// Hook elementów sesji (S-10, master-detail): dociąga WSZYSTKIE elementy wybranej sesji z
// GET /api/import-sessions/[id]/items i trzyma je w stanie z możliwością aktualizacji POJEDYNCZEGO
// elementu w miejscu (po edycji / koszu / przywróceniu — bez przeładowania listy i bez reorderu).
//
// Wzorzec ekstrakcji czystej logiki jak useItemList/useSessionRetry: `buildSessionItemsUrl` i
// `mapSessionItemsResponse` są czyste i testowane w node, a sam hook (AbortController + „ostatnie
// żądanie wygrywa") dochodzi w Fazie 3 i jest weryfikowany ręcznie w dev SSR (ryzyko dup-React na wyspie).

import type { Item } from "@/types";

interface SessionItemsResponse {
  ok?: boolean;
  items?: Item[];
}

/**
 * URL żądania elementów JEDNEJ sesji — odpowiednik `buildListUrl`, ale po `import_session_id` (SCOPE, nie
 * `view`): endpoint zwraca wszystkie stany akceptacji, więc nie ma tu żadnych parametrów filtra. `sessionId`
 * to UUID z wiersza dziennika (bez znaków wymagających enkodowania).
 */
export function buildSessionItemsUrl(sessionId: string): string {
  return `/api/import-sessions/${sessionId}/items`;
}

/** Mapuje odpowiedź endpointu na elementy lub porażkę — sukces TYLKO gdy HTTP ok + `ok:true` + tablica `items`. */
export function mapSessionItemsResponse(
  ok: boolean,
  data: SessionItemsResponse,
): { ok: true; items: Item[] } | { ok: false } {
  if (ok && data.ok && Array.isArray(data.items)) return { ok: true, items: data.items };
  return { ok: false };
}
