import { describe, expect, it } from "vitest";

import { activeNavId, isNavActive } from "./nav-active";

describe("activeNavId — aktywny stan powłoki wg adresu", () => {
  it("Do akceptacji (/items) jest DOKŁADNE — nie łapie podtras", () => {
    expect(activeNavId("/items")).toBe("pending");
  });

  it("grupa Wpisy łapie wszystkie zakresy /items/* (prefiks), a nie samego /items", () => {
    expect(activeNavId("/items/active")).toBe("entries");
    expect(activeNavId("/items/done")).toBe("entries");
    expect(activeNavId("/items/cancelled")).toBe("entries");
    expect(activeNavId("/items/trash")).toBe("entries");
  });

  it("Skrzynka / Sesje / Ustawienia mapują na swoje id", () => {
    expect(activeNavId("/ingest")).toBe("ingest");
    expect(activeNavId("/import-sessions")).toBe("sessions");
    expect(activeNavId("/profile")).toBe("settings");
  });

  it("adresy poza powłoką → null", () => {
    expect(activeNavId("/")).toBeNull();
    expect(activeNavId("/auth/signin")).toBeNull();
  });

  it("isNavActive rozróżnia exact vs prefix", () => {
    expect(isNavActive("/items", { type: "exact", path: "/items" })).toBe(true);
    expect(isNavActive("/items/active", { type: "exact", path: "/items" })).toBe(false);
    expect(isNavActive("/items/active", { type: "prefix", path: "/items/" })).toBe(true);
    expect(isNavActive("/items", { type: "prefix", path: "/items/" })).toBe(false);
  });
});
