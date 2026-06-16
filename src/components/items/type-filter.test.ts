import { describe, expect, it } from "vitest";

import {
  applyTypeFilter,
  parseTypeFilter,
  TYPE_FILTER_VALUES,
  typeFilterCookieName,
} from "@/components/items/type-filter";
import type { Item, ItemType } from "@/types";

function item(id: string, type: ItemType): Item {
  return {
    id,
    user_id: "u",
    import_session_id: null,
    type,
    title: id,
    description: null,
    acceptance_status: "accepted",
    operational_status: "new",
    created_at: "2026-06-15T00:00:00Z",
    updated_at: "2026-06-15T00:00:00Z",
  };
}

const NONE: ReadonlySet<string> = new Set<string>();

describe("TYPE_FILTER_VALUES", () => {
  it("to „all” + 5 typów w kolejności ITEM_TYPES", () => {
    expect([...TYPE_FILTER_VALUES]).toEqual(["all", "task", "note", "idea", "decision", "other"]);
  });
});

describe("applyTypeFilter", () => {
  const items = [item("a", "task"), item("b", "note"), item("c", "idea")];

  it("all → wszystkie (kolejność zachowana)", () => {
    expect(applyTypeFilter(items, "all", NONE).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("konkretny typ → tylko itemy tego typu", () => {
    expect(applyTypeFilter(items, "note", NONE).map((i) => i.id)).toEqual(["b"]);
  });

  it("typ bez itemów → pusta lista", () => {
    expect(applyTypeFilter(items, "decision", NONE)).toEqual([]);
  });

  it("przypięty item zostaje widoczny mimo niezgodności z filtrem (decyzja #6)", () => {
    // filtr „task", ale „b" (note) przypięty → widoczne „a" (task) + „b" (pinned)
    const pinned = new Set(["b"]);
    expect(applyTypeFilter(items, "task", pinned).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("przypięcie itemu zgodnego z filtrem nie duplikuje go", () => {
    const pinned = new Set(["a"]);
    expect(applyTypeFilter(items, "task", pinned).map((i) => i.id)).toEqual(["a"]);
  });

  it("all ignoruje pinnedIds (i tak wszystko widoczne)", () => {
    expect(applyTypeFilter(items, "all", new Set(["b"])).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("nie mutuje wejścia", () => {
    const snapshot = items.map((i) => i.id);
    applyTypeFilter(items, "note", NONE);
    expect(items.map((i) => i.id)).toEqual(snapshot);
  });
});

describe("typeFilterCookieName", () => {
  it("nazwa cookie per widok", () => {
    expect(typeFilterCookieName("active")).toBe("tl_tf_active");
    expect(typeFilterCookieName("done")).toBe("tl_tf_done");
    expect(typeFilterCookieName("cancelled")).toBe("tl_tf_cancelled");
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
