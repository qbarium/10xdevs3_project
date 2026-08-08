import { expect, test } from "@playwright/test";

// Faza 3 (prod-feedback-fixes, ticket 2d65d300): ikona „Do akceptacji" w sidebarze jest wizualnie niemal
// identyczna z ikoną „Skrzynka wejściowa" — obie to warianty tego samego kształtu skrzynki/tacy z „klapką"
// (`tray` i `inbox` w `Icon.astro`), różniące się tylko drobnymi przesunięciami współrzędnych. Test mierzy
// PODOBIEŃSTWO wizualne obu ikon programowo: renderuje oba SVG w tym samym rozmiarze i z tym samym,
// znormalizowanym kolorem/tłem — żeby porównanie izolowało KSZTAŁT, a nie przypadkowe różnice koloru
// wynikające z tego, że „Skrzynka wejściowa" to podświetlony przycisk CTA (`bg-primary`), a „Do akceptacji"
// to zwykła (nieaktywna) pozycja nawigacji — po czym liczy odsetek pikseli różniących się między dwoma
// zrzutami (dekodowanie PNG→piksele przez `Image` + canvas 2D `getImageData`, analogicznie do porównań
// kolorów w Fazie 2 — `prod-fixes-phase2-dark-checkbox.spec.ts`).
//
// Kalibracja progu (pomiar empiryczny, render 96×96, próg różnicy piksela = odległość euklidesowa RGB > 60):
// - PRZED poprawką (tray vs stary `inbox`, kształty niemal identyczne): diffFraction ≈ 0.259 — WIĘKSZE niż
//   naiwnie oczekiwane „blisko zera", bo cienkie obrysy (stroke ~7px przy tym renderze) tracą prawie cały
//   nakładający się obszar już przy przesunięciu współrzędnych o 1 jednostkę viewBox. Odnotowane zgodnie z
//   poleceniem: „przed" NIE jest małe w sensie bezwzględnym — próg niżej dobrany jest więc względem tej
//   realnej wartości, nie względem intuicyjnego zera.
// - PO poprawce (tray vs nowy `clipboard-check`): diffFraction ≈ 0.383 (zmierzone niezależnie kilkoma
//   kandydatami: `circle-check` dawał ~0.32-0.33, `list-checks` ~0.26 — czyli PRAWIE bez separacji od
//   „przed", mimo pozornie odmiennego kształtu; `clipboard-check` dał największą, najbardziej odporną lukę,
//   stąd wybór).
// - Próg asercji: 0.32 — niemal dokładnie w połowie między 0.259 a 0.383 (punkt środkowy ≈ 0.321), z
//   podobnym zapasem (~0.06) po obu stronach zmierzonych wartości.
test.describe('Faza 3: własna ikona "Do akceptacji" (ticket 2d65d300)', () => {
  test('ikony "Skrzynka wejściowa" i "Do akceptacji" są wizualnie wyraźnie różne', async ({ page }) => {
    // Dowolna strona powłoki — sidebar jest wszędzie, dane nie są potrzebne.
    await page.goto("/items/active");

    const inboxIcon = page.getByRole("link", { name: "Skrzynka wejściowa", exact: true }).locator("svg");
    const pendingIcon = page.getByRole("link", { name: "Do akceptacji", exact: true }).locator("svg");
    await expect(inboxIcon).toBeVisible();
    await expect(pendingIcon).toBeVisible();

    // Normalizacja PRZED zrzutem: oba <svg> dzielą ten sam viewBox (0 0 24 24), ale renderowany rozmiar
    // różni się (16 vs 17 px) i `currentColor` zależy od stylu linku (CTA na `bg-primary` vs zwykła pozycja
    // nav) — żadne z tego nie jest cechą KSZTAŁTU. Wymuszamy identyczny rozmiar oraz stały kolor/tło, żeby
    // zrzut mierzył wyłącznie różnicę kształtu ścieżek (uczciwe porównanie).
    const RENDER_SIZE = 96;
    for (const icon of [inboxIcon, pendingIcon]) {
      await icon.evaluate((svg, size) => {
        svg.setAttribute("width", String(size));
        svg.setAttribute("height", String(size));
        svg.style.color = "#000000";
        svg.style.backgroundColor = "#ffffff";
      }, RENDER_SIZE);
    }

    const [inboxPng, pendingPng] = await Promise.all([inboxIcon.screenshot(), pendingIcon.screenshot()]);

    const { diffFraction, meanDistance } = await page.evaluate(
      ({ a, b, size }: { a: string; b: string; size: number }) => {
        function decode(base64: string): Promise<Uint8ClampedArray> {
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = size;
              canvas.height = size;
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                reject(new Error("brak kontekstu 2d canvas"));
                return;
              }
              ctx.drawImage(img, 0, 0, size, size);
              resolve(ctx.getImageData(0, 0, size, size).data);
            };
            img.onerror = () => {
              reject(new Error("nie udało się zdekodować zrzutu ikony"));
            };
            img.src = `data:image/png;base64,${base64}`;
          });
        }

        return Promise.all([decode(a), decode(b)]).then(([pixelsA, pixelsB]) => {
          // Odległość euklidesowa RGB między odpowiadającymi sobie pikselami; przy znormalizowanym
          // czarno-białym renderze > ~60 oznacza realną różnicę (nie szum antyaliasingu 1-2 poziomów).
          const PIXEL_DIFF_THRESHOLD = 60;
          const MAX_DISTANCE = Math.sqrt(3 * 255 * 255);
          let differing = 0;
          let distanceSum = 0;
          for (let i = 0; i < pixelsA.length; i += 4) {
            const dr = pixelsA[i] - pixelsB[i];
            const dg = pixelsA[i + 1] - pixelsB[i + 1];
            const db = pixelsA[i + 2] - pixelsB[i + 2];
            const distance = Math.sqrt(dr * dr + dg * dg + db * db);
            if (distance > PIXEL_DIFF_THRESHOLD) differing += 1;
            distanceSum += distance;
          }
          const pixelCount = size * size;
          return { diffFraction: differing / pixelCount, meanDistance: distanceSum / pixelCount / MAX_DISTANCE };
        });
      },
      { a: inboxPng.toString("base64"), b: pendingPng.toString("base64"), size: RENDER_SIZE },
    );

    // eslint-disable-next-line no-console -- pomiar diagnostyczny (wartość udokumentowana też w komentarzu kalibracyjnym powyżej).
    console.log("[phase3-inbox-icon] diffFraction=%o meanDistance=%o", diffFraction, meanDistance);

    // Próg kalibrowany empirycznie — patrz komentarz na górze pliku (PRZED ≈ 0.259, PO ≈ 0.383, próg 0.32
    // to punkt środkowy z zapasem ~0.06 po obu stronach zmierzonych wartości).
    expect(diffFraction).toBeGreaterThanOrEqual(0.32);
  });
});
