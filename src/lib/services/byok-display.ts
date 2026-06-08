// Podgląd zamaskowany klucza API: ZACHOWUJE identyfikację (prefiks + sufiks), w odróżnieniu
// od log-maskera z `mask.ts`, który REDAGUJE sekrety do [REDACTED]. Semantyka jest celowo
// przeciwna, dlatego osobny moduł. Wynik liczony raz przy zapisie i trzymany w `api_key_hint`
// (plaintext, NIE sekret). Nigdy nie odtwarza całego klucza (FR-021).

/**
 * Zamienia jawny klucz na podgląd zachowujący identyfikację: prefiks (pierwsze 3)
 * + "…" + sufiks (ostatnie 4), np. "sk-…AB12". Klucz <= 8 znaków: same kropki o długości
 * wejścia — za krótki, by ujawnić prefiks+sufiks bez pokazania niemal całości.
 */
export function maskKeyForDisplay(plain: string): string {
  const key = plain.trim();
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}
