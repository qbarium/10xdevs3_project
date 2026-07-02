// Trwała preferencja „liczba wpisów na stronę" (S-11, uogólniona w S-13 F2) — localStorage, parametryzowana
// kluczem (osobna preferencja per lista) i pulą dozwolonych rozmiarów. Czyni wybór rozmiaru strony pamiętanym
// także między nawigacjami (nie tylko przez parametr URL): na „gołym" wejściu (URL bez `size`) wyspa adoptuje
// zapamiętaną wartość. Wszystko strażowane try/catch — bezpieczne pod SSR (brak `window`) i przy wyłączonym/
// niedostępnym storage. Wcześniej żyła w `import-sessions/page-size-pref.ts` z kluczem i pulą na sztywno.

/** Klucz preferencji dziennika sesji (S-11). NIE zmieniać wartości — zapamiętane wybory mają przeżyć refaktor. */
export const SESSION_LOG_PAGE_SIZE_KEY = "tasker.sessionLog.pageSize";

/** Klucz preferencji listy wpisów (S-13) — wspólny dla 5 widoków `/items*` i trybu sesji. */
export const ITEMS_LIST_PAGE_SIZE_KEY = "tasker.itemsList.pageSize";

/** Czy `n` jest jednym z dozwolonych rozmiarów strony (pula UI danej listy). */
export function isValidPageSize(n: number, sizes: readonly number[]): boolean {
  return sizes.includes(n);
}

/** Odczytuje zapamiętany rozmiar strony spod `key`; brak / spoza `sizes` / brak storage → `null`. */
export function readPageSizePref(key: string, sizes: readonly number[]): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return null;
    const n = Number(raw);
    return isValidPageSize(n, sizes) ? n : null;
  } catch {
    return null;
  }
}

/** Zapisuje rozmiar strony pod `key` (tylko wartość z puli `sizes`). Błędy storage połykane (best-effort). */
export function writePageSizePref(key: string, sizes: readonly number[], n: number): void {
  try {
    if (isValidPageSize(n, sizes)) window.localStorage.setItem(key, String(n));
  } catch {
    // SSR / storage niedostępny — preferencja po prostu nie zostaje zapisana.
  }
}
