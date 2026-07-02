// Czysta logika paginacji list (S-11, uogólniona w S-13 F2) — wydzielona z komponentów, by była testowalna
// w node (konwencja projektu: logika w `.ts`, render w `.tsx`). Konsumują ją `Pagination.tsx` oraz wyspy
// dziennika sesji i listy wpisów. Wcześniej żyła w `import-sessions/session-pagination.ts` przyspawana do
// kryteriów dziennika; `resetToFirstPage` jest teraz generyczne po typie kryteriów (każde z polem `page`).
// Nazwa pliku `list-pagination.ts` (nie `pagination.ts`): na case-insensitive FS (Windows) kolidowałaby
// z `Pagination.tsx` w tym samym katalogu — serwis projektu TS gubi wtedy jeden z plików.

/** Stan kontrolek stron: czy można cofnąć/przejść dalej oraz docelowe numery (z clampem do zakresu). */
export interface PageNav {
  canPrev: boolean;
  canNext: boolean;
  prevPage: number;
  nextPage: number;
}

/** Wylicza stan nawigacji dla strony `page` przy `pageCount` stronach (przyciski wyłączane na krańcach). */
export function pageNav(page: number, pageCount: number): PageNav {
  return {
    canPrev: page > 1,
    canNext: page < pageCount,
    prevPage: Math.max(1, page - 1),
    nextPage: Math.min(pageCount, page + 1),
  };
}

/**
 * Parsuje i klampuje WPISANY przez użytkownika numer strony do zakresu [1, pageCount]. Wartość niepoprawna
 * (pusta / NaN) → `current` (zachowujemy bieżącą stronę, nie skaczemy na 1). Ułamki ucinane w dół.
 */
export function clampPage(value: number, pageCount: number, current: number): number {
  if (!Number.isFinite(value)) return current;
  return Math.min(Math.max(1, Math.floor(value)), Math.max(1, pageCount));
}

/**
 * Kryteria po zmianie FILTRA lub SORTU — zawsze wracają na stronę 1, bo zmienił się zakres wyników (bieżąca
 * strona N mogłaby już nie istnieć). Paginacja zmienia samą stronę, więc jej NIE przepuszczamy przez to.
 * Generyczne: działa dla `SessionListCriteria` (dziennik) i `ListCriteria` (lista wpisów).
 */
export function resetToFirstPage<T extends { page: number }>(criteria: T): T {
  return { ...criteria, page: 1 };
}
