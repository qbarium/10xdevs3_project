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
    // Restore ORAZ accept/reject zwracają PEŁNE wiersze — dokładamy `items` ADDYTYWNIE (panel sesji S-10
    // podmienia element ze świeżym `updated_at`, by edycja po accept/restore nie dała fałszywego 409).
    // `updatedIds`/`count` zachowane → konsumenci z głównych list (czytają count) nietknięci.
    if (action === "restore" || action === "accept" || action === "reject") {
      const items =
        action === "restore"
          ? await restoreFromTrash(supabase, ids)
          : await setAcceptanceStatus(supabase, ids, action === "accept" ? "accepted" : "rejected");
      const updatedIds = items.map((item) => item.id);
      return json({ ok: true, action, updatedIds, count: updatedIds.length, items }, 200);
    }
    // Kosz: guard statusem w serwisie → tylko uprawnione wiersze; liczba wystarcza (element staje się read-only).
    const { updatedIds } = await moveToTrash(supabase, ids);
    return json({ ok: true, action, updatedIds, count: updatedIds.length }, 200);
  } catch (err) {
    reportError(err);
    return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);
  }
};
