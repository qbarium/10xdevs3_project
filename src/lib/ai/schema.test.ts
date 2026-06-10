import { describe, expect, it } from "vitest";

import { buildJsonSchema, classificationResultSchema, classifiedItemSchema } from "@/lib/ai/schema";

describe("classifiedItemSchema (walidacja granicy, FR-005)", () => {
  it("akceptuje poprawny item", () => {
    const ok = classifiedItemSchema.safeParse({ type: "task", title: "Zrób X", description: "kontekst" });
    expect(ok.success).toBe(true);
  });

  it("odrzuca nieznany typ", () => {
    expect(classifiedItemSchema.safeParse({ type: "bug", title: "x", description: "" }).success).toBe(false);
  });

  it("odrzuca pusty title", () => {
    expect(classifiedItemSchema.safeParse({ type: "note", title: "", description: "" }).success).toBe(false);
  });

  it("dopuszcza pusty description", () => {
    expect(classifiedItemSchema.safeParse({ type: "idea", title: "pomysł", description: "" }).success).toBe(true);
  });

  it("usuwa nadmiarowe pola modelu (nie utrwalamy confidence/tags)", () => {
    const parsed = classifiedItemSchema.parse({
      type: "decision",
      title: "decyzja",
      description: "",
      confidence: 0.9,
      tags: ["a"],
    });
    expect(parsed).toEqual({ type: "decision", title: "decyzja", description: "" });
    expect("confidence" in parsed).toBe(false);
  });

  it("classificationResultSchema waliduje tablicę itemów", () => {
    const ok = classificationResultSchema.safeParse([{ type: "task", title: "t", description: "" }]);
    expect(ok.success).toBe(true);
    expect(classificationResultSchema.safeParse([]).success).toBe(true);
  });
});

describe("buildJsonSchema (strict Structured Outputs)", () => {
  it("root: obiekt, additionalProperties:false, items required", () => {
    const schema = buildJsonSchema();
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain("items");
  });

  it("item: wszystkie pola required + additionalProperties:false (wymóg strict)", () => {
    const item = buildJsonSchema().properties.items.items;
    expect(item.required).toEqual(["type", "title", "description"]);
    expect(item.additionalProperties).toBe(false);
    expect(item.properties.type.enum).toEqual(["task", "note", "idea", "decision", "other"]);
  });
});
