import { expect, test } from "@playwright/test";

// Faza 2 (prod-feedback-fixes, ticket ef87e4f8): checkboxy na listach są w trybie CIEMNYM praktycznie
// niewidoczne — stan niezaznaczony zlewa się z tłem karty. Przyczyna (recon): `checkbox.tsx` w dark używa
// `border-input` (token `--input` = biel ~15% alfa) na obramowaniu i `dark:bg-input/30` na wypełnieniu —
// obie wartości są mocno przezroczyste na ciemnym tle karty (`--card`), więc kontur checkboxa praktycznie
// znika. Test wymusza dark cookiem (SSR czyta `theme` w `Layout.astro` → klasa `.dark` na `<html>`), potem
// bierze checkbox PIERWSZEJ karty na `/items/active` („Wpisy" — wzorzec preferuje istniejące dane; fallback
// na `/items`, a gdy obie listy puste — dodaj wpis ręczny S-07, `POST /api/items`, bez klucza BYOK).
//
// Metoda pomiaru: `getComputedStyle` samego checkboxa (borderColor) NIE mówi wprost o widoczności — trzeba
// zestawić z tłem, na którym leży. Kolory tokenów są w `oklch(... / alfa%)`; zamiast parsować format
// stringa (niepewny między przeglądarkami/wersjami), oddajemy oba kolory do canvas 2D (który parsuje
// DOWOLNY prawidłowy CSS <color>) i liczymy realnie wyrenderowany piksel obramowania „na" efektywnym tle
// (source-over blend), po czym mierzymy dystans (Euklides w RGB) do samego tła. Mały dystans = obramowanie
// wtapia się w tło (obecny bug); duży dystans = wyraźny kontur.
test.describe("Faza 2: widoczne checkboxy w trybie ciemnym (ticket ef87e4f8)", () => {
  const created: string[] = [];

  test.beforeEach(async ({ context, baseURL }) => {
    // Cookie PRZED nawigacją — SSR (Layout.astro) czyta `theme` i renderuje <html class="dark"> od razu
    // (bez migotania jasne→ciemne), więc computed style po `page.goto` już odzwierciedla dark.
    await context.addCookies([{ name: "theme", value: "dark", url: baseURL ?? "http://localhost:4321" }]);
  });

  test.afterEach(async ({ request, baseURL }) => {
    // Sprzątanie: wpis dodany w teście (tylko gdy zadziałał fallback „obie listy puste") trafia do kosza.
    if (!created.length || !baseURL) return;
    await request
      .post("/api/items/bulk", { data: { ids: created.splice(0), action: "trash" }, headers: { Origin: baseURL } })
      .catch(() => undefined);
  });

  test("checkbox niezaznaczony na liście ma wyraźny kontrast obramowania względem tła", async ({ page }) => {
    await page.goto("/items/active");

    // Sanity: dark faktycznie aktywny (szew cookie zadziałał).
    await expect(page.locator("html")).toHaveClass(/dark/);

    let card = page.locator("article[data-item-id]").first();

    if ((await card.count()) === 0) {
      await page.goto("/items");
      card = page.locator("article[data-item-id]").first();
    }

    if ((await card.count()) === 0) {
      // Obie listy puste — dodaj wpis ręczny (S-07: POST /api/items, bez klucza BYOK, od razu `accepted`),
      // by mieć gwarantowany checkbox. Retry na klik: topbar („Dodaj wpis") i widok listy to dwie osobne
      // wyspy React (client:load) — pierwszy klik bywa przed hydratacją (wzorzec z innych speców E2E).
      await page.goto("/items/active");
      const title = `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await expect(async () => {
        await page.getByRole("button", { name: "Dodaj wpis" }).click();
        await expect(page.getByLabel("Tytuł")).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 15_000 });
      await page.getByLabel("Tytuł").fill(title);
      await page.getByRole("button", { name: "Dodaj", exact: true }).click();
      card = page.locator("article[data-item-id]", { hasText: title });
      await expect(card).toBeVisible();
      const id = await card.getAttribute("data-item-id");
      if (id) created.push(id);
    }

    await expect(card).toBeVisible();
    const checkbox = card.getByRole("checkbox");
    await expect(checkbox).toBeVisible();

    const measurement = await checkbox.evaluate((el) => {
      function toRgba(color: string): { r: number; g: number; b: number; a: number } {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        return { r, g, b, a };
      }

      // Efektywne (nieprzezroczyste) tło, na którym faktycznie renderuje się checkbox: najbliższy PRZODEK
      // (start od rodzica — sam checkbox ma własne, badane tu tło, więc pomijamy je) z niezerową alfą tła
      // (dla karty listy to `bg-card`, dla paska „zaznacz wszystkie" to `bg-muted`).
      let node: Element | null = el.parentElement;
      let bgColor = "rgba(0, 0, 0, 0)";
      while (node) {
        const candidate = getComputedStyle(node).backgroundColor;
        if (toRgba(candidate).a > 0) {
          bgColor = candidate;
          break;
        }
        node = node.parentElement;
      }

      const borderColor = getComputedStyle(el).borderColor;
      const bgRgba = toRgba(bgColor);
      const borderRgba = toRgba(borderColor);
      // Obramowanie (ew. przezroczyste) skomponowane NA nieprzezroczystym tle — source-over blend.
      const alpha = borderRgba.a / 255;
      const composited = {
        r: borderRgba.r * alpha + bgRgba.r * (1 - alpha),
        g: borderRgba.g * alpha + bgRgba.g * (1 - alpha),
        b: borderRgba.b * alpha + bgRgba.b * (1 - alpha),
      };
      const distance = Math.sqrt(
        (composited.r - bgRgba.r) ** 2 + (composited.g - bgRgba.g) ** 2 + (composited.b - bgRgba.b) ** 2,
      );
      return { bgColor, borderColor, distance };
    });

    // eslint-disable-next-line no-console -- pomiar diagnostyczny „przed/po" (red→green), nie hałas na stałe.
    console.log("[phase2-dark-checkbox] measurement=%o", measurement);

    // Próg dobrany na realnym pomiarze: PRZED poprawką zmierzony dystans (border-input, biel ~15% alfa,
    // na `--card` w dark) to ok. 59.9 — próg 100 jest wyraźnie nad tą wartością (dowodzi reprodukcji na
    // obecnym kodzie, nie zgaduje) i wyraźnie pod wartością PO poprawce (`dark:border-white/40`).
    expect(measurement.distance).toBeGreaterThanOrEqual(100);
  });
});
