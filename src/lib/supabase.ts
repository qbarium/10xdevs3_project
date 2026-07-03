import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "").map(({ name, value }) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          // Anti-CSRF (S-14): wymuś jawny SameSite=Lax niezależnie od domyślnych `@supabase/ssr`
          // (dziś `lax`, ale pin chroni przed cichą zmianą przy aktualizacji biblioteki). Druga,
          // niezależna warstwa obrony obok origin-checku w `src/middleware.ts`.
          cookies.set(name, value, { ...options, sameSite: "lax" });
        });
      },
    },
  });
}
