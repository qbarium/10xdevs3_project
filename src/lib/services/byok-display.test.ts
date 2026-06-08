import { describe, expect, it } from "vitest";

import { maskKeyForDisplay } from "@/lib/services/byok-display";

describe("maskKeyForDisplay — podgląd zachowujący identyfikację (FR-021)", () => {
  it("typowy klucz: prefiks (3) + … + sufiks (4)", () => {
    expect(maskKeyForDisplay("sk-proj-ABCDEFGHIJKLMNOP-AB12")).toBe("sk-…AB12");
  });

  it("klucz dokładnie 9 znaków → już prefiks+sufiks (granica > 8)", () => {
    expect(maskKeyForDisplay("abcde1234")).toBe("abc…1234");
  });

  it("klucz <= 8 znaków → same kropki o długości wejścia", () => {
    expect(maskKeyForDisplay("sk-12345")).toBe("••••••••"); // dokładnie 8 znaków
    expect(maskKeyForDisplay("short")).toBe("•••••"); // 5 znaków
  });

  it("pusty string → pusty (0 kropek)", () => {
    expect(maskKeyForDisplay("")).toBe("");
  });

  it("przycina białe znaki przed maskowaniem", () => {
    expect(maskKeyForDisplay("  sk-proj-ABCDEFGHIJKL-AB12  ")).toBe("sk-…AB12");
  });

  it("nie ujawnia środka klucza", () => {
    const masked = maskKeyForDisplay("sk-SECRETMIDDLEPART9999");
    expect(masked).not.toContain("SECRETMIDDLE");
    expect(masked).toBe("sk-…9999");
  });
});
