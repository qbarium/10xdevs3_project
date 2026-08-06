// Mostek wyspy listy do topbara powłoki (S-15 Faza 3): nasłuchuje zdarzeń frazy i akcji głównej z topbara
// (`item-topbar-events`) i deleguje je do handlerów widoku. Handlery trzymane w refie aktualizowanym co
// render (wzorzec „latest ref") — nasłuch rejestruje się RAZ (stabilne listenery), a mimo to zawsze woła
// najświeższą domknięcie (bieżące `criteria`), bez wypinania/wpinania listenerów przy każdej zmianie.

import { useEffect, useRef } from "react";

import {
  ITEM_ACTION_EVENT,
  ITEM_SEARCH_EVENT,
  readLatestItemSearch,
  type ItemActionDetail,
  type ItemPrimaryAction,
  type ItemSearchDetail,
} from "@/components/items/item-topbar-events";

interface Handlers {
  /** Fraza z topbara — widok stosuje ją przez `applyCriteria` (debounce hooka + czyszczenie zaznaczenia). */
  onSearch: (q: string) => void;
  /** Akcja główna z topbara (np. „Dodaj wpis" / „Wyczyść kosz") — widok otwiera dialog/potwierdzenie. */
  onPrimaryAction?: (action: ItemPrimaryAction) => void;
}

export function useItemTopbarBridge(handlers: Handlers): void {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    function onSearch(event: Event) {
      // Rzut na `<... | undefined>`: `CustomEvent.detail` jest domyślnie typowany jako niepusty, ale obce/
      // zniekształcone zdarzenie mogłoby go nie nieść — guard runtime pozostaje sensowny (i lint-czysty).
      const detail = (event as CustomEvent<ItemSearchDetail | undefined>).detail;
      // Reaguj tylko na frazę OD topbara — echo `list` (Wyczyść filtry) obsługuje wyspa szukajki, nie widok.
      if (detail?.source !== "topbar") return;
      handlersRef.current.onSearch(detail.q);
    }
    function onAction(event: Event) {
      const detail = (event as CustomEvent<ItemActionDetail | undefined>).detail;
      if (!detail) return;
      handlersRef.current.onPrimaryAction?.(detail.action);
    }
    window.addEventListener(ITEM_SEARCH_EVENT, onSearch);
    window.addEventListener(ITEM_ACTION_EVENT, onAction);
    // Reconcyliacja wyścigu hydracji: jeśli topbar rozgłosił frazę, ZANIM ten listener się zarejestrował
    // (lżejsza wyspa topbara montuje się pierwsza), zdarzenie przepadło — dogoń ostatnią frazę z bufora.
    // Bufor pusty na świeżym wejściu (URL zasiewa obie wyspy; topbar nie rozgłasza na starcie), więc replay
    // odpala się TYLKO po realnie zgubionym zdarzeniu; echo „list" (Wyczyść filtry) jest tu ignorowane.
    const latest = readLatestItemSearch();
    if (latest?.source === "topbar") {
      handlersRef.current.onSearch(latest.q);
    }
    return () => {
      window.removeEventListener(ITEM_SEARCH_EVENT, onSearch);
      window.removeEventListener(ITEM_ACTION_EVENT, onAction);
    };
  }, []);
}
