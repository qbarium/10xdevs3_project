<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Pierwsza bramkowana generacja (S-02)

- **Plan**: context/changes/first-gated-generation/plan.md
- **Scope**: Phases 1–8 of 8 (pełny plan)
- **Date**: 2026-06-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success Criteria: unit 115/115, integ 29/29 (lokalny Supabase), `npm run lint` 0, `npm run build` 0, CI (ci + Workers Builds) zielone na PR #43. Wszystkie kroki ręczne `## Progress` oznaczone `[x]` i potwierdzone przez użytkownika.

## Findings

### F1 — Bucket import-files bez własnego limitu rozmiaru/MIME

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — prawdziwy kompromis; zatrzymaj się, by przemyśleć
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260610173611_storage_import_files.sql:13-15
- **Detail**: Bucket tworzony tylko z (id, name, public=false). Limit 300 KB i typy .txt/.md są egzekwowane wyłącznie w warstwie aplikacji (assertValidImportFile, classify.ts:127). Polityki RLS storage sprawdzają tylko prefiks ścieżki = user_id — nie rozmiar ani typ. Globalny limit bucketa to 50 MiB. Zalogowany user wołający Storage API bezpośrednio (z poprawnym prefiksem <jego-uid>/...) może wgrać do 50 MiB dowolnego typu, omijając walidację endpointu. RLS nadal izoluje per-user (NIE przełamanie izolacji), ale otwiera wektor nadużycia pojemności.
- **Fix A ⭐ Recommended**: Ustaw `file_size_limit=307200` i (ostrożnie) `allowed_mime_types` na buckecie w migracji.
  - Strength: Egzekwuje inwariant FR-018 w warstwie magazynu, nie tylko aplikacji.
  - Tradeoff: .md bywa serwowany z pustym/octet-stream MIME — biała lista MIME może odrzucać legalne .md; bezpieczniej oprzeć się głównie na file_size_limit.
  - Confidence: HIGH — natywny mechanizm Supabase Storage.
  - Blind spot: Nie zweryfikowano realnego MIME wysyłanego przez FileDropZone dla .md.
- **Fix B**: Zaakceptuj jako świadome ryzyko (RLS izoluje, app waliduje normalną ścieżkę).
  - Strength: Zero zmian; izolacja per-user nienaruszona.
  - Tradeoff: Pozostaje wektor nadużycia pojemności przez bezpośrednie API.
  - Confidence: MED — zależy od modelu zagrożeń.
  - Blind spot: Brak limitu retencji/sprzątania osieroconych obiektów.
- **Decision**: ACCEPTED (Fix B) — świadome ryzyko; RLS izoluje per-user, normalna ścieżka UI zawsze waliduje. Bez zmiany kodu.

### F2 — Konfiguracja LLM wrażliwa na bezpieczeństwo nadpisywalna przez env bez fail-closed

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — prawdziwy kompromis; zatrzymaj się, by przemyśleć
- **Dimension**: Safety & Quality
- **Location**: src/lib/config/ai.ts:21-27, astro.config.mjs:23-27
- **Detail**: OPENAI_BASE_URL i OPENAI_STORE mają access:"public" z domyślnymi. W przeciwieństwie do CLASSIFICATION_HASH_SALT (fail-closed, user-hash.ts:13) nie ma walidacji. (a) Nadpisanie OPENAI_BASE_URL wrogą wartością wyśle odszyfrowany klucz BYOK usera w nagłówku Authorization do tego hosta (classifier.ts:66-72). (b) OPENAI_STORE=true cicho włączy retencję treści wsadu po stronie OpenAI — bez sygnału w kodzie, mimo że store:false to guardrail prywatności (FR). Oba to ryzyka konfiguracyjne, nie kodowe.
- **Fix A ⭐ Recommended**: Walidacja base URL (https + allowlist hosta) i twarda asercja store.
  - Strength: Domyka egzekwowanie inwariantów prywatności w kodzie; spójne z fail-closed soli.
  - Tradeoff: Mniejsza elastyczność (proxy/gateway OpenAI wymaga wpisu na allowlistę).
  - Confidence: MED — zależy, czy planowany jest endpoint inny niż api.openai.com.
  - Blind spot: Nie wiadomo, czy deployment używa proxy do OpenAI.
- **Fix B**: Zostaw konfigurowalne, udokumentuj jako świadome ryzyko operacyjne.
  - Strength: Elastyczność (proxy, testy, alternatywni dostawcy zgodni z API).
  - Tradeoff: Inwariant prywatności zależy od dyscypliny konfiguracji env.
  - Confidence: MED.
  - Blind spot: Brak guardrailu wykrywającego błędną konfigurację w runtime.
- **Decision**: FIXED (Fix A) — `assertSafeBaseUrl` (https + allowlista hostów w kodzie) + `assertNoStore` fail-closed w `src/lib/config/ai.ts`; test negatywny `src/lib/config/ai.test.ts`; mock hosta w `classifier.test.ts`. Testy 120/120, lint+build zielone.

### F3 — Multipart body parsowane przed bramką klucza BYOK

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Safety & Quality (niezawodność)
- **Location**: src/pages/api/ingest/classify.ts:118-135
- **Detail**: context.request.formData() parsuje całe ciało (do 50 MiB, patrz F1) zanim sprawdzony zostanie klucz BYOK (:151). Świadoma kolejność (czysty 400 przed sesją), ale dla dużego multipartu serwer buforuje plik, choć user może nie mieć klucza. Nie luka izolacji — drobny koszt DoS.
- **Fix**: Opcjonalnie sprawdzić Content-Length przed formData() jako wczesny odrzut; albo świadomie pominąć (niski priorytet).
- **Decision**: FIXED — wczesny odrzut 413 po Content-Length (> MAX_FILE_BYTES + margines koperty 16 KB) przed formData() w `classify.ts`. Bez unit-testu: Content-Length to nagłówek transportowy, niedostępny na syntetycznym Request w vitest; guard działa w runtime Workers. Testy 120/120, lint+build zielone.
