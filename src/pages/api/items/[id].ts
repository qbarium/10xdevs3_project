// PATCH /api/items/[id] — natychmiastowe utrwalenie edycji pendingu (title/description/typ).
// Decyzja: zapis od razu, akceptacja osobno (FR-010). Bramkowany sesją; RLS przez cookies usera.
// `id` walidowany jako UUID (400 na niepoprawnym); payload przez zod (400). Gdy item nie jest już
// edytowalny (nie-pending / nie-własny) → 404; pozostałe rzuty serwisu → generyczne 500.

import type { APIRoute } from "astro";
import { z } from "zod";

import { editPendingItem, ItemNotEditableError } from "@/lib/services/items-mutation";
import { reportError } from "@/lib/services/logger";
import { createClient } from "@/lib/supabase";
import { editItemSchema } from "@/lib/validation/items";

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
    parsed = editItemSchema.safeParse(await context.request.json());
  } catch {
    return json({ ok: false, code: "bad_request", error: "Nieprawidłowe żądanie." }, 400);
  }
  if (!parsed.success) return json({ ok: false, code: "bad_request", error: "Nieprawidłowe żądanie." }, 400);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);

  try {
    const item = await editPendingItem(supabase, idResult.data, parsed.data);
    return json({ ok: true, item }, 200);
  } catch (err) {
    if (err instanceof ItemNotEditableError)
      return json({ ok: false, code: "not_found", error: "Element nie jest już dostępny do edycji." }, 404);
    reportError(err);
    return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);
  }
};
