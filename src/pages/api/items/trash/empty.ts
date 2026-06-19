// POST /api/items/trash/empty — trwałe opróżnienie kosza usera (S-06, FR-016). PIERWSZY twardy DELETE
// w aplikacji (reszta cyklu życia to soft-delete przez `acceptance_status`). Bramkowany sesją
// (`locals.user`); klient Supabase z cookies usera (RLS, bez service_role) → polityka `items_delete_own`
// izoluje per-user, więc user kasuje wyłącznie SWÓJ kosz. Operacja GLOBALNA — bez body, bez `ids`, bez
// zod (zgodnie z hard rule: brak wejścia wielopolowego). Błędy w ujednoliconym kształcie
// `{ ok:false, code, error }` (lessons.md); sukces `{ ok:true, deletedCount }`.

import type { APIRoute } from "astro";

import { emptyTrash } from "@/lib/services/items-mutation";
import { reportError } from "@/lib/services/logger";
import { createClient } from "@/lib/supabase";

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

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);

  try {
    const { deletedCount } = await emptyTrash(supabase);
    return json({ ok: true, deletedCount }, 200);
  } catch (err) {
    reportError(err);
    return json({ ok: false, code: "internal", error: "Błąd serwera." }, 500);
  }
};
