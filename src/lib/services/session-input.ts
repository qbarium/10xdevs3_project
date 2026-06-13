// Odtwarzanie wsadu trwałej sesji importu pod ponowienie (S-08). Zwraca tekst do (ponownej)
// klasyfikacji niezależnie od źródła:
//   • paste — treść inline z `import_sessions.raw_input` (zapisana już po sanityzacji),
//   • plik  — download obiektu ze Storage `import-files` → dekod (UTF-8/BOM/Windows-1250) → sanityzacja.
// Tekst pliku NIE jest utrwalany w bazie (tylko bajty w Storage), więc retry pliku wymaga re-downloadu
// i re-dekodu — ta sama sekwencja co ścieżka plikowa ingestu (`classify.ts`). Reużywa `decodeFile`
// i `sanitizeInput` z S-02; `decodeFile` rzuca `UnsupportedEncodingError` (wołający mapuje na `encoding`).

import type { SupabaseClient } from "@supabase/supabase-js";

import { decodeFile } from "@/lib/text/decode";
import { sanitizeInput } from "@/lib/text/sanitize";
import type { ImportFile, ImportSession } from "@/types";

/** Nazwa bucketa Storage z plikami wsadu (S-02 Faza 6). */
const BUCKET = "import-files";

/** Pobranie obiektu ze Storage nie powiodło się (zniknął / brak rekordu pliku). Wołający → kod `storage`. */
export class SessionInputStorageError extends Error {
  constructor(message = "Nie udało się pobrać pliku sesji ze Storage.", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SessionInputStorageError";
  }
}

/**
 * Zwraca tekst wsadu sesji do (ponownej) klasyfikacji. Paste → `raw_input`; plik → download +
 * dekod + sanityzacja. Może zwrócić pusty string (np. plik pusty po sanityzacji) — decyzję o
 * kodzie `empty_file` podejmuje wołający (endpoint retry). Rzuca: `UnsupportedEncodingError`
 * (nieczytelne kodowanie → `encoding`), `SessionInputStorageError` (download → `storage`).
 */
export async function loadSessionInput(
  supabase: SupabaseClient,
  session: ImportSession & { file?: ImportFile },
): Promise<string> {
  // Paste: treść inline (już zsanityzowana przy tworzeniu sesji; re-sanityzacja idempotentna i tania).
  if (session.raw_input !== null) {
    return sanitizeInput(session.raw_input);
  }

  // Plik: bez `raw_input` treść żyje wyłącznie w Storage — pobierz, zdekoduj, zsanityzuj.
  const file = session.file;
  if (!file) {
    throw new SessionInputStorageError("Sesja plikowa bez powiązanego rekordu pliku.");
  }
  const download = await supabase.storage.from(BUCKET).download(file.file_path);
  if (download.error) {
    throw new SessionInputStorageError(undefined, { cause: download.error });
  }
  const bytes = new Uint8Array(await download.data.arrayBuffer());
  return sanitizeInput(decodeFile(bytes).text);
}
