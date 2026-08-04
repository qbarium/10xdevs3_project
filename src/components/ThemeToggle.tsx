import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { applyTheme, writeThemePref, type Theme } from "@/lib/theme";

/**
 * Przełącznik motywu (jasny/ciemny) — wyspa. SSR wyrenderował już `.dark` + `color-scheme` na `<html>`
 * serwerowo (z cookie); klik flipuje klasę na `<html>` i zapisuje wybór w cookie. Stan `theme` (dla
 * `aria-label`) synchronizowany z klasą `<html>` przez MutationObserver — reaguje na zmianę z dowolnego
 * źródła. Ikona (słońce/księżyc) sterowana wariantem `dark:` jest poprawna od pierwszej klatki, niezależnie
 * od hydracji. Zależności (react, lucide-react, button) są już w `ssr.optimizeDeps.include` → brak dup-React.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const read = () => {
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
    };
  }, []);

  function toggle() {
    const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    applyTheme(next);
    writeThemePref(next);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      title="Przełącz motyw"
      aria-label={theme === "dark" ? "Przełącz na motyw jasny" : "Przełącz na motyw ciemny"}
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="block size-4 dark:hidden" />
    </Button>
  );
}
