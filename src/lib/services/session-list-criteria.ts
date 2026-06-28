// Jedno źródło prawdy o kryteriach dziennika sesji importu (S-11) i ich mapowaniu na/z parametrów URL.
// Współdzielone przez SSR (`Astro.url.searchParams`), endpoint `GET /api/import-sessions` i hook
// `useSessionList`: jeden parser → render serwerowy i pierwszy stan wyspy są IDENTYCZNE (hydration-stable,
// brak przeskoku po nawodnieniu). Wzorowane na `list-criteria.ts` z S-09.
//
// CELOWO bez osobnego schematu zod. `parseSessionListCriteria` jest TOLERANCYJNY (śmieć → fallback do
// domyślnej, nie rzuca) i jest JEDYNYM walidatorem kryteriów dla wszystkich trzech warstw — świadome
// odchylenie od twardej reguły „zod dla wejścia wielopolowego" (`lessons.md`), zaakceptowane wzorcem S-09:
// walidacja jest wydzieloną, testowaną, współdzieloną funkcją, nie ad-hoc. Dziennik nie ma wyszukiwania
// tekstowego, więc kryteria to tylko status + sort + page (bez `q`, bez debounce).
//
// Moduł jest BEZZALEŻNOŚCIOWY (importuje wyłącznie typ `ImportSessionStatus`) — może go importować kliencki
// hook bez wciągania `@supabase/supabase-js` do bundla przeglądarki. Stała `SESSION_PAGE_SIZE` też tu żyje,
// by serwis (serwer) i hook (klient) dzieliły jedno źródło rozmiaru strony.

import type { ImportSessionStatus } from "@/types";

/** Rozmiar strony dziennika (paginacja offsetowa). Współdzielony przez serwis i hook (liczenie `pageCount`). */
export const SESSION_PAGE_SIZE = 20;

/** Filtr statusu: konkretny stan sesji albo „all" (brak filtra). */
export type SessionStatusFilter = ImportSessionStatus | "all";

/** Oś sortowania dziennika — wyłącznie po dacie utworzenia (malejąco/rosnąco). */
export type SessionSort = "created_desc" | "created_asc";

/** Komplet kryteriów dziennika: filtr statusu + sort po dacie + numer strony (1-based). */
export interface SessionListCriteria {
  status: SessionStatusFilter;
  sort: SessionSort;
  page: number;
}

/** Cztery wartości enuma `import_session_status` — whitelist filtra (poza nimi: „all"). */
const STATUS_VALUES = [
  "processing",
  "completed_with_items",
  "completed_no_items",
  "failed",
] as const satisfies readonly ImportSessionStatus[];

const SESSION_SORTS = ["created_desc", "created_asc"] as const satisfies readonly SessionSort[];

const DEFAULT_STATUS: SessionStatusFilter = "all";
const DEFAULT_SORT: SessionSort = "created_desc";

function isStatus(value: string | null): value is ImportSessionStatus {
  return value != null && (STATUS_VALUES as readonly string[]).includes(value);
}

function isSort(value: string | null): value is SessionSort {
  return value != null && (SESSION_SORTS as readonly string[]).includes(value);
}

/** Parsuje numer strony: liczba całkowita ≥ 1; brak / śmieć / < 1 → 1 (clamp, nie rzuca). */
function parsePage(value: string | null): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/**
 * Czyta kryteria z `params`. TOLERANCYJNY: każde niepoprawne/brakujące pole → domyślne (status „all",
 * sort malejąco, strona 1) — nie rzuca. JEDYNY walidator kryteriów: używają go SSR, klient ORAZ endpoint.
 */
export function parseSessionListCriteria(params: URLSearchParams): SessionListCriteria {
  const statusRaw = params.get("status");
  const sortRaw = params.get("sort");
  return {
    status: isStatus(statusRaw) ? statusRaw : DEFAULT_STATUS,
    sort: isSort(sortRaw) ? sortRaw : DEFAULT_SORT,
    page: parsePage(params.get("page")),
  };
}

/**
 * Serializuje kryteria do query string — TYLKO pola różne od domyślnych (czysty, krótki URL). Odwrotność
 * `parseSessionListCriteria`: round-trip zachowuje kryteria.
 */
export function sessionCriteriaToQuery(criteria: SessionListCriteria): string {
  const params = new URLSearchParams();
  if (criteria.status !== DEFAULT_STATUS) params.set("status", criteria.status);
  if (criteria.sort !== DEFAULT_SORT) params.set("sort", criteria.sort);
  if (criteria.page > 1) params.set("page", String(criteria.page));
  return params.toString();
}

/** Komplet domyślnych kryteriów (puste params) — strona 1, sort malejąco, brak filtra statusu. */
export function defaultSessionCriteria(): SessionListCriteria {
  return parseSessionListCriteria(new URLSearchParams());
}

/**
 * Czy FILTR lub SORT odbiega od domyślnego (status ≠ „all" lub sort ≠ malejąco). Steruje rozróżnieniem
 * pustego wyniku w wyspie: „brak sesji dla wybranych filtrów" (+ akcja „Wyczyść filtry") vs zwykły
 * „brak sesji importu". `page` CELOWO NIE liczy się jako filtr — pusta strona poza zakresem to nie efekt
 * zawężenia filtrem, a „Wyczyść filtry" i tak resetuje stronę do 1 (domyślne kryteria).
 */
export function hasActiveSessionFilters(criteria: SessionListCriteria): boolean {
  return criteria.status !== DEFAULT_STATUS || criteria.sort !== DEFAULT_SORT;
}
