import { afterEach, describe, expect, it, vi } from "vitest";

// Walidacja aiConfig jest fail-closed PRZY IMPORCIE modułu (jak fail-closed soli). Testujemy więc
// zachowanie ewaluacji modułu: doMock astro:env/server + dynamiczny import + resetModules per test,
// by każdy przypadek dostał świeżą ewaluację z własnym env (F2 z /10x-impl-review).

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("astro:env/server");
});

function mockEnv(overrides: Record<string, unknown>): void {
  vi.doMock("astro:env/server", () => ({
    CLASSIFIER_MODEL: "gpt-4o-mini",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    OPENAI_TEMPERATURE: 0.5,
    OPENAI_MAX_TOKENS: 16000,
    OPENAI_STORE: false,
    ...overrides,
  }));
}

describe("aiConfig — walidacja fail-closed pól wrażliwych (F2)", () => {
  it("akceptuje domyślny host na allowliście i store:false", async () => {
    mockEnv({});
    const mod = await import("@/lib/config/ai");
    expect(mod.aiConfig.baseUrl).toBe("https://api.openai.com/v1");
    expect(mod.aiConfig.store).toBe(false);
  });

  it("odrzuca host spoza allowlisty egress (ochrona klucza BYOK)", async () => {
    mockEnv({ OPENAI_BASE_URL: "https://evil.example/v1" });
    await expect(import("@/lib/config/ai")).rejects.toThrow(/allowlisty/);
  });

  it("odrzuca schemat inny niż https", async () => {
    mockEnv({ OPENAI_BASE_URL: "http://api.openai.com/v1" });
    await expect(import("@/lib/config/ai")).rejects.toThrow(/https/);
  });

  it("odrzuca błędny URL", async () => {
    mockEnv({ OPENAI_BASE_URL: "nie-url" });
    await expect(import("@/lib/config/ai")).rejects.toThrow(/URL/);
  });

  it("odrzuca OPENAI_STORE=true (inwariant prywatności wsadu)", async () => {
    mockEnv({ OPENAI_STORE: true });
    await expect(import("@/lib/config/ai")).rejects.toThrow(/store/i);
  });
});
