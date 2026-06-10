import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mockujemy WSZYSTKIE zależności endpointu (m.in. config/ai → bez astro:env). Testujemy wyłącznie
// logikę endpointu: guard, walidację wsadu, mapowanie 4 stanów i kodów błędów, higienę logów.
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

import { classify } from "@/lib/ai/classifier";
import { decryptApiKey } from "@/lib/services/byok-crypto";
import { createSession, failSession, finalizeEmpty, persistItems } from "@/lib/services/import-session";
import { getEncryptedApiKey } from "@/lib/services/profile-key";
import { POST } from "@/pages/api/ingest/classify";
import type { ClassifiedItem } from "@/types";
import { ClassifierAuthError, ClassifierProviderError } from "@/types";

interface ResultBody {
  ok?: boolean;
  status?: string;
  code?: string;
  itemCount?: number;
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

const items = (n: number): ClassifiedItem[] =>
  Array.from({ length: n }, (_, i) => ({ type: "note", title: `t${i}`, description: "" }));

describe("POST /api/ingest/classify", () => {
  beforeEach(() => {
    vi.mocked(createSession).mockResolvedValue({ id: "sess-1" });
    vi.mocked(getEncryptedApiKey).mockResolvedValue("v1.iv.ct");
    vi.mocked(decryptApiKey).mockResolvedValue("sk-secret-xyz");
  });
  afterEach(() => vi.clearAllMocks());

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
