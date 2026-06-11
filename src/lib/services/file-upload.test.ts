import { describe, expect, it } from "vitest";

import { ALLOWED_EXTENSIONS, assertValidImportFile, fileExtension, MAX_FILE_BYTES } from "@/lib/services/file-upload";
import { FileTooLargeError, UnsupportedFileTypeError } from "@/types";

// File z kontrolowanym rozmiarem bez alokacji 300 KB — nadpisujemy getter `size`.
function fakeFile(name: string, size: number, type = "text/plain"): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("file-upload: walidacja typu/rozmiaru (FR-018)", () => {
  it("fileExtension wyciąga rozszerzenie małymi literami; null gdy brak", () => {
    expect(fileExtension("Notatki.TXT")).toBe("txt");
    expect(fileExtension("archiwum.tar.md")).toBe("md");
    expect(fileExtension("bez-rozszerzenia")).toBeNull();
    expect(fileExtension("kropka-na-koncu.")).toBeNull();
  });

  it("akceptuje .txt i .md w granicy rozmiaru i zwraca rozszerzenie", () => {
    expect(assertValidImportFile(fakeFile("notatki.txt", 1024))).toBe("txt");
    expect(assertValidImportFile(fakeFile("plan.md", MAX_FILE_BYTES))).toBe("md"); // dokładnie na granicy
  });

  it("odrzuca nieobsługiwany typ → UnsupportedFileTypeError", () => {
    expect(() => assertValidImportFile(fakeFile("dokument.pdf", 100))).toThrow(UnsupportedFileTypeError);
    expect(() => assertValidImportFile(fakeFile("brak", 100))).toThrow(UnsupportedFileTypeError);
  });

  it("odrzuca plik > 300 KB → FileTooLargeError", () => {
    expect(() => assertValidImportFile(fakeFile("duzy.txt", MAX_FILE_BYTES + 1))).toThrow(FileTooLargeError);
  });

  it("eksportuje limit 300 KB i listę dozwolonych rozszerzeń", () => {
    expect(MAX_FILE_BYTES).toBe(307_200);
    expect(ALLOWED_EXTENSIONS).toEqual(["txt", "md"]);
  });
});
