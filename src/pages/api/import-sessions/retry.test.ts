import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mockujemy zależności I/O endpointu i rdzenia (bez astro:env). classify-core ZOSTAJE REALNY — testujemy
// pełny łańcuch endpoint → runClassification → classifyResultToResponse (faktyczne mapowanie HTTP).
// Sterujemy wynikiem przez mock `classify` (jak w classify.test.ts), więc 422/200 wychodzą z prawdziwej
// logiki, nie ze stubu.
vi.mock("@/lib/config/ai", () => ({ AI_REQUEST_TIMEOUT_MS: 60000 }));
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/services/profile-key", () => ({ getEncryptedApiKey: vi.fn() }));
vi.mock("@/lib/services/byok-crypto", () => ({ decryptApiKey: vi.fn() }));
vi.mock("@/lib/ai/classifier", () => ({ classify: vi.fn() }));
vi.mock("@/lib/services/import-session", () => ({
  getSessionForRetry: vi.fn(),
  reopenSession: vi.fn(),
  persistItems: vi.fn(),
  finalizeEmpty: vi.fn(),
  failSession: vi.fn(),
}));
vi.mock("@/lib/services/session-input", () => {
  class SessionInputStorageError extends Error {
    constructor(message?: string) {
      super(message);
      this.name = "SessionInputStorageError";
    }
  }
  return { loadSessionInput: vi.fn(), SessionInputStorageError };
});

import { classify } from "@/lib/ai/classifier";
import { decryptApiKey } from "@/lib/services/byok-crypto";
import { failSession, getSessionForRetry, persistItems, reopenSession } from "@/lib/services/import-session";
import { getEncryptedApiKey } from "@/lib/services/profile-key";
import { loadSessionInput, SessionInputStorageError } from "@/lib/services/session-input";
import { POST } from "@/pages/api/import-sessions/retry";
import type { ImportSession } from "@/types";
import { ClassifierProviderError, UnsupportedEncodingError } from "@/types";

interface ResultBody {
  ok?: boolean;
  status?: string;
  code?: string;
  itemCount?: number;
  error?: string;
  sessionId?: string;
}

function ctx(body: unknown, user: { id: string } | null = { id: "user-1" }) {
  return {
    locals: { user },
    request: new Request("https://x/api/import-sessions/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    cookies: {},
  } as unknown as Parameters<typeof POST>[0];
}

const failedSession = (over: Partial<ImportSession> = {}): ImportSession => ({
  id: "sess-1",
  user_id: "user-1",
  status: "failed",
  raw_input: "wsad do ponowienia",
  item_count: null,
  error_message: "invalid_key",
  created_at: "2026-06-13T00:00:00Z",
  updated_at: "2026-06-13T00:00:00Z",
  ...over,
});

describe("POST /api/import-sessions/retry", () => {
  beforeEach(() => {
    vi.mocked(getSessionForRetry).mockResolvedValue(failedSession());
    vi.mocked(getEncryptedApiKey).mockResolvedValue("v1.iv.ct");
    vi.mocked(decryptApiKey).mockResolvedValue("sk-secret-xyz");
    vi.mocked(loadSessionInput).mockResolvedValue("wsad do ponowienia");
    vi.mocked(reopenSession).mockResolvedValue(true);
    vi.mocked(failSession).mockResolvedValue(undefined);
  });
  afterEach(() => vi.clearAllMocks());

  it("brak zalogowania → 401", async () => {
    const res = await POST(ctx({ sessionId: "sess-1" }, null));
    expect(res.status).toBe(401);
  });

  it("brak sessionId → 400", async () => {
    const res = await POST(ctx({ sessionId: "   " }));
    expect(res.status).toBe(400);
    expect(vi.mocked(getSessionForRetry)).not.toHaveBeenCalled();
  });

  it("ścieżka pozytywna: failed paste → completed_with_items, ten sam sessionId, item_count zaktualizowany", async () => {
    vi.mocked(classify).mockResolvedValue([{ type: "task", title: "T", description: "D" }]);
    vi.mocked(persistItems).mockResolvedValue(1);
    const res = await POST(ctx({ sessionId: "sess-1" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ResultBody;
    expect(body).toMatchObject({ ok: true, sessionId: "sess-1", status: "completed_with_items", itemCount: 1 });
    expect(vi.mocked(reopenSession)).toHaveBeenCalledWith(expect.anything(), "sess-1");
    expect(vi.mocked(persistItems)).toHaveBeenCalledOnce();
  });

  it("ścieżka negatywna: klasyfikacja pada ponownie → failed + kod", async () => {
    vi.mocked(classify).mockRejectedValue(new ClassifierProviderError());
    const res = await POST(ctx({ sessionId: "sess-1" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ResultBody;
    expect(body.status).toBe("failed");
    expect(body.code).toBe("provider");
    expect(vi.mocked(failSession)).toHaveBeenCalledWith(expect.anything(), "sess-1", "provider");
  });

  it("klucz usunięty przed retry → 409 missing_key + komunikat, BEZ klasyfikacji i reopenu", async () => {
    vi.mocked(getEncryptedApiKey).mockResolvedValue(null);
    const res = await POST(ctx({ sessionId: "sess-1" }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as ResultBody;
    expect(body.code).toBe("missing_key");
    expect(body.error).toContain("usunięty");
    expect(vi.mocked(loadSessionInput)).not.toHaveBeenCalled();
    expect(vi.mocked(reopenSession)).not.toHaveBeenCalled();
    expect(vi.mocked(classify)).not.toHaveBeenCalled();
  });

  it("retry sesji nie-failed → 409 not_retryable", async () => {
    vi.mocked(getSessionForRetry).mockResolvedValue(failedSession({ status: "completed_with_items" }));
    const res = await POST(ctx({ sessionId: "sess-1" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as ResultBody).code).toBe("not_retryable");
    expect(vi.mocked(classify)).not.toHaveBeenCalled();
  });

  it("plik: re-dekod pada → 200 failed/encoding, bez wycieku treści/klucza i bez klasyfikacji", async () => {
    vi.mocked(getSessionForRetry).mockResolvedValue(
      failedSession({
        raw_input: null,
        // @ts-expect-error: w teście dokładamy zsymulowany rekord pliku (sesja plikowa)
        file: { id: "f1", file_path: "user-1/sess-1/f1.txt", file_name: "n.txt", file_mime: "text/plain" },
      }),
    );
    vi.mocked(loadSessionInput).mockRejectedValue(new UnsupportedEncodingError());
    const res = await POST(ctx({ sessionId: "sess-1" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ResultBody;
    expect(body.status).toBe("failed");
    expect(body.code).toBe("encoding");
    expect(JSON.stringify(body)).not.toContain("sk-secret-xyz");
    expect(vi.mocked(failSession)).toHaveBeenCalledWith(expect.anything(), "sess-1", "encoding");
    expect(vi.mocked(classify)).not.toHaveBeenCalled();
  });

  it("download pliku pada → 200 failed/storage", async () => {
    vi.mocked(loadSessionInput).mockRejectedValue(new SessionInputStorageError());
    const res = await POST(ctx({ sessionId: "sess-1" }));
    expect(((await res.json()) as ResultBody).code).toBe("storage");
    expect(vi.mocked(failSession)).toHaveBeenCalledWith(expect.anything(), "sess-1", "storage");
  });

  it("RLS: cudza/nieistniejąca sesja → 404", async () => {
    vi.mocked(getSessionForRetry).mockResolvedValue(null);
    const res = await POST(ctx({ sessionId: "obca" }));
    expect(res.status).toBe(404);
    expect(vi.mocked(classify)).not.toHaveBeenCalled();
  });

  it("równoległe ponowienie wygrało wyścig (reopen → false) → 409 not_retryable, bez klasyfikacji", async () => {
    vi.mocked(reopenSession).mockResolvedValue(false);
    const res = await POST(ctx({ sessionId: "sess-1" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as ResultBody).code).toBe("not_retryable");
    expect(vi.mocked(classify)).not.toHaveBeenCalled();
  });

  it("pusty wsad po odtworzeniu → 200 failed/empty_file", async () => {
    vi.mocked(loadSessionInput).mockResolvedValue("");
    const res = await POST(ctx({ sessionId: "sess-1" }));
    expect(((await res.json()) as ResultBody).code).toBe("empty_file");
    expect(vi.mocked(reopenSession)).not.toHaveBeenCalled();
  });
});
