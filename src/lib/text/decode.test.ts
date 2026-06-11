import { describe, expect, it } from "vitest";

import { decodeFile } from "@/lib/text/decode";
import { UnsupportedEncodingError } from "@/types";

// Pełny polski pangram — dowodzi, że diakrytyki przeżywają round-trip w obu obowiązkowych kodowaniach.
const POLISH = "Zażółć gęślą jaźń";

describe("decodeFile (FR-003)", () => {
  it("dekoduje UTF-8 bez BOM", () => {
    const r = decodeFile(new TextEncoder().encode(POLISH));
    expect(r.text).toBe(POLISH);
    expect(r.encoding).toBe("utf-8");
  });

  it("dekoduje UTF-8 z BOM i zdejmuje sam BOM (brak wiodącego U+FEFF)", () => {
    const body = new TextEncoder().encode(POLISH);
    const r = decodeFile(new Uint8Array([0xef, 0xbb, 0xbf, ...body]));
    expect(r.text).toBe(POLISH);
    expect(r.text.charCodeAt(0)).not.toBe(0xfeff);
    expect(r.encoding).toBe("utf-8");
  });

  it("fallback Windows-1250 dla bajtów niepoprawnych jako UTF-8 (polskie znaki)", () => {
    // "łąka" w Windows-1250: ł=0xB3, ą=0xB9, k=0x6B, a=0x61. 0xB3 jako pierwszy bajt → niepoprawny UTF-8.
    const r = decodeFile(new Uint8Array([0xb3, 0xb9, 0x6b, 0x61]));
    expect(r.text).toBe("łąka");
    expect(r.encoding).toBe("windows-1250");
  });

  it("czysty ASCII rozpoznaje jako UTF-8", () => {
    expect(decodeFile(new TextEncoder().encode("plain ascii note"))).toEqual({
      text: "plain ascii note",
      encoding: "utf-8",
    });
  });

  it("pusty plik → pusty tekst (utf-8), bez błędu", () => {
    expect(decodeFile(new Uint8Array([]))).toEqual({ text: "", encoding: "utf-8" });
  });

  it("plik binarny (zawiera bajt NUL) → UnsupportedEncodingError", () => {
    // Nagłówek ZIP "PK\x03\x04" + bajty NUL (0x00). Pliki tekstowe nie mają NUL — strażnik odrzuca
    // binaria, których jednobajtowy Windows-1250 inaczej zdekodowałby na siłę do mojibake.
    const binary = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x48, 0x49]);
    expect(() => decodeFile(binary)).toThrow(UnsupportedEncodingError);
  });
});
