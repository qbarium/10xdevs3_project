import { expect, test } from "@playwright/test";

// Faza 1 (prod-feedback-fixes, ticket f4dc0119): marka „TaskerLight" w powłoce (logo + napis) ma być
// odnośnikiem do skrzynki wejściowej (/ingest). Przed poprawką blok marki to statyczny <div> —
// bez roli `link`, więc ten test jest czerwony aż do zamiany na <a href="/ingest">.
// Start na stronie powłoki INNEJ niż /ingest (/items/active — „Wpisy"), żeby klik faktycznie nawigował.
test.describe("Faza 1: marka TaskerLight jako link do skrzynki wejściowej (ticket f4dc0119)", () => {
  test("klik w markę w sidebarze nawiguje na /ingest", async ({ page }) => {
    await page.goto("/items/active");
    await expect(page).toHaveURL(/\/items\/active$/);

    const brandLink = page.getByRole("link", { name: /TaskerLight/i });
    await brandLink.click();

    await expect(page).toHaveURL(/\/ingest$/);
  });
});
