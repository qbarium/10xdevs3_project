import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Jeden mock astro:env/server zastępuje moduł dla WSZYSTKICH importerów w tym pliku
// (config/ai.ts + user-hash.ts), więc musi dostarczyć komplet zmiennych warstwy.
vi.mock("astro:env/server", () => ({
  CLASSIFIER_MODEL: "gpt-4o-mini",
  OPENAI_BASE_URL: "https://api.test/v1",
  OPENAI_TEMPERATURE: 0.5,
  OPENAI_MAX_TOKENS: 16000,
  OPENAI_STORE: false,
  CLASSIFICATION_HASH_SALT: "test-salt",
}));

import { classify } from "@/lib/ai/classifier";
import { ClassifierAuthError, ClassifierContractError, ClassifierProviderError } from "@/types";

interface MockInit {
  ok: boolean;
  status: number;
  body: unknown;
}

function mockResponse(init: MockInit): Response {
  return { ok: init.ok, status: init.status, json: () => Promise.resolve(init.body) } as unknown as Response;
}

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function runClassify() {
  return classify("surowy wsad", {
    apiKey: "sk-test-klucz",
    userId: "11111111-2222-3333-4444-555555555555",
    signal: new AbortController().signal,
  });
}

describe("classify — gałąź chat (gpt-4o-mini)", () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => vi.clearAllMocks());

  it("happy path: zwraca zwalidowane itemy", async () => {
    const content = JSON.stringify({ items: [{ type: "task", title: "Zrób X", description: "kontekst" }] });
    fetchMock.mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        body: { choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 10 } },
      }),
    );
    const items = await runClassify();
    expect(items).toEqual([{ type: "task", title: "Zrób X", description: "kontekst" }]);
  });

  it("nie wkleja klucza do URL ani body (klucz tylko w nagłówku Authorization)", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        body: { choices: [{ message: { content: JSON.stringify({ items: [] }) }, finish_reason: "stop" }] },
      }),
    );
    await runClassify();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("sk-test-klucz");
    expect(init.body as string).not.toContain("sk-test-klucz");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test-klucz");
  });

  it("401 → ClassifierAuthError", async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: false, status: 401, body: {} }));
    await expect(runClassify()).rejects.toThrow(ClassifierAuthError);
  });

  it("500 → ClassifierProviderError", async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: false, status: 500, body: {} }));
    await expect(runClassify()).rejects.toThrow(ClassifierProviderError);
  });

  it("obcięcie (finish_reason:length) → ClassifierContractError", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        body: { choices: [{ message: { content: "{" }, finish_reason: "length" }] },
      }),
    );
    await expect(runClassify()).rejects.toThrow(ClassifierContractError);
  });

  it("odpowiedź łamiąca kontrakt itemów → ClassifierContractError", async () => {
    const content = JSON.stringify({ items: [{ type: "nieznany", title: "x", description: "" }] });
    fetchMock.mockResolvedValue(
      mockResponse({ ok: true, status: 200, body: { choices: [{ message: { content }, finish_reason: "stop" }] } }),
    );
    await expect(runClassify()).rejects.toThrow(ClassifierContractError);
  });
});
