import { beforeEach, describe, expect, it, vi } from "vitest";

// Gałąź mock (CLASSIFIER_MODEL=mock) — atrapa E2E w classifier.ts (kind:"mock"). Deterministyczna,
// bez sieci ani klucza. Ten plik pinuje jej kontrakt; dotąd gałąź mock nie miała pokrycia.
vi.mock("astro:env/server", () => ({
  CLASSIFIER_MODEL: "mock",
  OPENAI_BASE_URL: "https://api.openai.com/v1", // host allowlistowy (config/ai.ts buduje się przy imporcie)
  OPENAI_TEMPERATURE: 0.5,
  OPENAI_MAX_TOKENS: 16000,
  OPENAI_STORE: false,
  CLASSIFICATION_HASH_SALT: "test-salt",
}));

import { classify } from "@/lib/ai/classifier";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

function run(text: string) {
  return classify(text, {
    apiKey: "sk-nieuzywany-w-mock",
    userId: "11111111-2222-3333-4444-555555555555",
    signal: new AbortController().signal,
  });
}

describe("classify — gałąź mock (atrapa E2E)", () => {
  it("każda niepusta linia → item typu task z tytułem = linia", async () => {
    expect(await run("Zadanie A\nZadanie B")).toEqual([
      { type: "task", title: "Zadanie A", description: "" },
      { type: "task", title: "Zadanie B", description: "" },
    ]);
  });

  it("jedna linia → jeden item (przypadek testu E2E: unikalny wsad → unikalny tytuł)", async () => {
    expect(await run("E2E-1234567890-abc")).toEqual([{ type: "task", title: "E2E-1234567890-abc", description: "" }]);
  });

  it("puste/białe linie pomijane, tytuł przycięty (trim)", async () => {
    expect(await run("  A  \n\n   \n B ")).toEqual([
      { type: "task", title: "A", description: "" },
      { type: "task", title: "B", description: "" },
    ]);
  });

  it("deterministyczny: ten sam wsad → ten sam wynik", async () => {
    expect(await run("X\nY")).toEqual(await run("X\nY"));
  });

  it("nie woła sieci (atrapa działa bez fetch)", async () => {
    await run("cokolwiek");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
