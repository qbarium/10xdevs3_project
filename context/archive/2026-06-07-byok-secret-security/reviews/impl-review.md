<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: F-01 — Bezpieczna warstwa sekretu BYOK

- **Plan**: context/changes/byok-secret-security/plan.md
- **Scope**: Fazy 1–4 z 4 (pełny plan)
- **Date**: 2026-06-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 krytycznych · 2 ostrzeżenia · 3 obserwacje

Podsumowanie: implementacja wiernie realizuje plan (12/12 pozycji MATCH, zero DRIFT/MISSING/EXTRA), wszystkie 6 barier „Czego NIE robimy" respektowane na rzeczywistym kodzie. Rdzeń AES-256-GCM jest poprawny i fail-closed (świeży IV per szyfrowanie, długość klucza wymuszona 32 B, tag GCM weryfikowany, base64 bezpieczny). Kryteria sukcesu zielone: 24 testy (6 plików), `npm run lint` exit 0, `npm run build` Complete!. Dwa ostrzeżenia dotyczą warstwy obrony w głąb maskera/loggera — nieszkodliwe dla kluczy OpenAI (zawsze prefiks `sk-`), ale dotykają wprost guardraila FR-026.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Fallback entropii maskera nie łapie sekretów base64url/base64/JWT bez prefiksu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 ŚREDNI — realny kompromis; zatrzymaj się, by to przemyśleć
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/mask.ts:41
- **Detail**: Regex fallbacku entropii to `[A-Za-z0-9]{32,}` — BEZ `-` `_` `+` `/` `=`, podczas gdy ścieżka prefiksu używa `[A-Za-z0-9_-]`. Token base64url z `-`/`_` (np. klucz 256-bit) oraz standardowy base64 z `+`/`/`/`=` przechodzą NIEZAMASKOWANE — znak specjalny rozbija token na pod-segmenty <32 znaki (potwierdzone empirycznie przez audyt). Każdy sekret bez prefiksu `sk-` w formacie base64url/base64/JWT-signature to fałszywy negatyw. Łagodzące: w zakresie F-01 dostawcą jest wyłącznie OpenAI, którego klucze zawsze mają `sk-` i są maskowane ścieżką prefiksu; luka dotyczy obrony w głąb i przyszłych/nie-OpenAI materiałów.
- **Fix A ⭐ Recommended**: Dodać `_` i `-` do klasy znaków fallbacku (rozważyć też `+/=`): `[A-Za-z0-9_-]{N,}` + test negatywny.
  - Strength: Domyka realną lukę obrony w głąb; regex pozostaje liniowy (bez ReDoS); zgodne z klasą znaków ścieżki prefiksu.
  - Tradeoff: Lekko podnosi ryzyko fałszywych pozytywów dla długich hash/ID base64 w logach (mitygowane progiem entropii 3.5 bita/znak).
  - Confidence: HIGH — audyt potwierdził wyciek empirycznie na realnych tokenach.
  - Blind spot: Próg fałszywych pozytywów dla realnego ruchu logów niezmierzony.
- **Fix B**: Zaakceptować jako świadome ryzyko (zakres F-01 = tylko OpenAI z `sk-`).
  - Strength: Zero zmian; OpenAI w pełni pokryty ścieżką prefiksu.
  - Tradeoff: Luka wraca, gdy S-02 doda innego dostawcę / JWT do logów.
  - Confidence: MED — zależy, czy poza-OpenAI materiał trafi kiedyś do logów.
  - Blind spot: Brak — świadoma akceptacja, nie naprawa.
- **Decision**: FIXED via Fix A — mask.ts klasa `[A-Za-z0-9_+/=-]` + test regresyjny (mask.test.ts); 25 testów zielonych.

### F2 — reportError może rzucić na wrogim kształcie błędu (getter rzucający poza try/catch)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/logger.ts:51-55
- **Detail**: `serializeError` czyta `err.message`/`err.stack` w literale obiektu oraz pola z pętli `Object.keys` POZA blokiem try/catch (try/catch jest dopiero w `maskUnknown`, niżej). Błąd z rzucającym getterem na `message` lub własnym polu enumerowalnym → `reportError` sam rzuca wyjątek, zanim dotrze do maskera (potwierdzone empirycznie). Łamie inwariant planu „logger nigdy nie może rzucić przy logowaniu błędu" (cel FR-026 wobec wrogich obiektów błędów bibliotek). `logger.info/warn/error` są odporne — dotyczy WYŁĄCZNIE `reportError`/`serializeError`.
- **Fix**: Owinąć ciało `serializeError` (lub jej wywołanie w `reportError`) w try/catch z fallbackiem `maskUnknown(String(err))` / `"[unserializable error]"`.
- **Decision**: FIXED — logger.ts `serializeError` owinięty w try/catch (fallback `[unserializable error]`); +2 testy F2 (ścieżka pozytywna i negatywna z rzucającym getterem); 27 testów zielonych, lint czysty.

### F3 — Próg długości fallbacku (≥32 znaki) przepuszcza krótsze tokeny bez prefiksu

- **Severity**: 🔬 OBSERVATION
- **Impact**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/mask.ts:41
- **Detail**: Fallback wymaga `ENTROPY_MIN_LENGTH` = 32 znaki. Token wysokiej entropii 20–31 znaków bez prefiksu przechodzi niezamaskowany (potwierdzone). Klucze OpenAI są dłuższe i mają prefiks, więc w zakresie OK; istotne tylko dla krótszych sekretów innych dostawców.
- **Fix**: Świadomie zaakceptować dla zakresu OpenAI, lub obniżyć próg z rekalibracją bitów/znak (ryzyko fałszywych pozytywów).
- **Decision**: ACCEPTED (ryzyko) — zakres F-01 = OpenAI (klucze dłuższe + prefiks `sk-`); próg długości 32 zostaje. Do rewizji przy dodaniu innego dostawcy w S-02.

### F4 — MAX_CAUSE_DEPTH=4 obcina łańcuch `cause` cicho, bez markera

- **Severity**: 🔬 OBSERVATION
- **Impact**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/logger.ts:59
- **Detail**: Limit głębokości `cause` chroni przed cyklem, ale obcina łańcuch cicho. Fail-safe (głębszy `cause` NIE jest serializowany → nie wycieknie sekret), lecz gubi diagnostykę bez śladu „[truncated]". Nie jest to luka bezpieczeństwa.
- **Fix**: Opcjonalnie dodać marker `out.cause = "[limit głębokości cause]"` przy obcięciu dla czytelności logów. Niski priorytet.
- **Decision**: FIXED (rozszerzone) — `MAX_CAUSE_DEPTH` 4→8 + marker `[limit głębokości cause]` przy obcięciu; +test regresyjny (łańcuch >8 przyczyn); 28 testów zielonych, lint czysty.

### F5 — atob toleruje białe znaki w segmentach koperty

- **Severity**: 🔬 OBSERVATION
- **Impact**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Dimension**: Safety & Quality
- **Location**: src/lib/crypto/aes-gcm.ts:64-66
- **Detail**: WHATWG `atob` ignoruje ASCII-whitespace, więc „prawie-malformed" koperta (np. ze wstrzykniętą spacją) bywa przyjęta zamiast `EnvelopeFormatError`. Bezpieczeństwa NIE osłabia — długość IV (12 B) i weryfikacja tagu GCM pozostają ostatecznymi bramami integralności.
- **Fix**: Bez działania — zachowanie poprawne; tag GCM jest ostatecznym arbitrem integralności.
- **Decision**: SKIPPED — świadomie; zachowanie poprawne (tag GCM + długość IV to ostateczne bramy integralności), koperty generowane wewnętrznie. Bez zmian.

## Triage outcome (2026-06-08)

Wszystkie 5 ustaleń rozstrzygnięte (0 PENDING).

- **F1** — FIXED (Fix A): klasa znaków fallbacku maskera → `[A-Za-z0-9_+/=-]` + test regresyjny (base64url/base64 bez prefiksu).
- **F2** — FIXED: `serializeError` owinięty w try/catch (fallback `[unserializable error]`) + testy ścieżki pozytywnej i negatywnej (rzucający getter).
- **F3** — ACCEPTED (ryzyko): próg długości 32 zostaje (zakres OpenAI); rewizja przy dodaniu innego dostawcy w S-02.
- **F4** — FIXED (rozszerzone): `MAX_CAUSE_DEPTH` 4→8 + marker `[limit głębokości cause]` przy obcięciu + test regresyjny.
- **F5** — SKIPPED: zachowanie poprawne; bez zmian.

Naprawy (`src/lib/services/mask.ts`, `src/lib/services/logger.ts` + testy): 28 testów zielonych, lint czysty, build Complete!. Ujęte w PR domykającym F-01 (gałąź `fix/byok-secret-security-review-fixes`); po mergu trafiają na prod (Workers Builds) → F-01 `done`.
