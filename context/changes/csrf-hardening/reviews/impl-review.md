<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Utwardzenie anty-CSRF mutujących endpointów (S-14)

- **Plan**: context/changes/csrf-hardening/plan.md
- **Zakres**: Faza 1 i 2 z 2 (pełny plan)
- **Data**: 2026-07-03
- **Werdykt**: WYMAGA UWAGI
- **Ustalenia**: 0 krytycznych, 2 ostrzeżenia, 3 obserwacje

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | WARNING |
| Kryteria sukcesu | WARNING |

## Kontekst weryfikacji automatycznej

- `npm run lint` → PASS (exit 0; komunikaty `projectService` to info parsera, nie błędy)
- `npm run build` → PASS (Complete!, SSR Cloudflare)
- `npm test` → PASS (51 plików, 512 testów; 7 nowych w csrf.test.ts)

## Ustalenia

### F1 — Brak testu integracyjnego middleware (wpięcie bramki nietestowane)

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/middleware.ts:13
- **Szczegóły**: Repo kolokuje test do każdego handlera API (bulk.test.ts, [id].test.ts, index.test.ts…), ale `src/middleware.test.ts` nie istnieje. Predykat jest w pełni pokryty jednostkowo (7 testów), lecz samo WPIĘCIE — że bramka zwraca 403 o właściwym kształcie i wykonuje się PRZED `createClient`/`getUser` (fail-fast/fail-closed) — nie ma testu automatycznego. Dziś tę własność potwierdza wyłącznie ręczny `curl` (krok 1.4), niepowtarzalny w CI.
- **Poprawka A ⭐ Zalecana**: Dodaj kolokowany `src/middleware.test.ts`
  - Siła: Domyka konwencję repo; pinuje regresyjnie fakt, że bramka odpala przed autoryzacją i zwraca 403 {ok:false,code:"forbidden"}. Mock `@/lib/supabase` jak w bulk.test.ts — wzorzec istnieje.
  - Kompromis: Kilkadziesiąt linii testu; trzeba zamockować createClient, by udowodnić „przed getUser".
  - Pewność: ŚREDNIA — wzorzec mockowania supabase istnieje, ale middleware nie był dotąd testowany (brak referencji 1:1).
  - Martwy punkt: Nie zweryfikowano, czy `defineMiddleware` łatwo wywołać w izolacji bez pełnego kontekstu Astro.
- **Poprawka B**: Zaakceptuj — wpięcie pokryte ręcznym curl (1.4) + predykat w 100% unit
  - Siła: Zero dodatkowej pracy; regresja predykatu już zapięta.
  - Kompromis: Regresja samego wpięcia (np. przeniesienie bramki pod getUser) przejdzie CI niezauważona.
  - Pewność: ŚREDNIA — zależy od wagi powtarzalnego dowodu wpięcia.
  - Martwy punkt: Brak.
- **Decyzja**: NAPRAWIONE (Poprawka A) — dodano `src/middleware.test.ts` (4 testy: 403 przed createClient dla cross-site i braku nagłówków; same-origin i bezpieczny GET przechodzą). Lint exit 0, vitest 4/4.

### F2 — Dwa ręczne kryteria sukcesu odhaczone jako niezrobione (2.5 wylogowanie, 1.5 UI)

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Kryteria sukcesu
- **Lokalizacja**: context/changes/csrf-hardening/plan.md (## Postęp: 2.5, 1.5)
- **Szczegóły**: Wszystkie bramki automatyczne zielone. W ręcznych zostają dwa `- [ ]`: 2.5 „Wylogowanie (formularz `signout`) działa" i 1.5 „Legalne przepływy UI" (opcjonalny sanity). 2.5 nie jest kosmetyczne: `signout` to natywny `<form method=POST>`, więc od tej zmiany przechodzi przez NOWĄ bramkę CSRF — potwierdzenie, że nadal wylogowuje, realnie sprawdza, że bramka nie zrywa legalnego same-origin POST-a formularza.
- **Poprawka**: Wykonaj krok 2.5 (i opcjonalnie 1.5) w UI, po czym odhacz w ## Postęp — lub jawnie zaznacz jako świadomie pominięte. Formularz signout niesie nagłówek Origin, więc oczekiwany wynik to sukces wylogowania.
- **Decyzja**: NAPRAWIONE (auto-proxy) — dev + `curl` na `/api/auth/signout`: same-origin form POST → 302 `/`; cross-origin form → 403 (Astro); cross-origin JSON → 403 `{code:forbidden}` (warstwa app). Krok 2.5 odhaczony w plan.md z adnotacją o zakresie. 1.5 (opcjonalny sanity UI) pozostaje `- [ ]` — do wizualnego potwierdzenia przez użytkownika.

### F3 — Fail-closed 403 dla żądań mutujących bez `Origin` i bez `Sec-Fetch-Site`

- **Ważność**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — zachowanie zamierzone; tylko do świadomości
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/lib/security/csrf.ts:28
- **Szczegóły**: Gdy `Origin` nieobecny i `Sec-Fetch-Site` nieobecny → `null === "same-origin"` → false → 403. Poprawne fail-closed, ale blokuje klientów nie-przeglądarkowych (curl/Postman, mobile natywny, server-to-server, webhook) oraz bardzo stare przeglądarki (pre-2020). Skan `src/pages/api/**` NIE ujawnił żadnego webhooka ani odbiorcy zewnętrznego → ryzyko akceptowalne i zamierzone.
- **Poprawka**: Żadna zmiana kodu. Do świadomej akceptacji: przyszły programmatyczny konsument `/api/**` będzie musiał jawnie wysyłać `Origin` albo dostać wyjątek w predykacie.
- **Decyzja**: NAPRAWIONE INACZEJ — dodano pustą allowlist `CSRF_EXEMPT_PATHS` (csrf.ts) jako bezpieczny punkt rozszerzenia (opcjonalny param `exemptPaths` jako szew testowy; middleware bez zmian). Pusta = zero zmiany zachowania. Odrzucono wariant „pomiń po nagłówku Authorization" jako bypass w aplikacji cookie-auth. Test: ścieżka na liście → true mimo cross-site; pusta lista domyślna → false. Lint 0, testy 12/12.

### F4 — Test predykatu nie pokrywa brzegów (opaque origin, pusty string, kolejność gałęzi)

- **Ważność**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/lib/security/csrf.test.ts
- **Szczegóły**: Predykat obsługuje je poprawnie (fail-closed), ale test nie pinuje: `Origin: "null"` (opaque origin — sandbox iframe / data:), `Origin: ""` (pusty string) oraz „Origin zgodny wygrywa mimo `Sec-Fetch-Site: cross-site`" (kolejność gałęzi z csrf.ts:27-28).
- **Poprawka**: Dodaj 3 asercje do csrf.test.ts pokrywające te brzegi.
- **Decyzja**: NAPRAWIONE — dodano 3 asercje: `Origin:"null"` → false, `Origin:""` → false, `Origin` zgodny + `Sec-Fetch-Site:cross-site` → true (pierwszeństwo gałęzi Origin). csrf.test.ts 11/11, lint 0.

### F5 — Wpis roadmapy S-14 dodany mimo bulletu „Czego NIE robimy"

- **Ważność**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: context/foundation/roadmap.md (commit 720ba4d, +14)
- **Szczegóły**: Plan w „Czego NIE robimy" #7 mówił „Nie tworzymy wpisu roadmapy…", a commit 720ba4d dodał wpis S-14 do roadmap.md. To nie jest niekontrolowany scope creep — sekcja „Uwagi dotyczące migracji" tego samego planu przewidziała to jako decyzję użytkownika (umiejscowić jako wycinek utwardzający S-14). Zmiana docs-only, spójna z furtką planu.
- **Poprawka**: Żadna. Ewentualnie zsynchronizuj „Czego NIE robimy" z rzeczywistością (usuń/zaktualizuj bullet #7), by przyszłe przeglądy tego nie zgłaszały ponownie.
- **Decyzja**: NAPRAWIONE — bullet #7 w plan.md „Czego NIE robimy" zaktualizowany: uznaje utworzenie S-14 decyzją użytkownika (koniec wewnętrznej sprzeczności planu).

## Wynik sortowania (2026-07-05)

Wszystkie 5 ustaleń rozstrzygnięto — 0 pominiętych, 0 oczekujących.

| ID | Decyzja | Artefakt |
|----|---------|----------|
| F1 | Naprawione (Poprawka A) | `src/middleware.test.ts` (nowy, 4 testy) |
| F2 | Naprawione (auto-proxy) | krok 2.5 odhaczony w plan.md; weryfikacja `curl` na `/api/auth/signout` |
| F3 | Naprawione inaczej | `CSRF_EXEMPT_PATHS` w `src/lib/security/csrf.ts` + test |
| F4 | Naprawione | 3 asercje brzegowe w `src/lib/security/csrf.test.ts` |
| F5 | Naprawione | bullet #7 „Czego NIE robimy" w plan.md |

**Bramki po poprawkach**: `npm run lint` → 0 · `npm run build` → Complete · `npm test` → 520/520 (było 512; +8 nowych).

**Pozostaje**: 1.5 (opcjonalny sanity UI) nadal `- [ ]` w ## Postęp — do wizualnego potwierdzenia przez użytkownika. Poprawki z triażu są w drzewie roboczym, **niezcommitowane** — S-14 pozostaje w kolumnie Review do czasu ich zmergowania na `main`.
