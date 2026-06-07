import type { APIRoute } from "astro";
import { SUPABASE_URL, SUPABASE_KEY, BYOK_KEK } from "astro:env/server";

export const prerender = false;

// Lekki health-check do weryfikacji deployu: potwierdza, że Worker widzi
// konfigurację Supabase, BEZ ujawniania wartości sekretów (tylko flaga boolean).
export const GET: APIRoute = () => {
  const hasSupabase = Boolean(SUPABASE_URL) && Boolean(SUPABASE_KEY);
  const hasKek = Boolean(BYOK_KEK);

  return new Response(
    JSON.stringify({
      ok: true,
      hasSupabase,
      hasKek,
      runtime: "workerd",
      checkedAt: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
