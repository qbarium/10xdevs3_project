import { describe, expect, it, vi } from "vitest";

import { loadSessionInput, SessionInputStorageError } from "@/lib/services/session-input";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportFile, ImportSession } from "@/types";
import { UnsupportedEncodingError } from "@/types";

// decodeFile i sanitizeInput zostają REALNE (czysta logika S-02, bez astro:env) — testujemy faktyczne
// dekodowanie bajtów ze Storage. Mockowany jest wyłącznie storage.download.

function mockStorage(downloadResult: { data: unknown; error: unknown }) {
  const download = vi.fn(() => Promise.resolve(downloadResult));
  const from = vi.fn(() => ({ download }));
  return { client: { storage: { from } } as unknown as SupabaseClient, download, from };
}

/** Minimalny Blob-like z kontrolowanymi bajtami (Storage.download zwraca Blob). */
function blobOf(bytes: Uint8Array) {
  return {
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  };
}

const session = (over: Partial<ImportSession> & { file?: ImportFile } = {}): ImportSession & { file?: ImportFile } => ({
  id: "s1",
  user_id: "u1",
  status: "failed",
  raw_input: null,
  item_count: null,
  error_message: "invalid_key",
  created_at: "2026-06-13T00:00:00Z",
  updated_at: "2026-06-13T00:00:00Z",
  ...over,
});

const fileRec: ImportFile = {
  id: "f1",
  user_id: "u1",
  session_id: "s1",
  file_path: "u1/s1/f1.txt",
  file_name: "n.txt",
  file_mime: "text/plain",
  created_at: "2026-06-13T00:00:00Z",
};

describe("loadSessionInput (S-08) — odtwarzanie wsadu sesji", () => {
  it("paste: zwraca zsanityzowany raw_input, bez dotykania Storage", async () => {
    const { client, from } = mockStorage({ data: null, error: null });
    const text = await loadSessionInput(client, session({ raw_input: "  Ala\r\nma kota  " }));
    expect(text).toBe("Ala\nma kota"); // CRLF→LF, trim
    expect(from).not.toHaveBeenCalled();
  });

  it("plik: download → dekod UTF-8 → sanityzacja", async () => {
    const bytes = new TextEncoder().encode("  treść z pliku\r\n  ");
    const { client, from } = mockStorage({ data: blobOf(bytes), error: null });
    const text = await loadSessionInput(client, session({ raw_input: null, file: fileRec }));
    expect(from).toHaveBeenCalledWith("import-files");
    expect(text).toBe("treść z pliku");
  });

  it("plik: błąd downloadu → SessionInputStorageError (wołający → kod storage)", async () => {
    const { client } = mockStorage({ data: null, error: { message: "not found" } });
    await expect(loadSessionInput(client, session({ raw_input: null, file: fileRec }))).rejects.toBeInstanceOf(
      SessionInputStorageError,
    );
  });

  it("plik bez rekordu pliku (session.file brak) → SessionInputStorageError", async () => {
    const { client } = mockStorage({ data: null, error: null });
    await expect(loadSessionInput(client, session({ raw_input: null }))).rejects.toBeInstanceOf(
      SessionInputStorageError,
    );
  });

  it("plik: nieczytalne kodowanie (bajt NUL = binarny) → UnsupportedEncodingError", async () => {
    const { client } = mockStorage({ data: blobOf(new Uint8Array([0x00, 0x41, 0x42])), error: null });
    await expect(loadSessionInput(client, session({ raw_input: null, file: fileRec }))).rejects.toBeInstanceOf(
      UnsupportedEncodingError,
    );
  });

  it("plik: pusty po sanityzacji → zwraca '' (wołający zdecyduje o empty_file)", async () => {
    const { client } = mockStorage({ data: blobOf(new TextEncoder().encode("   \n  ")), error: null });
    expect(await loadSessionInput(client, session({ raw_input: null, file: fileRec }))).toBe("");
  });
});
