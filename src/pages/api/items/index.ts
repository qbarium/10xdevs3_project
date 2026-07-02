// /api/items — endpoint kolekcji itemów zalogowanego usera.
//
// GET (S-09, filtry dodatkowe FR-008; okno strony S-13 F2): czyta kryteria listy z query string (`view` +
// type/sort/dir/q/opstatus + page/size), egzekwuje logowanie i RLS (klient z cookies usera), woła `listItems`
// z oknem Z KRYTERIÓW (spójnie z SSR stron — ten sam parser, brak rozjazdu hydratacji) i zwraca
// `{ ok, items, total, page, pageSize }` (wzorzec GET /api/import-sessions). Lista wpisów ZAWSZE stronicuje
// (brak/śmieciowy `size` → domyślny `ITEM_PAGE_SIZE` z parsera). `view` walidowane manualnie (pojedyncze
// pole skalarne — selektor predykatu); pozostałe pola przez tolerancyjny `parseListCriteria` (śmieć →
// fallback do domyślnej, clamp `q`), świadomie BEZ osobnego zod (jeden współdzielony walidator z SSR
// i klientem — patrz `list-criteria.ts`).
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
import { isMainView, parseListCriteria } from "@/lib/services/list-criteria";
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
    // Pozostałe pola: tolerancyjny parser (niepoprawne → fallback do domyślnej; `q` clamp do 200; okno
    // strony znormalizowane — page ≥ 1, size z puli). Okno idzie z KRYTERIÓW (spójnie z SSR stron).
    const criteria = parseListCriteria(view, searchParams);
    const { items, total } = await listItems(supabase, user.id, criteria, {
      page: criteria.page,
      size: criteria.size,
    });
    return json({ ok: true, items, total, page: criteria.page, pageSize: criteria.size }, 200);
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
