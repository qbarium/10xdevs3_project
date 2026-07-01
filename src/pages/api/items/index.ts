// /api/items — endpoint kolekcji itemów zalogowanego usera.
//
// GET (S-09, filtry dodatkowe FR-008; okno strony od S-13 Fazy 1): czyta kryteria listy z query string
// (`view` + type/sort/dir/q/opstatus) oraz OPCJONALNE okno `page`/`size`, egzekwuje logowanie i RLS (klient
// z cookies usera), woła `listItems` i zwraca `{ ok, items, total }` (+ echo `page`/`pageSize` przy oknie —
// wzorzec GET /api/import-sessions). Brak/śmieciowy `size` → wywołanie BEZ okna (pełna lista, jak dotąd) —
// kompatybilność wstecz dla klientów nie wysyłających okna (`useItemList` do Fazy 2). `view` walidowane
// manualnie (pojedyncze pole skalarne — selektor predykatu); pozostałe pola przez tolerancyjny
// `parseListCriteria` (śmieć → fallback do domyślnej, clamp `q`), świadomie BEZ osobnego zod (jeden
// współdzielony walidator z SSR i klientem — patrz `list-criteria.ts`).
//
// POST (S-07): utworzenie pojedynczego itemu RĘCZNEGO — pomija klasyfikację AI i kolejkę pendingów: serwer
// wstawia item od razu jako accepted/new/NULL-session. Sekwencja jak bulk.ts/[id].ts: guard sesji (401) →
// walidacja zod PRZED bazą (400) → klient z cookies usera (RLS, bez service_role) → serwis → 201 z utworzonym
// wierszem. ŚWIADOMIE bez JAKIEGOKOLWIEK sprawdzenia klucza BYOK — ręczne dodawanie jest bezkluczowe
// (wyjątek FR-024); akcja nie siedzi na ścieżce dziedziczącej bramkę `missing_key` z classify.ts.
//
// Oba: błędy generyczne (bez szczegółów DB/sieci), ujednolicony kształt `{ ok:false, code, error }`,
// odpowiedzi przez współdzielony `json()` z `@/lib/http`.

import type { APIRoute } from "astro";

import { json } from "@/lib/http";
import { listItems } from "@/lib/services/items";
import { createManualItem } from "@/lib/services/items-mutation";
import { isMainView, parseItemPage, parseItemSize, parseListCriteria } from "@/lib/services/list-criteria";
import { reportError } from "@/lib/services/logger";
import { createClient } from "@/lib/supabase";
import { createItemSchema } from "@/lib/validation/items";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, code: "unauthorized", error: "Wymagane logowanie." }, 401);

  // `view` selektuje predykat widoku — manualny guard pojedynczego pola (brak / spoza 5 widoków ⇒ 400).
  const searchParams = new URL(context.request.url).searchParams;
  const view = searchParams.get("view");
  if (!isMainView(view)) return json({ ok: false, code: "bad_request", error: "Nieprawidłowe żądanie." }, 400);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);

  try {
    // Pozostałe pola: tolerancyjny parser (niepoprawne → fallback do domyślnej; `q` clamp do 200).
    const criteria = parseListCriteria(view, searchParams);
    // Okno strony: `size === null` (brak/śmieć) → pełna lista bez okna; odpowiedź zawsze z `total`.
    const size = parseItemSize(searchParams.get("size"));
    if (size === null) {
      const { items, total } = await listItems(supabase, user.id, criteria);
      return json({ ok: true, items, total }, 200);
    }
    const page = parseItemPage(searchParams.get("page"));
    const { items, total } = await listItems(supabase, user.id, criteria, { page, size });
    return json({ ok: true, items, total, page, pageSize: size }, 200);
  } catch (err) {
    reportError(err);
    return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);
  }
};

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, code: "unauthorized", error: "Wymagane logowanie." }, 401);

  let parsed;
  try {
    parsed = createItemSchema.safeParse(await context.request.json());
  } catch {
    return json({ ok: false, code: "bad_request", error: "Nieprawidłowe żądanie." }, 400);
  }
  if (!parsed.success) return json({ ok: false, code: "bad_request", error: "Nieprawidłowe żądanie." }, 400);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);

  try {
    const item = await createManualItem(supabase, user.id, parsed.data);
    return json({ ok: true, item }, 201);
  } catch (err) {
    reportError(err);
    return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);
  }
};
