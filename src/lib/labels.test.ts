import { describe, expect, it } from "vitest";

import { acceptanceStatusLabel, importSessionStatusLabel, itemTypeLabel, operationalStatusLabel } from "@/lib/labels";
import type { ImportSessionStatus } from "@/types";

describe("labels (enum → PL)", () => {
  it("itemTypeLabel mapuje wszystkie pięć typów", () => {
    expect(itemTypeLabel("task")).toBe("Zadanie");
    expect(itemTypeLabel("note")).toBe("Notatka");
    expect(itemTypeLabel("idea")).toBe("Pomysł");
    expect(itemTypeLabel("decision")).toBe("Decyzja");
    expect(itemTypeLabel("other")).toBe("Inne");
  });

  it("operationalStatusLabel mapuje wszystkie statusy operacyjne", () => {
    expect(operationalStatusLabel("new")).toBe("Nowe");
    expect(operationalStatusLabel("in_progress")).toBe("W toku");
    expect(operationalStatusLabel("done")).toBe("Zrobione");
    expect(operationalStatusLabel("cancelled")).toBe("Anulowane");
  });

  it("acceptanceStatusLabel mapuje wszystkie statusy akceptacji", () => {
    expect(acceptanceStatusLabel("pending")).toBe("Do akceptacji");
    expect(acceptanceStatusLabel("accepted")).toBe("Zaakceptowane");
    expect(acceptanceStatusLabel("rejected")).toBe("Odrzucone");
    expect(acceptanceStatusLabel("deleted")).toBe("Usunięte");
  });

  it("importSessionStatusLabel mapuje wszystkie statusy sesji importu (S-08)", () => {
    expect(importSessionStatusLabel("processing")).toBe("Przetwarzanie…");
    expect(importSessionStatusLabel("completed_with_items")).toBe("Gotowe");
    expect(importSessionStatusLabel("completed_no_items")).toBe("Brak wpisów");
    expect(importSessionStatusLabel("failed")).toBe("Błąd");
    // kompletność enuma
    const all: ImportSessionStatus[] = ["processing", "completed_with_items", "completed_no_items", "failed"];
    for (const status of all) expect(importSessionStatusLabel(status)).toBeTruthy();
  });
});
