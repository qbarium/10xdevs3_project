// Trwała preferencja „liczba wpisów na stronę" dziennika sesji (S-11) — localStorage. Czyni wybór rozmiaru
// strony pamiętanym także między nawigacjami (nie tylko przez parametr URL): na „gołym" wejściu (URL bez
// `size`) wyspa adoptuje zapamiętaną wartość. Wszystko strażowane try/catch — bezpieczne pod SSR (brak
// `window`) i przy wyłączonym/niedostępnym storage. Walidacja względem puli `SESSION_PAGE_SIZES`.

import { SESSION_PAGE_SIZES } from "@/lib/services/session-list-criteria";

const STORAGE_KEY = "tasker.sessionLog.pageSize";

/** Czy `n` jest jednym z dozwolonych rozmiarów strony (pula UI). */
export function isValidPageSize(n: number): boolean {
  return (SESSION_PAGE_SIZES as readonly number[]).includes(n);
}

/** Odczytuje zapamiętany rozmiar strony; brak / niepoprawny / brak storage → `null`. */
export function readPageSizePref(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const n = Number(raw);
    return isValidPageSize(n) ? n : null;
  } catch {
    return null;
  }
}

/** Zapisuje rozmiar strony (tylko wartość z puli). Błędy storage połykane (best-effort). */
export function writePageSizePref(n: number): void {
  try {
    if (isValidPageSize(n)) window.localStorage.setItem(STORAGE_KEY, String(n));
  } catch {
    // SSR / storage niedostępny — preferencja po prostu nie zostaje zapisana.
  }
}
