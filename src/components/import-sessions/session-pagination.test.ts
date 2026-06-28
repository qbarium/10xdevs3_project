import { describe, expect, it } from "vitest";

import { pageNav, resetToFirstPage } from "@/components/import-sessions/session-pagination";
import { defaultSessionCriteria } from "@/lib/services/session-list-criteria";

describe("pageNav — stany krańcowe", () => {
  it("pierwsza strona → prev wyłączony, next włączony", () => {
    expect(pageNav(1, 3)).toEqual({ canPrev: false, canNext: true, prevPage: 1, nextPage: 2 });
  });

  it("ostatnia strona → next wyłączony, prev włączony", () => {
    expect(pageNav(3, 3)).toEqual({ canPrev: true, canNext: false, prevPage: 2, nextPage: 3 });
  });

  it("środkowa strona → oba włączone, cele ±1", () => {
    expect(pageNav(2, 5)).toEqual({ canPrev: true, canNext: true, prevPage: 1, nextPage: 3 });
  });

  it("jedna strona → oba wyłączone (cele sklampowane do 1)", () => {
    expect(pageNav(1, 1)).toEqual({ canPrev: false, canNext: false, prevPage: 1, nextPage: 1 });
  });
});

describe("resetToFirstPage — reset strony przy zmianie filtra/sortu", () => {
  it("ustawia page 1, zachowując status i sort", () => {
    expect(resetToFirstPage({ status: "failed", sort: "created_asc", page: 4 })).toEqual({
      status: "failed",
      sort: "created_asc",
      page: 1,
    });
  });

  it("domyślne kryteria na stronie N → wracają na 1", () => {
    expect(resetToFirstPage({ ...defaultSessionCriteria(), page: 7 }).page).toBe(1);
  });
});
