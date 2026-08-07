// Aktywny stan pozycji powłoki liczony z `Astro.url.pathname` (multi-page SSR — brak stanu React).
// Pułapka: naiwny `startsWith` myli „Do akceptacji" (/items, DOKŁADNE) z grupą „Wpisy"
// (/items/active|done|cancelled — PREFIKS /items/). „Kosz" (/items/trash, DOKŁADNE) też wpadłby w ten
// prefiks, więc jego matcher stoi PRZED „entries". Dopasowanie jest jawne per pozycja, a kolejność
// w `NAV_MATCHERS` czyni wykluczenia widocznymi. Pokryte `nav-active.test.ts`.

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

// Kolejność = priorytet (pierwsze pasujące wygrywa). „pending" (exact /items) oraz „trash"
// (exact /items/trash) MUSZĄ stać PRZED „entries" (prefix /items/) — inaczej prefiks złapie je pierwszy.
export const NAV_MATCHERS: readonly NavMatcher[] = [
  { id: "ingest", match: { type: "exact", path: "/ingest" } },
  { id: "pending", match: { type: "exact", path: "/items" } },
  { id: "trash", match: { type: "exact", path: "/items/trash" } },
  { id: "entries", match: { type: "prefix", path: "/items/" } },
  { id: "sessions", match: { type: "prefix", path: "/import-sessions" } },
  { id: "settings", match: { type: "prefix", path: "/profile" } },
  { id: "help", match: { type: "prefix", path: "/help" } },
];

/** Id aktywnej pozycji dla adresu, albo `null` (np. landing/auth — poza powłoką). */
export function activeNavId(pathname: string): string | null {
  // Normalizacja: obetnij końcowy „/" (poza korzeniem) — `/items/` ma podświetlać „Do akceptacji",
  // nie grupę „Wpisy" (Astro `trailingSlash:"ignore"` serwuje tę samą stronę pod obiema formami).
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return NAV_MATCHERS.find((m) => isNavActive(p, m.match))?.id ?? null;
}
