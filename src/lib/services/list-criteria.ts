// Jedno źródło prawdy o kryteriach listy (FR-008, S-09) i ich mapowaniu na/z parametrów URL.
// Współdzielone przez SSR (`Astro.url.searchParams`), endpoint `GET /api/items` i hook `useItemList`:
// jeden parser → render serwerowy i pierwszy stan wyspy są IDENTYCZNE (hydration-stable, brak przeskoku).
//
// CELOWO bez osobnego schematu zod. `criteriaToQuery` pomija pola domyślne (czysty, krótki URL), więc
// rygorystyczny zod wymagający enumów dawałby 400 na własnym „Wyczyść filtry" / domyślnym URL. `parseListCriteria`
// jest TOLERANCYJNY (śmieć → fallback do domyślnej, nie rzuca) i jest JEDYNYM walidatorem kryteriów dla
// wszystkich trzech warstw. To świadome odchylenie od twardej reguły „zod dla wejścia wielopolowego"
// (`lessons.md`), zaakceptowane przy bramce przeglądu planu — walidacja jest wydzieloną, testowaną,
// współdzieloną funkcją, nie ad-hoc.
//
// `parseTypeFilter`/`TypeFilterValue` reużywane z `type-filter.ts` (kierunek importu zostanie odwrócony
// w Fazie 4, gdy kliencki `applyTypeFilter`/cookie znikną i eksporty trafią tutaj).

import { parseTypeFilter } from "@/components/items/type-filter";
import type { TypeFilterValue } from "@/components/items/type-filter";
import type { OperationalStatus } from "@/types";

/** Pięć widoków list. Wynika ze ŚCIEŻKI strony (każda `.astro` ustala swój) — NIE jest parametrem URL. */
export type MainView = "pending" | "active" | "done" | "cancelled" | "trash";

/** Pięć dozwolonych widoków. Strony `.astro` używają literałów; tylko endpoint waliduje surowy `view` z URL. */
export const MAIN_VIEWS = ["pending", "active", "done", "cancelled", "trash"] as const satisfies readonly MainView[];

/** Pole sortowania (jedno naraz). Mapowane na kolumnę w `listItems`: created→created_at, updated→updated_at. */
export type SortField = "created" | "updated" | "title";

/** Kierunek sortowania. */
export type SortDir = "asc" | "desc";

/**
 * Komplet kryteriów listy. `view` na sztywno per strona (nie z URL); reszta czytana z query string.
 * `opstatus` honorowany WYŁĄCZNIE dla `view==="active"` (jedyny widok z >1 stanem operacyjnym).
 */
export interface ListCriteria {
  view: MainView;
  type: TypeFilterValue;
  sort: SortField;
  dir: SortDir;
  q: string;
  opstatus?: OperationalStatus;
}

const SORT_FIELDS = ["created", "updated", "title"] as const satisfies readonly SortField[];
const SORT_DIRS = ["asc", "desc"] as const satisfies readonly SortDir[];

/** Podfiltr operacyjny w „Aktywne" oferuje tylko te dwa stany (widok i tak zawęża do new/in_progress). */
const ACTIVE_OPERATIONAL_STATUSES = ["new", "in_progress"] as const satisfies readonly OperationalStatus[];

/** Twardy clamp długości frazy wyszukiwania (zastępuje 400 z zod — patrz nagłówek pliku). */
const MAX_QUERY_LENGTH = 200;

/** Domyślne sortowanie wg widoku: pending = kolejność tworzenia; pozostałe = recency akcji (`updated_at`). */
function defaultSort(view: MainView): { sort: SortField; dir: SortDir } {
  return view === "pending" ? { sort: "created", dir: "desc" } : { sort: "updated", dir: "desc" };
}

function isSortField(value: string | null): value is SortField {
  return value != null && (SORT_FIELDS as readonly string[]).includes(value);
}

function isSortDir(value: string | null): value is SortDir {
  return value != null && (SORT_DIRS as readonly string[]).includes(value);
}

function isActiveOperational(value: string | null): value is OperationalStatus {
  return value != null && (ACTIVE_OPERATIONAL_STATUSES as readonly string[]).includes(value);
}

/** Runtime-guard surowego `view` z URL → `MainView` (endpoint zawęża nim string przed `parseListCriteria`). */
export function isMainView(value: string | null): value is MainView {
  return value != null && (MAIN_VIEWS as readonly string[]).includes(value);
}

/**
 * Czyta kryteria z `params` dla danego `view`. TOLERANCYJNY: każde niepoprawne/brakujące pole → wartość
 * domyślna wg widoku (nie rzuca). `q` przycięte do 200 znaków. `opstatus` honorowany tylko dla `active`
 * i tylko z dozwolonych wartości (new/in_progress) — inaczej `undefined`. JEDYNY walidator kryteriów:
 * używają go SSR, klient ORAZ endpoint.
 */
export function parseListCriteria(view: MainView, params: URLSearchParams): ListCriteria {
  const def = defaultSort(view);
  const sortRaw = params.get("sort");
  const dirRaw = params.get("dir");
  const opstatusRaw = params.get("opstatus");
  return {
    view,
    type: parseTypeFilter(params.get("type")),
    sort: isSortField(sortRaw) ? sortRaw : def.sort,
    dir: isSortDir(dirRaw) ? dirRaw : def.dir,
    q: (params.get("q") ?? "").slice(0, MAX_QUERY_LENGTH),
    opstatus: view === "active" && isActiveOperational(opstatusRaw) ? opstatusRaw : undefined,
  };
}

/**
 * Serializuje kryteria do query string — TYLKO pola różne od domyślnych dla widoku (czysty, krótki URL).
 * `view` NIE jest emitowane (wynika ze ścieżki). Odwrotność `parseListCriteria`: round-trip zachowuje kryteria.
 */
export function criteriaToQuery(criteria: ListCriteria): string {
  const def = defaultSort(criteria.view);
  const params = new URLSearchParams();
  if (criteria.type !== "all") params.set("type", criteria.type);
  if (criteria.sort !== def.sort) params.set("sort", criteria.sort);
  if (criteria.dir !== def.dir) params.set("dir", criteria.dir);
  if (criteria.q !== "") params.set("q", criteria.q);
  if (criteria.view === "active" && criteria.opstatus) params.set("opstatus", criteria.opstatus);
  return params.toString();
}

/** Komplet domyślnych kryteriów widoku (puste params) — używane przez nakładki serwisu (Faza 1 §4). */
export function defaultCriteria(view: MainView): ListCriteria {
  return parseListCriteria(view, new URLSearchParams());
}
