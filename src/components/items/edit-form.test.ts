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
  it("trimuje title, zawiera type i operationalStatus", () => {
    const payload = buildEditPayload("  Nowy  ", "opis", "task", "in_progress");
    expect(payload.title).toBe("Nowy");
    expect(payload.type).toBe("task");
    expect(payload.description).toBe("opis");
    expect(payload.operationalStatus).toBe("in_progress");
  });

  it("pusty / whitespace description → null", () => {
    expect(buildEditPayload("T", "", "note", "new").description).toBeNull();
    expect(buildEditPayload("T", "   ", "note", "new").description).toBeNull();
  });

  it("przekazuje operationalStatus bez zmian (zachowanie postępu przy edycji treści)", () => {
    expect(buildEditPayload("T", "x", "note", "done").operationalStatus).toBe("done");
  });
});
