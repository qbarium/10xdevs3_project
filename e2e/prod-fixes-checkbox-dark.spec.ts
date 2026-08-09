import { expect, test, type Page } from "@playwright/test";

// Ticket ef87e4f8 (prod-feedback-fixes): checkboxy na listach w trybie ciemnym.
//  - niezaznaczony musi być widoczny na ciemnej karcie (jasna ramka — naprawa z wcześniejszej fazy),
//  - zaznaczony musi mieć PEŁNE jasne tło `primary` (nie półprzezroczyste `white/10`), na którym ciemny
//    ptaszek `primary-foreground` wyraźnie kontrastuje.
//
// Regresja, którą to łapie (zmierzona 2026-08-09): `dark:bg-white/10` bez zawężenia do `unchecked` miało
// tę samą specyficzność co `data-[state=checked]:bg-primary` i jako późniejsze wygrywało też dla stanu
// zaznaczonego → pole zostawało ciemne (tło = biały z alfą 0.1), a ciemny ptaszek na nim znikał.
//
// Kolory czytamy z `getComputedStyle` (Chromium zwraca je w oklch/oklab). Bierzemy jasność L (pierwszy
// komponent) i alfę (po „/"). Sedno asercji: tło zaznaczonego ma alfę = 1 (pełny `primary`), nie 0.1.

function parseOk(s: string): { L: number; alpha: number } | null {
  const m = s.match(/okl(?:ab|ch)\(([^)]+)\)/);
  if (!m) return null;
  const [main, alphaPart] = m[1].split("/");
  const L = parseFloat(main.trim().split(/\s+/)[0]);
  const alpha = alphaPart !== undefined ? parseFloat(alphaPart) : 1;
  return { L, alpha };
}

test.use({ viewport: { width: 1280, height: 900 } });

async function seedItem(page: Page, created: string[], title: string): Promise<void> {
  await expect(async () => {
    await page.getByRole("button", { name: "Dodaj wpis" }).click();
    await expect(page.getByLabel("Tytuł")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByLabel("Tytuł").fill(title);
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  const card = page.locator("article[data-item-id]", { hasText: title });
  await expect(card).toBeVisible();
  const id = await card.getAttribute("data-item-id");
  if (id) created.push(id);
}

const created: string[] = [];
test.afterEach(async ({ request, baseURL }) => {
  if (!created.length || !baseURL) return;
  await request
    .post("/api/items/bulk", { data: { ids: created.splice(0), action: "trash" }, headers: { Origin: baseURL } })
    .catch(() => undefined);
});

test("checkboxy w ciemnym: niezaznaczony widoczny, zaznaczony z jasnym tłem i kontrastowym ptaszkiem", async ({
  page,
}) => {
  await page.goto("/items/active");
  await page.waitForLoadState("networkidle");

  const title = `E2E-DARK-${Date.now()}`;
  await seedItem(page, created, title);
  const card = page.locator("article[data-item-id]", { hasText: title });

  // Tryb ciemny: klasa `.dark` na <html> (to samo źródło co ThemeToggle) — kolory to czysty CSS.
  await page.evaluate(() => document.documentElement.classList.add("dark"));

  const boxUnchecked = card.locator('[data-slot="checkbox"]');
  await expect(boxUnchecked).toBeVisible();
  const unchecked = await boxUnchecked.evaluate((el) => ({
    state: el.getAttribute("data-state"),
    border: getComputedStyle(el).borderColor,
    bg: getComputedStyle(el).backgroundColor,
  }));
  console.log("NIEZAZNACZONY:", JSON.stringify(unchecked));

  // Niezaznaczony: jasna, wyraźna ramka na ciemnej karcie (widoczny pusty checkbox).
  const ub = parseOk(unchecked.border);
  expect(ub, `ramka niezaznaczonego (${unchecked.border}) w oklch/oklab`).not.toBeNull();
  expect(ub!.L, "ramka niezaznaczonego ma być jasna").toBeGreaterThan(0.8);
  expect(ub!.alpha, "ramka niezaznaczonego wystarczająco krycia").toBeGreaterThan(0.3);

  // Zaznacz.
  const cb = card.getByRole("checkbox", { name: `Zaznacz: ${title}` });
  await cb.click();
  const boxChecked = card.locator('[data-slot="checkbox"][data-state="checked"]');
  await expect(boxChecked).toBeVisible();
  await expect(boxChecked.locator("svg")).toBeVisible();
  const checked = await boxChecked.evaluate((el) => {
    const svg = el.querySelector("svg");
    return {
      bg: getComputedStyle(el).backgroundColor,
      check: svg ? getComputedStyle(svg).color : "(brak svg)",
    };
  });
  console.log("ZAZNACZONY:", JSON.stringify(checked));

  const cbg = parseOk(checked.bg);
  const cck = parseOk(checked.check);
  expect(cbg, `tło zaznaczonego (${checked.bg}) w oklch/oklab`).not.toBeNull();
  expect(cck, `ptaszek (${checked.check}) w oklch/oklab`).not.toBeNull();

  // Sedno regresji: tło zaznaczonego jest PEŁNE (primary), nie białe 10% (alfa 0.1).
  expect(cbg!.alpha, "tło zaznaczonego ma być pełne (primary), nie białe 10%").toBe(1);
  expect(cbg!.L, "tło zaznaczonego jasne (primary w trybie ciemnym)").toBeGreaterThan(0.8);
  // Ciemny ptaszek na jasnym tle → duży rozjazd jasności = wyraźnie widoczny.
  expect(Math.abs(cbg!.L - cck!.L), "kontrast jasności ptaszek↔tło").toBeGreaterThan(0.5);

  await card.screenshot({ path: "test-results/checkbox-dark-after.png" });
});

test("master Zaznacz wszystkie jest dwustanowy: część zaznaczonych → odznaczony (bez stanu pośredniego)", async ({
  page,
}) => {
  await page.goto("/items/active");
  await page.waitForLoadState("networkidle");

  const stamp = Date.now();
  const t1 = `E2E-2ST-A-${stamp}`;
  const t2 = `E2E-2ST-B-${stamp}`;
  await seedItem(page, created, t1);
  await seedItem(page, created, t2);

  // Zaznacz jeden wpis (część widocznych).
  const card1 = page.locator("article[data-item-id]", { hasText: t1 });
  await card1.getByRole("checkbox", { name: `Zaznacz: ${t1}` }).click();

  // Część zaznaczonych → master jest ODZNACZONY, nie w stanie pośrednim „indeterminate".
  const master = page.getByRole("checkbox", { name: "Zaznacz wszystkie", exact: true });
  await expect(master).toHaveAttribute("data-state", "unchecked");

  // Klik zaznacza wszystkie; kolejny klik odznacza — czyste dwa stany.
  await master.click();
  await expect(master).toHaveAttribute("data-state", "checked");
  await master.click();
  await expect(master).toHaveAttribute("data-state", "unchecked");
});
