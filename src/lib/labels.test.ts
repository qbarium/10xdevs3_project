import { describe, expect, it } from "vitest";

import { acceptanceStatusLabel, itemTypeLabel, operationalStatusLabel } from "@/lib/labels";

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
});
