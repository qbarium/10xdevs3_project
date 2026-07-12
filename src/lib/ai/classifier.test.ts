import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Jeden mock astro:env/server zastępuje moduł dla WSZYSTKICH importerów w tym pliku
// (config/ai.ts + user-hash.ts), więc musi dostarczyć komplet zmiennych warstwy.
vi.mock("astro:env/server", () => ({
  CLASSIFIER_MODEL: "gpt-4o-mini",
  OPENAI_BASE_URL: "https://api.openai.com/v1", // host allowlistowy (walidacja fail-closed w ai.ts, F2)
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

// Koperta OpenAI ze statusem 200 i podaną treścią (`content`). Kontrakt itemów żyje w treści,
// więc scenariusze różnią się wyłącznie nią — HTTP jest zawsze ok:true.
function stubChatOk(content: string) {
  fetchMock.mockResolvedValue(
    mockResponse({ ok: true, status: 200, body: { choices: [{ message: { content }, finish_reason: "stop" }] } }),
  );
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

  it("wysyła store:false w body żądania (inwariant prywatności wsadu #4 na drucie)", async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        body: { choices: [{ message: { content: JSON.stringify({ items: [] }) }, finish_reason: "stop" }] },
      }),
    );
    await runClassify();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { store?: unknown };
    expect(body.store).toBe(false); // aiConfig.store (=assertNoStore, zawsze false) ląduje na drucie
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

  // --- Rodzina "naruszenie kontraktu itemu": każde brakujące/niepoprawne pole obowiązkowe pada na
  //     granicy zod (schema.ts) jako ClassifierContractError. Dotąd pokryty był tylko zły `type` wyżej.

  it("item bez wymaganego pola: brak title → ClassifierContractError", async () => {
    stubChatOk(JSON.stringify({ items: [{ type: "task", description: "x" }] }));
    await expect(runClassify()).rejects.toThrow(ClassifierContractError);
  });

  it("item bez wymaganego pola: title pusty (min(1)) → ClassifierContractError", async () => {
    stubChatOk(JSON.stringify({ items: [{ type: "task", title: "", description: "x" }] }));
    await expect(runClassify()).rejects.toThrow(ClassifierContractError);
  });

  it("item bez wymaganego pola: brak type → ClassifierContractError", async () => {
    stubChatOk(JSON.stringify({ items: [{ title: "x", description: "y" }] }));
    await expect(runClassify()).rejects.toThrow(ClassifierContractError);
  });

  it("item bez wymaganego pola: brak description → ClassifierContractError", async () => {
    stubChatOk(JSON.stringify({ items: [{ type: "task", title: "x" }] }));
    await expect(runClassify()).rejects.toThrow(ClassifierContractError);
  });

  it("treść bez klucza items → ClassifierContractError (payload undefined → zod pada)", async () => {
    stubChatOk(JSON.stringify({ foo: 1 }));
    await expect(runClassify()).rejects.toThrow(ClassifierContractError);
  });

  // --- Nie-błędy: kształty łatwe do pomylenia z awarią, a to poprawne ścieżki.

  it("nadmiarowe pole itemu jest cicho usuwane (sukces bez pola, nie błąd)", async () => {
    // schema.ts to zwykły z.object (bez .strict()) → pole `foo` znika, item przechodzi jako sukces.
    stubChatOk(JSON.stringify({ items: [{ type: "task", title: "x", description: "y", foo: "bar" }] }));
    expect(await runClassify()).toEqual([{ type: "task", title: "x", description: "y" }]);
  });

  it("poprawne items:[] → [] (pusta tablica to sukces, nie błąd)", async () => {
    stubChatOk(JSON.stringify({ items: [] }));
    expect(await runClassify()).toEqual([]);
  });

  it("pusty content koperty → ClassifierContractError (kontrast do items:[])", async () => {
    // Pusta *treść koperty* to naruszenie kontraktu (parseChatResponse, request.ts:67-70) — odrębne
    // od zera itemów: brak content ≠ poprawne items:[]. To dwie różne ścieżki, nie jedna.
    stubChatOk("");
    await expect(runClassify()).rejects.toThrow(ClassifierContractError);
  });

  // --- Jawny "poprawne N" (N > 1); happy path wyżej testuje tylko N=1.

  it("poprawne N itemów (N=3, różne typy) → zwalidowana tablica, kolejność zachowana", async () => {
    const items = [
      { type: "task", title: "Zadanie", description: "a" },
      { type: "idea", title: "Pomysł", description: "" },
      { type: "decision", title: "Decyzja", description: "c" },
    ];
    stubChatOk(JSON.stringify({ items }));
    expect(await runClassify()).toEqual(items);
  });
});
