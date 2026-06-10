import { describe, expect, it } from "vitest";

import { INPUT_MAX_CHARS, sanitizeInput } from "@/lib/text/sanitize";

// Znaki sterujące budujemy przez String.fromCharCode (literały zrobiłyby z pliku binaria).

describe("sanitizeInput (FR-002)", () => {
  it("usuwa znaki sterujące C0 i DEL, zachowuje TAB i LF", () => {
    const controls = String.fromCharCode(0, 8, 11, 13, 31, 127); // NUL, BS, VT, CR, US, DEL
    const input = `a${controls}b`;
    expect(sanitizeInput(input)).toBe("ab");
  });

  it("zachowuje TAB i LF wewnątrz tekstu", () => {
    const tabLf = `x${String.fromCharCode(9, 10)}y`;
    expect(sanitizeInput(tabLf)).toBe(tabLf);
  });

  it("zamienia CRLF na LF (CR usuwany)", () => {
    const crlf = `linia1${String.fromCharCode(13, 10)}linia2`;
    expect(sanitizeInput(crlf)).toBe(`linia1${String.fromCharCode(10)}linia2`);
  });

  it("normalizuje do NFC (złożony znak → pojedynczy code point)", () => {
    const decomposed = `e${String.fromCharCode(0x301)}`; // e + combining acute
    const result = sanitizeInput(decomposed);
    expect(result).toBe("é");
    expect(result.length).toBe(1); // NFC złożyło do U+00E9 (jedna jednostka UTF-16)
  });

  it("przycina białe znaki na brzegach", () => {
    expect(sanitizeInput("  treść  ")).toBe("treść");
  });

  it("NIE odrzuca po długości — limit to sprawa wołającego", () => {
    const long = "x".repeat(INPUT_MAX_CHARS + 50);
    expect(sanitizeInput(long)).toHaveLength(INPUT_MAX_CHARS + 50);
  });

  it("eksportuje limit paste = 100000", () => {
    expect(INPUT_MAX_CHARS).toBe(100_000);
  });
});
