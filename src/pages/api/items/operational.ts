// POST /api/items/operational — zbiorcza zmiana stanu operacyjnego accepted itemów jednym żądaniem
// (S-04, FR-009). Bramkowany sesją (`locals.user`); klient Supabase z cookies usera (RLS, bez
// service_role). Walidacja zod PRZED dotknięciem bazy; błędy generyczne w ujednoliconym kształcie
// `{ ok:false, code, error }` (lessons.md). Guard `accepted` w serwisie realizuje „reszta pomijana
// bez błędu" (FR-007) — count z realnej liczby zmienionych wierszy, nie z liczby zaznaczonych.

import type { APIRoute } from "astro";

import { setOperationalStatus } from "@/lib/services/items-mutation";
import { reportError } from "@/lib/services/logger";
import { createClient } from "@/lib/supabase";
import { operationalActionSchema } from "@/lib/validation/items";

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, code: "unauthorized", error: "Wymagane logowanie." }, 401);

  let parsed;
  try {
    parsed = operationalActionSchema.safeParse(await context.request.json());
  } catch {
    return json({ ok: false, code: "bad_request", error: "Nieprawidłowe żądanie." }, 400);
  }
  if (!parsed.success) return json({ ok: false, code: "bad_request", error: "Nieprawidłowe żądanie." }, 400);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);

  const { ids, status } = parsed.data;
  try {
    const { updatedIds } = await setOperationalStatus(supabase, ids, status);
    return json({ ok: true, status, updatedIds, count: updatedIds.length }, 200);
  } catch (err) {
    reportError(err);
    return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);
  }
};
