<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Nowa szata graficzna (wariant techniczny) + powłoka nawigacyjna

- **Plan**: context/changes/ui-redesign/plan.md
- **Zakres**: Faza 1 z 8 (Fundament motywu + fonty)
- **Data**: 2026-08-04
- **Werdykt**: ZAAKCEPTOWANO
- **Ustalenia**: 0 krytycznych, 0 ostrzeżeń, 5 obserwacji
- **Commity**: f133379 (implementacja), 16ddcc7 (weryfikacja planu)
- **Uwaga**: przegląd per-faza zmiany w toku — `change.md.status` pozostaje `implementing` (fazy 2–8 przed nami), NIE `impl_reviewed`.

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

Wszystkie wymiary PASS. Kryteria automatyczne (lint, build, test 568/568) zielone; ręczne 1.4–1.6 zweryfikowane Playwrightem, 1.7 świadomie odroczone (żyje za auth). Dwaj niezależni recenzenci (odchylenia od planu + bezpieczeństwo/jakość) potwierdzili wierność implementacji i brak regresji dup-React. Pięć obserwacji niskiej wagi (opcjonalny polish), nic blokującego.

## Ustalenia

### F1 — Komentarz `theme.ts` przekłamuje „wszystko best-effort try/catch"; `applyTheme` bez guardu

- **Ważność**: 🔵 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość (niezawodność / spójność kontraktu)
- **Lokalizacja**: src/lib/theme.ts:33-37 (komentarz modułu :4-5)
- **Szczegóły**: `applyTheme` dereferencuje `document.documentElement` bez try/catch, podczas gdy komentarz modułu deklaruje „Wszystko best-effort w try/catch — bezpieczne pod SSR". Obecnie bezpieczne (funkcja woła się wyłącznie z klienckiego `onClick` w `ThemeToggle.tsx:31`), ale komentarz przekłamuje słowem „Wszystko", a funkcja jest latentną pułapką: przyszły wywołujący w ścieżce SSR/render dostanie crash — inaczej niż strzeżony `writeThemePref`.
- **Poprawka**: Zawęź komentarz modułu — best-effort/try-catch dotyczy `writeThemePref` (zapis cookie może rzucić np. w piaskownicy iframe); `applyTheme` jest z założenia client-only. (Alternatywa: opakować ciało `applyTheme` w try/catch dla parytetu — mniej preferowana, bo cicho połknęłaby realne błędy klienta.)
- **Decyzja**: NAPRAWIONE — zawężono komentarz modułu; `applyTheme` oznaczone jako client-only bez guardu (commit fixów przeglądu).

### F2 — `aria-label` przełącznika odwrócony do czasu hydracji przy starcie w motywie ciemnym

- **Ważność**: 🔵 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość (a11y / hydracja)
- **Lokalizacja**: src/components/ThemeToggle.tsx:15 (analogicznie sonner.tsx:10)
- **Szczegóły**: Początkowy `useState<Theme>("light")` jest zaszyty na sztywno. Przy ładowaniu strony w motywie ciemnym (SSR wyrenderował `.dark`) przez kilka ms — do uruchomienia efektu montującego — `aria-label` mówi „Przełącz na motyw ciemny" na już-ciemnej stronie. Ikona jest niezależna (czysty wariant CSS `dark:`, poprawna od pierwszej klatki), więc wizualnie OK; brak ostrzeżenia hydracji Reacta (serwer i pierwszy render klienta oba używają "light"). Niuansik dla czytników ekranu.
- **Poprawka** (opcjonalna): Przekaż serwerowo rozwiązany `theme` jako prop wyspy (`<ThemeToggle client:load theme={theme} />`) i użyj jako wartości początkowej `useState` — eliminuje opóźnienie etykiety.
- **Decyzja**: NAPRAWIONE — `ThemeToggle` przyjmuje `initialTheme`; `Topbar` podaje motyw z SSR. Zweryfikowane Playwrightem: SSR `aria-label` idzie za cookie (dark→„jasny", light→„ciemny").

### F3 — ThemeToggle zamontowany w legacy `Topbar.astro` (poza listą plików fazy 1)

- **Ważność**: 🔵 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: src/components/Topbar.astro (import + 2× `<ThemeToggle client:load />`)
- **Szczegóły**: Plan fazy 1 nie wymieniał `Topbar.astro`; bariera mówi „przełącznik w trwałym topbarze = Faza 2". Zamontowano jednak w **legacy** Topbarze (do usunięcia w Fazie 8), nie w powłoce Fazy 2 — bo wyspa musi mieć punkt montażu, by w ogóle zweryfikować kryteria ręczne 1.4/1.5/1.7. Kolory „cosmic" Topbara celowo nietknięte (zgodnie z barierą). Niezależny recenzent uznał to za uzasadniony scaffolding.
- **Poprawka**: Brak akcji teraz — celowe i tymczasowe; przenieść do topbara `AppLayout` w Fazie 2, usunąć w Fazie 8 (już w planie).
- **Decyzja**: ZAAKCEPTOWANE — celowy, tymczasowy scaffolding; przeniesie się do topbara `AppLayout` w fazie 2, usunie w fazie 8.

### F4 — Ręczne kryterium 1.7 (toaster) pozostaje nieodhaczone

- **Ważność**: 🔵 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Kryteria sukcesu
- **Lokalizacja**: context/changes/ui-redesign/plan.md (Progress 1.7)
- **Szczegóły**: Kod toastera jest theme-aware (MutationObserver na klasie `.dark`, ten sam mechanizm co potwierdzone 1.4), ale 1.7 nie został potwierdzony na żywo — toaster żyje na stronach chronionych za auth. Świadomie odroczone, nie „podpisane na ślepo".
- **Poprawka**: Zweryfikować toast w obu motywach na stronie chronionej przy najbliższej sesji zalogowanej (np. w Fazie 4/5) i wtedy odhaczyć 1.7.
- **Decyzja**: NAPRAWIONE — 1.7 zweryfikowane Playwrightem TERAZ (zalogowany, `/items/active`): toast błędu wywołany niemutująco (abort POST `/api/items`), renderuje się jasny w motywie jasnym i ciemny w ciemnym; `leakedItems: 0`. 1.7 odhaczone w Progress.

### F5 — Build bundluje nieużywane subsety fontów (cyrillic/greek/vietnamese) do `dist`

- **Ważność**: 🔵 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość (wydajność / waga buildu)
- **Lokalizacja**: src/styles/global.css:3-8 (import plików zbiorczych `400.css`/`500.css`/…)
- **Szczegóły**: Import plików zbiorczych per grubość ściąga `@font-face` wszystkich subsetów (w tym cyrillic/greek/vietnamese) → ~20 nadmiarowych woff2 w `dist`. Runtime pozostaje lekki: `unicode-range` sprawia, że przeglądarka pobiera wyłącznie latin+latin-ext. To świadomy kompromis — pliki subsetowe (`latin-ext-400.css`) nie mają `unicode-range` i gryzłyby się przy łączeniu. Koszt to tylko waga artefaktu buildu (statyczne assety serwowane na żądanie), nie transfer do użytkownika.
- **Poprawka**: Zaakceptować (runtime lekki; ręczne `@font-face` odrzucone przez plan). Ewentualnie w Fazie 8 rozważyć przycięcie, jeśli waga `dist` zacznie mieć znaczenie.
- **Decyzja**: ZAAKCEPTOWANE — świadomy kompromis; runtime lekki dzięki `unicode-range`, ewentualne przycięcie w fazie 8.
