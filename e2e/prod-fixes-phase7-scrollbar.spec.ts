import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

// Faza 7 (prod-feedback-fixes, ticket be20465a): na tablecie przy listach dłuższych niż ekran znika pasek
// przewijania. RECON (plan §Analiza stanu obecnego): `global.css` PRZED tą fazą nie zawiera żadnego CSS
// ukrywającego scrollbar — objaw to natywne, AUTO-UKRYWAJĄCE SIĘ overlay-scrollbary systemu/przeglądarki
// mobilnej na dotyku (nic ich nie wymusza na widoczność). Wspólny kontener przewijania listy (klasa
// `min-h-0 flex-1 overflow-y-auto px-6`) występuje identycznie w 5 widokach: TrashItemsView:247,
// AcceptedItemsView:376, PendingItemsView:267, SessionEntriesView:143, ImportSessionsView:83.
//
// Fix: nowa utilitka `.scrollbar-stable` w `global.css` (Firefox: `scrollbar-width:thin` +
// `scrollbar-color`; Chromium/WebKit: `::-webkit-scrollbar` + `-thumb`/`-track` z NIEZEROWĄ szerokością —
// pasek „on-canvas", rezerwujący miejsce, nie overlay), dodana do wspólnej klasy kontenera we wszystkich
// 5 widokach.
//
// UCZCIWOŚĆ METODY (WAŻNE — realny pomiar PRZED i PO fixie, DWA razy: emulacja tabletu/dotyku i domyślny
// desktop, na headless Chromium z Playwright):
//   Tablet (`hasTouch:true, isMobile:true`, viewport 820×1180) PRZED: kontener przewijalny (scrollHeight
//     3185 vs clientHeight 831); offsetWidth 756 vs clientWidth 756 → zarezerwowana szerokość paska = 0;
//     computed `scrollbar-width` = „auto" (brak reguły — zgodnie z reconem).
//   Tablet PO (`.scrollbar-stable` w `global.css`): kontener nadal przewijalny (te same wysokości); computed
//     `scrollbar-width` = „thin", `scrollbar-color` = rozwiązany token (`oklch(0.556 0 0) rgba(0,0,0,0)`) —
//     reguła CSS FAKTYCZNIE się aplikuje. offsetWidth − clientWidth NADAL = 0.
//   Desktop (DOMYŚLNY viewport projektu, BEZ `hasTouch`/`isMobile`) PO fixie: zmierzone RÓWNIEŻ 0 (patrz
//     `console.log` w teście „desktop") — czyli zarezerwowana szerokość zostaje 0 w KAŻDEJ headless
//     konfiguracji, którą przetestowano, nie tylko w emulacji dotyku. Wniosek: w tej wersji headless
//     Chromium (Playwright) `scrollbar-width`/`::-webkit-scrollbar{width}` NIE zmienia box-modelu w ogóle —
//     to prawdopodobnie charakterystyka silnika headless (brak realnego „chrome" OS do namalowania
//     klasycznego paska), nie coś specyficznego dla emulacji tabletu. NIE mamy dowodu, że to samo dotyczy
//     realnej przeglądarki na fizycznym urządzeniu (desktop Chrome z prawdziwym oknem klasycznie REZERWUJE
//     miejsce dla `scrollbar-width:thin` — to standardowe, udokumentowane zachowanie; różnica leży
//     najpewniej w headless, nie w naszym CSS).
//   „Pasek zajmuje miejsce" (offsetWidth−clientWidth>0), preferowany w zleceniu jako mierzalne red→green,
//     okazał się PO ZMIERZENIU niedostępny w TYM środowisku (headless) — zostaje 0 PRZED i PO, na obu
//     viewportach. Jego użycie jako asercji byłoby nieuczciwym red→green. NIE UDAJEMY go.
//   Zamiast tego: jedyna asercja RED→GREEN w tym pliku (test „tablet") jest STRUKTURALNA — computed
//     `scrollbar-width` kontenera zmienia się z „auto" (PRZED) na „thin" (PO). To dowodzi, że reguła CSS
//     jest zastosowana; NIE dowodzi rezerwacji miejsca ani widoczności na realnym urządzeniu — headless w
//     TYM projekcie nie jest w stanie tego zmierzyć na ŻADNYM viewporcie, więc różnicowanie
//     tablet/desktop tej akurat własności nic by nie dowodziło.
//
// CO WYMAGA RĘCZNEJ WERYFIKACJI NA REALNYM TABLECIE (nie da się automatycznie w headless — to jest
// GŁÓWNE ograniczenie tego specu, nie drugorzędny szczegół): (a) czy pasek faktycznie REZERWUJE miejsce
// (nie jest overlayem) na prawdziwym Android Chrome / iPadOS Safari; (b) czy pasek jest wizualnie widoczny
// (kolor/kontrast) na tych przeglądarkach; (c) czy `::-webkit-scrollbar`/`scrollbar-width` jest tam w ogóle
// respektowany — WebKit iOS bywa niekonsekwentny między wersjami (wsparcie `scrollbar-width` dopiero od
// Safari 18.2); (d) czy pasek nie przeszkadza UX po zdjęciu palca (poza zakresem Fazy 7 — w zakresie jest
// wyłącznie trwała OBECNOŚĆ, nie zachowanie po interakcji).
test.describe("Faza 7: widoczny scrollbar na tablecie (ticket be20465a)", () => {
  const created: string[] = [];
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let batchCounter = 0;

  test.afterEach(async ({ request, baseURL }) => {
    // Sprzątanie: wszystkie własne wpisy (utworzone od razu jako accepted/new, S-07) do kosza.
    if (!created.length || !baseURL) return;
    await request
      .post("/api/items/bulk", { data: { ids: created.splice(0), action: "trash" }, headers: { Origin: baseURL } })
      .catch(() => undefined);
  });

  /**
   * Zapewnia listę „Wpisy" (/items/active) dłuższą niż ekran: tworzy wpisy RĘCZNE (S-07, `POST /api/items`
   * — od razu accepted/new, bez przechodzenia przez kolejkę pending) w rosnących partiach, aż kontener
   * przewijania faktycznie przewija (scrollHeight > clientHeight), z twardym limitem rund (nie zapętla się
   * w nieskończoność, jeśli coś strukturalnie nie działa). `?size=100` w URL wymusza maksymalny rozmiar
   * strony (pula `ITEM_PAGE_SIZES`), żeby preferencja cookie z konta testowego nie obcięła listy.
   */
  async function ensureOverflowingList(page: Page, request: APIRequestContext, baseURL: string): Promise<Locator> {
    const containerSel = "div.overflow-y-auto:has(article[data-item-id])";
    const batchSizes = [16, 24]; // sumarycznie do 40 wpisów — hojny margines nad realistyczną wysokością karty

    for (const size of batchSizes) {
      const titles = Array.from({ length: size }, (_, i) => `E2E-P7-${runId}-${batchCounter}-${i}`);
      batchCounter++;
      for (const title of titles) {
        const res = await request.post("/api/items", {
          data: { title, description: null, type: "task" },
          headers: { Origin: baseURL },
        });
        expect(res.ok(), `seed POST /api/items nie powiódł się dla „${title}”`).toBeTruthy();
        const body = (await res.json()) as { item?: { id?: string } };
        if (body.item?.id) created.push(body.item.id);
      }

      await page.goto("/items/active?size=100");
      const container = page.locator(containerSel).first();
      await expect(container).toBeVisible({ timeout: 10_000 });

      const { scrollH, clientH } = await container.evaluate((el) => ({
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
      }));
      if (scrollH > clientH) return container;
    }

    throw new Error(
      `Kontener „${containerSel}” nie przewija po ${created.length} zaseedowanych wpisach — nieoczekiwane.`,
    );
  }

  test.describe("tablet (emulacja dotyku)", () => {
    test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });

    test("kontener listy jest przewijalny; trwały pasek wymuszony strukturalnie (scrollbar-width != auto)", async ({
      page,
      request,
      baseURL,
    }) => {
      if (!baseURL) throw new Error("Brak baseURL w konfiguracji Playwright.");
      const container = await ensureOverflowingList(page, request, baseURL);

      const metrics = await container.evaluate((el: HTMLElement) => {
        const cs = getComputedStyle(el);
        return {
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          offsetWidth: el.offsetWidth,
          clientWidth: el.clientWidth,
          scrollbarWidth: cs.scrollbarWidth,
          scrollbarColor: cs.scrollbarColor,
        };
      });

      const reservedWidth = metrics.offsetWidth - metrics.clientWidth;
      // eslint-disable-next-line no-console -- pomiar diagnostyczny „przed/po" (red→green), nie hałas na stałe.
      console.log("[phase7-scrollbar][tablet] measurement=%o", { ...metrics, reservedWidth });

      // Krok 1 (zawsze prawdziwe, niezależne od fixu): kontener faktycznie przewija.
      expect(metrics.scrollHeight, "kontener listy powinien być wyższy niż jego widoczny obszar").toBeGreaterThan(
        metrics.clientHeight,
      );

      // Krok 2 — TYLKO DIAGNOSTYKA, bez asercji (patrz nagłówek pliku „UCZCIWOŚĆ METODY"): zmierzone
      // PRZED fixem `reservedWidth` = 0 i PO fixie NADAL = 0 (i to na OBU testowanych viewportach, patrz
      // test „desktop" niżej — nie tylko pod emulacją dotyku). Asercja „> 0" byłaby nieuczciwym red→green —
      // świadomie jej NIE stawiamy. Faktyczna rezerwacja miejsca/widoczność paska wymaga ręcznej weryfikacji
      // na realnym tablecie (patrz nagłówek pliku).

      // Krok 3 (JEDYNA asercja RED→GREEN tego testu, strukturalna): przed Fazą 7 przeglądarka nie ma żadnej
      // reguły scrollbar-width na tym kontenerze → computed „auto". Po fixie `.scrollbar-stable` ustawia
      // `scrollbar-width: thin` — dowód, że reguła jest zastosowana (niezależnie od dokładnej liczby
      // pikseli/faktycznej rezerwacji miejsca, której headless+dotyk nie odtwarza — patrz nagłówek pliku).
      expect(metrics.scrollbarWidth, "computed scrollbar-width kontenera po fixie Fazy 7").toBe("thin");
    });
  });

  test.describe("desktop (brak regresji)", () => {
    // Domyślny viewport projektu „chromium" (Desktop Chrome, playwright.config.ts) — bez nadpisania.
    test("kontener listy działa bez regresji layoutu; strona bez dodatkowego przewijania w poziomie", async ({
      page,
      request,
      baseURL,
    }) => {
      if (!baseURL) throw new Error("Brak baseURL w konfiguracji Playwright.");
      const container = await ensureOverflowingList(page, request, baseURL);

      // Diagnostyka (nie asercja — patrz nagłówek pliku „UCZCIWOŚĆ METODY"): zmierzona wartość jest TAKŻE 0
      // tutaj (domyślny desktop, bez emulacji dotyku) — headless Chromium w tym projekcie nie rezerwuje
      // miejsca dla `scrollbar-width`/`::-webkit-scrollbar` na ŻADNYM z dwóch przetestowanych viewportów,
      // więc to nie jest artefakt specyficzny dla emulacji tabletu. Log zostaje jako dowód, że sprawdzono
      // (nie założono), bez wyciągania z niego wniosku o realnym urządzeniu.
      const reservedWidth = await container.evaluate((el: HTMLElement) => el.offsetWidth - el.clientWidth);
      // eslint-disable-next-line no-console -- pomiar diagnostyczny, patrz nagłówek pliku.
      console.log("[phase7-scrollbar][desktop] reservedWidth=%d", reservedWidth);

      // Kontener nadal faktycznie przewijalny (fix nie psuje scrollowania na desktopie).
      const before = await container.evaluate((el) => ({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight }));
      await container.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      const after = await container.evaluate((el) => el.scrollTop);
      expect(after, "kontener na desktopie powinien dać się przewinąć programowo").toBeGreaterThan(before.scrollTop);

      // Brak regresji: strona jako całość nie zyskuje poziomego przewijania przez nowy pasek (gutter
      // zarezerwowany PIONOWO w obrębie kontenera, nie powinien poszerzać dokumentu w poziomie).
      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(hasHorizontalOverflow, "strona nie powinna zyskać poziomego przewijania po Fazie 7").toBe(false);
    });
  });
});
