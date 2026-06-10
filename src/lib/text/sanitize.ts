// Czysta, współdzielona normalizacja wsadu (FR-002): client (Faza 4), server defensywnie (Faza 3),
// plik (PR2). NIE odrzuca po długości — limit paste egzekwuje wołający (endpoint), nie ta funkcja.

/**
 * Limit znaków WYŁĄCZNIE dla wsadu paste (FR-002), egzekwowany przez wołającego (endpoint paste).
 * NIE dotyczy wejścia plikowego (PR2 — tam limit to 300 KB rozmiaru). UTF-16 code units = String.length.
 */
export const INPUT_MAX_CHARS = 100_000;

const TAB = 0x09;
const LF = 0x0a;
const C0_MAX = 0x1f; // górny kraniec bloku C0 (znaki sterujące 0x00–0x1f)
const DEL = 0x7f;

/** Czy znak (po code point) to usuwany znak sterujący — zachowujemy TAB i LF, usuwamy resztę C0, CR i DEL. */
function isStrippableControl(code: number): boolean {
  if (code === TAB || code === LF) return false;
  return code <= C0_MAX || code === DEL;
}

/**
 * Normalizuje wsad: Unicode NFC, usunięcie znaków sterujących (poza TAB i LF; CR usuwany → CRLF staje
 * się LF) oraz trim. Tylko normalizuje, nie waliduje długości. Filtr po kodzie znaku (bez regexu
 * ze znakami sterującymi), iteracja po code pointach (poprawnie dla par surogatów).
 */
export function sanitizeInput(raw: string): string {
  let out = "";
  for (const ch of raw.normalize("NFC")) {
    const code = ch.codePointAt(0) ?? 0;
    if (!isStrippableControl(code)) {
      out += ch;
    }
  }
  return out.trim();
}
