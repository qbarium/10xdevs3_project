import { describe, expect, it } from "vitest";

import {
  resolveStateSelection,
  STATE_FILTER_OPTIONS,
  stateSelectLabel,
  stateSelectValue,
} from "@/components/items/state-filter";

describe("STATE_FILTER_OPTIONS", () => {
  it("to 6 pozycji w kolejności cyklu życia z rozłącznymi wartościami", () => {
    expect(STATE_FILTER_OPTIONS.map((o) => o.value)).toEqual([
      "active",
      "active:new",
      "active:in_progress",
      "done",
      "cancelled",
      "trash",
    ]);
  });

  it("etykiety: „Wszystko aktywne” + stany operacyjne + widoki", () => {
    expect(STATE_FILTER_OPTIONS.map((o) => o.label)).toEqual([
      "Wszystko aktywne",
      "Nowe",
      "W toku",
      "Zakończone",
      "Anulowane",
      "Kosz",
    ]);
  });

  it("rodzina „active” dzieli widok active z rozłącznym opstatus; pozostałe to osobne widoki", () => {
    expect(STATE_FILTER_OPTIONS.filter((o) => o.view === "active").map((o) => o.opstatus)).toEqual([
      undefined,
      "new",
      "in_progress",
    ]);
    expect(STATE_FILTER_OPTIONS.filter((o) => o.view !== "active").map((o) => o.view)).toEqual([
      "done",
      "cancelled",
      "trash",
    ]);
  });
});

describe("resolveStateSelection — ze strony active (kliencki podfiltr)", () => {
  const ctx = { view: "active", type: "all" } as const;

  it("„Wszystko aktywne” → subfilter{undefined} (czyści zawężenie)", () => {
    expect(resolveStateSelection("active", ctx)).toEqual({ kind: "subfilter", opstatus: undefined });
  });

  it("„Nowe” → subfilter{new} (bez nawigacji)", () => {
    expect(resolveStateSelection("active:new", ctx)).toEqual({ kind: "subfilter", opstatus: "new" });
  });

  it("„W toku” → subfilter{in_progress}", () => {
    expect(resolveStateSelection("active:in_progress", ctx)).toEqual({ kind: "subfilter", opstatus: "in_progress" });
  });

  it("podfiltr NIE zależy od filtra rodzaju (type nie trafia do werdyktu subfilter)", () => {
    expect(resolveStateSelection("active:new", { view: "active", type: "task" })).toEqual({
      kind: "subfilter",
      opstatus: "new",
    });
  });

  it("„Zakończone” → nawigacja na /items/done (opstatus pominięty)", () => {
    expect(resolveStateSelection("done", ctx)).toEqual({ kind: "navigate", href: "/items/done" });
  });

  it("„Anulowane” → nawigacja na /items/cancelled", () => {
    expect(resolveStateSelection("cancelled", ctx)).toEqual({ kind: "navigate", href: "/items/cancelled" });
  });

  it("„Kosz” → nawigacja na /items/trash", () => {
    expect(resolveStateSelection("trash", ctx)).toEqual({ kind: "navigate", href: "/items/trash" });
  });
});

describe("resolveStateSelection — z innej strony (pełna nawigacja)", () => {
  it("z kosza „Nowe” → /items/active?opstatus=new", () => {
    expect(resolveStateSelection("active:new", { view: "trash", type: "all" })).toEqual({
      kind: "navigate",
      href: "/items/active?opstatus=new",
    });
  });

  it("z kosza „W toku” → /items/active?opstatus=in_progress", () => {
    expect(resolveStateSelection("active:in_progress", { view: "trash", type: "all" })).toEqual({
      kind: "navigate",
      href: "/items/active?opstatus=in_progress",
    });
  });

  it("z kosza „Wszystko aktywne” → /items/active (bez opstatus)", () => {
    expect(resolveStateSelection("active", { view: "trash", type: "all" })).toEqual({
      kind: "navigate",
      href: "/items/active",
    });
  });

  it("z done „Nowe” → /items/active?opstatus=new", () => {
    expect(resolveStateSelection("active:new", { view: "done", type: "all" })).toEqual({
      kind: "navigate",
      href: "/items/active?opstatus=new",
    });
  });

  it("niesie filtr rodzaju: z kosza „Nowe” + type=idea → /items/active?type=idea&opstatus=new", () => {
    expect(resolveStateSelection("active:new", { view: "trash", type: "idea" })).toEqual({
      kind: "navigate",
      href: "/items/active?type=idea&opstatus=new",
    });
  });

  it("niesie filtr rodzaju na widok nav: z active „Zakończone” + type=task → /items/done?type=task", () => {
    expect(resolveStateSelection("done", { view: "active", type: "task" })).toEqual({
      kind: "navigate",
      href: "/items/done?type=task",
    });
  });

  it("opstatus POMIJANY przy nawigacji na widok inny niż active (criteriaToQuery): z active „Kosz” + type=note", () => {
    expect(resolveStateSelection("trash", { view: "active", type: "note" })).toEqual({
      kind: "navigate",
      href: "/items/trash?type=note",
    });
  });

  it("wybór bieżącego widoku nav (trash na trash) → nawigacja na tę samą stronę", () => {
    expect(resolveStateSelection("trash", { view: "trash", type: "all" })).toEqual({
      kind: "navigate",
      href: "/items/trash",
    });
  });

  it("nieznana wartość → bezpieczna nawigacja na bieżący widok", () => {
    expect(resolveStateSelection("garbage", { view: "done", type: "all" })).toEqual({
      kind: "navigate",
      href: "/items/done",
    });
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
    expect(stateSelectValue("trash", undefined)).toBe("trash");
  });

  it("opstatus ignorowany dla widoków innych niż active (obronnie)", () => {
    expect(stateSelectValue("done", "new")).toBe("done");
    expect(stateSelectValue("trash", "in_progress")).toBe("trash");
  });

  it("round-trip: każda wartość z modelu wraca przez stateSelectValue(view, opstatus)", () => {
    for (const o of STATE_FILTER_OPTIONS) {
      expect(stateSelectValue(o.view, o.opstatus)).toBe(o.value);
    }
  });
});

describe("stateSelectLabel", () => {
  it("zwraca etykietę pozycji dla znanej wartości", () => {
    expect(stateSelectLabel("active")).toBe("Wszystko aktywne");
    expect(stateSelectLabel("active:in_progress")).toBe("W toku");
    expect(stateSelectLabel("trash")).toBe("Kosz");
  });

  it("nieznana wartość → undefined", () => {
    expect(stateSelectLabel("garbage")).toBeUndefined();
  });
});
