import { describe, expect, it } from "vitest";

import {
  criteriaToQuery,
  defaultCriteria,
  hasActiveFilters,
  ITEM_PAGE_SIZE,
  ITEM_PAGE_SIZES,
  parseItemPage,
  parseItemSize,
  parseListCriteria,
} from "@/lib/services/list-criteria";
import type { ListCriteria } from "@/lib/services/list-criteria";

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe("parseListCriteria — domyślne wg widoku", () => {
  it("pending → sort:created, dir:desc, type:all, q:'', brak opstatus", () => {
    expect(parseListCriteria("pending", params(""))).toEqual({
      view: "pending",
      type: "all",
      sort: "created",
      dir: "desc",
      q: "",
      opstatus: undefined,
    });
  });

  it.each(["active", "done", "cancelled", "trash"] as const)("%s → sort:updated, dir:desc, type:all", (view) => {
    const c = parseListCriteria(view, params(""));
    expect(c.sort).toBe("updated");
    expect(c.dir).toBe("desc");
    expect(c.type).toBe("all");
    expect(c.q).toBe("");
  });
});

describe("parseListCriteria — fallback dla śmieci", () => {
  it("niepoprawny sort/dir/type → wartości domyślne (nie rzuca)", () => {
    const c = parseListCriteria("active", params("sort=garbage&dir=sideways&type=archived"));
    expect(c.sort).toBe("updated");
    expect(c.dir).toBe("desc");
    expect(c.type).toBe("all");
  });
});

describe("parseListCriteria — poprawny odczyt pól", () => {
  it("czyta sort, dir, type, q", () => {
    const c = parseListCriteria("done", params("sort=title&dir=asc&type=task&q=hello"));
    expect(c).toMatchObject({ sort: "title", dir: "asc", type: "task", q: "hello" });
  });

  it("opstatus honorowany tylko dla active", () => {
    expect(parseListCriteria("active", params("opstatus=in_progress")).opstatus).toBe("in_progress");
    expect(parseListCriteria("done", params("opstatus=in_progress")).opstatus).toBeUndefined();
    expect(parseListCriteria("trash", params("opstatus=new")).opstatus).toBeUndefined();
  });

  it("opstatus spoza new/in_progress → undefined (nawet dla active)", () => {
    expect(parseListCriteria("active", params("opstatus=done")).opstatus).toBeUndefined();
    expect(parseListCriteria("active", params("opstatus=garbage")).opstatus).toBeUndefined();
  });

  it("q przycięte do 200 znaków (clamp)", () => {
    const long = "a".repeat(250);
    expect(parseListCriteria("active", params(`q=${long}`)).q).toHaveLength(200);
  });
});

describe("criteriaToQuery — pomija domyślne", () => {
  it("same domyślne → pusty query string", () => {
    expect(criteriaToQuery(defaultCriteria("pending"))).toBe("");
    expect(criteriaToQuery(defaultCriteria("active"))).toBe("");
    expect(criteriaToQuery(defaultCriteria("trash"))).toBe("");
  });

  it("emituje tylko pola różne od domyślnych, bez view", () => {
    const c: ListCriteria = { view: "active", type: "task", sort: "title", dir: "asc", q: "x", opstatus: "new" };
    const parsed = params(criteriaToQuery(c));
    expect(parsed.has("view")).toBe(false);
    expect(parsed.get("type")).toBe("task");
    expect(parsed.get("sort")).toBe("title");
    expect(parsed.get("dir")).toBe("asc");
    expect(parsed.get("q")).toBe("x");
    expect(parsed.get("opstatus")).toBe("new");
  });

  it("opstatus nie emitowane poza widokiem active", () => {
    const c: ListCriteria = { view: "done", type: "all", sort: "updated", dir: "desc", q: "", opstatus: "new" };
    expect(criteriaToQuery(c)).toBe("");
  });
});

describe("round-trip parse(query(c)) === c", () => {
  const cases: ListCriteria[] = [
    { view: "pending", type: "all", sort: "created", dir: "desc", q: "", opstatus: undefined },
    { view: "active", type: "task", sort: "title", dir: "asc", q: "foo bar", opstatus: "in_progress" },
    { view: "trash", type: "note", sort: "created", dir: "asc", q: "%weird,(input)", opstatus: undefined },
    { view: "done", type: "idea", sort: "updated", dir: "desc", q: "", opstatus: undefined },
  ];
  it.each(cases)("round-trips $view/$type/$sort", (c) => {
    expect(parseListCriteria(c.view, params(criteriaToQuery(c)))).toEqual(c);
  });
});

describe("hasActiveFilters", () => {
  it("domyślne kryteria (puste params) → false dla każdego widoku", () => {
    for (const view of ["pending", "active", "done", "cancelled", "trash"] as const) {
      expect(hasActiveFilters(defaultCriteria(view))).toBe(false);
    }
  });

  it("dowolne pole różne od domyślnego (typ/sort/dir/q/opstatus) → true", () => {
    expect(hasActiveFilters({ ...defaultCriteria("active"), type: "task" })).toBe(true);
    expect(hasActiveFilters({ ...defaultCriteria("active"), sort: "title" })).toBe(true);
    expect(hasActiveFilters({ ...defaultCriteria("active"), dir: "asc" })).toBe(true);
    expect(hasActiveFilters({ ...defaultCriteria("active"), q: "foo" })).toBe(true);
    expect(hasActiveFilters({ ...defaultCriteria("active"), opstatus: "new" })).toBe(true);
  });

  it("opstatus poza widokiem active nie liczy się jako filtr (nie jest emitowany)", () => {
    expect(hasActiveFilters({ ...defaultCriteria("done"), opstatus: "new" })).toBe(false);
    expect(hasActiveFilters({ ...defaultCriteria("trash"), opstatus: "in_progress" })).toBe(false);
  });
});

describe("parseItemPage — clamp do całkowitej ≥ 1 (S-13 F1)", () => {
  it("poprawna liczba → wartość (podłoga dla ułamka)", () => {
    expect(parseItemPage("1")).toBe(1);
    expect(parseItemPage("5")).toBe(5);
    expect(parseItemPage("2.7")).toBe(2);
  });

  it("brak / śmieć / zero / ujemna → 1 (nie rzuca)", () => {
    expect(parseItemPage(null)).toBe(1);
    expect(parseItemPage("")).toBe(1);
    expect(parseItemPage("abc")).toBe(1);
    expect(parseItemPage("0")).toBe(1);
    expect(parseItemPage("-3")).toBe(1);
    expect(parseItemPage("Infinity")).toBe(1);
  });
});

describe("parseItemSize — pula albo null = brak okna (S-13 F1)", () => {
  it("wartość z puli → liczba", () => {
    for (const size of ITEM_PAGE_SIZES) {
      expect(parseItemSize(String(size))).toBe(size);
    }
  });

  it("brak / śmieć / spoza puli → null (pełna lista, kompat przejściowy)", () => {
    expect(parseItemSize(null)).toBeNull();
    expect(parseItemSize("")).toBeNull();
    expect(parseItemSize("abc")).toBeNull();
    expect(parseItemSize("11")).toBeNull();
    expect(parseItemSize("0")).toBeNull();
    expect(parseItemSize("-10")).toBeNull();
  });

  it("domyślny rozmiar należy do puli", () => {
    expect(ITEM_PAGE_SIZES).toContain(ITEM_PAGE_SIZE);
  });
});
