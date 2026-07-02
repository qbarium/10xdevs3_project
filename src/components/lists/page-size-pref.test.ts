import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isValidPageSize,
  ITEMS_LIST_PAGE_SIZE_KEY,
  parsePageSizePref,
  readPageSizePref,
  SESSION_LOG_PAGE_SIZE_KEY,
  withPageSizePref,
  writePageSizePref,
} from "@/components/lists/page-size-pref";

const SIZES = [10, 15, 25, 50, 100] as const;

/**
 * Minimalny `document.cookie` z semantyką przeglądarki: przypisanie DOKŁADA/nadpisuje jedno cookie
 * (nie zastępuje całości), odczyt zwraca pary złączone "; " (środowisko node nie ma document).
 */
function cookieJar() {
  const jar = new Map<string, string>();
  return {
    get cookie() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    set cookie(value: string) {
      const [pair] = value.split(";");
      const eq = pair.indexOf("=");
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    },
  };
}

/** Minimalny in-memory localStorage — ścieżka legacy (migracja starych zapisów do cookie). */
function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? (store.get(k) ?? null) : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
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

describe("parsePageSizePref — czysty parser surowej wartości (cookie/SSR)", () => {
  it.each(["10", "50"])("wartość z puli (%s) → liczba", (raw) => {
    expect(parsePageSizePref(raw, SIZES)).toBe(Number(raw));
  });

  it("brak / śmieć / spoza puli → null", () => {
    expect(parsePageSizePref(undefined, SIZES)).toBeNull();
    expect(parsePageSizePref(null, SIZES)).toBeNull();
    expect(parsePageSizePref("abc", SIZES)).toBeNull();
    expect(parsePageSizePref("7", SIZES)).toBeNull();
  });
});

describe("withPageSizePref — nakładka preferencji na kryteria (SSR)", () => {
  const criteria = { page: 3, size: 10 };

  it("adres bez size + poprawne cookie → rozmiar z preferencji (reszta kryteriów nietknięta)", () => {
    expect(withPageSizePref(criteria, new URLSearchParams(""), "25", SIZES)).toEqual({ page: 3, size: 25 });
  });

  it("adres z size → URL ma pierwszeństwo (cookie ignorowane)", () => {
    expect(withPageSizePref(criteria, new URLSearchParams("size=50"), "25", SIZES)).toEqual(criteria);
  });

  it("brak / śmieciowe cookie → kryteria bez zmian", () => {
    expect(withPageSizePref(criteria, new URLSearchParams(""), undefined, SIZES)).toEqual(criteria);
    expect(withPageSizePref(criteria, new URLSearchParams(""), "abc", SIZES)).toEqual(criteria);
    expect(withPageSizePref(criteria, new URLSearchParams(""), "7", SIZES)).toEqual(criteria);
  });
});

describe("read/writePageSizePref — trwałość w cookie per klucz", () => {
  it("zapis i odczyt wartości z puli (cookie z max-age i path)", () => {
    const doc = cookieJar();
    vi.stubGlobal("document", doc);
    writePageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES, 50);
    expect(readPageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES)).toBe(50);
  });

  it("klucze są niezależne — zapis dziennika nie przecieka do listy wpisów", () => {
    vi.stubGlobal("document", cookieJar());
    writePageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES, 50);
    expect(readPageSizePref(ITEMS_LIST_PAGE_SIZE_KEY, SIZES)).toBeNull();
    writePageSizePref(ITEMS_LIST_PAGE_SIZE_KEY, SIZES, 25);
    expect(readPageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES)).toBe(50);
    expect(readPageSizePref(ITEMS_LIST_PAGE_SIZE_KEY, SIZES)).toBe(25);
  });

  it("klucz dziennika zachowuje wartość sprzed refaktoru (kompatybilność preferencji)", () => {
    expect(SESSION_LOG_PAGE_SIZE_KEY).toBe("tasker.sessionLog.pageSize");
  });

  it("stary zapis localStorage (legacy) → odczytany i zmigrowany do cookie", () => {
    const doc = cookieJar();
    const storage = memoryStorage();
    storage.setItem(SESSION_LOG_PAGE_SIZE_KEY, "25");
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", { localStorage: storage });
    expect(readPageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES)).toBe(25);
    expect(doc.cookie).toContain(`${SESSION_LOG_PAGE_SIZE_KEY}=25`);
  });

  it("brak zapisanej wartości (cookie i legacy) → null", () => {
    vi.stubGlobal("document", cookieJar());
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    expect(readPageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES)).toBeNull();
  });

  it("nie zapisuje wartości spoza puli (odczyt → null)", () => {
    vi.stubGlobal("document", cookieJar());
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    writePageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES, 7);
    expect(readPageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES)).toBeNull();
  });

  it("śmieciowa wartość w cookie → null przy odczycie", () => {
    const doc = cookieJar();
    doc.cookie = `${SESSION_LOG_PAGE_SIZE_KEY}=abc`;
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    expect(readPageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES)).toBeNull();
  });

  it("brak document/window (SSR) → null, bez rzutu", () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("window", undefined);
    expect(readPageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES)).toBeNull();
    expect(() => {
      writePageSizePref(SESSION_LOG_PAGE_SIZE_KEY, SIZES, 50);
    }).not.toThrow();
  });
});
