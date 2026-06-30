// /api/import-sessions — endpoint listy dziennika sesji importu zalogowanego usera (S-11).
//
// GET: czyta kryteria (status/sort/page) z query string przez tolerancyjny `parseSessionListCriteria`
// (JEDYNY walidator — śmieć → fallback do domyślnej, clamp `page`; bez osobnego zod, bo wszystkie pola to
// skalarne whitelisty/int — patrz `session-list-criteria.ts` i reguła „pole skalarne → walidacja ręczna").
// Egzekwuje logowanie i RLS (klient z cookies usera), woła `getImportSessions` (strona listy) i mapuje
// wiersze współdzielonym `toSessionRow`. Zwraca `{ ok, rows, total, page, pageSize }`. Strukturalnie jak
// `GET /api/items` (S-09). `status: "all"` → brak filtra statusu (undefined dla serwisu).
//
// Błędy generyczne (bez szczegółów DB/sieci), ujednolicony kształt `{ ok:false, code, error }`, odpowiedzi
// przez współdzielony `json()` z `@/lib/http`.

import type { APIRoute } from "astro";

import { json } from "@/lib/http";
import { getImportSessions, toSessionRow } from "@/lib/services/import-session";
import { reportError } from "@/lib/services/logger";
import { parseSessionListCriteria } from "@/lib/services/session-list-criteria";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, code: "unauthorized", error: "Wymagane logowanie." }, 401);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);

  try {
    // Tolerancyjny parser: niepoprawny status/sort → domyślne, `page` < 1 → 1. „all" → brak filtra statusu.
    const criteria = parseSessionListCriteria(new URL(context.request.url).searchParams);
    const { sessions, total, page, pageSize } = await getImportSessions(supabase, user.id, {
      sort: criteria.sort,
      status: criteria.status === "all" ? undefined : criteria.status,
      page: criteria.page,
      pageSize: criteria.size,
    });
    const rows = sessions.map(toSessionRow);
    return json({ ok: true, rows, total, page, pageSize }, 200);
  } catch (err) {
    reportError(err);
    return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);
  }
};
