import { describe, expect, it } from "vitest";

import { resolveEndpoint } from "@/lib/ai/resolver";

describe("resolveEndpoint (wytyczne §4)", () => {
  it("model klasyczny → chat", () => {
    expect(resolveEndpoint("gpt-4o-mini").kind).toBe("chat");
    expect(resolveEndpoint("gpt-4o").kind).toBe("chat");
    expect(resolveEndpoint("gpt-3.5-turbo").kind).toBe("chat");
  });

  it("wariant z datą modelu klasycznego → chat", () => {
    expect(resolveEndpoint("gpt-4o-mini-2024-07-18").kind).toBe("chat");
  });

  it("porównanie bez wielkości liter", () => {
    expect(resolveEndpoint("GPT-4O-MINI").kind).toBe("chat");
  });

  it("mock → mock (szew E2E)", () => {
    expect(resolveEndpoint("mock").kind).toBe("mock");
    expect(resolveEndpoint("MOCK").kind).toBe("mock");
  });

  it("wszystko inne (rozumujące/przyszłe) → responses", () => {
    expect(resolveEndpoint("gpt-5").kind).toBe("responses");
    expect(resolveEndpoint("o3-mini").kind).toBe("responses");
    expect(resolveEndpoint("nieznany-model").kind).toBe("responses");
  });
});
