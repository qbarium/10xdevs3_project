# Konfiguracja klucza BYOK w profilu — Krótki plan

> Pełny plan: `context/changes/byok-key-config/plan.md`

## Co i dlaczego

Dajemy zalogowanemu użytkownikowi zarządzanie własnym kluczem API OpenAI w profilu: zapis (szyfrowany at-rest przez F-01), podgląd zamaskowany zachowujący identyfikację (`sk-…AB12`) i usunięcie. Bez klucza nie da się klasyfikować wsadu — S-01 odblokowuje gwiazdę przewodnią (S-02), dostarczając bezpieczny nośnik klucza i komunikat bramkujący (US-06, FR-021/022/024).

## Punkt wyjścia

F-01 dostarczyło komplet kryptografii (`encryptApiKey`/`decryptApiKey`, koperta `v1.iv.ct`, fail-closed) + masker logów (FR-026); `BYOK_KEK` wgrany prod+lokalnie. Baza danych to wciąż pusty placeholder — brak jakiejkolwiek tabeli domenowej. S-01 wprowadza pierwszą (`profiles`) i pierwszy JSON+fetch endpoint w projekcie.

## Pożądany stan końcowy

Użytkownik wchodzi na `/profile`, wkleja klucz i go zapisuje — zostaje zaszyfrowany w jego wierszu `profiles`, a strona pokazuje go zamaskowanego bez przeładowania. Może go usunąć. Dopóki klucza nie ma, dashboard pokazuje baner „Skonfiguruj Klucz API OpenAI" z linkiem do strony OpenAI i do profilu. Pełny klucz nigdy nie opuszcza serwera ani nie pojawia się w logach; RLS izoluje klucz każdego usera.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Model danych | Tabela `profiles` (1:1 z `auth.users`) + RLS | Kanoniczny wzorzec Supabase; roadmap zakłada „kolumnę w profilu" | Plan |
| Transport API | JSON + `fetch` (`POST`/`GET`/`DELETE`) | Panel CRUD stanu; zapis/usuń bez przeładowania; GET status dla S-02 | Plan |
| Walidacja klucza | Brak walidacji formatu (tylko trim+niepusty) | FR-022 — błędny klucz ujawnia się dopiero w S-02 | PRD |
| Podgląd zamaskowany | Kolumna `api_key_hint` liczona przy zapisie | Wyświetlenie bez deszyfracji/KEK; pełny klucz nie opuszcza serwera | Plan |
| Bramkowanie | Helper statusu + komunikat US-06, bez przycisku generacji | Nie wyprzedza S-02; dostarcza kontrakt bramki | Plan |
| Routing | `/profile` (top-level, chroniona) | Prosto; miejsce na przyszłe ustawienia konta | Plan |
| Testy | Unit + integracyjne na lokalnym Supabase (poza CI) | Pewność RLS i endpointu; CI bez DB → tylko unit+lint+build | Plan |
| Wiersz profilu | Leniwy upsert (`on conflict do update`) | Zero triggerów w schemacie `auth`; działa dla istniejących userów | Plan |

## Zakres

**W zakresie:** tabela `profiles` + RLS; serwis zapis/status/usuń; endpoint `/api/profile/byok-key`; funkcja `maskKeyForDisplay`; strona `/profile` + island; baner bramkujący US-06.

**Poza zakresem:** walidacja poprawności klucza (FR-022); realny submit/klasyfikacja (S-02); wybór modelu/providera; rotacja KEK; wiele kluczy; trigger DB; `supabase gen types`; inne pola profilu; testy integracyjne w CI.

## Architektura / Podejście

Cztery warstwy w kolejności zależności: **Dane** (migracja+RLS) → **Backend** (display-mask, serwis nad crypto F-01, JSON endpoint z guardem `locals.user` i fail-closed) → **Frontend** (`/profile` SSR + React island przez `fetch`) → **Bramkowanie** (baner na dashboardzie sterowany statusem). Bezpieczeństwo na trzech poziomach: RLS (izolacja per-user), szyfrowanie at-rest (F-01), masker logów (FR-026). Klient Supabase z cookies usera egzekwuje RLS — bez service_role w ścieżce użytkowej.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Dane | Tabela `profiles` + RLS + typ `Profile` | Pierwsza tabela — poprawność polityk RLS |
| 2. Backend | `maskKeyForDisplay`, serwis, endpoint JSON | Fail-closed przed zapisem; FR-026 w logach |
| 3. Frontend profilu | `/profile` + island zapis/podgląd/usuń | UX stanów (pending/error), ochrona trasy |
| 4. Bramkowanie | Baner US-06 na dashboardzie | Spójność statusu z profilem |

**Wymagania wstępne:** F-01 (done), `BYOK_KEK` wgrany (jest), lokalny Supabase do integ-testów.
**Szacowany nakład pracy:** ~2–3 sesje w 4 fazach.

## Otwarte ryzyka i założenia

- Integracyjne testy wymagają lokalnego stacku Supabase + `BYOK_KEK` — nie odpalą się w CI (świadome; CI = unit+lint+build).
- Dopasowanie trasy w `middleware.ts` (prefiks vs dokładne) wymaga weryfikacji przy dodaniu `/profile`.
- `api_key_hint` trzyma jawny fragment klucza (prefiks+sufiks) — celowo ujawniany wg FR-021, nie sekret.

## Kryteria sukcesu (podsumowanie)

- Użytkownik zapisuje/podgląda-zamaskowany/usuwa klucz na `/profile`; pełny klucz nie trafia do klienta ani logów.
- Integ-test potwierdza izolację RLS (user A ≠ user B) i roundtrip endpointu.
- Dashboard pokazuje/ukrywa baner US-06 zgodnie ze statusem klucza.
