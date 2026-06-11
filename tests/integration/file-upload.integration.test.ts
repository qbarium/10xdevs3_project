import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MAX_FILE_BYTES, uploadImportFile } from "@/lib/services/file-upload";
import { FileTooLargeError, UnsupportedFileTypeError } from "@/types";

// Integ uploadu pliku wsadu (S-02 Faza 7, PR2): uploadImportFile pod realnym lokalnym Supabase —
// obiekt ląduje w prywatnym buckecie `import-files` pod ścieżką usera, a referencja w tabeli
// `import_files` (RLS po user_id). Walidacja typu/rozmiaru odrzuca PRZED jakimkolwiek zapisem.
// Wzorzec klienta/signUp z storage-rls + import-files-rls. WYMAGA Storage UP (config.toml enabled=true).

const URL = process.env.SUPABASE_TEST_URL ?? "";
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? "";

const ready = Boolean(URL && ANON);
const d = ready ? describe : describe.skip;

const BUCKET = "import-files";

function client() {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signUpClient(tag: string) {
  const supabase = client();
  const email = `s02-upload-${tag}-${Math.floor(Math.random() * 1e9)}@test.local`;
  const { data, error } = await supabase.auth.signUp({ email, password: "test-password-123" });
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error("signUp nie zwrócił usera (sprawdź enable_confirmations=false)");
  return { supabase, id };
}

d("uploadImportFile (S-02 Faza 7)", () => {
  let A: Awaited<ReturnType<typeof signUpClient>>;
  const sessionId = crypto.randomUUID();
  const uploadedPaths: string[] = [];

  beforeAll(async () => {
    A = await signUpClient("a");
    const sess = await A.supabase
      .from("import_sessions")
      .insert({ id: sessionId, user_id: A.id, status: "processing", raw_input: null });
    expect(sess.error).toBeNull();
  });

  afterAll(async () => {
    if (uploadedPaths.length) await A.supabase.storage.from(BUCKET).remove(uploadedPaths);
    await A.supabase.auth.signOut();
  });

  it("wgrywa .txt → obiekt w storage pod ścieżką usera + wiersz import_files wskazujący sesję", async () => {
    const file = new File(["notatka usera A do klasyfikacji"], "notatki.txt", { type: "text/plain" });
    const ref = await uploadImportFile(A.supabase, A.id, sessionId, file);
    uploadedPaths.push(ref.path);

    // Ścieżka obiektu = <user_id>/<session_id>/<file_id>.<ext>; nazwą obiektu jest UUID, nie nazwa od usera.
    expect(ref.path).toBe(`${A.id}/${sessionId}/${ref.id}.txt`);
    expect(ref.name).toBe("notatki.txt");

    const row = await A.supabase
      .from("import_files")
      .select("file_name, session_id, file_path")
      .eq("id", ref.id)
      .single();
    expect(row.error).toBeNull();
    expect(row.data?.session_id).toBe(sessionId);
    expect(row.data?.file_name).toBe("notatki.txt");
    expect(row.data?.file_path).toBe(ref.path);

    const dl = await A.supabase.storage.from(BUCKET).download(ref.path);
    expect(dl.error).toBeNull();
    expect(await dl.data?.text()).toContain("notatka usera A");
  });

  it("odrzuca plik > 300 KB → FileTooLargeError, bez zapisu obiektu i wiersza", async () => {
    const big = new File(["x".repeat(MAX_FILE_BYTES + 1)], "duzy.txt", { type: "text/plain" });
    await expect(uploadImportFile(A.supabase, A.id, sessionId, big)).rejects.toBeInstanceOf(FileTooLargeError);
  });

  it("odrzuca zły typ (.pdf) → UnsupportedFileTypeError, bez zapisu", async () => {
    const pdf = new File(["%PDF-1.4 udit"], "dokument.pdf", { type: "application/pdf" });
    await expect(uploadImportFile(A.supabase, A.id, sessionId, pdf)).rejects.toBeInstanceOf(UnsupportedFileTypeError);
  });
});
