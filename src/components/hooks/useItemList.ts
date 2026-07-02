// Hook listy itemów (S-09, FR-008; paginacja S-13 F2): jedyny właściciel listy w wyspie. Pobiera stronę
// itemów wg `ListCriteria` z GET /api/items i utrzymuje adres strony w zgodzie z kryteriami
// (hydration-stable — ten sam parser co SSR). Wzorzec ekstrakcji czystej logiki jak useSessionRetry:
// `buildListUrl`/`mapListResponse`/`fetchList`/`isSearchOnlyChange` są testowane w node, a sam hook
// (debounce / popstate / history / AbortController) weryfikowany ręcznie (reguła CLAUDE.md: hooki
// w src/components/hooks/).
//
// Inwarianty:
//  - Zmiana kryteriów = re-fetch (lista autorytatywna z serwera) → naturalnie czyści listę; mutacje NIE
//    re-fetchują, nanoszą optimistic przez `applyOptimistic` (lista należy do hooka, nie do wyspy).
//  - Najnowsze żądanie wygrywa (F5): każde nowe pobranie anuluje poprzednie (`AbortController`) i jest
//    znaczone tokenem — odpowiedź spóźniona/anulowana nie podmienia listy ani nie ustawia błędu.
//  - Zapis URL po udanym fetchu: `pushState` dla zmian dyskretnych (typ/sort/dir/opstatus/strona —
//    back/forward je przełącza), `replaceState` dla kolejnych liter `q` (jeden wpis historii). `popstate`
//    re-parsuje adres.
//  - Okno strony (S-13 F2): preferencja rozmiaru adoptowana na „gołym" adresie (URL z `size` ma
//    pierwszeństwo — wzorzec useSessionList); optimistic koryguje `total` o różnicę długości listy.
//  - Kolejka „dosuwa się" (decyzja użytkownika 2026-07-02): po akcji usuwającej wpisy widok woła
//    `refetchAfterRemoval` — ciche dociągnięcie strony clampowanej do nowej liczby stron (replaceState,
//    bez spamu historii). Strona nigdy nie zostaje pusta ani „krótsza", gdy kolejne strony mają wpisy.

import { useCallback, useEffect, useRef, useState } from "react";

import { ITEMS_LIST_PAGE_SIZE_KEY, readPageSizePref } from "@/components/lists/page-size-pref";
import { criteriaToQuery, ITEM_PAGE_SIZES, parseListCriteria } from "@/lib/services/list-criteria";
import type { ListCriteria } from "@/lib/services/list-criteria";
import type { Item } from "@/types";

const DEBOUNCE_MS = 300;
const FETCH_ERROR = "Nie udało się zaktualizować listy. Spróbuj ponownie.";

interface ListResponse {
  ok?: boolean;
  items?: Item[];
  total?: number;
}

/** Wynik pojedynczego pobrania: dane / błąd / anulowane (zastąpione nowszym żądaniem). */
export type ListFetchOutcome =
  | { status: "ok"; items: Item[]; total: number }
  | { status: "error" }
  | { status: "aborted" };

/**
 * URL ŻĄDANIA do endpointu — `criteriaToQuery` pomija `view` (wynika ze ścieżki strony), ale endpoint go
 * WYMAGA (selektor predykatu), więc dokładamy `view` jawnie. To URL fetchu, nie adres strony (ten bez `view`).
 * Tryb sesji (S-13 F4): endpoint sesyjny, BEZ `view` (sesja to zakres, nie widok) i z oknem ZAWSZE jawnym —
 * ten endpoint traktuje brak `size` jako pełną listę (kompat panelu S-10 do F5), a tryb zawsze stronicuje.
 */
export function buildListUrl(criteria: ListCriteria): string {
  if (criteria.session) {
    return `/api/import-sessions/${encodeURIComponent(criteria.session)}/items?page=${criteria.page}&size=${criteria.size}`;
  }
  const qs = criteriaToQuery(criteria);
  return `/api/items?view=${criteria.view}${qs ? `&${qs}` : ""}`;
}

/**
 * Mapuje odpowiedź endpointu na itemy + total lub porażkę — sukces TYLKO gdy HTTP ok + `ok:true` + tablica
 * `items`. Brak liczbowego `total` → `items.length` (tolerancyjnie, wzorzec `mapSessionResponse`).
 */
export function mapListResponse(
  ok: boolean,
  data: ListResponse,
): { ok: true; items: Item[]; total: number } | { ok: false } {
  if (ok && data.ok && Array.isArray(data.items)) {
    return { ok: true, items: data.items, total: typeof data.total === "number" ? data.total : data.items.length };
  }
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
    return mapped.ok ? { status: "ok", items: mapped.items, total: mapped.total } : { status: "error" };
  } catch (err) {
    return isAbortError(err) ? { status: "aborted" } : { status: "error" };
  }
}

/**
 * Czy zmiana dotyczy WYŁĄCZNIE frazy `q` — wtedy debounce + `replaceState`. `page` CELOWO pomijane: zmiana
 * frazy resetuje stronę do 1 (`resetToFirstPage` w widokach), a to nadal jest „tylko wyszukiwanie" (jeden
 * wpis historii, bez natychmiastowego fetchu). `size` się LICZY (zmiana rozmiaru to nie wyszukiwanie).
 */
export function isSearchOnlyChange(prev: ListCriteria, next: ListCriteria): boolean {
  return (
    next.q !== prev.q &&
    prev.view === next.view &&
    prev.type === next.type &&
    prev.sort === next.sort &&
    prev.dir === next.dir &&
    prev.opstatus === next.opstatus &&
    prev.size === next.size
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
  /**
   * Ciche dociągnięcie po akcji USUWAJĄCEJ wpisy z listy (kolejka się dosuwa): re-fetch strony
   * (domyślnie bieżącej; `targetPage` np. dla „Wyczyść kosz" → 1) clampowanej do nowej liczby stron
   * wg lokalnie skorygowanego `total`. Zapis adresu przez replaceState — seria akcji nie spamuje historii.
   */
  refetchAfterRemoval: (targetPage?: number) => void;
  loading: boolean;
  error: string | null;
  /** Łączna liczba itemów pasujących do `settledCriteria` (korygowana lokalnie przez optimistic). */
  total: number;
  /** Numer aktualnie wyświetlanej strony (z `settledCriteria`). */
  page: number;
  /** Liczba stron (≥ 1) wg `total` i rozmiaru z `settledCriteria`. */
  pageCount: number;
}

export function useItemList(
  view: ListCriteria["view"],
  initialItems: Item[],
  initialCriteria: ListCriteria,
  initialTotal: number,
): UseItemList {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [total, setTotal] = useState<number>(initialTotal);
  const [criteria, setCriteriaState] = useState<ListCriteria>(initialCriteria);
  // Kryteria odpowiadające AKTUALNIE wyświetlanej liście (`items`) — aktualizowane DOPIERO, gdy fetch wróci
  // i podmieni listę. Decyzje układu w wyspach (widoczność paska filtrów, rodzaj pustego stanu) bazują na NIM,
  // a nie na `criteria` (które zmienia się synchronicznie w `setCriteria`). Inaczej między klikiem a powrotem
  // fetcha powstaje render z niespójnym stanem (criteria=nowe, items=stare) → migotanie ekranu pośredniego.
  const [settledCriteria, setSettledCriteria] = useState<ListCriteria>(initialCriteria);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const criteriaRef = useRef(initialCriteria);
  // Lustro `items` do synchronicznej matematyki optimistic (korekta `total` bez czekania na re-render);
  // aktualizowane WSZĘDZIE tam, gdzie `setItems` (runFetch + applyOptimistic).
  const itemsRef = useRef(initialItems);
  // Lustro `total` — refetchAfterRemoval liczy clamp strony synchronicznie, zaraz po optimistic.
  const totalRef = useRef(initialTotal);
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
        itemsRef.current = outcome.items;
        setItems(outcome.items);
        totalRef.current = outcome.total;
        setTotal(outcome.total);
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
    // Mutacja liczona synchronicznie na lustrze (itemsRef) — korekta `total` o różnicę długości listy
    // (usunięcia/wstawienia w obrębie strony) bez re-fetchu. Widoki kolejkowe po akcji usuwającej wołają
    // dodatkowo `refetchAfterRemoval` (dociągnięcie strony); tryb sesji podmienia wiersze w miejscu i
    // dociągnięcia nie potrzebuje. Wołane z handlerów zdarzeń (nie z renderu) — efekt uboczny bezpieczny.
    const prev = itemsRef.current;
    const next = updater(prev);
    itemsRef.current = next;
    setItems(next);
    const delta = next.length - prev.length;
    if (delta !== 0) {
      totalRef.current = Math.max(0, totalRef.current + delta);
      setTotal(totalRef.current);
    }
  }, []);

  // Dociągnięcie kolejki po akcji usuwającej (decyzja 2026-07-02): strona docelowa = min(bieżąca — lub
  // jawna `targetPage` — nowa liczba stron wg lokalnego `total`), nie mniej niż 1. Re-fetch przez runFetch
  // z `replace: true` — seria akcji nadpisuje jeden wpis historii zamiast produkować identyczne wpisy.
  const refetchAfterRemoval = useCallback(
    (targetPage?: number) => {
      const current = criteriaRef.current;
      const pageCount = Math.max(1, Math.ceil(totalRef.current / current.size));
      const page = Math.max(1, Math.min(targetPage ?? current.page, pageCount));
      const next = { ...current, page };
      criteriaRef.current = next;
      setCriteriaState(next);
      runFetch(next, { replace: true, fromPopstate: false });
    },
    [runFetch],
  );

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

  // Trwała preferencja rozmiaru strony: na „gołym" wejściu (URL bez `size`) adoptuj zapamiętaną wartość
  // (cookie; fallback legacy localStorage) i re-fetchuj BEZ zapisu URL. URL z `size` ma pierwszeństwo.
  // SSR nakłada preferencję z cookie już przy renderze (withPageSizePref), więc normalnie stored ===
  // criteria.size i efekt jest no-opem — realnie odpala się tylko przy migracji z localStorage.
  // Wzorzec useSessionList; klucz wspólny dla wszystkich widoków listy wpisów.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("size")) return;
    const stored = readPageSizePref(ITEMS_LIST_PAGE_SIZE_KEY, ITEM_PAGE_SIZES);
    if (stored == null || stored === criteriaRef.current.size) return;
    const next = { ...criteriaRef.current, size: stored, page: 1 };
    criteriaRef.current = next;
    setCriteriaState(next);
    runFetch(next, { replace: false, fromPopstate: true });
  }, [runFetch]);

  // Sprzątanie przy odmontowaniu: ubij timer debounce i anuluj fetch w locie.
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / settledCriteria.size));

  return {
    items,
    criteria,
    settledCriteria,
    setCriteria,
    applyOptimistic,
    refetchAfterRemoval,
    loading,
    error,
    total,
    page: settledCriteria.page,
    pageCount,
  };
}
