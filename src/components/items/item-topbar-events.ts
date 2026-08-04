// Kanał koordynacji topbar ↔ wyspa listy (S-15 Faza 3). Szukajka i akcja główna („Dodaj wpis" / „Wyczyść
// kosz") żyją w topbarze powłoki (osobne wyspy Astro), a stan listy — w wyspie widoku. Komunikują się przez
// zdarzenia `window` (globalne, bez założeń o współdzieleniu modułów między osobnymi wyspami). URL pozostaje
// źródłem prawdy (wyspa listy synchronizuje go po fetchu); zdarzenia niosą tylko INTENCJĘ.
//
// Kierunki:
//  - fraza `topbar` → wyspa listy stosuje ją przez `applyCriteria` (zachowuje debounce sieciowy hooka ORAZ
//    czyszczenie zaznaczenia — parytet dawnego `SearchBox` w pasku filtrów);
//  - fraza `list` → topbar synchronizuje input (gdy wyspa zeruje frazę „Wyczyść filtry");
//  - akcja główna → wyspa listy otwiera odpowiedni dialog/potwierdzenie.

export const ITEM_SEARCH_EVENT = "tl:item-search";
export const ITEM_ACTION_EVENT = "tl:item-action";

export type SearchSource = "topbar" | "list";
export interface ItemSearchDetail {
  q: string;
  source: SearchSource;
}

export type ItemPrimaryAction = "add" | "empty-trash";
export interface ItemActionDetail {
  action: ItemPrimaryAction;
}

// Bufor ostatniej frazy na `window` (wyspy nie współdzielą modułów). Domyka wyścig hydracji: gdy topbar
// rozgłosi frazę, zanim mostek wyspy listy zarejestruje listener (lżejsza wyspa topbara montuje się
// pierwsza), zdarzenie przepada. Mostek odczytuje ten bufor przy montażu i dogania zgubioną frazę.
interface ItemSearchWindow {
  __tlItemSearchLatest?: ItemSearchDetail;
}

/** Rozgłasza zmianę frazy wyszukiwania. `source` rozróżnia nadawcę, by uniknąć pętli echo. Zapisuje też
 *  ostatnią frazę do bufora na `window` (patrz `readLatestItemSearch`). */
export function dispatchItemSearch(q: string, source: SearchSource): void {
  const detail: ItemSearchDetail = { q, source };
  (window as unknown as ItemSearchWindow).__tlItemSearchLatest = detail;
  window.dispatchEvent(new CustomEvent<ItemSearchDetail>(ITEM_SEARCH_EVENT, { detail }));
}

/** Ostatnia rozgłoszona fraza (lub null) — mostek listy używa jej przy montażu, by dogonić zdarzenie
 *  zgubione w oknie hydracji (topbar rozgłosił, zanim listener mostka wstał). */
export function readLatestItemSearch(): ItemSearchDetail | null {
  return (window as unknown as ItemSearchWindow).__tlItemSearchLatest ?? null;
}

/** Rozgłasza żądanie akcji głównej z topbara — wyspa widoku otwiera dialog/potwierdzenie. */
export function dispatchItemAction(action: ItemPrimaryAction): void {
  window.dispatchEvent(new CustomEvent<ItemActionDetail>(ITEM_ACTION_EVENT, { detail: { action } }));
}
