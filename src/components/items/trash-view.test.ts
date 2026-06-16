import { describe, expect, it } from "vitest";

import { applyTrashSubFilter } from "@/components/items/trash-view";
import type { AcceptanceStatus, Item } from "@/types";

function item(id: string, acceptance_status: AcceptanceStatus): Item {
  return {
    id,
    user_id: "u",
    import_session_id: null,
    type: "task",
    title: id,
    description: null,
    acceptance_status,
    operational_status: "new",
    created_at: "2026-06-15T00:00:00Z",
    updated_at: "2026-06-15T00:00:00Z",
  };
}

const TRASH = [item("r1", "rejected"), item("d1", "deleted"), item("r2", "rejected")];

describe("applyTrashSubFilter", () => {
  it("„all” przepuszcza oba statusy kosza", () => {
    expect(applyTrashSubFilter(TRASH, "all").map((i) => i.id)).toEqual(["r1", "d1", "r2"]);
  });

  it("„rejected” zawęża tylko do odrzuconych", () => {
    expect(applyTrashSubFilter(TRASH, "rejected").map((i) => i.id)).toEqual(["r1", "r2"]);
  });

  it("„deleted” zawęża tylko do usuniętych", () => {
    expect(applyTrashSubFilter(TRASH, "deleted").map((i) => i.id)).toEqual(["d1"]);
  });

  it("nie mutuje wejścia (zwraca nową tablicę)", () => {
    const out = applyTrashSubFilter(TRASH, "all");
    expect(out).not.toBe(TRASH);
    expect(TRASH).toHaveLength(3);
  });

  it("pusta lista → pusta lista (każdy pod-filtr)", () => {
    expect(applyTrashSubFilter([], "all")).toEqual([]);
    expect(applyTrashSubFilter([], "rejected")).toEqual([]);
    expect(applyTrashSubFilter([], "deleted")).toEqual([]);
  });
});
