// GET /api/import-sessions/[id]/items — wszystkie elementy JEDNEJ sesji importu bieżącego usera (S-10,
// master-detail; od S-13 warstwa danych trybu sesji). Odchudzony wariant GET /api/items (S-09): sesja to
// SCOPE (`import_session_id`), nie widok — endpoint NIE przyjmuje `view` i NIE filtruje `acceptance_status`,
// więc zwraca wszystkie cztery stany naraz (`pending`/`accepted`/`rejected`/`deleted`). Od S-13 Fazy 1
// przyjmuje OPCJONALNE okno `page`/`size` (te same parsery i pula co GET /api/items) i zwraca
// `{ ok, items, total }` (+ echo `page`/`pageSize` przy oknie); brak/śmieciowy `size` → pełna lista bez
// okna (tolerancja — od F5 tryb sesji zawsze podaje okno). Sekwencja jak w sąsiednich endpointach: guard sesji (401) →
// walidacja UUID ścieżki (400; ten sam `z.uuid()` co PATCH /api/items/[id] — pojedynczy skalar, zod już
// jest zależnością tej trasy) → klient z cookies usera (RLS izoluje per-user) → serwis → odpowiedź.
// Nieistniejąca/cudza sesja → pusta lista (RLS odfiltrowuje; brak osobnego sprawdzania istnienia — jedno
// zapytanie). Błędy generyczne, ujednolicony kształt `{ ok:false, code, error }`.

import type { APIRoute } from "astro";
import { z } from "zod";

import { json } from "@/lib/http";
import { getSessionItems } from "@/lib/services/items";
import { parseItemPage, parseItemSize } from "@/lib/services/list-criteria";
import { reportError } from "@/lib/services/logger";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, code: "unauthorized", error: "Wymagane logowanie." }, 401);

  // `id` to pojedynczy parametr ścieżki — walidacja kształtu UUID (zła wartość ⇒ 400, bez dotykania bazy).
  const idResult = z.uuid().safeParse(context.params.id);
  if (!idResult.success) return json({ ok: false, code: "bad_request", error: "Nieprawidłowe żądanie." }, 400);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);

  try {
    // Okno strony: `size === null` (brak/śmieć) → pełna lista bez okna; odpowiedź zawsze z `total`.
    const searchParams = new URL(context.request.url).searchParams;
    const size = parseItemSize(searchParams.get("size"));
    if (size === null) {
      const { items, total } = await getSessionItems(supabase, user.id, idResult.data);
      return json({ ok: true, items, total }, 200);
    }
    const page = parseItemPage(searchParams.get("page"));
    const { items, total } = await getSessionItems(supabase, user.id, idResult.data, { page, size });
    return json({ ok: true, items, total, page, pageSize: size }, 200);
  } catch (err) {
    reportError(err);
    return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);
  }
};
