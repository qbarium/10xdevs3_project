import { describe, expect, it } from "vitest";

import { allowedActions, isActionAllowed } from "@/components/items/item-card";
import type { ItemAction } from "@/components/items/item-card";

const ALL_ACTIONS: readonly ItemAction[] = ["edit", "accept", "reject", "trash", "restore", "preview", "delete"];

describe("allowedActions — mapowanie stan → dozwolone akcje (S-13 F3)", () => {
  it("pending → edycja / akceptuj / odrzuć", () => {
    expect([...allowedActions("pending")].sort()).toEqual(["accept", "edit", "reject"]);
  });

  it("accepted → edycja / do kosza", () => {
    expect([...allowedActions("accepted")].sort()).toEqual(["edit", "trash"]);
  });

  it.each(["rejected", "deleted"] as const)(
    "%s → podgląd / przywróć / usuń trwale (read-only + kosz dwukierunkowo + hard delete F10)",
    (status) => {
      expect([...allowedActions(status)].sort()).toEqual(["delete", "preview", "restore"]);
    },
  );
});

describe("isActionAllowed — warunek renderu akcji", () => {
  it("zgodny z allowedActions dla każdej pary stan × akcja", () => {
    for (const status of ["pending", "accepted", "rejected", "deleted"] as const) {
      for (const action of ALL_ACTIONS) {
        expect(isActionAllowed(status, action)).toBe(allowedActions(status).includes(action));
      }
    }
  });

  it("kluczowe zakazy: edycja poza pending/accepted, akceptacja poza pending, kosz poza accepted", () => {
    expect(isActionAllowed("rejected", "edit")).toBe(false);
    expect(isActionAllowed("deleted", "edit")).toBe(false);
    expect(isActionAllowed("accepted", "accept")).toBe(false);
    expect(isActionAllowed("pending", "trash")).toBe(false);
    expect(isActionAllowed("pending", "preview")).toBe(false);
    expect(isActionAllowed("accepted", "restore")).toBe(false);
  });

  it("trwałe usunięcie (F10) dozwolone WYŁĄCZNIE w koszu (rejected/deleted), zakazane dla pending/accepted", () => {
    expect(isActionAllowed("rejected", "delete")).toBe(true);
    expect(isActionAllowed("deleted", "delete")).toBe(true);
    expect(isActionAllowed("pending", "delete")).toBe(false);
    expect(isActionAllowed("accepted", "delete")).toBe(false);
  });
});
