import { describe, expect, it } from "vitest";

import { STATE_FILTER_OPTIONS, stateSelectValue } from "@/components/items/state-filter";

describe("STATE_FILTER_OPTIONS", () => {
  it("to 5 pozycji w kolejności cyklu życia z rozłącznymi wartościami", () => {
    expect(STATE_FILTER_OPTIONS.map((o) => o.value)).toEqual([
      "active",
      "active:new",
      "active:in_progress",
      "done",
      "cancelled",
    ]);
  });

  it("etykiety: „Wszystko aktywne” + stany operacyjne + widoki", () => {
    expect(STATE_FILTER_OPTIONS.map((o) => o.label)).toEqual([
      "Wszystko aktywne",
      "Nowe",
      "W toku",
      "Zakończone",
      "Anulowane",
    ]);
  });

  it("rodzina „active” dzieli widok active z rozłącznym opstatus; pozostałe to osobne widoki", () => {
    expect(STATE_FILTER_OPTIONS.filter((o) => o.view === "active").map((o) => o.opstatus)).toEqual([
      undefined,
      "new",
      "in_progress",
    ]);
    expect(STATE_FILTER_OPTIONS.filter((o) => o.view !== "active").map((o) => o.view)).toEqual(["done", "cancelled"]);
  });
});

describe("stateSelectValue", () => {
  it("active wg opstatus", () => {
    expect(stateSelectValue("active", undefined)).toBe("active");
    expect(stateSelectValue("active", "new")).toBe("active:new");
    expect(stateSelectValue("active", "in_progress")).toBe("active:in_progress");
  });

  it("pozostałe widoki wg samego view", () => {
    expect(stateSelectValue("done", undefined)).toBe("done");
    expect(stateSelectValue("cancelled", undefined)).toBe("cancelled");
  });

  it("opstatus ignorowany dla widoków innych niż active (obronnie)", () => {
    expect(stateSelectValue("done", "new")).toBe("done");
  });

  it("round-trip: każda wartość z modelu wraca przez stateSelectValue(view, opstatus)", () => {
    for (const o of STATE_FILTER_OPTIONS) {
      expect(stateSelectValue(o.view, o.opstatus)).toBe(o.value);
    }
  });
});
