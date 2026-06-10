# Pierwsza bramkowana generacja (S-02) — Krótki plan

> Pełny plan: `context/changes/first-gated-generation/plan.md`
> Wytyczne LLM (wiążące): `docs/api/tasker-light-llm-wytyczne.md`

## Co i dlaczego

Gwiazda przewodnia TaskerLighta: pierwszy moment, w którym surowy wsad zamienia się w sklasyfikowane itemy. Zalogowany użytkownik z kluczem BYOK wkleja tekst (lub wrzuca plik `.txt`/`.md`), a aplikacja synchronicznie (timeout 60 s, blokujący wskaźnik) klasyfikuje go przez OpenAI na typowane itemy (`task`/`note`/`idea`/`decision`/`other`) i pokazuje je jako pendingi do akceptacji. Dowodzi najbardziej ryzykownego założenia produktu — że klasyfikacja AI poprawnie typuje (acceptance rate ≥ 70%).

## Punkt wyjścia

F-01 + S-01 (oba `done`) dostarczyły komplet BYOK: tabela `profiles` z kluczem zaszyfrowanym at-rest, `decryptApiKey`, masker logów (FR-026), bramkowanie US-06. W repo nie ma jeszcze żadnego wywołania zewnętrznego API, `zod`, kodu OpenAI ani Supabase Storage — S-02 wprowadza je po raz pierwszy. Runtime: Workers Free (60 s to wall-clock fetch-wait, nie CPU — Free wystarcza).

## Pożądany stan końcowy

Użytkownik wchodzi na `/ingest`, wkleja wsad, klika „Klasyfikuj" — UI blokuje interakcję ze wskaźnikiem, a po klasyfikacji przechodzi w jeden z 4 stanów (FR-006) i przy sukcesie auto-przenosi na `/items`, gdzie widzi wszystkie swoje pendingi (read-only). Każdy item powiązany z sesją importu (audit trail). Surowy wsad trafia tylko do OpenAI (`store:false`), klucz nigdy do logów, RLS izoluje dane per-user.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Zakres wycinka | Pełny (paste+plik), dwa PR-y na granicy wejścia | Gwiazda przewodnia (paste) mergowalna sama; plik osobno | Plan |
| Wywołanie OpenAI | Surowy `fetch` + `AbortController`, bez SDK | Edge runtime, kontrola timeoutu/body, zero ciężkiej zależności | Research-LLM |
| Walidacja kontraktu | Structured Outputs (`json_schema` strict) + `zod` | Model gwarantuje kształt; zod broni na granicy (FR-005) | Research-LLM |
| Model | `gpt-4o-mini` (Chat Completions), konfigurowalny env | Tani dla BYOK, okno 128k, klasyfikacja to proste zadanie | Research-LLM |
| Resolver endpointu | Chat Completions pełny + szew Responses (`text.format`) | Cienka warstwa dziś, czysty szew pod modele rozumujące | Research-LLM |
| Retry | Brak auto-retry; manualny „Spróbuj ponownie" | Zgodne z 4-stanowym UX, oszczędza budżet 60 s | Plan |
| Schemat itemów | Pełny dwuwymiarowy od razu (S-02 = tylko `pending`) | Jedna migracja; S-03/S-04/S-06 bez ALTER TABLE | Plan |
| Sesja importu | Osobna tabela `import_sessions` + FK `items.import_session_id` | Audit trail (FR-015) — guardrail odtwarzalności | PRD |
| Enumy | Angielskie w bazie, etykiety PL w UI | Separacja danych/prezentacji, spójność, i18n-ready | Plan |
| Pola extra | Nie utrwalać `confidence`/`importance`/`tags` | „MVP używa podzbioru" (FR-005) | PRD |
| Widok walidacyjny | Read-only lista pendingów | Czysta granica z S-03 | Plan |
| FR-025 identyfikator | HMAC-SHA256 + sól-env → `safety_identifier`/`user` | Stabilny per-user, przerwana deanonimizacja | Research-LLM |
| Wdrożenie | Workers Free; Paid tylko gdy prod utnie na CPU | 60 s to fetch-wait, nie CPU; koszt po fakcie | Plan |
| Testy | Unit (mock fetch) + integ (RLS/zapis) + szew `model:mock` | CI deterministyczne; pokrycie kontraktu i RLS | Plan |

## Zakres

**W zakresie:** tabele `import_sessions`+`items` z RLS; warstwa klasyfikacji (config/prompt/resolver/request/walidator/hash); endpoint `/api/ingest/classify` (timeout, atomowy zapis); strona `/ingest` + 4-stanowy modal; read-only `/items`; (PR2) Storage + dekodowanie kodowań + drag-drop.

**Poza zakresem:** akceptacja/odrzucenie/edycja (S-03); stany operacyjne (S-04); ręczne dodawanie (S-07); dziennik sesji (S-08); audio; wybór modelu w UI; gałąź Responses w pełni; auto-retry; upgrade Paid z góry; tool-calling/rozmowa wieloturowa.

## Architektura / Podejście

Kolejność zależności danych. **PR1:** Dane → Warstwa klasyfikacji (umowa `classify(rawText,opts)→ClassifiedItem[]`, resolver, Structured Outputs+zod) → Endpoint (guard, BYOK decrypt, `AbortController` 60 s, atomowy zapis przez RPC) → Frontend paste + 4-stanowy modal → read-only `/items`. **PR2:** Storage+bucket+RLS → dekodowanie+upload → drag-drop. Bezpieczeństwo na trzech poziomach: RLS (klient z cookies, bez service_role), klucz at-rest (F-01), masker+`store:false`+hash (FR-025/026).

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Dane | `import_sessions`+`items`+enumy+RLS+FK+typy | Poprawność modelu dwuwymiarowego od razu |
| 2. Warstwa klasyfikacji | config/prompt/resolver/request/zod/hash | Kontrakt JSON i mapowanie `response_format` |
| 3. Endpoint | guard, BYOK, timeout 60 s, atomowy zapis | Atomowość + fail-closed na braku klucza/KEK |
| 4. Frontend paste + modal | `/ingest`, textarea+licznik, 4 stany | Blokada bez anulowania + auto-przejście |
| 5. Widok pendingów | read-only `/items` | Czysta granica z S-03 |
| 6. Storage (PR2) | bucket+RLS+referencja pliku | RLS storage + retencja sesji |
| 7. Dekodowanie+upload (PR2) | Windows-1250/UTF-8, walidacja, server-side | Kodowanie nieczytelne → komunikat |
| 8. Drag-drop (PR2) | strefa drop `.txt`/`.md` | Walidacja typ/rozmiar; paste XOR plik |

**Wymagania wstępne:** S-01 + F-01 (done); lokalny Supabase + `BYOK_KEK` + `CLASSIFICATION_HASH_SALT` do testów; realny klucz OpenAI do smoke.
**Szacowany nakład pracy:** ~5–7 sesji; PR1 (~3–4) dowodzi gwiazdę przewodnią, PR2 (~2–3) domyka FR-003.

## Otwarte ryzyka i założenia

- `TextDecoder` workerd może nie obsługiwać `windows-1250` — fallback `iconv-lite` (PR2, `npm audit`).
- Atomowość zapisu zależy od RPC `SECURITY INVOKER` pod RLS — zweryfikować w integ-teście.
- Merge PR1 do `main` = auto-deploy na prod; gate „działa lokalnie" przed PR.
- Sól FR-025 i parametry modelu to nowe sekrety/konfiguracja do wgrania przed prod.

## Kryteria sukcesu (podsumowanie)

- Wklejony tekst klasyfikuje się i pokazuje pendingi na `/items`; 4 stany UI działają (FR-006).
- Integ-test potwierdza RLS i atomowy zapis sesji+itemów; klucz i treść wsadu nie trafiają do logów.
- (PR2) Plik `.txt`/`.md` (UTF-8 i Windows-1250) klasyfikuje się; limity FR-018 egzekwowane.
