import { describe, expect, it } from "vitest";

import { clampPage, pageNav, resetToFirstPage } from "@/components/import-sessions/session-pagination";
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

describe("clampPage — zatwierdzenie wpisanej strony", () => {
  it("wartość w zakresie → bez zmiany", () => {
    expect(clampPage(2, 5, 1)).toBe(2);
  });

  it("powyżej zakresu → ostatnia strona", () => {
    expect(clampPage(99, 5, 1)).toBe(5);
  });

  it("poniżej 1 → pierwsza strona", () => {
    expect(clampPage(0, 5, 3)).toBe(1);
    expect(clampPage(-4, 5, 3)).toBe(1);
  });

  it("NaN (śmieć nienumeryczny) → bieżąca strona (nie skacze)", () => {
    expect(clampPage(Number("abc"), 5, 3)).toBe(3);
    expect(clampPage(NaN, 5, 3)).toBe(3);
  });

  it("ułamek → ucięty w dół", () => {
    expect(clampPage(2.9, 5, 1)).toBe(2);
  });

  it("pageCount 0 → klamp do 1 (brak ujemnej górnej granicy)", () => {
    expect(clampPage(5, 0, 1)).toBe(1);
  });
});

describe("resetToFirstPage — reset strony przy zmianie filtra/sortu", () => {
  it("ustawia page 1, zachowując status, sort i rozmiar strony", () => {
    expect(resetToFirstPage({ status: "failed", sort: "created_asc", page: 4, size: 25 })).toEqual({
      status: "failed",
      sort: "created_asc",
      page: 1,
      size: 25,
    });
  });

  it("domyślne kryteria na stronie N → wracają na 1", () => {
    expect(resetToFirstPage({ ...defaultSessionCriteria(), page: 7 }).page).toBe(1);
  });
});
