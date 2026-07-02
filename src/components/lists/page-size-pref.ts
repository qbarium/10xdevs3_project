// Trwała preferencja „liczba wpisów na stronę" (S-11; od poprawki S-13 2026-07-02 w COOKIE zamiast
// localStorage) — parametryzowana kluczem (osobna preferencja per lista) i pulą dozwolonych rozmiarów.
// Cookie (path=/, rok, SameSite=Lax) widzi też SERWER: strony SSR renderują na „gołym" adresie od razu
// właściwą liczbę wierszy (URL z `size` ma pierwszeństwo) — bez migotania „domyślna strona → docięta po
// adopcji", które dawał localStorage (niewidoczny przy SSR). Odczyt kliencki ma fallback do starego
// zapisu localStorage (jednorazowa migracja do cookie). Wszystko best-effort w try/catch — bezpieczne
// pod SSR (brak `document`/`window`) i przy zablokowanym storage.

/** Klucz preferencji dziennika sesji (S-11). NIE zmieniać wartości — zapamiętane wybory mają przeżyć refaktor. */
export const SESSION_LOG_PAGE_SIZE_KEY = "tasker.sessionLog.pageSize";

/** Klucz preferencji listy wpisów (S-13) — wspólny dla 5 widoków `/items*` i trybu sesji. */
export const ITEMS_LIST_PAGE_SIZE_KEY = "tasker.itemsList.pageSize";

/** Czas życia cookie preferencji: rok (w sekundach). */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Czy `n` jest jednym z dozwolonych rozmiarów strony (pula UI danej listy). */
export function isValidPageSize(n: number, sizes: readonly number[]): boolean {
  return sizes.includes(n);
}

/**
 * Czysty parser surowej wartości preferencji → rozmiar z puli albo `null`. Wspólny dla odczytu
 * klienckiego (cookie/localStorage) i stron SSR (`Astro.cookies.get(key)?.value`).
 */
export function parsePageSizePref(raw: string | null | undefined, sizes: readonly number[]): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return isValidPageSize(n, sizes) ? n : null;
}

/**
 * Nakłada preferencję rozmiaru (surowa wartość cookie) na kryteria, gdy adres NIE niesie `size`
 * (URL ma pierwszeństwo — ta sama reguła co kliencka adopcja w hookach). Dla stron SSR: wyspa dostaje
 * `initialCriteria` już z preferencją, więc kliencka adopcja jest no-opem — zero migotania listy.
 */
export function withPageSizePref<T extends { size: number }>(
  criteria: T,
  params: URLSearchParams,
  rawCookie: string | undefined,
  sizes: readonly number[],
): T {
  if (params.has("size")) return criteria;
  const pref = parsePageSizePref(rawCookie, sizes);
  return pref === null ? criteria : { ...criteria, size: pref };
}

/** Odczyt cookie po nazwie z `document.cookie`; brak → `null` (brak DOM → rzut łapany wyżej). */
function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
  }
  return null;
}

/**
 * Odczytuje zapamiętany rozmiar strony spod `key` (klient): najpierw cookie, przy jego braku stary
 * zapis localStorage (sprzed przejścia na cookie) — znaleziona wartość legacy jest od razu przepisywana
 * do cookie (jednorazowa migracja). Brak / spoza `sizes` / brak storage → `null`.
 */
export function readPageSizePref(key: string, sizes: readonly number[]): number | null {
  try {
    const fromCookie = parsePageSizePref(readCookie(key), sizes);
    if (fromCookie !== null) return fromCookie;
    const legacy = parsePageSizePref(window.localStorage.getItem(key), sizes);
    if (legacy !== null) writePageSizePref(key, sizes, legacy);
    return legacy;
  } catch {
    return null;
  }
}

/** Zapisuje rozmiar strony pod `key` (cookie: cała witryna, rok, SameSite=Lax). Błędy połykane (best-effort). */
export function writePageSizePref(key: string, sizes: readonly number[], n: number): void {
  try {
    if (isValidPageSize(n, sizes)) {
      document.cookie = `${key}=${String(n)}; path=/; max-age=${String(COOKIE_MAX_AGE)}; samesite=lax`;
    }
  } catch {
    // SSR / storage niedostępny — preferencja po prostu nie zostaje zapisana.
  }
}
