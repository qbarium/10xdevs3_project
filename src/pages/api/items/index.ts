// POST /api/items — utworzenie pojedynczego itemu RĘCZNEGO dla zalogowanego usera (S-07). Pomija
// klasyfikację AI i kolejkę pendingów: serwer wstawia item od razu jako accepted/new/NULL-session.
// Sekwencja jak bulk.ts/[id].ts: guard sesji (401) → walidacja zod PRZED bazą (400) → klient z cookies
// usera (RLS, bez service_role) → serwis → 201 z utworzonym wierszem. Błędy generyczne (bez szczegółów
// DB/sieci), ujednolicony kształt `{ ok:false, code, error }`. ŚWIADOMIE bez JAKIEGOKOLWIEK sprawdzenia
// klucza BYOK — ręczne dodawanie jest bezkluczowe (wyjątek FR-024); akcja nie siedzi na ścieżce
// dziedziczącej bramkę `missing_key` z classify.ts.

import type { APIRoute } from "astro";

import { createManualItem } from "@/lib/services/items-mutation";
import { reportError } from "@/lib/services/logger";
import { createClient } from "@/lib/supabase";
import { createItemSchema } from "@/lib/validation/items";

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
