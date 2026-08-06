<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Nowa szata graficzna (wariant techniczny) + powłoka nawigacyjna

- **Plan**: context/changes/ui-redesign/plan.md
- **Zakres**: Faza 7 z 8 (Landing + auth — pełny restyle)
- **Data**: 2026-08-05
- **Werdykt**: ZAAKCEPTOWANO
- **Ustalenia**: 0 krytycznych, 0 ostrzeżeń, 2 obserwacje
- **Commit fazy**: 3c4b330 (+ odhaczenia postępu 517a87a, bc271a7)

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | WARNING |
| Bezpieczeństwo i jakość | WARNING |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

## Kryteria sukcesu (zweryfikowane na żywo)

- 7.1 Lint (`npm run lint`) — PASS (exit 0)
- 7.2 Build (`npm run build`) — PASS („Complete!", exit 0)
- 7.3 Testy jednostkowe (`npm test`) — PASS (574/574 w 55 plikach)
- 7.4 / 7.5 (ręczne) — odhaczone z dowodem: weryfikacja wizualna agenta przez Playwright (commit bc271a7); diff potwierdza usunięcie „cosmic"/starfield i przejście stanów błędu na token `destructive` (czytelne w obu motywach). Nie „podpisane na ślepo".

## Dowody (dwaj pod-agenci)

- **Odchylenia od planu**: 11/11 plików MATCH, 0 DRIFT, 0 MISSING, 1 łagodny EXTRA. Obie rozbieżności plan↔diff to poprawne „bez zmian": `index.astro` to cienki wrapper `Layout`+`Welcome` (cały wygląd landingu żyje w `Welcome.astro`), a `SignInForm.tsx` jest bajt-identyczny — to czysta delegacja do współdzielonych dzieci (`FormField`/`PasswordToggle`/`SubmitButton`/`ServerError`), które przełożono na tokeny, więc restyle „za darmo". Asymetria z `SignUpForm` (który się zmienił) wynika z jednego inline'owego `text-blue-100/50` w podpowiedzi hasła, którego SignIn nie ma.
- **Bezpieczeństwo/jakość/wzorce**: zero złamań reguły `.astro` (frontmatter signin/signup/confirm-email to same `const`, brak top-level `return`), zero zaszytych kolorów w dodanych liniach, zero zmian atrybutów formularzy/endpointów/logiki, dostępne nazwy i powiązania `label htmlFor`↔`id` + `aria-label` nietknięte, brak CDN/sekretów/XSS. Stany błędu na `destructive` (`ServerError.tsx:11`, `FormField.tsx:53,59`). SignIn↔SignUp spójne.

## Nota (nie ustalenie): `Topbar.astro` osierocony — przedwarunek Fazy 8 spełniony

Po zdjęciu ostatniego konsumenta (`Welcome.astro`) `src/components/Topbar.astro` nie jest już nigdzie importowany (grep `Topbar` → tylko niepowiązane `TopbarItemSearch`/`TopbarItemAction`). To dokładnie stan, na który czekała Faza 8 (plan §Faza 8.1: „Usunąć `Topbar.astro` — po Fazach 2 i 7 nikt go nie woła; potwierdź grepem zero trafień"). Zaplanowana praca, nie defekt Fazy 7.

## Ustalenia

### F1 — Brak przełącznika motywu na powierzchni przed-logowaniem

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość (niezawodność / UX)
- **Lokalizacja**: src/components/Welcome.astro:25-48 (nowy nagłówek) vs usunięty src/components/Topbar.astro:52
- **Szczegóły**: `Welcome.astro` zdjął `<Topbar/>`, który w gałęzi niezalogowanej renderował `<ThemeToggle client:load .../>`. Nowy minimalny pasek landingu ma markę + „Zaloguj się"/„Zarejestruj się", ale nie ma przełącznika; strony auth nigdy go nie miały. Efekt netto: niezalogowany użytkownik nie ma żadnej kontrolki zmiany motywu przed logowaniem. Nic nie jest zepsute — motyw nadal rozwiązuje się serwerowo z cookie i oba warianty renderują poprawnie. To realny skutek uboczny restyle, najpewniej zamierzony (plan sam opisał minimalny pasek jako „marka + Zaloguj/Zarejestruj", bez przełącznika). Warty świadomej decyzji, bo to decyzja produktowa, nie błąd.
- **Poprawka**: Potwierdź, że brak przełącznika przed logowaniem jest zamierzony (spójne z opisem planu). Jeśli nie — dodaj `<ThemeToggle client:load initialTheme={...} />` do nagłówka landingu (i ew. do stron auth).
- **Decyzja**: NAPRAWIONO (2026-08-05, decyzja użytkownika „spójnie z resztą wszędzie") — dodano `<ThemeToggle client:load initialTheme={theme} />` na WSZYSTKICH powierzchniach przed-logowaniem: nagłówek landingu (`Welcome.astro`, na końcu paska nawigacji) oraz prawy górny róg trzech stron auth (`signin`/`signup`/`confirm-email`, wrapper `relative` + `absolute top-4 right-4`). Motyw czytany serwerowo (`parseTheme` + `THEME_COOKIE`, wzorzec z `AppLayout`). Zero nowych zależności (depy `ThemeToggle` już w `ssr.optimizeDeps.include`; landing hostował ten sam przełącznik przez `Topbar` przed Fazą 7). Lint + build zielone.

### F2 — Nieplanowany rząd chipów typów w hero landingu (eyebrow)

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: src/components/Welcome.astro:10-16, 51-59
- **Szczegóły**: W hero pojawił się rząd chipów typów (`bg-task-bg text-task-fg`, `bg-note-bg`, …) niewymieniony wprost w kontrakcie Fazy 7. Element czysto prezentacyjny, na ogólnodostępnych tokenach per-typ zdefiniowanych w `global.css` (oba motywy) i używanych też przez `badge.tsx`; zero zaszytych kolorów; zero wpływu na zachowanie. Mieści się w mandacie „przeprojektować hero na nowy język" i „wszystkie widoki jednym językiem wizualnym".
- **Poprawka**: Żadna nie jest wymagana — zaakceptuj jako świadomy, zgodny z intencją EXTRA. (Jeśli chcesz twardej dyscypliny „tylko to, co w kontrakcie" — usuń rząd chipów.)
- **Decyzja**: ZAAKCEPTOWANO (2026-08-05, decyzja użytkownika) — chipy zostają jako świadoma dekoracja hero landingu (zapowiedź 5 typów), spójna z tokenami per-typ. Uwaga UX (element wygląda na kontrolkę, a nią nie jest) omówiona i przyjęta świadomie. Bez zmian w kodzie.
