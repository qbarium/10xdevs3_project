import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/profile", "/ingest", "/items", "/import-sessions"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  // Strona startowa tylko dla niezalogowanych (2026-07-02): zalogowany omija ją i trafia prosto do
  // Skrzynki wejściowej. Endpoint logowania kieruje na `/`, więc reguła domyka też przepływ po
  // zalogowaniu (signin → / → /ingest). Tu, nie we frontmatterze index.astro — top-level `return`
  // w .astro wywraca regułę @typescript-eslint/no-misused-promises (crash parsera ESLint).
  if (context.url.pathname === "/" && context.locals.user) {
    return context.redirect("/ingest");
  }

  return next();
});
