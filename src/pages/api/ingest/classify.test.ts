import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mockujemy WSZYSTKIE zależności endpointu (m.in. config/ai → bez astro:env). Testujemy wyłącznie
// logikę endpointu: guard, walidację wsadu (paste + plik), mapowanie 4 stanów i kodów błędów, higienę
// logów. sanitizeInput/decode-sanitize zostają realne tylko tam, gdzie to nie wymaga astro:env.
vi.mock("@/lib/config/ai", () => ({ AI_REQUEST_TIMEOUT_MS: 60000 }));
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/services/profile-key", () => ({ getEncryptedApiKey: vi.fn() }));
vi.mock("@/lib/services/byok-crypto", () => ({ decryptApiKey: vi.fn() }));
vi.mock("@/lib/ai/classifier", () => ({ classify: vi.fn() }));
vi.mock("@/lib/services/import-session", () => ({
  createSession: vi.fn(),
  persistItems: vi.fn(),
  finalizeEmpty: vi.fn(),
  failSession: vi.fn(),
}));
vi.mock("@/lib/services/file-upload", () => ({
  assertValidImportFile: vi.fn(),
  uploadImportFile: vi.fn(),
  MAX_FILE_BYTES: 307_200, // 300 KB — używane przez wczesny odrzut po Content-Length
}));
vi.mock("@/lib/text/decode", () => ({ decodeFile: vi.fn() }));

import { classify } from "@/lib/ai/classifier";
import { decryptApiKey } from "@/lib/services/byok-crypto";
import { assertValidImportFile, uploadImportFile } from "@/lib/services/file-upload";
import { createSession, failSession, finalizeEmpty, persistItems } from "@/lib/services/import-session";
import { getEncryptedApiKey } from "@/lib/services/profile-key";
import { decodeFile } from "@/lib/text/decode";
import { POST } from "@/pages/api/ingest/classify";
import type { ClassifiedItem } from "@/types";
import {
  ClassifierAuthError,
  ClassifierContractError,
  ClassifierProviderError,
  FileTooLargeError,
  UnsupportedEncodingError,
  UnsupportedFileTypeError,
} from "@/types";

interface ResultBody {
  ok?: boolean;
  status?: string;
  code?: string;
  itemCount?: number;
  error?: string;
}

function ctx(body: unknown, user: { id: string } | null = { id: "user-1" }) {
  return {
    locals: { user },
    request: new Request("https://x/api/ingest/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    cookies: {},
  } as unknown as Parameters<typeof POST>[0];
}

// Multipart ctx: body=FormData ustawia Content-Type multipart/form-data z boundary automatycznie.
function fileCtx(file: File | null, user: { id: string } | null = { id: "user-1" }) {
  const form = new FormData();
  if (file) form.append("file", file);
  return {
    locals: { user },
    request: new Request("https://x/api/ingest/classify", { method: "POST", body: form }),
    cookies: {},
  } as unknown as Parameters<typeof POST>[0];
}

const items = (n: number): ClassifiedItem[] =>
  Array.from({ length: n }, (_, i) => ({ type: "note", title: `t${i}`, description: "" }));

describe("POST /api/ingest/classify", () => {
  beforeEach(() => {
    vi.mocked(createSession).mockResolvedValue({ id: "sess-1" });
    vi.mocked(failSession).mockResolvedValue(undefined); // realny serwis zwraca Promise<void>; gałąź pliku robi .catch()
    vi.mocked(getEncryptedApiKey).mockResolvedValue("v1.iv.ct");
    vi.mocked(decryptApiKey).mockResolvedValue("sk-secret-xyz");
    // Domyślne dla ścieżki plikowej (clearAllMocks czyści calls, NIE implementacje — ustawiamy je tu).
    vi.mocked(assertValidImportFile).mockReturnValue("txt");
    vi.mocked(uploadImportFile).mockResolvedValue({ id: "f1", path: "p", name: "n.txt", mime: "text/plain" });
    vi.mocked(decodeFile).mockReturnValue({ text: "zdekodowany wsad pliku", encoding: "utf-8" });
  });
  afterEach(() => vi.clearAllMocks());

  // --- Paste (PR1) ---

  it("brak zalogowania → 401", async () => {
    const res = await POST(ctx({ text: "x" }, null));
    expect(res.status).toBe(401);
  });

  it("puste body → 400", async () => {
    const res = await POST(ctx({ text: "   " }));
    expect(res.status).toBe(400);
  });

  it("nieprawidłowy JSON → 400", async () => {
    const res = await POST(ctx("{niepoprawny"));
    expect(res.status).toBe(400);
  });

  it("brak klucza → 409 missing_key", async () => {
    vi.mocked(getEncryptedApiKey).mockResolvedValue(null);
    const res = await POST(ctx({ text: "wsad" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as ResultBody).code).toBe("missing_key");
  });

  it("happy path → 200 completed_with_items + persistItems wołane", async () => {
    vi.mocked(classify).mockResolvedValue([{ type: "task", title: "T", description: "D" }]);
    vi.mocked(persistItems).mockResolvedValue(1);
    const res = await POST(ctx({ text: "wsad" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ResultBody;
    expect(body.status).toBe("completed_with_items");
    expect(body.itemCount).toBe(1);
    expect(vi.mocked(persistItems)).toHaveBeenCalledOnce();
  });

  it("zero itemów → 200 completed_no_items + finalizeEmpty", async () => {
    vi.mocked(classify).mockResolvedValue([]);
    const res = await POST(ctx({ text: "wsad" }));
    expect(((await res.json()) as ResultBody).status).toBe("completed_no_items");
    expect(vi.mocked(finalizeEmpty)).toHaveBeenCalledOnce();
    expect(vi.mocked(persistItems)).not.toHaveBeenCalled();
  });

  it("safety net > 100 → 422 too_many_items, bez zapisu itemów", async () => {
    vi.mocked(classify).mockResolvedValue(items(101));
    const res = await POST(ctx({ text: "wsad" }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as ResultBody).code).toBe("too_many_items");
    expect(vi.mocked(failSession)).toHaveBeenCalledWith(expect.anything(), "sess-1", "too_many_items");
    expect(vi.mocked(persistItems)).not.toHaveBeenCalled();
  });

  it("ClassifierAuthError → 200 failed/invalid_key", async () => {
    vi.mocked(classify).mockRejectedValue(new ClassifierAuthError());
    const res = await POST(ctx({ text: "wsad" }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as ResultBody).code).toBe("invalid_key");
    expect(vi.mocked(failSession)).toHaveBeenCalledWith(expect.anything(), "sess-1", "invalid_key");
  });

  it("AbortError (timeout) → 200 failed/timeout", async () => {
    vi.mocked(classify).mockRejectedValue(new DOMException("aborted", "AbortError"));
    const res = await POST(ctx({ text: "wsad" }));
    expect(((await res.json()) as ResultBody).code).toBe("timeout");
  });

  // Wszystkie przyczyny naruszenia kontraktu (obcięcie, brak pola, zły JSON) rozróżnialne są tylko na
  // warstwie classify() — na wyjściu HTTP kolapsują do jednego kodu "contract" przy 200/ok:true, bo
  // `failed` to normalny stan przepływu (FR-006), nie awaria transportu.
  it("naruszenie kontraktu → 200 failed/contract (spłaszczenie przyczyn do jednego kodu)", async () => {
    vi.mocked(classify).mockRejectedValue(new ClassifierContractError("dowolny powód"));
    const res = await POST(ctx({ text: "wsad" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ResultBody;
    expect(body.status).toBe("failed");
    expect(body.code).toBe("contract");
    expect(vi.mocked(failSession)).toHaveBeenCalledWith(expect.anything(), "sess-1", "contract");
  });

  // --- Plik (PR2, Faza 7) ---

  it("plik: happy path → 200 completed_with_items; sesja z raw_input null + upload + persist", async () => {
    vi.mocked(classify).mockResolvedValue([{ type: "task", title: "T", description: "D" }]);
    vi.mocked(persistItems).mockResolvedValue(1);
    const res = await POST(fileCtx(new File(["dowolna treść"], "notatki.txt", { type: "text/plain" })));
    expect(res.status).toBe(200);
    expect(((await res.json()) as ResultBody).status).toBe("completed_with_items");
    expect(vi.mocked(uploadImportFile)).toHaveBeenCalledOnce();
    expect(vi.mocked(createSession)).toHaveBeenCalledWith(expect.anything(), "user-1", null);
    expect(vi.mocked(decodeFile)).toHaveBeenCalledOnce();
  });

  it("plik: brak pola file w multipart → 400, bez sesji", async () => {
    const res = await POST(fileCtx(null));
    expect(res.status).toBe(400);
    expect(vi.mocked(createSession)).not.toHaveBeenCalled();
  });

  it("plik: nieobsługiwany typ → 400 + przyjazny komunikat, przed utworzeniem sesji", async () => {
    vi.mocked(assertValidImportFile).mockImplementation(() => {
      throw new UnsupportedFileTypeError();
    });
    const res = await POST(fileCtx(new File(["x"], "dokument.pdf", { type: "application/pdf" })));
    expect(res.status).toBe(400);
    expect(((await res.json()) as ResultBody).error).toContain(".txt, .md");
    expect(vi.mocked(createSession)).not.toHaveBeenCalled();
    expect(vi.mocked(uploadImportFile)).not.toHaveBeenCalled();
  });

  it("plik: za duży → 400 + przyjazny komunikat, przed utworzeniem sesji", async () => {
    vi.mocked(assertValidImportFile).mockImplementation(() => {
      throw new FileTooLargeError();
    });
    const res = await POST(fileCtx(new File(["x"], "duzy.txt")));
    expect(res.status).toBe(400);
    expect(((await res.json()) as ResultBody).error).toContain("300 KB");
    expect(vi.mocked(createSession)).not.toHaveBeenCalled();
  });

  // Uwaga: wczesny odrzut po Content-Length (413, guard DoS, classify.ts) NIE jest tu testowany —
  // Content-Length to nagłówek transportowy ustawiany dopiero przy realnym wysłaniu; syntetyczny
  // Request w vitest zwraca dla niego null. Guard działa w runtime Workers (realne żądanie ma nagłówek).

  it("plik: błąd dekodowania → 200 failed/encoding, bez klasyfikacji", async () => {
    vi.mocked(decodeFile).mockImplementation(() => {
      throw new UnsupportedEncodingError();
    });
    const res = await POST(fileCtx(new File(["ÿ"], "binarny.txt")));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ResultBody;
    expect(body.status).toBe("failed");
    expect(body.code).toBe("encoding");
    expect(vi.mocked(failSession)).toHaveBeenCalledWith(expect.anything(), "sess-1", "encoding");
    expect(vi.mocked(classify)).not.toHaveBeenCalled();
  });

  it("plik: błąd uploadu → 200 failed/storage", async () => {
    vi.mocked(uploadImportFile).mockRejectedValue(new Error("storage down"));
    const res = await POST(fileCtx(new File(["x"], "n.txt")));
    const body = (await res.json()) as ResultBody;
    expect(body.status).toBe("failed");
    expect(body.code).toBe("storage");
    expect(vi.mocked(failSession)).toHaveBeenCalledWith(expect.anything(), "sess-1", "storage");
    expect(vi.mocked(classify)).not.toHaveBeenCalled();
  });

  it("plik: pusta treść po dekodowaniu → 200 failed/empty_file", async () => {
    vi.mocked(decodeFile).mockReturnValue({ text: "   \n  ", encoding: "utf-8" }); // sanitize → ""
    const res = await POST(fileCtx(new File(["   "], "pusty.txt")));
    expect(((await res.json()) as ResultBody).code).toBe("empty_file");
    expect(vi.mocked(classify)).not.toHaveBeenCalled();
  });

  // --- Higiena logów (oba wejścia) ---

  it("higiena logów: klucz ani treść wsadu nie trafiają do konsoli", async () => {
    const spies = [
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    vi.mocked(classify).mockRejectedValue(new ClassifierProviderError());
    await POST(ctx({ text: "moje prywatne myśli do sklasyfikowania" }));
    const logged = spies.map((s) => JSON.stringify(s.mock.calls)).join(" ");
    expect(logged).not.toContain("sk-secret-xyz");
    expect(logged).not.toContain("moje prywatne myśli");
    spies.forEach((s) => {
      s.mockRestore();
    });
  });
});
