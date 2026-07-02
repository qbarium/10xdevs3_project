import { describe, expect, it } from "vitest";

import {
  defaultSessionCriteria,
  hasActiveSessionFilters,
  parseSessionListCriteria,
  sessionCriteriaToQuery,
} from "@/lib/services/session-list-criteria";
import type { SessionListCriteria } from "@/lib/services/session-list-criteria";

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe("parseSessionListCriteria — domyślne", () => {
  it("puste params → status:all, sort:created_desc, page:1, size:10", () => {
    expect(parseSessionListCriteria(params(""))).toEqual({ status: "all", sort: "created_desc", page: 1, size: 10 });
  });
});

describe("parseSessionListCriteria — fallback dla śmieci", () => {
  it("niepoprawny status/sort → domyślne (nie rzuca)", () => {
    const c = parseSessionListCriteria(params("status=bogus&sort=sideways"));
    expect(c.status).toBe("all");
    expect(c.sort).toBe("created_desc");
  });

  it("status=all (niebędący wartością enuma) → all", () => {
    expect(parseSessionListCriteria(params("status=all")).status).toBe("all");
  });
});

describe("parseSessionListCriteria — poprawny odczyt pól", () => {
  it.each(["processing", "completed_with_items", "completed_no_items", "failed"] as const)(
    "czyta status %s",
    (status) => {
      expect(parseSessionListCriteria(params(`status=${status}`)).status).toBe(status);
    },
  );

  it("czyta sort created_asc", () => {
    expect(parseSessionListCriteria(params("sort=created_asc")).sort).toBe("created_asc");
  });

  it("czyta page jako liczbę całkowitą", () => {
    expect(parseSessionListCriteria(params("page=4")).page).toBe(4);
  });
});

describe("parseSessionListCriteria — clamp page", () => {
  it.each([
    ["page=0", 1],
    ["page=-3", 1],
    ["page=abc", 1],
    ["", 1],
    ["page=2.9", 2],
    ["page=10", 10],
  ])("%s → %i", (query, expected) => {
    expect(parseSessionListCriteria(params(query)).page).toBe(expected);
  });
});

describe("sessionCriteriaToQuery — pomija domyślne", () => {
  it("same domyślne → pusty query string", () => {
    expect(sessionCriteriaToQuery(defaultSessionCriteria())).toBe("");
  });

  it("emituje tylko pola różne od domyślnych", () => {
    const parsed = params(sessionCriteriaToQuery({ status: "failed", sort: "created_asc", page: 3, size: 50 }));
    expect(parsed.get("status")).toBe("failed");
    expect(parsed.get("sort")).toBe("created_asc");
    expect(parsed.get("page")).toBe("3");
    expect(parsed.get("size")).toBe("50");
  });

  it("page 1 i size domyślny nie są emitowane", () => {
    expect(sessionCriteriaToQuery({ status: "failed", sort: "created_desc", page: 1, size: 10 })).toBe("status=failed");
  });
});

describe("round-trip parse(query(c)) === c", () => {
  const cases: SessionListCriteria[] = [
    { status: "all", sort: "created_desc", page: 1, size: 10 },
    { status: "failed", sort: "created_asc", page: 5, size: 25 },
    { status: "completed_with_items", sort: "created_desc", page: 2, size: 100 },
    { status: "processing", sort: "created_asc", page: 1, size: 10 },
  ];
  it.each(cases)("round-trips $status/$sort/$page/$size", (c) => {
    expect(parseSessionListCriteria(params(sessionCriteriaToQuery(c)))).toEqual(c);
  });
});

describe("parseSessionListCriteria — size (pula wartości)", () => {
  it.each([5, 10, 15, 25, 50, 100])("czyta dozwolony rozmiar %i", (size) => {
    expect(parseSessionListCriteria(params(`size=${size}`)).size).toBe(size);
  });

  it.each(["size=7", "size=999", "size=abc", ""])("spoza puli / śmieć / brak (%s) → domyślny 10", (query) => {
    expect(parseSessionListCriteria(params(query)).size).toBe(10);
  });
});

describe("hasActiveSessionFilters", () => {
  it("domyślne kryteria → false", () => {
    expect(hasActiveSessionFilters(defaultSessionCriteria())).toBe(false);
  });

  it("status ≠ all lub sort ≠ created_desc → true", () => {
    expect(hasActiveSessionFilters({ ...defaultSessionCriteria(), status: "failed" })).toBe(true);
    expect(hasActiveSessionFilters({ ...defaultSessionCriteria(), sort: "created_asc" })).toBe(true);
  });

  it("sama strona > 1 NIE liczy się jako filtr (paginacja to nie zawężenie)", () => {
    expect(hasActiveSessionFilters({ ...defaultSessionCriteria(), page: 3 })).toBe(false);
  });
});
