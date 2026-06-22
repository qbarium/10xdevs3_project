// Hook listy itemów (S-09, FR-008): jedyny właściciel listy w wyspie. Pobiera itemy wg `ListCriteria` z
// GET /api/items i utrzymuje adres strony w zgodzie z kryteriami (hydration-stable — ten sam parser co SSR).
// Wzorzec ekstrakcji czystej logiki jak useSessionRetry: `buildListUrl`/`mapListResponse`/`fetchList` są
// testowane w node, a sam hook (debounce / popstate / history / AbortController) weryfikowany ręcznie
// w Fazach 4-5 (reguła CLAUDE.md: hooki w src/components/hooks/).
//
// Inwarianty:
//  - Zmiana kryteriów = re-fetch (lista autorytatywna z serwera) → naturalnie czyści listę; mutacje NIE
//    re-fetchują, nanoszą optimistic przez `applyOptimistic` (lista należy do hooka, nie do wyspy).
//  - Najnowsze żądanie wygrywa (F5): każde nowe pobranie anuluje poprzednie (`AbortController`) i jest
//    znaczone tokenem — odpowiedź spóźniona/anulowana nie podmienia listy ani nie ustawia błędu.
//  - Zapis URL po udanym fetchu: `pushState` dla zmian dyskretnych (typ/sort/dir/opstatus — back/forward je
//    przełącza), `replaceState` dla kolejnych liter `q` (jeden wpis historii). `popstate` re-parsuje adres.

import { useCallback, useEffect, useRef, useState } from "react";

import { criteriaToQuery, parseListCriteria } from "@/lib/services/list-criteria";
import type { ListCriteria } from "@/lib/services/list-criteria";
import type { Item } from "@/types";

const DEBOUNCE_MS = 300;
const FETCH_ERROR = "Nie udało się zaktualizować listy. Spróbuj ponownie.";

interface ListResponse {
  ok?: boolean;
  items?: Item[];
}

/** Wynik pojedynczego pobrania: dane / błąd / anulowane (zastąpione nowszym żądaniem). */
export type ListFetchOutcome = { status: "ok"; items: Item[] } | { status: "error" } | { status: "aborted" };

/**
 * URL ŻĄDANIA do endpointu — `criteriaToQuery` pomija `view` (wynika ze ścieżki strony), ale endpoint go
 * WYMAGA (selektor predykatu), więc dokładamy `view` jawnie. To URL fetchu, nie adres strony (ten bez `view`).
 */
export function buildListUrl(criteria: ListCriteria): string {
  const qs = criteriaToQuery(criteria);
  return `/api/items?view=${criteria.view}${qs ? `&${qs}` : ""}`;
}

/** Mapuje odpowiedź endpointu na itemy lub porażkę — sukces TYLKO gdy HTTP ok + `ok:true` + tablica `items`. */
export function mapListResponse(ok: boolean, data: ListResponse): { ok: true; items: Item[] } | { ok: false } {
  if (ok && data.ok && Array.isArray(data.items)) return { ok: true, items: data.items };
  return { ok: false };
}

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";
}

/**
 * Pobiera listę wg kryteriów z przekazanym `signal`. Anulowanie (signal przerwany przez nowsze żądanie) →
 * `aborted` (połykane wyżej, NIE błąd). Błąd sieci / odpowiedź nie-ok / zły kształt → `error`. Czyste
 * i testowalne w node (mock `fetch` + `AbortController`).
 */
export async function fetchList(criteria: ListCriteria, signal: AbortSignal): Promise<ListFetchOutcome> {
  try {
    const res = await fetch(buildListUrl(criteria), { signal });
    const data = (await res.json()) as ListResponse;
    const mapped = mapListResponse(res.ok, data);
    return mapped.ok ? { status: "ok", items: mapped.items } : { status: "error" };
  } catch (err) {
    return isAbortError(err) ? { status: "aborted" } : { status: "error" };
  }
}

/** Czy zmiana dotyczy WYŁĄCZNIE frazy `q` (reszta pól identyczna) — wtedy debounce + `replaceState`. */
function isSearchOnlyChange(prev: ListCriteria, next: ListCriteria): boolean {
  return (
    next.q !== prev.q &&
    prev.view === next.view &&
    prev.type === next.type &&
    prev.sort === next.sort &&
    prev.dir === next.dir &&
    prev.opstatus === next.opstatus
  );
}

export interface UseItemList {
  items: Item[];
  /** Żywe kryteria (sterują KONTROLKAMI — responsywne, zmieniają się natychmiast). */
  criteria: ListCriteria;
  /** Kryteria pasujące do wyświetlanej `items` (sterują UKŁADEM — pasek/pusty stan, bez migotania). */
  settledCriteria: ListCriteria;
  /** Zmiana kryteriów → re-fetch. Zmiana samej frazy `q` jest debounce'owana (~300 ms) i scala wpis historii. */
  setCriteria: (next: ListCriteria) => void;
  /** Nanosi optimistic mutację na listę hooka (bez re-fetchu); unieważnia fetch w locie, by jej nie cofnął. */
  applyOptimistic: (updater: (prev: Item[]) => Item[]) => void;
  loading: boolean;
  error: string | null;
}

export function useItemList(
  view: ListCriteria["view"],
  initialItems: Item[],
  initialCriteria: ListCriteria,
): UseItemList {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [criteria, setCriteriaState] = useState<ListCriteria>(initialCriteria);
  // Kryteria odpowiadające AKTUALNIE wyświetlanej liście (`items`) — aktualizowane DOPIERO, gdy fetch wróci
  // i podmieni listę. Decyzje układu w wyspach (widoczność paska filtrów, rodzaj pustego stanu) bazują na NIM,
  // a nie na `criteria` (które zmienia się synchronicznie w `setCriteria`). Inaczej między klikiem a powrotem
  // fetcha powstaje render z niespójnym stanem (criteria=nowe, items=stare) → migotanie ekranu pośredniego.
  const [settledCriteria, setSettledCriteria] = useState<ListCriteria>(initialCriteria);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const criteriaRef = useRef(initialCriteria);
  const abortRef = useRef<AbortController | null>(null);
  const tokenRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pobranie: anuluj poprzednie, znacz tokenem, zastosuj TYLKO jeśli token wciąż najnowszy (F5).
  const runFetch = useCallback((next: ListCriteria, opts: { replace: boolean; fromPopstate: boolean }) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const myToken = ++tokenRef.current;
    setLoading(true);
    setError(null);
    void fetchList(next, controller.signal).then((outcome) => {
      if (myToken !== tokenRef.current || outcome.status === "aborted") return; // zastąpione nowszym żądaniem
      setLoading(false);
      if (outcome.status === "ok") {
        setItems(outcome.items);
        setSettledCriteria(next); // lista i jej kryteria zmieniają się razem (spójny układ, bez migotania)
        // Zapis adresu pomijamy dla popstate (adres już zmieniony przez back/forward).
        if (!opts.fromPopstate) {
          const qs = criteriaToQuery(next);
          const url = qs ? `?${qs}` : window.location.pathname;
          if (opts.replace) window.history.replaceState(null, "", url);
          else window.history.pushState(null, "", url);
        }
      } else {
        setError(FETCH_ERROR); // poprzednia lista zostaje (hook jej nie czyści)
      }
    });
  }, []);

  const scheduleFetch = useCallback(
    (next: ListCriteria, opts: { debounce: boolean; replace: boolean }) => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (opts.debounce) {
        debounceRef.current = setTimeout(() => {
          debounceRef.current = null;
          runFetch(next, { replace: opts.replace, fromPopstate: false });
        }, DEBOUNCE_MS);
      } else {
        runFetch(next, { replace: opts.replace, fromPopstate: false });
      }
    },
    [runFetch],
  );

  const setCriteria = useCallback(
    (next: ListCriteria) => {
      const prev = criteriaRef.current;
      criteriaRef.current = next;
      setCriteriaState(next);
      const searchOnly = isSearchOnlyChange(prev, next);
      scheduleFetch(next, { debounce: searchOnly, replace: searchOnly });
    },
    [scheduleFetch],
  );

  const applyOptimistic = useCallback((updater: (prev: Item[]) => Item[]) => {
    // Optimistic jest autorytatywny do następnej zmiany kryteriów: unieważnij fetch w locie (token + abort)
    // i ubij oczekujący debounce, by spóźniona odpowiedź nie cofnęła naniesionej zmiany.
    abortRef.current?.abort();
    tokenRef.current++;
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setLoading(false);
    setItems((prev) => updater(prev));
  }, []);

  // Back/forward: re-parsuj adres tym samym parserem co SSR i re-fetchuj BEZ zapisu URL (adres już zmieniony).
  useEffect(() => {
    function onPopState() {
      const next = parseListCriteria(view, new URLSearchParams(window.location.search));
      criteriaRef.current = next;
      setCriteriaState(next);
      runFetch(next, { replace: false, fromPopstate: true });
    }
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [view, runFetch]);

  // Sprzątanie przy odmontowaniu: ubij timer debounce i anuluj fetch w locie.
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  return { items, criteria, settledCriteria, setCriteria, applyOptimistic, loading, error };
}
