import { describe, expect, it } from "vitest";

import { validateImportFile } from "@/components/ingest/FileDropZone";
import { MAX_FILE_BYTES } from "@/lib/services/file-upload";

// File z kontrolowanym rozmiarem bez alokacji 300 KB — nadpisujemy getter `size` (jak w file-upload.test.ts).
function fakeFile(name: string, size: number, type = "text/plain"): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("FileDropZone: walidacja client-side pliku (FR-018)", () => {
  it("akceptuje .txt i .md w granicy rozmiaru → null", () => {
    expect(validateImportFile(fakeFile("notatki.txt", 1024))).toBeNull();
    expect(validateImportFile(fakeFile("PLAN.MD", 2048))).toBeNull(); // rozszerzenie bez względu na wielkość liter
    expect(validateImportFile(fakeFile("plan.md", MAX_FILE_BYTES))).toBeNull(); // dokładnie na granicy
  });

  it("odrzuca nieobsługiwany typ z komunikatem o .txt/.md", () => {
    expect(validateImportFile(fakeFile("dokument.pdf", 100))).toMatch(/\.txt.*\.md/);
    expect(validateImportFile(fakeFile("bez-rozszerzenia", 100))).toMatch(/\.txt.*\.md/);
  });

  it("odrzuca plik > 300 KB z komunikatem o rozmiarze", () => {
    expect(validateImportFile(fakeFile("duzy.txt", MAX_FILE_BYTES + 1))).toMatch(/300 KB/);
  });

  it("typ ma pierwszeństwo: zły typ ORAZ za duży → komunikat o typie", () => {
    expect(validateImportFile(fakeFile("duzy.pdf", MAX_FILE_BYTES + 1))).toMatch(/\.txt.*\.md/);
  });
});
