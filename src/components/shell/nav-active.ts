// Aktywny stan pozycji powłoki liczony z `Astro.url.pathname` (multi-page SSR — brak stanu React).
// Pułapka: naiwny `startsWith` myli „Do akceptacji" (/items, DOKŁADNE) z grupą „Wpisy"
// (/items/active|done|cancelled|trash — PREFIKS /items/). Dlatego dopasowanie jest jawne per pozycja,
// a kolejność w `NAV_MATCHERS` czyni wykluczenie widocznym. Pokryte `nav-active.test.ts`.

export type NavMatch = { type: "exact"; path: string } | { type: "prefix"; path: string };

/** Czy `pathname` aktywuje daną regułę. exact = równość; prefix = `startsWith` (path z „/" na końcu dla grupy). */
export function isNavActive(pathname: string, match: NavMatch): boolean {
  return match.type === "exact" ? pathname === match.path : pathname.startsWith(match.path);
}

/** Stabilne id pozycji powłoki → reguła dopasowania. */
export interface NavMatcher {
  id: string;
  match: NavMatch;
}

// Kolejność = priorytet (pierwsze pasujące wygrywa). „pending" (exact /items) PRZED „entries"
// (prefix /items/) — i tak się wykluczają, ale kolejność czyni to jawnym.
export const NAV_MATCHERS: readonly NavMatcher[] = [
  { id: "ingest", match: { type: "exact", path: "/ingest" } },
  { id: "pending", match: { type: "exact", path: "/items" } },
  { id: "entries", match: { type: "prefix", path: "/items/" } },
  { id: "sessions", match: { type: "prefix", path: "/import-sessions" } },
  { id: "settings", match: { type: "prefix", path: "/profile" } },
];

/** Id aktywnej pozycji dla adresu, albo `null` (np. landing/auth — poza powłoką). */
export function activeNavId(pathname: string): string | null {
  return NAV_MATCHERS.find((m) => isNavActive(pathname, m.match))?.id ?? null;
}
