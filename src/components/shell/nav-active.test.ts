import { describe, expect, it } from "vitest";

import { activeNavId, isNavActive } from "@/components/shell/nav-active";

describe("activeNavId — aktywny stan powłoki wg adresu", () => {
  it("Do akceptacji (/items) jest DOKŁADNE — nie łapie podtras", () => {
    expect(activeNavId("/items")).toBe("pending");
  });

  it("grupa Wpisy łapie zakresy cyklu życia /items/* (prefiks), a nie samego /items", () => {
    expect(activeNavId("/items/active")).toBe("entries");
    expect(activeNavId("/items/done")).toBe("entries");
    expect(activeNavId("/items/cancelled")).toBe("entries");
  });

  it("Kosz (/items/trash) jest DOKŁADNE — wyjęty z grupy Wpisy, świeci jako „trash”", () => {
    expect(activeNavId("/items/trash")).toBe("trash");
  });

  it("Skrzynka / Sesje / Ustawienia mapują na swoje id", () => {
    expect(activeNavId("/ingest")).toBe("ingest");
    expect(activeNavId("/import-sessions")).toBe("sessions");
    expect(activeNavId("/profile")).toBe("settings");
  });

  it("trailing slash normalizowany: /items/ = pending, /ingest/ = ingest", () => {
    expect(activeNavId("/items/")).toBe("pending");
    expect(activeNavId("/ingest/")).toBe("ingest");
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
