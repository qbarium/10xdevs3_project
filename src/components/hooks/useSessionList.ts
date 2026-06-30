// Hook listy dziennika sesji importu (S-11): jedyny właściciel listy w wyspie. Pobiera stronę listy wg
// `SessionListCriteria` z GET /api/import-sessions i utrzymuje adres strony w zgodzie z kryteriami
// (hydration-stable — ten sam parser co SSR). Wzorzec `useItemList` (S-09), ale PROSTSZY: dziennik nie ma
// wyszukiwania tekstowego, więc brak gałęzi debounce/`q`; retry sesji żyje niezależnie w `SessionRow`
// (`useSessionRetry`, mutacja in-place), więc lista nie potrzebuje `applyOptimistic`. Czyste funkcje
// (`buildSessionListUrl`/`mapSessionResponse`/`fetchSessionList`) testowane w node; pełen hook
// (popstate/history/AbortController) weryfikowany ręcznie na `npm run preview`.
//
// Inwarianty:
//  - Zmiana kryteriów = re-fetch (lista autorytatywna z serwera). Każde nowe pobranie anuluje poprzednie
//    (`AbortController`) i jest znaczone tokenem — odpowiedź spóźniona/anulowana nie podmienia listy.
//  - `settledCriteria` = kryteria pasujące do AKTUALNIE wyświetlanej listy (aktualizowane DOPIERO po powrocie
//    fetcha). Układ wyspy (pusty stan, wskaźnik strony) bazuje na NIM, nie na `criteria` (które zmienia się
//    synchronicznie w `setCriteria`) — inaczej między klikiem a powrotem fetcha render byłby niespójny.
//  - Zapis URL po udanym fetchu: `pushState` (back/forward przełącza kryteria); `popstate` re-parsuje adres.

import { useCallback, useEffect, useRef, useState } from "react";

import { readPageSizePref } from "@/components/import-sessions/page-size-pref";
import type { SessionRowData } from "@/components/import-sessions/SessionRow";
import { parseSessionListCriteria, sessionCriteriaToQuery } from "@/lib/services/session-list-criteria";
import type { SessionListCriteria } from "@/lib/services/session-list-criteria";

const FETCH_ERROR = "Nie udało się zaktualizować listy. Spróbuj ponownie.";

interface SessionListResponse {
  ok?: boolean;
  rows?: SessionRowData[];
  total?: number;
}

/** Wynik pojedynczego pobrania: dane / błąd / anulowane (zastąpione nowszym żądaniem). */
export type SessionListFetchOutcome =
  | { status: "ok"; rows: SessionRowData[]; total: number }
  | { status: "error" }
  | { status: "aborted" };

/**
 * URL ŻĄDANIA do endpointu listy. `sessionCriteriaToQuery` pomija pola domyślne (czysty, krótki URL);
 * przy samych domyślnych URL to goły `/api/import-sessions` (endpoint nie wymaga żadnego pola obowiązkowego).
 */
export function buildSessionListUrl(criteria: SessionListCriteria): string {
  const qs = sessionCriteriaToQuery(criteria);
  return qs ? `/api/import-sessions?${qs}` : "/api/import-sessions";
}

/** Mapuje odpowiedź endpointu na wiersze + total — sukces TYLKO gdy HTTP ok + `ok:true` + tablica `rows`. */
export function mapSessionResponse(
  ok: boolean,
  data: SessionListResponse,
): { ok: true; rows: SessionRowData[]; total: number } | { ok: false } {
  if (ok && data.ok && Array.isArray(data.rows)) {
    return { ok: true, rows: data.rows, total: typeof data.total === "number" ? data.total : data.rows.length };
  }
  return { ok: false };
}

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";
}

/**
 * Pobiera stronę listy wg kryteriów z przekazanym `signal`. Anulowanie (signal przerwany przez nowsze
 * żądanie) → `aborted` (połykane wyżej, NIE błąd). Błąd sieci / odpowiedź nie-ok / zły kształt → `error`.
 * Czyste i testowalne w node (mock `fetch` + `AbortController`).
 */
export async function fetchSessionList(
  criteria: SessionListCriteria,
  signal: AbortSignal,
): Promise<SessionListFetchOutcome> {
  try {
    const res = await fetch(buildSessionListUrl(criteria), { signal });
    const data = (await res.json()) as SessionListResponse;
    const mapped = mapSessionResponse(res.ok, data);
    return mapped.ok ? { status: "ok", rows: mapped.rows, total: mapped.total } : { status: "error" };
  } catch (err) {
    return isAbortError(err) ? { status: "aborted" } : { status: "error" };
  }
}

export interface UseSessionList {
  rows: SessionRowData[];
  /** Żywe kryteria (sterują KONTROLKAMI — responsywne, zmieniają się natychmiast). */
  criteria: SessionListCriteria;
  /** Kryteria pasujące do wyświetlanej `rows` (sterują UKŁADEM — pusty stan, wskaźnik strony; bez migotania). */
  settledCriteria: SessionListCriteria;
  /** Zmiana kryteriów → re-fetch (anuluje poprzednie żądanie; najnowsze wygrywa). */
  setCriteria: (next: SessionListCriteria) => void;
  loading: boolean;
  error: string | null;
  /** Łączna liczba sesji pasujących do `settledCriteria` (do liczenia stron). */
  total: number;
  /** Numer aktualnie wyświetlanej strony (z `settledCriteria`). */
  page: number;
  /** Liczba stron (≥ 1) wg `total` i stałego `SESSION_PAGE_SIZE`. */
  pageCount: number;
}

export function useSessionList(
  initialRows: SessionRowData[],
  initialCriteria: SessionListCriteria,
  initialTotal: number,
): UseSessionList {
  const [rows, setRows] = useState<SessionRowData[]>(initialRows);
  const [criteria, setCriteriaState] = useState<SessionListCriteria>(initialCriteria);
  const [settledCriteria, setSettledCriteria] = useState<SessionListCriteria>(initialCriteria);
  const [total, setTotal] = useState<number>(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const criteriaRef = useRef(initialCriteria);
  const abortRef = useRef<AbortController | null>(null);
  const tokenRef = useRef(0);

  // Pobranie: anuluj poprzednie, znacz tokenem, zastosuj TYLKO jeśli token wciąż najnowszy (najnowsze wygrywa).
  const runFetch = useCallback((next: SessionListCriteria, opts: { fromPopstate: boolean }) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const myToken = ++tokenRef.current;
    setLoading(true);
    setError(null);
    void fetchSessionList(next, controller.signal).then((outcome) => {
      if (myToken !== tokenRef.current || outcome.status === "aborted") return; // zastąpione nowszym żądaniem
      setLoading(false);
      if (outcome.status === "ok") {
        setRows(outcome.rows);
        setTotal(outcome.total);
        setSettledCriteria(next); // lista i jej kryteria zmieniają się razem (spójny układ, bez migotania)
        // Zapis adresu pomijamy dla popstate (adres już zmieniony przez back/forward).
        if (!opts.fromPopstate) {
          const qs = sessionCriteriaToQuery(next);
          window.history.pushState(null, "", qs ? `?${qs}` : window.location.pathname);
        }
      } else {
        setError(FETCH_ERROR); // poprzednia lista zostaje (hook jej nie czyści)
      }
    });
  }, []);

  const setCriteria = useCallback(
    (next: SessionListCriteria) => {
      criteriaRef.current = next;
      setCriteriaState(next);
      runFetch(next, { fromPopstate: false });
    },
    [runFetch],
  );

  // Back/forward: re-parsuj adres tym samym parserem co SSR i re-fetchuj BEZ zapisu URL (adres już zmieniony).
  useEffect(() => {
    function onPopState() {
      const next = parseSessionListCriteria(new URLSearchParams(window.location.search));
      criteriaRef.current = next;
      setCriteriaState(next);
      runFetch(next, { fromPopstate: true });
    }
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [runFetch]);

  // Trwała preferencja rozmiaru strony: na „gołym" wejściu (URL bez `size`) adoptuj zapamiętaną wartość z
  // localStorage i re-fetchuj BEZ zapisu URL (preferencja nie zaśmieca adresu). URL z `size` ma pierwszeństwo.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("size")) return;
    const stored = readPageSizePref();
    if (stored == null || stored === criteriaRef.current.size) return;
    const next = { ...criteriaRef.current, size: stored, page: 1 };
    criteriaRef.current = next;
    setCriteriaState(next);
    runFetch(next, { fromPopstate: true });
  }, [runFetch]);

  // Sprzątanie przy odmontowaniu: anuluj fetch w locie.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / settledCriteria.size));

  return {
    rows,
    criteria,
    settledCriteria,
    setCriteria,
    loading,
    error,
    total,
    page: settledCriteria.page,
    pageCount,
  };
}
