// Anti-CSRF origin-check (S-14). Czysty, fail-closed predykat rozstrzygający, czy żądanie
// mutujące pochodzi z tego samego originu. Bez zależności od Astro/Supabase — testowalny w
// izolacji i wywoływany z `src/middleware.ts`.
//
// Warstwa aplikacyjna PONAD wbudowanym origin-checkiem Astro (`security.checkOrigin: true`):
// domyka klasę `application/json`, którą Astro celowo przepuszcza (broniona wyłącznie preflightem
// CORS). Obie warstwy zwracają 403 na cross-site; legalne same-origin przechodzi przez obie.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Czy metoda HTTP mutuje stan (a więc wymaga kontroli CSRF). */
export function isMutatingMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

/**
 * Ścieżki zwolnione z origin-check (klienci nie-przeglądarkowi: webhook / server-to-server).
 * KAŻDA wpisana tu ścieżka MUSI mieć WŁASNĄ autoryzację (podpis/HMAC) — pominięcie bramki oznacza
 * BRAK ochrony CSRF dla tej ścieżki. NIE zwalniaj po obecności nagłówka (np. `Authorization`): w
 * aplikacji uwierzytelniającej ambient ciasteczkiem to realny bypass CSRF. Pusta z rozmysłem —
 * dziś żaden endpoint `/api/**` nie ma konsumenta programmatycznego.
 */
const CSRF_EXEMPT_PATHS: readonly string[] = [];

/**
 * Fail-closed: żądanie jest zaufane wtedy i tylko wtedy, gdy
 *  - jego ścieżka jest jawnie zwolniona (`CSRF_EXEMPT_PATHS` — własna auth), LUB
 *  - nagłówek `Origin` jest obecny i równy originowi żądania, LUB
 *  - `Origin` jest nieobecny, a `Sec-Fetch-Site` = `same-origin`.
 *
 * Każdy inny przypadek — `Origin` obecny i różny (cross-site) albo brak obu nagłówków — jest
 * niezaufany. Oba nagłówki ustawia przeglądarka (forbidden headers), więc nie da się ich podrobić
 * z JavaScriptu strony atakującego. `exemptPaths` jest wstrzykiwalny wyłącznie dla testów.
 */
export function isTrustedRequest(
  request: Request,
  url: URL,
  exemptPaths: readonly string[] = CSRF_EXEMPT_PATHS,
): boolean {
  if (exemptPaths.some((p) => url.pathname.startsWith(p))) return true;
  const origin = request.headers.get("origin");
  if (origin !== null) return origin === url.origin;
  return request.headers.get("sec-fetch-site") === "same-origin";
}
