import { describe, expect, it } from "vitest";

import { OPERATIONAL_TRANSITIONS } from "@/lib/items/operational-transitions";
import type { OperationalStatus } from "@/types";

const ALL: OperationalStatus[] = ["new", "in_progress", "done", "cancelled"];

describe("OPERATIONAL_TRANSITIONS", () => {
  it("kuruje oczekiwany zestaw przejść per stan (kolejność = UX)", () => {
    expect(OPERATIONAL_TRANSITIONS.new.map((t) => t.target)).toEqual(["in_progress", "done", "cancelled"]);
    expect(OPERATIONAL_TRANSITIONS.in_progress.map((t) => t.target)).toEqual(["done", "new", "cancelled"]);
    expect(OPERATIONAL_TRANSITIONS.done.map((t) => t.target)).toEqual(["new"]);
    expect(OPERATIONAL_TRANSITIONS.cancelled.map((t) => t.target)).toEqual(["new"]);
  });

  it("każde przejście ma niepustą etykietę i nie celuje w stan źródłowy", () => {
    for (const status of ALL) {
      for (const t of OPERATIONAL_TRANSITIONS[status]) {
        expect(t.label.length).toBeGreaterThan(0);
        expect(t.target).not.toBe(status);
      }
    }
  });

  it("graf jest silnie spójny — z każdego stanu osiągalny każdy inny (hub „nowe”)", () => {
    for (const start of ALL) {
      const reachable = new Set<OperationalStatus>();
      const queue: OperationalStatus[] = [start];
      while (queue.length > 0) {
        const cur = queue.shift();
        if (!cur) break;
        for (const t of OPERATIONAL_TRANSITIONS[cur]) {
          if (!reachable.has(t.target)) {
            reachable.add(t.target);
            queue.push(t.target);
          }
        }
      }
      for (const target of ALL) {
        if (target !== start) expect(reachable.has(target)).toBe(true);
      }
    }
  });
});
