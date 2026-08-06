// Wyspa szukajki w topbarze powłoki (S-15 Faza 3). Kontrolowany input (stan lokalny = natychmiastowa
// responsywność), a każda zmiana rozgłaszana do wyspy listy przez zdarzenie `tl:item-search` (source `topbar`);
// tam hook `useItemList` debounce'uje fetch i czyści zaznaczenie. Input synchronizuje się w drugą stronę:
//  - zdarzenie `list` (Wyczyść filtry w wyspie) → wyzeruj/ustaw input,
//  - `popstate` (back/forward) → odczytaj `?q=` z adresu (wyspa listy re-fetchuje niezależnie na tym samym
//    zdarzeniu). SSR renderuje `initialQuery` z URL → brak mignięcia „pusty input po hydracji".

import { useEffect, useRef, useState } from "react";

import SearchBox from "@/components/items/SearchBox";
import { dispatchItemSearch, ITEM_SEARCH_EVENT, type ItemSearchDetail } from "@/components/items/item-topbar-events";

export default function TopbarItemSearch({ initialQuery }: { initialQuery: string }) {
  const [value, setValue] = useState(initialQuery);
  const valueRef = useRef(initialQuery);

  function change(next: string) {
    valueRef.current = next;
    setValue(next);
    dispatchItemSearch(next, "topbar");
  }

  useEffect(() => {
    function onSearch(event: Event) {
      const detail = (event as CustomEvent<ItemSearchDetail | undefined>).detail;
      if (detail?.source !== "list") return;
      if (detail.q !== valueRef.current) {
        valueRef.current = detail.q;
        setValue(detail.q);
      }
    }
    function onPop() {
      const q = new URLSearchParams(window.location.search).get("q") ?? "";
      if (q !== valueRef.current) {
        valueRef.current = q;
        setValue(q);
      }
    }
    window.addEventListener(ITEM_SEARCH_EVENT, onSearch);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener(ITEM_SEARCH_EVENT, onSearch);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  return <SearchBox value={value} onChange={change} className="w-[240px] max-[920px]:w-[168px]" />;
}
