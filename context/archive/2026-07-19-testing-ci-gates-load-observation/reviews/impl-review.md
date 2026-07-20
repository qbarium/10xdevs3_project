<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Faza 5 planu testów — bramki CI + obserwacja i utwardzenie dużego wsadu

- **Plan**: context/changes/testing-ci-gates-load-observation/plan.md
- **Zakres**: Fazy 1, 2, 4 z 5 (zaimplementowane w kodzie; Fazy 3 „obserwacja" i 5 „domknięcie" nierozpoczęte)
- **Data**: 2026-07-20
- **Werdykt**: WYMAGA UWAGI
- **Ustalenia**: 0 krytycznych, 1 ostrzeżenie, 2 obserwacje

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | WARNING |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | WARNING |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | WARNING |

## Ustalenia

### F1 — CI może cicho pominąć testy integracyjne (zielono) bez strażnika env

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: .github/workflows/ci.yml:29-36
- **Szczegóły**: Eksport env robi `eval "$(npx --no-install supabase status -o env 2>/dev/null)"` i przypisuje `SUPABASE_TEST_URL=$API_URL` / `SUPABASE_TEST_ANON_KEY=$ANON_KEY`. Gdy `API_URL`/`ANON_KEY` będą puste (zmiana formatu `-o env` w nowszym CLI, nieudany `status` połknięty przez `2>/dev/null`), do `$GITHUB_ENV` trafią puste zmienne. Testy integracyjne mają fallback `const d = ready ? describe : describe.skip` (`import-session-reap.integration.test.ts:14-15`) → 0 uruchomionych testów → exit 0 → **CI zielony bez żadnego testu integracyjnego**. To dokładnie ten tryb awarii, przed którym plan ostrzegał (kryt. 2.2 „widać N przechodzących, nie skipped"), a który wciąż jest `[ ]` niezweryfikowany na realnym CI. Nazwy pól `API_URL`/`ANON_KEY` są najprawdopodobniej poprawne (standard `supabase status -o env`), więc dziś prawdopodobnie działa — brakuje jednak siatki bezpieczeństwa zamieniającej ciche pominięcie w czerwony CI.
- **Poprawka**: Dołóż krok-strażnik po eksporcie env: `test -n "$SUPABASE_TEST_URL" && test -n "$SUPABASE_TEST_ANON_KEY"` (fail jeśli puste), ewentualnie usuń `2>/dev/null`, by błąd `status` był widoczny w logu. Rozważ też `vitest run --passWithNoTests=false` na configu integracyjnym, by 0 zebranych plików również czerwieniło.
  - Siła: Jedno-liniowy guard zamienia niewidoczny fałszywy-zielony w jawny sygnał; realizuje intencję kryt. 2.2 jako sprawdzenie automatyczne, nie tylko ręczny przegląd logu.
  - Kompromis: Drobny — kilka linii w workflow.
  - Pewność: MED — pola CLI dziś zapewne poprawne, więc to utwardzenie robustności bramki, nie naprawa czynnego buga.
  - Martwy punkt: Nie potwierdzono jeszcze na realnym przebiegu CI, że testy faktycznie się URUCHAMIAJĄ (kryt. 2.2/2.4 wciąż `[ ]`).
- **Decyzja**: FIXED (Napraw teraz — guard niepustości `$API_URL`/`$ANON_KEY` + zdjęcie `2>/dev/null` w `ci.yml`)

### F2 — Reaper liczy próg po stronie klienta (`Date.now()`), nie DB-side `now()`

- **Ważność**: 🔵 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: src/lib/services/import-session.ts:253
- **Szczegóły**: Kontrakt planu (Faza 4 #1) zapisał predykat `... created_at < now() - interval '5 minutes'` (DB-side `now()`), a „Kluczowe odkrycia" uzasadniały test integracyjny tym, że „próg `now()` jest DB-side". Implementacja liczy cutoff na Workerze: `new Date(Date.now() - 5*60_000).toISOString()` i `.lt("created_at", cutoff)`. Funkcjonalnie równoważne (skew zegara Worker↔DB << 5 min), a komentarz w kodzie jasno to uzasadnia. Skutek uboczny: pierwotne uzasadnienie „test musi być integracyjny bo now() jest DB-side" częściowo nieaktualne — test i tak wymaga bazy (wstawienie `created_at` w przeszłości + RLS), więc jego integracyjność jest nadal poprawna, tylko z innego powodu. Drift od litery kontraktu, intencja (reap `processing` starszych niż 5 min) w pełni zachowana.
- **Poprawka**: Brak wymaganej — decyzja świadoma i udokumentowana. Ewentualnie 1 zdanie w komentarzu, że test pozostaje integracyjny z powodu wstawiania `created_at`/RLS, nie z powodu `now()`.
- **Decyzja**: FIXED (Dopisz komentarz — doprecyzowano w docstringu `reapStaleProcessing`, `import-session.ts:248-250`)

### F3 — Premisa planu „jedyny wywołujący getImportSessions" nieścisła (jest też endpoint paginacji)

- **Ważność**: 🔵 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: src/pages/import-sessions.astro:37
- **Szczegóły**: Plan (Faza 4 #2) opisał miejsce wywołania jako „ścieżka ładowania dziennika — jedyny wywołujący `getImportSessions`". W rzeczywistości `getImportSessions` ma dwóch wywołujących: stronę SSR `import-sessions.astro:42` (tu dodano reaper) oraz endpoint paginacji `src/pages/api/import-sessions/index.ts:33` (S-11, bez reapera). Wybór miejsca jest POPRAWNY dla intencji „opportunistycznie przy wejściu na dziennik": wejście na `/import-sessions` zawsze najpierw SSR-uje stronę (reaper odpala), a endpoint obsługuje dopiero kliencką paginację w obrębie już otwartej strony. Skutek: reaper nie odpala się przy samej paginacji klienckiej — to akceptowalne (wejście = SSR), ale warto mieć świadomość, że premisa planu była nieścisła.
- **Poprawka**: Brak — implementacja realizuje intencję. Opcjonalnie: gdyby chcieć reap także przy paginacji klienckiej, dołożyć wywołanie w `api/import-sessions/index.ts` (best-effort); nierekomendowane (redundancja).
- **Decyzja**: SKIPPED (rezygnacja z lekcji; kod bez zmian — implementacja realizuje intencję)

## Zweryfikowane kryteria sukcesu (Step 3)

- **1.2** `npx --no-install tsc --noEmit` → exit 0 (zielony) ✅
- **4.5** lint zmienionych plików (`import-session.ts`, `import-sessions.astro`, test reapera) → exit 0 ✅ (ostrzeżenie `astro-eslint-parser` o `projectService` jest oczekiwane)
- **1.1** `ci.yml` zawiera krok `tsc --noEmit` w jobie `ci` ✅ (`ci.yml:21`)
- **2.1** `ci.yml` ma kroki `supabase start` + eksport env + `test:integration` ✅ (`ci.yml:27-36`)
- **4.1** `reapStaleProcessing` istnieje, predykat `created_at < now-5min`, flip `processing→failed` ✅ (z zastrzeżeniem F2)
- **4.2** Reaper wołany przed `getImportSessions` w ścieżce dziennika, best-effort (try/catch) ✅ (`import-sessions.astro:36-40`)
- **4.3** Nowy test integracyjny (nieświeża→failed, świeża nietknięta, + izolacja per-user) istnieje ✅ — NIE uruchomiony w tym przeglądzie (wymaga wystartowanego Supabase; nie odpalam bez zgody)
- **NIEZWERYFIKOWANE (wymagają realnego PR / Supabase)**: 1.3, 1.4, 2.2, 2.4, 2.5, 4.4, 4.6 — wszystkie wciąż `[ ]` w planie. F1 dotyczy wprost 2.2.

## Uwaga o zakresie i stanie

Fazy 3 (obserwacja na żywym Workerze) i 5 (aktualizacja `test-plan.md` + sync tablicy) są NIEROZPOCZĘTE. `change.md.status` = `implementing` — zmiana jest nadal w toku, więc świadomie NIE stemplujemy jej `impl_reviewed` (byłoby to przedwczesne i rozjechałoby stan plików ↔ tablicy GitHub). Ten raport to przegląd cząstkowy zaimplementowanego kodu (Fazy 1/2/4), nie pełne domknięcie planu.
