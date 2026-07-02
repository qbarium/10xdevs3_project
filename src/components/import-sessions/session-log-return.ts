// Adres powrotny dziennika (S-13, poprawka po testach manualnych 2026-07-02): „Wróć do dziennika"
// w trybie sesji ma prowadzić DOKŁADNIE tam, skąd użytkownik wyszedł (strona/filtr/sort), nie na
// domyślną pierwszą stronę. Karta „Pokaż wpisy" zapisuje query dziennika w `sessionStorage` w chwili
// wyjścia; baner trybu odczytuje je i podmienia odnośnik powrotu. `sessionStorage` (per karta
// przeglądarki), nie `localStorage` — kontekst powrotu jest ulotny jak sesja przeglądania, a deep-link
// bez zapisu ma prowadzić na goły `/import-sessions`. Wszystko best-effort w try/catch (wzorzec
// `page-size-pref`): brak storage → domyślny odnośnik, bez rzutu. Moduł bezzależnościowy — importuje go
// wyspa React (SessionCard) ORAZ kliencki skrypt banera (.astro) bez wciągania Reacta do bundla skryptu.

const SESSION_LOG_RETURN_KEY = "tasker.sessionLog.return";

/** Zapamiętuje query dziennika w chwili wyjścia do trybu sesji (klik „Pokaż wpisy"). */
export function rememberSessionLogReturn(): void {
  try {
    window.sessionStorage.setItem(SESSION_LOG_RETURN_KEY, window.location.search);
  } catch {
    // Brak storage — powrót poprowadzi na domyślny /import-sessions.
  }
}

/** Adres powrotu do dziennika: `/import-sessions` + zapamiętane query (albo goły przy braku zapisu). */
export function sessionLogReturnHref(): string {
  try {
    return `/import-sessions${window.sessionStorage.getItem(SESSION_LOG_RETURN_KEY) ?? ""}`;
  } catch {
    return "/import-sessions";
  }
}
