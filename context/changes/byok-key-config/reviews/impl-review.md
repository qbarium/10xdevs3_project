<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Konfiguracja klucza BYOK w profilu (S-01)

- **Plan**: context/changes/byok-key-config/plan.md
- **Scope**: Pełny plan — 4 z 4 faz
- **Date**: 2026-06-09
- **Verdict**: NEEDS ATTENTION (nic nie blokuje merge — ostrzeżenia to ryzyko-do-akceptacji / follow-up)
- **Findings**: 0 critical · 2 warnings · 2 observations

## Weryfikacja automatyczna

| Kryterium | Wynik |
|-----------|-------|
| `npm run lint` | ✅ PASS (0 błędów; tylko ostrzeżenia parsera astro) |
| `npm run build` / typecheck | ✅ PASS (typy wygenerowane, „Complete!") |
| `npm test` (unit) | ✅ PASS (39/39 w 9 plikach) |
| `npm run test:integration` | ✅ PASS (9/9 w 2 plikach — lokalny Supabase aktywny) |
| `npx supabase db reset` | ⏭️ nie uruchamiano (operacja lokalna; migracja potwierdzona przez przechodzące testy RLS) |
| Kryteria ręczne | ✅ wszystkie `[x]` z SHA; higiena logów dodatkowo pokryta testami `byok-endpoint.{test,no-kek}` |

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — Brak ochrony CSRF na mutujących endpointach BYOK

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — stawka architektoniczna; pomyśl dokładnie przed decyzją
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/profile/byok-key.ts (POST, DELETE)
- **Detail**: POST (zapis) i DELETE (usunięcie) klucza uwierzytelniają się wyłącznie sesją z cookies (locals.user + klient Supabase z cookies), bez tokenu CSRF ani sprawdzenia Origin. Cross-site żądanie z poświadczeniami mogłoby nadpisać/usunąć klucz (nie wykrada go — pełny klucz nigdy nie wychodzi). To dług DZIEDZICZONY z całej aplikacji (signin/signout też cookie-auth bez CSRF) — nie regresja S-01. Praktyczne ryzyko mocno ograniczone przez domyślny SameSite=Lax przeglądarek (blokuje cookies przy cross-site POST/DELETE).
- **Fix A ⭐ Recommended**: Zaakceptować jako ryzyko / follow-up app-wide i potwierdzić, że cookies sesji mają SameSite=Lax (domyślne @supabase/ssr).
  - Strength: Adekwatne do faktu, że to problem całej aplikacji, nie S-01; SameSite=Lax już blokuje cross-site mutację cookie.
  - Tradeoff: Odkłada jawne tokeny CSRF; polega na domyślnych przeglądarki.
  - Confidence: MED — SameSite=Lax to standard, ale nie potwierdzono jawnej konfiguracji cookie w @supabase/ssr w tym repo.
  - Blind spot: Nie zweryfikowano efektywnego atrybutu SameSite na cookie sesji.
- **Fix B**: Dodać ochronę CSRF teraz (token lub walidacja Origin/Referer na mutujących handlerach).
  - Strength: Obrona w głąb, niezależna od domyślnych przeglądarki.
  - Tradeoff: Zmiana app-wide (dotyka też endpointów auth) — scope creep poza S-01.
  - Confidence: MED — wymaga spójnego wzorca dla wszystkich mutacji.
  - Blind spot: Interakcja z istniejącym przepływem FormData+redirect auth.
- **Decision**: ACCEPTED-AS-RISK (Fix A) — SameSite=Lax przez domyślne @supabase/ssr (nie pinowane jawnie); app-wide follow-up w follow-ups/review-fixes.md

### F2 — SSR strony nie obsługują błędu odczytu statusu → twardy 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny kompromis; zatrzymaj się, by to przemyśleć
- **Dimension**: Safety & Quality (Niezawodność)
- **Location**: src/pages/dashboard.astro:16-19, src/pages/profile.astro:17-19
- **Detail**: getKeyStatus (profile-key.ts:46) rzuca przy błędzie zapytania. Oba wywołania SSR (dashboard, profile) NIE są owinięte w try/catch, więc przejściowy błąd DB wywróci całą stronę w 500 zamiast łagodnej degradacji. Zachowanie jest fail-safe (nigdy nie pokaże „skonfigurowany", gdy nie jest — baner bramkujący pojawiłby się, nie zniknął), więc to problem DOSTĘPNOŚCI, nie wyciek. S-01 nie ma budżetu krytycznego.
- **Fix A ⭐ Recommended**: Owinąć getKeyStatus w try/catch w obu stronach SSR; na błędzie → domyślny status (configured:false / initialStatus).
  - Strength: Łagodna degradacja; serwis pozostaje surowy (rzuca) dla ścieżki API GET, gdzie 500 jest pożądane.
  - Tradeoff: Drobny — kilka linii na stronę.
  - Confidence: HIGH — wzorzec defensywny, lokalny, bez efektów ubocznych.
  - Blind spot: Brak znaczących.
- **Fix B**: Zmienić getKeyStatus, by zwracał configured:false na błędzie odczytu.
  - Strength: Jedno miejsce, prostsze.
  - Tradeoff: Połyka błąd także dla endpointu GET (traci sygnał 500).
  - Confidence: MED — zmienia kontrakt serwisu dla wszystkich wołających.
  - Blind spot: Wpływ na diagnostykę realnych awarii DB.
- **Decision**: FIXED via Fix A — try/catch w dashboard.astro + profile.astro (łagodna degradacja, serwis pozostaje surowy dla GET API)

### F3 — Middleware dopasowuje trasy prefiksowo (startsWith)

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; rzecz jest oczywista i wąsko zakrojona
- **Dimension**: Pattern Consistency
- **Location**: src/middleware.ts:18
- **Detail**: PROTECTED_ROUTES dopasowywane przez startsWith, więc /profile łapie też hipotetyczne /profile-foo. Plan (plan.md:244) WPROST prosił o weryfikację „prefiksowy czy dokładny". Tu nadmiarowe dopasowanie jest BEZPIECZNE (chroni więcej, nie mniej) i brak tras kolidujących.
- **Fix**: Zaakceptować (prefiks bezpiecznie nadmiarowo chroni) lub zawęzić do dokładnego dopasowania, jeśli planowane są trasy typu /profile*.
- **Decision**: SKIPPED — prefiks bezpiecznie nadmiarowo chroni; brak tras kolidujących

### F4 — Brak testu RLS „anon bez sesji" z planowanej strategii

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; rzecz jest oczywista i wąsko zakrojona
- **Dimension**: Success Criteria
- **Location**: tests/integration/profiles-rls.integration.test.ts
- **Detail**: Test pokrywa izolację A↔B (select + update), ale strategia testowania planu (plan.md:312) wymieniała też „anon bez sesji nie czyta profiles" — ten przypadek nie ma dedykowanego testu. Polityki RLS są `to authenticated`, więc anon jest strukturalnie wykluczony; brak jedynie asercji to potwierdzającej. Wszystkie KRYTERIA sukcesu (1.4, 2.2) przechodzą.
- **Fix**: Dodać przypadek anon-client select → [] / error, lub świadomie zaakceptować (polityki `to authenticated` już wykluczają anon).
- **Decision**: FIXED — dodano test „anon bez sesji nie czyta profiles" (test:integration 10/10)

## Kontekst pozytywny (nie ustalenia)

- **Zgodność z planem 13/13 MATCH** — zero drift/missing; wszystkie bariery „Czego NIE robimy" utrzymane (brak walidacji formatu, brak generacji, jeden klucz/provider, leniwy upsert, ręczny typ, brak audit logu).
- **Cztery krytyczne wymagania bezpieczeństwa BYOK spełnione i przetestowane**: (a) pełny klucz nigdy do klienta/logów/błędów, (b) izolacja per-user przez RLS, (c) fail-closed (encrypt PRZED upsert), (d) generyczne komunikaty błędów.
- **Endpoint surowszy niż istniejący wzorzec auth** — `signin.ts` echo'uje `error.message` do query stringa; endpoint BYOK świadomie tego unika.
- **Pliki EXTRA uzasadnione**: `byok-endpoint.test.ts` / `byok-endpoint.no-kek.test.ts` automatyzują ręczne kryteria 2.6/2.7 (higiena logów, fail-closed); integ-testy w strategii planu; zmiany CLAUDE.md/AGENTS.md/lessons.md to dokumentacja lekcji (zod-vs-manual), roadmap.md to wymagany sync boardu.
