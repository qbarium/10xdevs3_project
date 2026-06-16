// PATCH /api/items/[id] — natychmiastowe utrwalenie edycji itemu (title/description/typ) dla
// pendingów ORAZ zaakceptowanych (S-05). Decyzja: zapis od razu, akceptacja osobno (FR-010).
// Bramkowany sesją; RLS przez cookies usera. `id` walidowany jako UUID (400 na niepoprawnym);
// payload przez zod, w tym `expectedUpdatedAt` dla optimistic concurrency (400 na złym). Item
// nieedytowalny/nieistniejący → 404; rozjazd `updated_at` (równoległa edycja) → 409; reszta → 500.

import type { APIRoute } from "astro";
import { z } from "zod";

import { editItem, ItemConflictError, ItemNotEditableError } from "@/lib/services/items-mutation";
import { reportError } from "@/lib/services/logger";
import { createClient } from "@/lib/supabase";
import { editItemBodySchema } from "@/lib/validation/items";

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const PATCH: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ ok: false, code: "unauthorized", error: "Wymagane logowanie." }, 401);

  const idResult = z.uuid().safeParse(context.params.id);
  if (!idResult.success) return json({ ok: false, code: "bad_request", error: "Nieprawidłowe żądanie." }, 400);

  let parsed;
  try {
    parsed = editItemBodySchema.safeParse(await context.request.json());
  } catch {
    return json({ ok: false, code: "bad_request", error: "Nieprawidłowe żądanie." }, 400);
  }
  if (!parsed.success) return json({ ok: false, code: "bad_request", error: "Nieprawidłowe żądanie." }, 400);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);

  // `expectedUpdatedAt` odchodzi do compare-and-swap; pozostałe pola (`input`) to czysty `EditItemInput`.
  const { expectedUpdatedAt, ...input } = parsed.data;
  try {
    const item = await editItem(supabase, idResult.data, input, expectedUpdatedAt);
    return json({ ok: true, item }, 200);
  } catch (err) {
    if (err instanceof ItemConflictError)
      return json(
        {
          ok: false,
          code: "conflict",
          error: "Element został zmieniony w innym miejscu — odśwież i spróbuj ponownie.",
        },
        409,
      );
    if (err instanceof ItemNotEditableError)
      return json({ ok: false, code: "not_found", error: "Element nie jest już dostępny do edycji." }, 404);
    reportError(err);
    return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);
  }
};
