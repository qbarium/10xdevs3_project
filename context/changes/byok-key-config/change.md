---
change_id: byok-key-config
title: Konfiguracja klucza BYOK w profilu — zapis szyfrowany, podgląd zamaskowany, usunięcie + bramkowanie
status: implementing
created: 2026-06-08
updated: 2026-06-08
---

## Notes

Źródło: `@context/foundation/roadmap.md` → S-01 (wycinek, strumień A „Ścieżka generacji"; pierwszy wycinek użytkowy po F-01).

Wynik: użytkownik może zapisać własny klucz API OpenAI w profilu (szyfrowany at-rest przez F-01), podejrzeć go w postaci zamaskowanej zachowującej identyfikację (`sk-…AB12`) i usunąć; gdy klucz nie jest skonfigurowany — widzi komunikat bramkujący z linkiem do strony OpenAI (generowanie klucza) i do profilu.

Odnośniki PRD: US-06, FR-021, FR-022, FR-024 (oraz FR-026 — masker logów z F-01, egzekwowany w endpoincie).
Wymagania wstępne: F-01 (done — crypto `encryptApiKey`/`decryptApiKey`, masker, KEK wgrany prod+lokalnie).
Odblokowuje: S-02 (pierwsza bramkowana generacja — używa zapisanego klucza + helpera statusu z S-01).

Kluczowe decyzje (8/8 z `/10x-plan`):
- Model danych: tabela `profiles` (`id = auth.users.id`, 1:1) + RLS ON per-operacja; kolumny `api_key_encrypted` / `api_key_hint` / `api_key_updated_at`.
- Transport: JSON API + `fetch` (`POST`/`GET`/`DELETE` na `/api/profile/byok-key`), `prerender=false`.
- Walidacja: bez walidacji formatu (FR-022) — tylko `trim` + odrzucenie pustego.
- Podgląd: kolumna `api_key_hint` liczona PRZY ZAPISIE nową funkcją `maskKeyForDisplay` (pełny klucz nigdy nie trafia do klienta).
- Bramkowanie: helper statusu klucza + komunikat US-06; bez przycisku generacji (to S-02).
- Routing: `/profile` (top-level, chroniona przez middleware).
- Testy: unit (czyste funkcje) + integracyjne na lokalnym Supabase (endpoint + RLS), oddzielone od CI.
- Cykl życia wiersza profilu: leniwy upsert (`insert ... on conflict do update`).

GitHub: parent Issue #5 (S-01, etykieta `slice`). Pod-zgłoszenia faz utworzone z tego planu (4 fazy → 4 sub-issue `task`).
