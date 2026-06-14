import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock zależności rdzenia (bez astro:env). Testujemy: czysty rdzeń runClassification (mapowanie 4
// stanów) oraz classifyResultToResponse — JEDYNE miejsce mapowania wyniku na HTTP (regresja-strażnik
// F1: too_many_items musi dawać 422/ok:false, identycznie jak historyczny classify.ts).
vi.mock("@/lib/config/ai", () => ({ AI_REQUEST_TIMEOUT_MS: 60000 }));
vi.mock("@/lib/ai/classifier", () => ({ classify: vi.fn() }));
vi.mock("@/lib/services/import-session", () => ({
  persistItems: vi.fn(),
  finalizeEmpty: vi.fn(),
  failSession: vi.fn(),
}));

import { classify } from "@/lib/ai/classifier";
import { classifyResultToResponse, runClassification } from "@/lib/ai/classify-core";
import type { ClassificationResult } from "@/lib/ai/classify-core";
import { failSession, finalizeEmpty, persistItems } from "@/lib/services/import-session";
import type { ClassifiedItem } from "@/types";
import { ClassifierAuthError } from "@/types";

const supa = {} as unknown as Parameters<typeof runClassification>[0];
const params = (text = "wsad") => ({ sessionId: "s1", apiKey: "k", userId: "u", text });
const items = (n: number): ClassifiedItem[] =>
  Array.from({ length: n }, (_, i) => ({ type: "note", title: `t${i}`, description: "" }));

describe("classifyResultToResponse — jedyne mapowanie wyniku na HTTP (F1)", () => {
  async function bodyOf(r: ClassificationResult) {
    const res = classifyResultToResponse("s1", r);
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }

  it("too_many_items → 422 z ok:false", async () => {
    const { status, json } = await bodyOf({ status: "failed", code: "too_many_items" });
    expect(status).toBe(422);
    expect(json).toMatchObject({ ok: false, sessionId: "s1", status: "failed", code: "too_many_items" });
  });

  it("completed_with_items → 200 z ok:true i itemCount", async () => {
    const { status, json } = await bodyOf({ status: "completed_with_items", itemCount: 3 });
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true, status: "completed_with_items", itemCount: 3 });
  });

  it("completed_no_items → 200 z itemCount 0", async () => {
    const { status, json } = await bodyOf({ status: "completed_no_items", itemCount: 0 });
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true, status: "completed_no_items", itemCount: 0 });
  });

  it("failed (błąd klasyfikacji) → 200 z ok:true i code", async () => {
    const { status, json } = await bodyOf({ status: "failed", code: "timeout" });
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true, status: "failed", code: "timeout" });
  });
});

describe("runClassification — współdzielony rdzeń (reuse sessionId)", () => {
  beforeEach(() => {
    vi.mocked(failSession).mockResolvedValue(undefined);
  });
  afterEach(() => vi.clearAllMocks());

  it("happy path → completed_with_items + persistItems", async () => {
    vi.mocked(classify).mockResolvedValue([{ type: "task", title: "T", description: "D" }]);
    vi.mocked(persistItems).mockResolvedValue(1);
    expect(await runClassification(supa, params())).toEqual({ status: "completed_with_items", itemCount: 1 });
    expect(vi.mocked(persistItems)).toHaveBeenCalledOnce();
  });

  it("zero itemów → completed_no_items + finalizeEmpty, bez persist", async () => {
    vi.mocked(classify).mockResolvedValue([]);
    expect(await runClassification(supa, params())).toEqual({ status: "completed_no_items", itemCount: 0 });
    expect(vi.mocked(finalizeEmpty)).toHaveBeenCalledOnce();
    expect(vi.mocked(persistItems)).not.toHaveBeenCalled();
  });

  it("> 100 → failed/too_many_items + failSession, bez persist", async () => {
    vi.mocked(classify).mockResolvedValue(items(101));
    expect(await runClassification(supa, params())).toEqual({ status: "failed", code: "too_many_items" });
    expect(vi.mocked(failSession)).toHaveBeenCalledWith(supa, "s1", "too_many_items");
    expect(vi.mocked(persistItems)).not.toHaveBeenCalled();
  });

  it("ClassifierAuthError → failed/invalid_key + failSession", async () => {
    vi.mocked(classify).mockRejectedValue(new ClassifierAuthError());
    expect(await runClassification(supa, params())).toEqual({ status: "failed", code: "invalid_key" });
    expect(vi.mocked(failSession)).toHaveBeenCalledWith(supa, "s1", "invalid_key");
  });
});
