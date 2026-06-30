import { afterEach, describe, expect, it, vi } from "vitest";

import { isValidPageSize, readPageSizePref, writePageSizePref } from "@/components/import-sessions/page-size-pref";

/** Minimalny in-memory localStorage (środowisko node nie ma window). */
function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? (store.get(k) ?? null) : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("isValidPageSize — pula wartości", () => {
  it.each([10, 15, 25, 50, 100])("akceptuje %i z puli", (n) => {
    expect(isValidPageSize(n)).toBe(true);
  });

  it.each([7, 0, 999, -10, 11])("odrzuca %i spoza puli", (n) => {
    expect(isValidPageSize(n)).toBe(false);
  });
});

describe("read/writePageSizePref — trwałość", () => {
  it("zapis i odczyt wartości z puli", () => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    writePageSizePref(50);
    expect(readPageSizePref()).toBe(50);
  });

  it("brak zapisanej wartości → null", () => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    expect(readPageSizePref()).toBeNull();
  });

  it("nie zapisuje wartości spoza puli (odczyt → null)", () => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    writePageSizePref(7);
    expect(readPageSizePref()).toBeNull();
  });

  it("zapisana śmieciowa wartość → null przy odczycie", () => {
    const storage = memoryStorage();
    storage.setItem("tasker.sessionLog.pageSize", "abc");
    vi.stubGlobal("window", { localStorage: storage });
    expect(readPageSizePref()).toBeNull();
  });

  it("brak window (SSR) → null, bez rzutu", () => {
    vi.stubGlobal("window", undefined);
    expect(readPageSizePref()).toBeNull();
    expect(() => {
      writePageSizePref(50);
    }).not.toThrow();
  });
});
