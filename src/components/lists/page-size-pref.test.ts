import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isValidPageSize,
  ITEMS_LIST_PAGE_SIZE_KEY,
  readPageSizePref,
  SESSION_LOG_PAGE_SIZE_KEY,
  writePageSizePref,
} from "@/components/lists/page-size-pref";

const SIZES = [10, 15, 25, 50, 100] as const;

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

describe("isValidPageSize — pula wartości (parametryzowana)", () => {
  it.each([10, 15, 25, 50, 100])("akceptuje %i z puli", (n) => {
    expect(isValidPageSize(n, SIZES)).toBe(true);
  });

  it.each([7, 0, 999, -10, 11])("odrzuca %i spoza puli", (n) => {
    expect(isValidPageSize(n, SIZES)).toBe(false);
  });

  it("inna pula → inna walidacja (pula jest parametrem, nie stałą)", () => {
    expect(isValidPageSize(7, [7, 14])).toBe(true);
    expect(isValidPageSize(10, [7, 14])).toBe(false);
  });
});

describe("read/writePageSizePref — trwałość per klucz", () => {
  it("zapis i odczyt wartości z puli", () => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    writePageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES, 50);
    expect(readPageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES)).toBe(50);
  });

  it("klucze są niezależne — zapis dziennika nie przecieka do listy wpisów", () => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    writePageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES, 50);
    expect(readPageSizePref(ITEMS_LIST_PAGE_SIZE_KEY, SIZES)).toBeNull();
    writePageSizePref(ITEMS_LIST_PAGE_SIZE_KEY, SIZES, 25);
    expect(readPageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES)).toBe(50);
    expect(readPageSizePref(ITEMS_LIST_PAGE_SIZE_KEY, SIZES)).toBe(25);
  });

  it("klucz dziennika zachowuje wartość sprzed refaktoru (kompatybilność preferencji)", () => {
    expect(SESSION_LOG_PAGE_SIZE_KEY).toBe("tasker.sessionLog.pageSize");
  });

  it("brak zapisanej wartości → null", () => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    expect(readPageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES)).toBeNull();
  });

  it("nie zapisuje wartości spoza puli (odczyt → null)", () => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    writePageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES, 7);
    expect(readPageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES)).toBeNull();
  });

  it("zapisana śmieciowa wartość → null przy odczycie", () => {
    const storage = memoryStorage();
    storage.setItem(SESSION_LOG_PAGE_SIZE_KEY, "abc");
    vi.stubGlobal("window", { localStorage: storage });
    expect(readPageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES)).toBeNull();
  });

  it("brak window (SSR) → null, bez rzutu", () => {
    vi.stubGlobal("window", undefined);
    expect(readPageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES)).toBeNull();
    expect(() => {
      writePageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES, 50);
    }).not.toThrow();
  });
});
