// POST /api/items/bulk — atomowe zatwierdzenie/odrzucenie zaznaczonych pendingów jednym żądaniem
// (metryka „≤ 1 klik" + FR-007). Bramkowany sesją (`locals.user`); klient Supabase z cookies usera
// (RLS, bez service_role). Walidacja zod PRZED dotknięciem bazy; błędy generyczne (bez szczegółów
// DB/sieci). Guard `pending` w serwisie realizuje „reszta pomijana bez błędu".

import type { APIRoute } from "astro";

import { moveToTrash, restoreFromTrash, setAcceptanceStatus } from "@/lib/services/items-mutation";
import { reportError } from "@/lib/services/logger";
import { createClient } from "@/lib/supabase";
import { bulkActionSchema } from "@/lib/validation/items";

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
    parsed = bulkActionSchema.safeParse(await context.request.json());
  } catch {
    return json({ ok: false, code: "bad_request", error: "Nieprawidłowe żądanie." }, 400);
  }
  if (!parsed.success) return json({ ok: false, code: "bad_request", error: "Nieprawidłowe żądanie." }, 400);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);

  const { ids, action } = parsed.data;
  try {
    // Każda gałąź zwraca `{ updatedIds }` (guard statusem w serwisie → tylko uprawnione wiersze).
    let updatedIds: string[];
    if (action === "trash") {
      ({ updatedIds } = await moveToTrash(supabase, ids));
    } else if (action === "restore") {
      ({ updatedIds } = await restoreFromTrash(supabase, ids));
    } else {
      ({ updatedIds } = await setAcceptanceStatus(supabase, ids, action === "accept" ? "accepted" : "rejected"));
    }
    return json({ ok: true, action, updatedIds, count: updatedIds.length }, 200);
  } catch (err) {
    reportError(err);
    return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);
  }
};
