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
    expect(operationalStatusLabel("done")).toBe("Zakończone");
    expect(operationalStatusLabel("cancelled")).toBe("Anulowane");
  });

  it("operationalStatusLabel z typem zwraca nadpisanie per-typ dla done (S-04), ujednolicone do Zakończone (ticket 164608bf)", () => {
    expect(operationalStatusLabel("done", "note")).toBe("Zakończone");
    expect(operationalStatusLabel("done", "idea")).toBe("Zakończone");
    expect(operationalStatusLabel("done", "decision")).toBe("Zakończone");
    expect(operationalStatusLabel("done", "other")).toBe("Zakończone");
    // `task` nie ma nadpisania → generyczna etykieta
    expect(operationalStatusLabel("done", "task")).toBe("Zakończone");
  });

  it("operationalStatusLabel z typem używa fallbacku dla stanów bez nadpisania", () => {
    // Nadpisania dotyczą tylko `done`; pozostałe stany → generyczna etykieta niezależnie od typu.
    expect(operationalStatusLabel("new", "note")).toBe("Nowe");
    expect(operationalStatusLabel("in_progress", "decision")).toBe("W toku");
    expect(operationalStatusLabel("cancelled", "other")).toBe("Anulowane");
    // Bez typu — zachowanie wsteczne.
    expect(operationalStatusLabel("done")).toBe("Zakończone");
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
