// Walidacja i zapis pliku wsadu (PR2, Faza 7). Plik trafia do prywatnego bucketa `import-files`
// pod ścieżką <user_id>/<session_id>/<file_id>.<ext> (izolacja per-user przez RLS na storage.objects),
// a jego referencja do tabeli `import_files` (RLS po user_id). Nazwą OBIEKTU jest UUID (file_id),
// nie nazwa od usera — eliminuje kolizje i ścieżkową niespodziankę; oryginalną nazwę trzyma file_name.
//
// Walidacja typu/rozmiaru jest wydzielona (assertValidImportFile), bo endpoint egzekwuje ją PRZED
// utworzeniem sesji (czysty 400), a tu trzymamy ją defensywnie tuż przy zapisie.

import type { SupabaseClient } from "@supabase/supabase-js";

import { FileTooLargeError, UnsupportedFileTypeError } from "@/types";

const BUCKET = "import-files";

/** Limit rozmiaru pliku wsadu (FR-018). To JEDYNY limit dla pliku — INPUT_MAX_CHARS nie dotyczy pliku. */
export const MAX_FILE_BYTES = 300 * 1024; // 300 KB

/** Dozwolone rozszerzenia (FR-018). Walidujemy po rozszerzeniu nazwy, nie po MIME (ten bywa pusty dla .md). */
export const ALLOWED_EXTENSIONS = ["txt", "md"] as const;

type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

/** Zwraca rozszerzenie z nazwy pliku (małe litery, bez kropki) lub null, gdy brak. */
export function fileExtension(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

function isAllowedExtension(ext: string | null): ext is AllowedExtension {
  return ext !== null && (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Waliduje typ (rozszerzenie .txt/.md) i rozmiar (≤ 300 KB) pliku. Rzuca UnsupportedFileTypeError /
 * FileTooLargeError. Zwraca rozpoznane rozszerzenie do zbudowania klucza obiektu. Czysta (bez I/O).
 */
export function assertValidImportFile(file: File): AllowedExtension {
  const ext = fileExtension(file.name);
  if (!isAllowedExtension(ext)) throw new UnsupportedFileTypeError();
  if (file.size > MAX_FILE_BYTES) throw new FileTooLargeError();
  return ext;
}

export interface UploadedFileRef {
  id: string;
  path: string;
  name: string;
  mime: string | null;
}

/**
 * Waliduje, wgrywa plik do storage i wstawia wiersz `import_files`. Przy porażce zapisu referencji
 * sprząta osierocony obiekt (best-effort), by nie zostawić pliku bez wiersza w tabeli.
 */
export async function uploadImportFile(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  file: File,
): Promise<UploadedFileRef> {
  const ext = assertValidImportFile(file);
  const id = crypto.randomUUID();
  const path = `${userId}/${sessionId}/${id}.${ext}`;
  const mime = file.type || null;

  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: mime ?? "text/plain",
    upsert: false,
  });
  if (up.error) throw new Error("Upload pliku do storage nie powiódł się.", { cause: up.error });

  const ins = await supabase.from("import_files").insert({
    id,
    user_id: userId,
    session_id: sessionId,
    file_path: path,
    file_name: file.name,
    file_mime: mime,
  });
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path]); // best-effort: nie osieracaj obiektu
    throw new Error("Zapis referencji pliku nie powiódł się.", { cause: ins.error });
  }

  return { id, path, name: file.name, mime };
}
