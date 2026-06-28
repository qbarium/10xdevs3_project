// Czysta logika paginacji dziennika sesji (S-11) — wydzielona z komponentu, by była testowalna w node
// (konwencja projektu: logika w `.ts`, render w `.tsx`). `SessionPagination.tsx` ją konsumuje.

import type { SessionListCriteria } from "@/lib/services/session-list-criteria";

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
 * Kryteria po zmianie FILTRA lub SORTU — zawsze wracają na stronę 1, bo zmienił się zakres wyników (bieżąca
 * strona N mogłaby już nie istnieć). Paginacja zmienia samą stronę, więc jej NIE przepuszczamy przez to.
 */
export function resetToFirstPage(criteria: SessionListCriteria): SessionListCriteria {
  return { ...criteria, page: 1 };
}
