import { describe, expect, it } from "vitest";

import { matchesView, reconcileAfterChange } from "@/components/items/operational-view";
import type { Item, OperationalStatus } from "@/types";

function item(id: string, operational_status: OperationalStatus | null): Item {
  return {
    id,
    user_id: "u",
    import_session_id: null,
    type: "task",
    title: id,
    description: null,
    acceptance_status: "accepted",
    operational_status,
    created_at: "2026-06-15T00:00:00Z",
    updated_at: "2026-06-15T00:00:00Z",
  };
}

describe("matchesView", () => {
  it("Aktywne = new | in_progress (done/cancelled/null poza)", () => {
    expect(matchesView("new", "active")).toBe(true);
    expect(matchesView("in_progress", "active")).toBe(true);
    expect(matchesView("done", "active")).toBe(false);
    expect(matchesView("cancelled", "active")).toBe(false);
    expect(matchesView(null, "active")).toBe(false);
  });

  it("Zakończone = done; Anulowane = cancelled (rozłącznie)", () => {
    expect(matchesView("done", "done")).toBe(true);
    expect(matchesView("new", "done")).toBe(false);
    expect(matchesView("cancelled", "cancelled")).toBe(true);
    expect(matchesView("done", "cancelled")).toBe(false);
  });
});

describe("reconcileAfterChange", () => {
  it("usuwa item, którego nowy stan wypada poza predykat (Aktywne: new→done znika)", () => {
    const items = [item("a", "new"), item("b", "new")];
    const next = reconcileAfterChange(items, new Set(["a"]), "done", "active");
    expect(next.map((i) => i.id)).toEqual(["b"]);
  });

  it("zostawia i aktualizuje item w obrębie predykatu (Aktywne: new→in_progress zostaje)", () => {
    const items = [item("a", "new")];
    const next = reconcileAfterChange(items, new Set(["a"]), "in_progress", "active");
    expect(next).toHaveLength(1);
    expect(next[0].operational_status).toBe("in_progress");
  });

  it("bulk: wszystkie wskazane id dostają target; te poza predykatem znikają", () => {
    const items = [item("a", "new"), item("b", "in_progress"), item("c", "new")];
    const next = reconcileAfterChange(items, new Set(["a", "b"]), "done", "active");
    expect(next.map((i) => i.id)).toEqual(["c"]); // a,b → done (znikają z Aktywne), c zostaje
  });

  it("Zakończone „Otwórz ponownie” (→ new) usuwa item z widoku done", () => {
    const items = [item("a", "done")];
    const next = reconcileAfterChange(items, new Set(["a"]), "new", "done");
    expect(next).toHaveLength(0);
  });

  it("Anulowane „Przywróć” (→ new) usuwa item z widoku cancelled", () => {
    const items = [item("a", "cancelled")];
    const next = reconcileAfterChange(items, new Set(["a"]), "new", "cancelled");
    expect(next).toHaveLength(0);
  });
});
