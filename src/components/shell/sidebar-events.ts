// Kanał koordynacji powłoka ↔ wyspy (prod-feedback-fixes, Faza 5 ticket 80c4f735 + Faza 6 ticket
// 6fa2b64b — drugie zdarzenie, licznik „Do akceptacji"). Powłoka (`AppSidebar.astro`) jest statycznym
// Astro BEZ wyspy — stan zależny od danych (status klucza BYOK, licznik „Do akceptacji") liczony
// SERWEROWO raz na render (`AppLayout.astro`), więc nie reaguje na mutacje wykonane w wyspach React bez
// pełnego przeładowania strony. Wzorzec mostu wyspa→powłoka jak w `src/components/items/item-topbar-events.ts`:
// `CustomEvent` na `window` (globalne, bez zakładania współdzielonych modułów między osobnymi
// wyspami/inline scriptami).
//
// Odbiorcą jest inline `<script>` w `AppSidebar.astro` (progresywne wzbogacenie — sidebar zostaje
// statyczny, decyzja plan-review F2), nie komponent React, więc zamiast hooka (`useEffect`) eksportujemy
// zwykłą funkcję subskrybującą zwracającą `unsubscribe` — ten sam `addEventListener`/`removeEventListener`,
// jaki React-owy `useItemTopbarBridge.ts` owija w efekt, tu bez efektu (wołający sam decyduje o cyklu
// życia; w inline script to po prostu „na czas życia strony").

export const BYOK_KEY_CHANGED_EVENT = "byok-key-changed";

export interface ByokKeyChangedDetail {
  configured: boolean;
}

/** Rozgłasza zmianę stanu klucza BYOK (wołane z `useApiKey` po udanym `save`/`remove`). */
export function dispatchKeyChanged(configured: boolean): void {
  window.dispatchEvent(new CustomEvent<ByokKeyChangedDetail>(BYOK_KEY_CHANGED_EVENT, { detail: { configured } }));
}

/** Subskrybuje zmiany stanu klucza BYOK (wołane z inline `<script>` w `AppSidebar.astro`). Zwraca
 *  funkcję odsubskrybowującą. */
export function onKeyChanged(cb: (configured: boolean) => void): () => void {
  function handler(event: Event): void {
    // Rzut na `<... | undefined>`: jak w `item-topbar-events.ts` — obce/zniekształcone zdarzenie mogłoby
    // nie nieść `detail`, guard runtime pozostaje sensowny (i lint-czysty).
    const detail = (event as CustomEvent<ByokKeyChangedDetail | undefined>).detail;
    if (!detail) return;
    cb(detail.configured);
  }
  window.addEventListener(BYOK_KEY_CHANGED_EVENT, handler);
  return () => {
    window.removeEventListener(BYOK_KEY_CHANGED_EVENT, handler);
  };
}

// Faza 6 (ticket 6fa2b64b): licznik „Do akceptacji" w sidebarze (`pendingCount`, SSR) ma dokładnie ten
// sam problem jak wskaźnik klucza wyżej — bez tego zdarzenia zostaje nieaktualny po akceptacji/odrzuceniu
// w wyspie `/items` (PendingItemsView) aż do reloadu. Niesiemy DELTĘ (liczba ujemna — accept i reject OBA
// usuwają z pending, więc oba dekrementują), nie nowy stan absolutny: powłoka nie zna globalnego `total`
// poza tym, co wyrenderował SSR, więc odbiorca dolicza deltę do wartości trzymanej w DOM.

export const PENDING_COUNT_CHANGED_EVENT = "pending-count-changed";

export interface PendingCountChangedDetail {
  delta: number;
}

/** Rozgłasza zmianę licznika „Do akceptacji" o `delta` (wołane z `PendingItemsView.execute()` po sukcesie
 *  accept/reject — `dispatchPendingDelta(-count)`, `count` to liczba FAKTYCZNIE zmienionych). */
export function dispatchPendingDelta(delta: number): void {
  window.dispatchEvent(new CustomEvent<PendingCountChangedDetail>(PENDING_COUNT_CHANGED_EVENT, { detail: { delta } }));
}

/** Subskrybuje zmiany licznika „Do akceptacji" (wołane z inline `<script>` w `AppSidebar.astro`). Zwraca
 *  funkcję odsubskrybowującą. */
export function onPendingDelta(cb: (delta: number) => void): () => void {
  function handler(event: Event): void {
    // Rzut na `<... | undefined>`: jak wyżej — obce/zniekształcone zdarzenie mogłoby nie nieść `detail`.
    const detail = (event as CustomEvent<PendingCountChangedDetail | undefined>).detail;
    if (!detail) return;
    cb(detail.delta);
  }
  window.addEventListener(PENDING_COUNT_CHANGED_EVENT, handler);
  return () => {
    window.removeEventListener(PENDING_COUNT_CHANGED_EVENT, handler);
  };
}
