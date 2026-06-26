// Hook elementów sesji (S-10, master-detail): dociąga WSZYSTKIE elementy wybranej sesji z
// GET /api/import-sessions/[id]/items i trzyma je w stanie z możliwością aktualizacji POJEDYNCZEGO
// elementu w miejscu (po edycji / koszu / przywróceniu — bez przeładowania listy i bez reorderu).
//
// Wzorzec ekstrakcji czystej logiki jak useItemList/useSessionRetry: `buildSessionItemsUrl` i
// `mapSessionItemsResponse` są czyste i testowane w node, a sam hook (AbortController + „ostatnie
// żądanie wygrywa") dochodzi w Fazie 3 i jest weryfikowany ręcznie w dev SSR (ryzyko dup-React na wyspie).

import { useCallback, useEffect, useRef, useState } from "react";

import type { AcceptanceStatus, Item } from "@/types";

const FETCH_ERROR = "Nie udało się wczytać elementów sesji. Spróbuj ponownie.";

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

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";
}

export interface UseSessionItems {
  items: Item[];
  loading: boolean;
  error: string | null;
  /** Podmienia jeden element po `id` (po edycji / przywróceniu — pełny świeży wiersz z serwera). */
  replaceItem: (updated: Item) => void;
  /** Zmienia `acceptance_status` jednego elementu lokalnie (po przeniesieniu do kosza — bez świeżego wiersza). */
  setItemStatus: (id: string, acceptance_status: AcceptanceStatus) => void;
}

/**
 * Dociąga WSZYSTKIE elementy wybranej sesji i utrzymuje je w stanie z aktualizacją POJEDYNCZEGO elementu
 * w miejscu. Fetch przy każdej zmianie `sessionId`; `null` (brak wyboru) → nie pobieramy (panel pokazuje
 * placeholder na podstawie `sessionId === null`, więc ewentualne stare `items` i tak nie są renderowane — a
 * UI nie ma „odznaczania" sesji, więc przejście id→null nie zachodzi). „Ostatnie żądanie wygrywa" jak w
 * useItemList: nowy wybór anuluje poprzedni `fetch` (AbortController) i jest znaczony tokenem — spóźniona/
 * anulowana odpowiedź na starą sesję nie podmienia listy ani nie ustawia błędu. Sort przychodzi z endpointu
 * (`created_at asc`); `replaceItem`/`setItemStatus` zachowują kolejność (mapowanie po `id`), więc żadna akcja
 * nie przesuwa wiersza.
 */
export function useSessionItems(sessionId: string | null): UseSessionItems {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    // Brak wyboru: nic nie pobieramy (panel pokazuje placeholder). Świadomie BEZ setState tutaj — czysty
    // synchroniczny setState w efekcie bez synchronizacji z systemem zewnętrznym to kaskadowy render
    // (react-compiler), a stare `items` i tak nie są renderowane przy `sessionId === null`.
    if (sessionId === null) return;

    // Zmiana sesji: anuluj poprzednie żądanie i znacz tokenem (ostatni wybór wygrywa).
    abortRef.current?.abort();
    const myToken = ++tokenRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    // setState wewnątrz async-IIFE (zagnieżdżony callback, nie ciało efektu) — leci synchronicznie do
    // pierwszego awaitu, więc loading pokazuje się od razu, a react-compiler nie widzi kaskady w efekcie.
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(buildSessionItemsUrl(sessionId), { signal: controller.signal });
        const data = (await res.json()) as SessionItemsResponse;
        if (myToken !== tokenRef.current) return; // zastąpione nowszym wyborem
        const mapped = mapSessionItemsResponse(res.ok, data);
        setLoading(false);
        if (mapped.ok) setItems(mapped.items);
        else setError(FETCH_ERROR);
      } catch (err) {
        if (myToken !== tokenRef.current || isAbortError(err)) return; // anulowane / nieaktualne — nie błąd
        setLoading(false);
        setError(FETCH_ERROR);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [sessionId]);

  const replaceItem = useCallback((updated: Item) => {
    setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
  }, []);

  const setItemStatus = useCallback((id: string, acceptance_status: AcceptanceStatus) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, acceptance_status } : it)));
  }, []);

  return { items, loading, error, replaceItem, setItemStatus };
}
