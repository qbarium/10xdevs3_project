// Trwała preferencja motywu (jasny/ciemny) w COOKIE — wzorzec jak `components/lists/page-size-pref.ts`.
// Cookie (path=/, rok, SameSite=Lax) widzi też SERWER: `Layout.astro` renderuje `<html>` z właściwą klasą
// `.dark` i `color-scheme` od pierwszego bajtu → brak mignięcia „jasne→ciemne" przy odświeżeniu. Wyspa
// `ThemeToggle` flipuje klasę na `document.documentElement` i zapisuje cookie. Wszystko best-effort w
// try/catch — bezpieczne pod SSR (brak `document`) i przy zablokowanym storage.

export type Theme = "light" | "dark";

/** Nazwa cookie preferencji motywu. Czytana serwerowo (`Astro.cookies`) i klienckie (`document.cookie`). */
export const THEME_COOKIE = "theme";

/** Motyw domyślny, gdy cookie brak — jasny (baza makiety, `context/foundation/ui-mockup`). */
export const DEFAULT_THEME: Theme = "light";

/** Czas życia cookie: rok (w sekundach). */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Czysty parser wartości cookie → motyw; nieznane/brak → `DEFAULT_THEME`. Wspólny dla SSR i klienta. */
export function parseTheme(raw: string | null | undefined): Theme {
  return raw === "dark" || raw === "light" ? raw : DEFAULT_THEME;
}

/** Klient: zapis motywu (cookie: cała witryna, rok, SameSite=Lax). Błędy połykane (best-effort). */
export function writeThemePref(theme: Theme): void {
  try {
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${String(COOKIE_MAX_AGE)}; samesite=lax`;
  } catch {
    // SSR / storage niedostępny — preferencja po prostu nie zostaje zapisana.
  }
}

/** Klient: nałóż motyw na `<html>` — klasa `.dark` + natywne `color-scheme` (spójne z renderem SSR). */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}
