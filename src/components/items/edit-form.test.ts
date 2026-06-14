import { describe, expect, it } from "vitest";

import { buildEditPayload, isTitleValid } from "@/components/items/edit-form";

describe("isTitleValid", () => {
  it("pusty / whitespace → niepoprawny", () => {
    expect(isTitleValid("")).toBe(false);
    expect(isTitleValid("   ")).toBe(false);
  });

  it("niepusty → poprawny", () => {
    expect(isTitleValid("Tytuł")).toBe(true);
  });
});

describe("buildEditPayload", () => {
  it("trimuje title i zawiera type", () => {
    const payload = buildEditPayload("  Nowy  ", "opis", "task");
    expect(payload.title).toBe("Nowy");
    expect(payload.type).toBe("task");
    expect(payload.description).toBe("opis");
  });

  it("pusty / whitespace description → null", () => {
    expect(buildEditPayload("T", "", "note").description).toBeNull();
    expect(buildEditPayload("T", "   ", "note").description).toBeNull();
  });

  it("zachowuje type note (derywacja operational_status po stronie serwera)", () => {
    expect(buildEditPayload("T", "x", "note").type).toBe("note");
  });
});
