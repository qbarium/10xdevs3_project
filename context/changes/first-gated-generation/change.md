---
change_id: first-gated-generation
title: Pierwsza bramkowana generacja — wsad → klasyfikacja OpenAI → typowane itemy (pendingi)
status: impl_reviewed
created: 2026-06-10
updated: 2026-06-12
---

## Notes

Źródło: `@context/foundation/roadmap.md` → S-02 (gwiazda przewodnia, strumień A „Ścieżka generacji"; najcięższy i najbardziej ryzykowny wycinek). Research warstwy LLM: `@docs/api/tasker-light-llm-wytyczne.md` (wiążący), `@docs/api/openai_resonses_api.txt`, `@docs/api/openai_conversation_api.txt`.

Wynik: zalogowany użytkownik ze skonfigurowanym kluczem BYOK wkleja tekst (do 100 000 znaków) lub wrzuca jeden plik `.txt`/`.md` (do 300 KB), klika submit, widzi blokujący wskaźnik aktywności podczas synchronicznej klasyfikacji (timeout 60 s), a po jej zakończeniu — wygenerowane typowane itemy jako pendingi w widoku „Elementy do akceptacji". Dowodzi najbardziej ryzykownego założenia produktu (acceptance rate ≥ 70%).

Odnośniki PRD: US-01, FR-002, FR-003, FR-005, FR-006, FR-015, FR-018, FR-020, FR-023, FR-025 (oraz FR-026 — masker z F-01).
Wymagania wstępne: S-01 (done — `profiles`, `decryptApiKey`, status klucza, bramkowanie) + F-01 (done — crypto, masker, KEK).
Odblokowuje: S-03 (walidacja: akceptacja/odrzucenie pendingów), S-07 (ręczne dodawanie), S-08 (dziennik sesji + retry).

Architektura dwóch PR-ów (decyzja użytkownika z `/10x-plan`):
- **PR1 (Fazy 1–5)** — ścieżka wklejania end-to-end, mergowalna BEZ Storage: dane, warstwa klasyfikacji, endpoint, frontend paste + 4-stanowy modal, read-only widok pendingów. Ani jednego elementu storage.
- **PR2 (Fazy 6–8)** — ścieżka plikowa: Supabase Storage + bucket + RLS, dekodowanie kodowań (Windows-1250→UTF-8), upload `.txt`/`.md` (FR-003), referencja pliku (FR-015).

Kluczowe decyzje (12/12 z `/10x-plan`):
- Zakres: pełny (paste + plik), ale rozbity na dwa niezależne PR-y na granicy ścieżki wejścia.
- Wywołanie OpenAI: surowy `fetch` + `AbortController` (bez SDK); prompt jako importowany moduł (bundlowany, nie czytany z dysku w runtime).
- Walidacja: Structured Outputs (`json_schema`, `strict`) + `zod` na granicy przed zapisem.
- Model: `gpt-4o-mini` (klasyczny, Chat Completions); konfigurowalny przez env (`CLASSIFIER_MODEL` itd.), `store: false`, `OPENAI_TEMPERATURE=0.5`.
- Resolver endpointu: w pełni gałąź Chat Completions + szew na Responses (rzuca „nieobsługiwany w MVP"); szew `model:mock` pod przyszłe E2E.
- Retry: brak auto-retry — stan „niepowodzenie" (FR-006) + manualny „Spróbuj ponownie" (sprawdza stan klucza, FR-024).
- Schemat: pełny model dwuwymiarowy od razu (`acceptance_status` × `operational_status`), S-02 używa tylko `pending`; enumy po angielsku w bazie, polskie etykiety w UI; FK `items.import_session_id` (nullable — pod przyszły S-07).
- Sesja importu: osobna tabela `import_sessions`, enum statusu 4-wartościowy.
- Pola forward-compatible (`confidence`/`importance`/`tags`): nie utrwalane (FR-005 „MVP używa podzbioru").
- Widok walidacyjny: read-only lista pendingów (akcje accept/reject/edit → S-03).
- FR-025: HMAC-SHA256 z solą-sekretem (`CLASSIFICATION_HASH_SALT`) → `safety_identifier` (Responses, `user` deprecated) / `user` (Chat Completions).
- Wdrożenie: zostajemy na Workers Free; weryfikacja na lokalnym `wrangler dev`; upgrade do Paid + `cpu_ms:60000` tylko jeśli prod realnie utnie na CPU (deploy-plan Faza 8). 60 s to wall-clock fetch-wait, nie CPU.
- Testy: unit (walidator/resolver/sanityzacja, mock fetch) + integ (RLS + atomowy zapis, lokalny Supabase) + szew `model:mock` pod E2E.

GitHub: parent Issue #6 (S-02, etykiety `slice` + `north-star`). Pod-zgłoszenia faz z tego planu (8 faz → 8 sub-issue `task`).
