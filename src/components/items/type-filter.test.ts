import { describe, expect, it } from "vitest";

import { parseTypeFilter, TYPE_FILTER_VALUES } from "@/components/items/type-filter";

describe("TYPE_FILTER_VALUES", () => {
  it("to „all” + 5 typów w kolejności ITEM_TYPES", () => {
    expect([...TYPE_FILTER_VALUES]).toEqual(["all", "task", "note", "idea", "decision", "other"]);
  });
});

describe("parseTypeFilter", () => {
  it("poprawna wartość → ona sama", () => {
    expect(parseTypeFilter("task")).toBe("task");
    expect(parseTypeFilter("all")).toBe("all");
    expect(parseTypeFilter("decision")).toBe("decision");
  });

  it("niepoprawna / pusta / brak → fallback „all”", () => {
    expect(parseTypeFilter("archived")).toBe("all");
    expect(parseTypeFilter("")).toBe("all");
    expect(parseTypeFilter(undefined)).toBe("all");
    expect(parseTypeFilter(null)).toBe("all");
  });
});
