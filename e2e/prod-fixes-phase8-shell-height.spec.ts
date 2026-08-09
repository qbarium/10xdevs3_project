import { expect, test, type Locator, type Page } from "@playwright/test";

// Faza 8 (prod-feedback-fixes, ticket 0a23baea): na tablecie strona (np. `/profile`) przewijała się „za
// ekran” — opcje profilu/ustawień lądowały pod dolną krawędzią, szczególnie po zmianie orientacji.
//
// RECON (plan §Analiza stanu obecnego, §Krytyczne szczegóły): dwie przyczyny w `Layout.astro`, jedynym
// `<head>`/viewport aplikacji (dotyka KAŻDEJ strony):
//   (a) `:31` meta viewport bez `initial-scale=1` — po obrocie ekranu tablet/mobile bywa przelicza skalę
//       od nowa zamiast trzymać 1:1, co przesuwa/skaluje treść.
//   (b) `:36` wrapper `fullHeight` używał `h-screen` (100vh) — jednostka STATYCZNA, liczona raz przy
//       pierwszym layoucie i NIE reagująca na zmianę wysokości paska adresu przeglądarki mobilnej (chowa
//       się/pokazuje przy scrollu i po rotacji) — realna wysokość dostępnego okna zmienia się, 100vh nie
//       nadąża, zostaje martwa przestrzeń albo treść ucięta pod krawędzią.
//
// FIX: (a) `content="width=device-width, initial-scale=1"`; (b) `h-screen` → `h-[100dvh]` (dynamiczna
// jednostka viewportu — przelicza się na bieżąco, uwzględnia pasek adresu). Łańcuch scrolla POD
// wrapperem (`AppLayout.astro:70,78,91` — `min-h-0`/`overflow-hidden`/`overflow-y-auto`) jest NIETKNIĘTY.
//
// UCZCIWOŚĆ METODY (wzorzec: nagłówki `prod-fixes-phase7-scrollbar.spec.ts`) — co JEST i co NIE JEST
// red→green mierzalne w headless Chromium:
//   1. `initial-scale=1` w atrybucie `content` metatagu — CZYSTO tekstowe, w 100% red→green: PRZED fixem
//      `content="width=device-width"` (brak), PO fixem zawiera `initial-scale=1`. Zmierzone poniżej.
//   2. Klasa wrappera (`h-screen`→zawiera „dvh”) — również red→green tekstowe/strukturalne, niezależne od
//      renderowania.
//   3. Wysokość wrappera = `window.innerHeight` — TA liczba jest identyczna PRZED i PO fixie w headless:
//      bez realnego „chrome” przeglądarki (paska adresu) `100vh === 100dvh` w Playwright/Chromium headless
//      (potwierdzone też w nagłówku Fazy 7 dla pokrewnej własności `scrollbar-width`/box model). NIE jest
//      to więc red→green — jest to WYŁĄCZNIE dowód braku regresji wysokości po zmianie jednostki. Realna
//      korzyść `dvh` (przeliczenie po schowaniu/pokazaniu paska adresu na fizycznym urządzeniu) jest tu
//      strukturalnie NIEOBSERWOWALNA — wymaga ręcznej weryfikacji na fizycznym tablecie (patrz sekcja niżej).
//   4. Objaw „opcje pod krawędzią” pod emulacją tabletu (820×1180 portret / 1180×820 „pejzaż” — Playwright
//      nie ma realnej rotacji z przeliczeniem paska adresu, tylko zamianę wymiarów viewportu) — z tego
//      samego powodu co (3) NIE odtwarza się w headless: nawet na starym `h-screen` kontener sidebar/main
//      poprawnie skaluje się do `innerHeight`, bo headless nie ma paska adresu, który by tę wysokość
//      zmieniał. Test niżej weryfikuje więc REACHABILITY strukturalnie (bounding box w oknie po scrollu) —
//      przechodzi PRZED i PO fixie w headless; to jest udokumentowane ograniczenie metody, nie ukryty fakt.
//
// CO WYMAGA RĘCZNEJ WERYFIKACJI NA REALNYM TABLECIE (headless nie jest w stanie tego zmierzyć — patrz
// punkty 3–4 wyżej): (a) czy `100dvh` faktycznie przelicza się po schowaniu paska adresu podczas scrolla
// i po obrocie ekranu na Android Chrome / iPadOS Safari; (b) czy po fixie znika „martwa przestrzeń”/ucięcie
// treści pod krawędzią, które zgłosił tester; (c) czy `initial-scale=1` faktycznie stabilizuje skalę po
// rotacji na tych przeglądarkach (headless Chromium nie symuluje przeliczenia skali przez silnik viewportu
// mobilnego przy rotacji).
test.describe("Faza 8: wysokość i skala powłoki na tablecie (ticket 0a23baea)", () => {
  const SHELL_PAGES = [
    { path: "/items/active", heading: "Wpisy" },
    { path: "/ingest", heading: "Skrzynka wejściowa" },
    { path: "/profile", heading: "Profil" },
    { path: "/items/trash", heading: "Kosz" },
  ] as const;

  const TABLET_PORTRAIT = { width: 820, height: 1180 };
  const TABLET_LANDSCAPE = { width: 1180, height: 820 }; // stand-in za „po obrocie ekranu”

  /** Wrapper `fullHeight` z `Layout.astro` — jedyny bezpośredni <div> dziecko <body> w szablonie. Toolbar
      deweloperski Astro to osobny custom element `<astro-dev-toolbar>` (nie <div>), więc selektor
      pozostaje jednoznaczny również w trybie dev. */
  function shellLocator(page: Page): Locator {
    return page.locator("body > div").first();
  }

  /** Kontener przewijania treści strony: dla `fill=false` (Profil/Skrzynka) to samo `<main>`
      (`overflow-y-auto` wprost na nim); dla `fill=true` (Wpisy/Kosz) to wewnętrzny kontener widoku listy
      (`min-h-0 flex-1 overflow-y-auto`, ta sama klasa co w Fazie 7). Jeden selektor łapie oba warianty. */
  function scrollRegionLocator(page: Page): Locator {
    return page.locator("main.overflow-y-auto, main .overflow-y-auto").first();
  }

  /** Powłoka (`Layout.astro` wrapper) jest `overflow-hidden` — całe body NIE powinno przewijać się samo,
      wyłącznie kontener treści w środku (wzorzec F1/S-15, `config-banner-shell-layout.spec.ts`). Mierzymy
      `document.body.scrollHeight`, ŚWIADOMIE NIE `document.scrollingElement`/`documentElement`: Astro w
      trybie dev wstrzykuje `<astro-dev-toolbar>`, które zawyża wysokość `documentElement` (potwierdzone w
      `config-banner-shell-layout.spec.ts`, nie istnieje w buildzie produkcyjnym) — `scrollingElement` w
      trybie standards JEST `documentElement`, więc odziedziczyłby ten sam fałszywy alarm. `document.body`
      nie cierpi na ten artefakt, stąd odejście od dosłownego brzmienia zlecenia na sprawdzoną w tym repo
      alternatywę. */
  async function assertNoOuterScroll(page: Page) {
    const { bodyScrollHeight, viewportHeight } = await page.evaluate(() => ({
      bodyScrollHeight: document.body.scrollHeight,
      viewportHeight: window.innerHeight,
    }));
    expect(
      bodyScrollHeight,
      "document.body.scrollHeight nie powinien przekraczać wysokości viewportu (powłoka jest overflow-hidden)",
    ).toBeLessThanOrEqual(viewportHeight + 2);
  }

  /** Brak dodatkowego przewijania w poziomie całej strony (wzorzec `prod-fixes-phase7-scrollbar.spec.ts`,
      test „desktop (brak regresji)”). */
  async function assertNoHorizontalOverflow(page: Page) {
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(hasHorizontalOverflow, "strona nie powinna mieć poziomego przewijania").toBe(false);
  }

  /** Element faktycznie OSIĄGALNY: po przewinięciu do niego jego bounding box mieści się w oknie — nie
      zostaje „pod krawędzią” bez sposobu, by go zobaczyć/kliknąć. */
  async function assertReachable(locator: Locator, page: Page, description: string) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    expect(box, `${description}: powinien być wyrenderowany (bounding box)`).not.toBeNull();
    const viewport = page.viewportSize();
    expect(viewport, "viewportSize powinien być ustawiony przez konfigurację testu").not.toBeNull();
    if (box && viewport) {
      expect(box.y, `${description}: górna krawędź nie powinna wypadać nad oknem`).toBeGreaterThanOrEqual(-1);
      expect(
        box.y + box.height,
        `${description}: dolna krawędź powinna mieścić się w oknie (osiągalny po przewinięciu)`,
      ).toBeLessThanOrEqual(viewport.height + 1);
    }
  }

  test("meta viewport zawiera initial-scale=1 (red→green mierzalne)", async ({ page }) => {
    await page.goto("/profile");
    const content = await page.locator('head meta[name="viewport"]').getAttribute("content");
    // RED przed fixem: content = "width=device-width" (brak initial-scale). GREEN po fixie: zawiera
    // "initial-scale=1".
    expect(content).toContain("initial-scale=1");
  });

  test("wrapper fullHeight: klasa zmieniona na jednostkę dynamiczną (dvh); wysokość = wysokość viewportu", async ({
    page,
  }) => {
    await page.goto("/profile");
    const shell = shellLocator(page);

    // Strukturalny dowód zmiany (red→green): PRZED fixem klasa to "h-screen", PO fixie zawiera "dvh" i
    // już NIE zawiera "h-screen" jako osobny token.
    await expect(shell).toHaveClass(/dvh/);
    await expect(shell).not.toHaveClass(/(?:^|\s)h-screen(?:\s|$)/);

    // Wysokość = wysokość viewportu. NIE red→green (patrz nagłówek pliku, punkt 3) — w headless Chromium
    // ta wartość jest identyczna przed i po fixie (100vh === 100dvh bez realnego paska adresu). Dowodzi
    // wyłącznie braku regresji wysokości po zmianie jednostki, nie realnej korzyści dvh.
    const { height, viewportHeight } = await shell.evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
    }));
    expect(
      Math.abs(height - viewportHeight),
      "wrapper fullHeight powinien wypełniać cały viewport",
    ).toBeLessThanOrEqual(1);
  });

  test.describe("objaw „opcje pod krawędzią” — emulacja tabletu na /profile", () => {
    test.describe("portret 820×1180", () => {
      test.use({ viewport: TABLET_PORTRAIT, hasTouch: true, isMobile: true });

      test("opcje sidebaru i karty klucza są osiągalne; brak nadmiarowego scrolla body", async ({ page }) => {
        await page.goto("/profile");

        // Dolny rząd stopki sidebaru (najdalej od góry — pierwszy kandydat na „pod krawędzią”) i akcja w
        // karcie ApiKeyManager (konto testowe ma klucz skonfigurowany, patrz `prod-fixes-phase5-key-indicator.spec.ts`).
        await assertReachable(page.getByRole("button", { name: "Wyloguj się" }), page, "„Wyloguj się” w sidebarze");
        await assertReachable(page.getByRole("button", { name: "Usuń klucz" }), page, "„Usuń klucz” w karcie profilu");

        // Symptom „opcje pod krawędzią” NIE odtwarza się w headless (patrz nagłówek pliku, punkt 4) —
        // asercja wyżej przechodzi strukturalnie zarówno przed, jak i po fixie; realna weryfikacja wymaga
        // fizycznego tabletu. Tu potwierdzamy dodatkowo brak nadmiarowego scrolla całego dokumentu.
        await assertNoOuterScroll(page);
      });
    });

    test.describe("pejzaż 1180×820 (po „rotacji”)", () => {
      test.use({ viewport: TABLET_LANDSCAPE, hasTouch: true, isMobile: true });

      test("opcje sidebaru i karty klucza są osiągalne po zmianie orientacji; brak nadmiarowego scrolla body", async ({
        page,
      }) => {
        await page.goto("/profile");

        await assertReachable(page.getByRole("button", { name: "Wyloguj się" }), page, "„Wyloguj się” w sidebarze");
        await assertReachable(page.getByRole("button", { name: "Usuń klucz" }), page, "„Usuń klucz” w karcie profilu");

        await assertNoOuterScroll(page);
      });
    });
  });

  test.describe("regresja: powłoka na wielu stronach (desktop i tablet)", () => {
    const VIEWPORTS: { label: string; viewport: { width: number; height: number } | null }[] = [
      { label: "desktop (domyślny viewport projektu)", viewport: null },
      { label: "tablet portret 820×1180", viewport: TABLET_PORTRAIT },
      { label: "tablet pejzaż 1180×820", viewport: TABLET_LANDSCAPE },
    ];

    for (const vp of VIEWPORTS) {
      test.describe(vp.label, () => {
        if (vp.viewport) {
          test.use({ viewport: vp.viewport, hasTouch: true, isMobile: true });
        }

        for (const target of SHELL_PAGES) {
          test(`${target.path}: powłoka renderuje, treść przewijalna, brak podwójnego/poziomego scrolla`, async ({
            page,
          }) => {
            await page.goto(target.path);

            // Powłoka (sidebar) i treść (nagłówek strony z AppLayout) faktycznie renderują.
            await expect(page.getByRole("heading", { level: 1, name: target.heading })).toBeVisible();
            await expect(page.locator("aside")).toBeVisible();

            // Kontener treści jest przewijalny strukturalnie (overflow-y:auto) — dowód, że globalna zmiana
            // jednostki wysokości w Layout.astro nie „urwała” łańcucha scrolla poniżej (AppLayout.astro).
            const scrollRegion = scrollRegionLocator(page);
            await expect(scrollRegion).toBeVisible();
            const overflowY = await scrollRegion.evaluate((el) => getComputedStyle(el).overflowY);
            expect(overflowY, "kontener treści powinien mieć computed overflow-y:auto").toBe("auto");

            await assertNoOuterScroll(page);
            await assertNoHorizontalOverflow(page);
          });
        }
      });
    }
  });
});
