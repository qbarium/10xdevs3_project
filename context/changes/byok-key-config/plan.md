# Konfiguracja klucza BYOK w profilu — Plan implementacji

## Przegląd

S-01 daje zalogowanemu użytkownikowi pełne zarządzanie własnym kluczem API OpenAI w profilu: **zapis** (szyfrowany at-rest przez warstwę F-01), **podgląd zamaskowany** zachowujący zdolność identyfikacji (`sk-…AB12`) oraz **usunięcie**. Gdy klucz nie jest skonfigurowany, aplikacja pokazuje **komunikat bramkujący** z linkiem do strony OpenAI (gdzie user generuje klucz) i do profilu. Zmiana wprowadza **pierwszą domenową tabelę** projektu (`profiles`) z RLS i jest pierwszym wycinkiem użytkowym strumienia A.

## Analiza stanu obecnego

- **Crypto BYOK gotowe (F-01):** `encryptApiKey(plain): Promise<EncryptedEnvelope>` i `decryptApiKey(envelope): Promise<string>` (`src/lib/services/byok-crypto.ts:48,53`) — koperta `v1.<iv>.<ct>` (AES-256-GCM), fail-closed na braku/nieprawidłowym `BYOK_KEK` (`KekNotConfiguredError`). KEK wgrany na prod (Cloudflare Workers Secret) i lokalnie (`.dev.vars`); `/api/health` → `hasKek:true`.
- **Masker F-01 ≠ podgląd profilu:** `maskSecrets`/`maskUnknown` (`src/lib/services/mask.ts:35,60`) redagują ciągi w kształcie klucza do `[REDACTED]` na potrzeby **logów** (FR-026). FR-021 wymaga podglądu **zachowującego identyfikację** (prefiks + ostatnie znaki) — to osobna, nieistniejąca jeszcze funkcja.
- **Logger (F-01):** `logger.{info,warn,error}` + `reportError` (`src/lib/services/logger.ts`) — jedyny dozwolony punkt `console`, każde pole przechodzi przez masker. Endpoint S-01 musi logować wyłącznie przez nie i nigdy nie przekazywać klucza jako pola.
- **DB to pusty placeholder:** `supabase/migrations/20260604214624_init.sql` nie tworzy żadnej tabeli domenowej. S-01 wprowadza pierwszą migrację domenową; per CLAUDE.md każda nowa tabela = RLS ON + granularne polityki per-operacja/per-rola.
- **Wzorzec API route:** `export const POST: APIRoute` (uppercase), `export const prerender = false` (`src/pages/api/health.ts:4`). Istniejące endpointy auth (`src/pages/api/auth/*`) używają `FormData` + `context.redirect(...?error=)`, bez zod, bez JSON — S-01 świadomie odchodzi od tego ku JSON API (panel CRUD stanu, nie jednorazowy submit).
- **Klient Supabase:** `createClient(requestHeaders, cookies)` (`src/lib/supabase.ts`) z `@supabase/ssr`, zwraca `null` przy braku konfiguracji; egzekwuje RLS przez JWT usera w cookies (anon key + sesja). Brak service_role w ścieżce użytkowej.
- **Auth/sesja:** `src/middleware.ts` ustawia `context.locals.user` (`User | null`) i redirectuje niezalogowanych z `PROTECTED_ROUTES = ["/dashboard"]`. `App.Locals` (`src/env.d.ts`) ma tylko `user`. Strony chronione (`src/pages/dashboard.astro`) czytają `Astro.locals.user`; guard realizuje middleware.
- **Frontend:** React islands `client:load`, pending przez `useFormStatus` (`src/components/auth/SubmitButton.tsx`), błędy serwera przez `ServerError`. Brak katalogu `src/components/hooks/` (reguła CLAUDE.md wymaga tam hooków — utworzymy). shadcn/ui „new-york": zainstalowany tylko `button` — brakuje `input`/`label`/`card`/`alert`. Helper `cn()` w `src/lib/utils.ts`.
- **Config nazewnictwa (F-01):** `AI_PROVIDER_NAME = "OpenAI"` i prefiksy klucza w `src/lib/config/byok.ts` — naturalne miejsce na URL providera.

## Pożądany stan końcowy

Po zakończeniu planu zalogowany użytkownik wchodzi na `/profile`, wkleja klucz OpenAI i klika „Zapisz" — klucz zostaje zaszyfrowany i zapisany w jego wierszu `profiles`, a strona pokazuje go w postaci zamaskowanej (`sk-…AB12`) bez przeładowania. Może go usunąć (wraca do formularza). Na dashboardzie, dopóki klucz nie jest skonfigurowany, widnieje baner „Skonfiguruj Klucz API OpenAI" z linkiem do strony OpenAI i do profilu; po zapisaniu klucza baner znika. Pełny klucz nigdy nie opuszcza serwera ani nie pojawia się w logach. RLS gwarantuje, że żaden użytkownik nie widzi ani nie modyfikuje klucza innego.

**Weryfikacja:** `/profile` (po zalogowaniu) pozwala zapisać/podejrzeć-zamaskowany/usunąć klucz; `GET /api/profile/byok-key` zwraca `{configured, hint, updatedAt}`; integ-test RLS potwierdza izolację per-user; dashboard pokazuje/ukrywa baner zgodnie ze statusem klucza; logi nie zawierają fragmentu klucza.

### Kluczowe odkrycia:

- F-01 dostarcza komplet kryptografii — S-01 tylko ją woła (`encryptApiKey`), nie dotyka prymitywów (`src/lib/services/byok-crypto.ts:48`).
- Podgląd zamaskowany to **nowa** funkcja, semantycznie przeciwna do log-maskera: ujawnia prefiks+sufiks zamiast je redagować (`src/lib/services/mask.ts` redaguje do `[REDACTED]`).
- Profil/RLS to wzorzec Supabase „tabela 1:1 z `auth.users`" — w projekcie pojawia się pierwszy raz (`supabase/migrations/` ma tylko placeholder).
- Klient z cookies usera egzekwuje RLS automatycznie (`src/lib/supabase.ts`) — nie wolno obchodzić go service_role.
- Endpointy auth używają `FormData`+redirect (`src/pages/api/auth/signin.ts`); S-01 wprowadza pierwszy JSON+fetch endpoint — `prerender=false` obowiązkowe.

## Czego NIE robimy

- **Walidacji poprawności klucza przy zapisie** (FR-022) — żadnego sprawdzania prefiksu/długości/formatu ani testowego wywołania OpenAI. Błędny klucz ujawnia się dopiero w S-02.
- **Realnego submitu / klasyfikacji / generacji** — to S-02. S-01 dostarcza jedynie helper statusu i komunikat bramkujący, nie buduje przycisku generacji ani strony wsadu.
- **Wyboru modelu/providera w UI** (FR-023) — provider jest stały (`AI_PROVIDER_NAME`), poza zakresem.
- **Rotacji KEK** (PRD OQ7) — statyczny KEK z F-01, rotacja to V2.
- **Wielu kluczy / wielu providerów** — jeden klucz, jeden provider, jeden user.
- **Triggera DB `on auth.users insert`** — wiersz profilu powstaje leniwym upsertem przy pierwszym zapisie.
- **Pipeline'u `supabase gen types`** — lekki ręczny typ `Profile` w `src/types.ts`.
- **Innych pól profilu** (nazwa, avatar, ustawienia) ani audit logu zmian klucza — tabela `profiles` zawiera teraz wyłącznie kolumny klucza.
- **Integracyjnych testów w CI** — wymagają lokalnego Supabase; CI (bez DB) uruchamia tylko unit+lint+build.

## Podejście do implementacji

Cztery fazy w kolejności zależności danych: **Dane → Backend → Frontend profilu → Bramkowanie**. Każda faza jest samodzielnie testowalna i kończy się jednym commitem (per-faza), odwzorowanym jako sub-issue na boardzie. Crypto pochodzi z F-01 (tylko wołane). Bezpieczeństwo egzekwowane na trzech poziomach: RLS (izolacja per-user), szyfrowanie at-rest (F-01), masker logów (FR-026). Transport to JSON+`fetch` (panel CRUD stanu); guard endpointów przez `locals.user`; klient Supabase z cookies usera (RLS, nie service_role).

## Krytyczne szczegóły implementacji

- **Leniwy upsert — brak wiersza to stan normalny.** Brak wiersza `profiles` dla usera oznacza „klucz nieskonfigurowany". `getKeyStatus` i `deleteApiKey` muszą być idempotentne na braku wiersza (status → `configured:false`; delete → no-op). Zapis tworzy wiersz przez `upsert` (`insert ... on conflict (id) do update`).
- **Fail-closed PRZED zapisem.** Szyfrowanie (`encryptApiKey`) wykonuje się przed `upsert` — jeśli rzuci `KekNotConfiguredError`, nic nie trafia do DB (brak częściowej koperty, której nie da się odszyfrować). Mapowanie: `KekNotConfiguredError` → 503 generyczny; pozostałe → 500 generyczny.
- **`api_key_hint` to celowo ujawniony fragment w plaintext** (prefiks+sufiks, FR-021) — to NIE sekret. Ale pełny klucz NIGDY nie jest zapisywany w plaintext ani zwracany do klienta; klient dostaje wyłącznie `hint`.
- **FR-026 w endpoincie.** `apiKey` nie może trafić do żadnego pola `logger.*`/`reportError`, do treści odpowiedzi błędu ani do query stringów. `reportError` maskuje obiekt błędu, ale klucza i tak nie przekazujemy jako pole.
- **RLS przez klienta usera.** Endpoint używa `createClient(request.headers, cookies)` (JWT usera) — RLS egzekwuje izolację. Nie używać service_role w ścieżce użytkowej.
- **Integ-testy poza CI.** Testy `*.integration.test.ts` wymagają lokalnego Supabase (`localhost:54321`) + `BYOK_KEK`; `npm test` (CI) je wyklucza, `npm run test:integration` je uruchamia lokalnie przed mergem.
- **`prerender=false`** na endpoincie i SSR-stronach (`/profile`), inaczej Cloudflare potraktuje je statycznie.

---

## Faza 1: Dane — tabela `profiles` + RLS + typ

### Przegląd

Pierwsza domenowa migracja: tabela `profiles` 1:1 z `auth.users`, RLS ON z granularnymi politykami per-operacja, kolumny na zaszyfrowany klucz i hint. Lekki ręczny typ `Profile`.

### Wymagane zmiany:

#### 1. Migracja `profiles`

**Plik**: `supabase/migrations/<YYYYMMDDHHmmss>_profiles.sql` (utworzyć przez `npx supabase migration new profiles`)

**Cel**: utworzyć nośnik klucza BYOK per użytkownik z twardą izolacją RLS. Kolumny klucza są nullowalne (brak = klucz nieskonfigurowany).

**Kontrakt**: tabela `public.profiles` z `id uuid primary key references auth.users(id) on delete cascade`, `api_key_encrypted text`, `api_key_hint text`, `api_key_updated_at timestamptz`. RLS ON + cztery polityki per-operacja związane z `auth.uid() = id`. Pierwsza tabela domenowa — SQL pokazany, bo ustanawia wzorzec RLS dla kolejnych wycinków:

```sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  api_key_encrypted text,
  api_key_hint text,
  api_key_updated_at timestamptz
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);
```

Uwaga: ścieżka „usuń klucz" w S-01 to UPDATE (zerowanie kolumn), nie DELETE wiersza; polityka `delete` istnieje dla kompletności per-operacja (hard rule), nieużywana w tym wycinku.

#### 2. Typ `Profile`

**Plik**: `src/types.ts`

**Cel**: lekki, ręczny typ wiersza profilu dla warstwy serwisu (bez pipeline'u `supabase gen types`).

**Kontrakt**: `export interface Profile { id: string; api_key_encrypted: EncryptedEnvelope | null; api_key_hint: string | null; api_key_updated_at: string | null; }`. Reużyć istniejący `EncryptedEnvelope` (brand z F-01). Dodać też wąski typ statusu: `export interface ByokKeyStatus { configured: boolean; hint: string | null; updatedAt: string | null; }`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Migracja aplikuje się czysto lokalnie: `npx supabase db reset`
- Linting przechodzi: `npm run lint`
- Build/typecheck przechodzi: `npm run build`
- Integ-test RLS przechodzi: `npm run test:integration`

#### Weryfikacja ręczna:

- RLS zweryfikowane: użytkownik A nie odczytuje ani nie modyfikuje wiersza użytkownika B (Studio/SQL lub integ-test)
- Migracja wypchnięta na cloud `npx supabase db push` — za jawną zgodą użytkownika

---

## Faza 2: Backend — display-mask + config + serwis + endpoint

### Przegląd

Nowa funkcja podglądu zamaskowanego, URL providera w configu, serwis profilu (zapis/status/usuń) oparty na crypto F-01 i RLS, oraz JSON endpoint `/api/profile/byok-key` z guardem i obsługą fail-closed.

### Wymagane zmiany:

#### 1. `maskKeyForDisplay`

**Plik**: `src/lib/services/byok-display.ts` (nowy; osobny od `mask.ts`, bo semantyka jest przeciwna — ujawnia zamiast redagować)

**Cel**: zamienić jawny klucz na podgląd zachowujący identyfikację (FR-021), liczony raz przy zapisie.

**Kontrakt**: `export function maskKeyForDisplay(plain: string): string`. Edge-logika jest nieoczywista (krótki klucz nie może ujawnić „prawie całości"), więc fragment:

```ts
// Prefiks (pierwsze 3) + "…" + sufiks (ostatnie 4); np. "sk-…AB12".
// Klucz <= 8 znaków: zwróć same kropki o długości wejścia (za krótki na bezpieczny podgląd).
export function maskKeyForDisplay(plain: string): string {
  const key = plain.trim();
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}
```

#### 2. URL providera w configu

**Plik**: `src/lib/config/byok.ts`

**Cel**: trzymać link do generowania klucza obok `AI_PROVIDER_NAME` (niesekretna konfiguracja nazewnictwa).

**Kontrakt**: `export const AI_PROVIDER_KEYS_URL = "https://platform.openai.com/api-keys";`

#### 3. Serwis profilu

**Plik**: `src/lib/services/profile-key.ts` (nowy)

**Cel**: hermetyzować operacje na kluczu w profilu — szyfrowanie, hint, upsert, status, usunięcie — nad klientem Supabase z RLS.

**Kontrakt**: trzy funkcje przyjmujące `SupabaseClient` (z cookies usera) i `userId`:
- `saveApiKey(supabase, userId, plain): Promise<ByokKeyStatus>` — `encryptApiKey(plain)` → `maskKeyForDisplay(plain)` → `upsert({ id: userId, api_key_encrypted, api_key_hint, api_key_updated_at: new Date().toISOString() }, { onConflict: "id" })`; zwraca `{configured:true, hint, updatedAt}`. Szyfrowanie przed upsertem (fail-closed).
- `getKeyStatus(supabase, userId): Promise<ByokKeyStatus>` — `select api_key_hint, api_key_updated_at` where `id=userId`; brak wiersza → `{configured:false, hint:null, updatedAt:null}`.
- `deleteApiKey(supabase, userId): Promise<void>` — `update set api_key_encrypted=null, api_key_hint=null, api_key_updated_at=null` where `id=userId` (idempotentne).

Nigdy nie selektuje `api_key_encrypted` do warstwy odpowiedzi; deszyfracja nie jest potrzebna w S-01 (podgląd z hintu).

#### 4. Endpoint `/api/profile/byok-key`

**Plik**: `src/pages/api/profile/byok-key.ts` (nowy)

**Cel**: REST-owy zapis/status/usunięcie klucza, bramkowany sesją, z generycznymi błędami (FR-026).

**Kontrakt**: `export const prerender = false`. Trzy handlery `APIRoute`:
- `POST` — guard `locals.user` (brak → 401 JSON); `apiKey` z `request.json()`, `trim`; pusty → 400 generyczny; `createClient(request.headers, cookies)` (null → 500); `saveApiKey` w `try`; sukces → 200 `{ok:true, ...status}`; `catch KekNotConfiguredError` → `logger.warn("BYOK save: KEK niedostępny")` (bez klucza) + 503 generyczny; pozostałe → `reportError(err)` + 500 generyczny.
- `GET` — guard; `getKeyStatus` → 200 `{configured, hint, updatedAt}`.
- `DELETE` — guard; `deleteApiKey` → 200 `{ok:true, configured:false}`.

Wszystkie odpowiedzi `Content-Type: application/json`. Żaden komunikat błędu nie zawiera klucza.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Unit `maskKeyForDisplay` przechodzi (prefiks+sufiks, klucz <=8, trim): `npm test`
- Integ-test endpointu (POST→GET→DELETE na lokalnym Supabase) przechodzi: `npm run test:integration`
- Linting przechodzi: `npm run lint`
- Build/typecheck przechodzi: `npm run build`

#### Weryfikacja ręczna:

- Lokalnie zapis→status→usuń przez `curl`/REST zwraca poprawne kody i `hint`
- Log z udanego i nieudanego zapisu NIE zawiera fragmentu klucza (oględziny konsoli / `wrangler tail`)
- Zapis przy podmienionym/niepoprawnym `BYOK_KEK` → 503 generyczny (bez wycieku)

---

## Faza 3: Frontend profilu — strona `/profile` + island zarządzania kluczem

### Przegląd

Chroniona strona `/profile` z React island `ApiKeyManager`: zapis (input typu password), podgląd zamaskowany, usunięcie — przez `fetch` do endpointu z Fazy 2. Doinstalowanie brakujących komponentów shadcn.

### Wymagane zmiany:

#### 1. Komponenty shadcn

**Plik**: `src/components/ui/{input,label,card,alert}.tsx` (przez `npx shadcn@latest add input label card alert`)

**Cel**: prymitywy formularza i komunikatów w stylu „new-york". **Kontrakt**: po dodaniu uruchomić `npm audit` (hard rule — audyt przed/po nowej zależności radix).

#### 2. Hook `useApiKey`

**Plik**: `src/components/hooks/useApiKey.ts` (nowy katalog — reguła CLAUDE.md: hooki w `src/components/hooks/`)

**Cel**: wydzielić logikę `fetch` (zapis/usuń) + stan (`status`, `pending`, `error`) z komponentu.

**Kontrakt**: `useApiKey(initial: ByokKeyStatus)` → `{ status, pending, error, save(plain), remove() }`. `save`/`remove` wołają `POST`/`DELETE` `/api/profile/byok-key`, aktualizują `status` z odpowiedzi, mapują błąd serwera na komunikat (bez klucza).

#### 3. Island `ApiKeyManager`

**Plik**: `src/components/profile/ApiKeyManager.tsx` (nowy)

**Cel**: UI zarządzania kluczem sterowane stanem `configured`.

**Kontrakt**: props `initialStatus: ByokKeyStatus`. Gdy `configured` — `Card` z `hint` (`sk-…AB12`), datą i przyciskiem „Usuń" (z potwierdzeniem). Gdy nie — `input type="password"` + „Zapisz". `pending` blokuje przyciski; `error` w `Alert`. Klasy przez `cn()`.

#### 4. Strona `/profile`

**Plik**: `src/pages/profile.astro` (nowy)

**Cel**: SSR-host islandu z guardem i wstępnym statusem (bez migotania).

**Kontrakt**: `prerender=false`; `const { user } = Astro.locals`; serwerowo `createClient(Astro.request.headers, Astro.cookies)` + `getKeyStatus` → `initialStatus` jako prop do `<ApiKeyManager client:load />`; w `Layout` + `Topbar`.

#### 5. Ochrona trasy + nawigacja

**Pliki**: `src/middleware.ts`, `src/components/Topbar.astro`

**Cel**: chronić `/profile` i dodać do niej link.

**Kontrakt**: dodać `"/profile"` do `PROTECTED_ROUTES`; zweryfikować, że dopasowanie trasy obejmuje dokładnie `/profile` (sprawdzić, czy match jest prefiksowy czy dokładny). W `Topbar` (gałąź zalogowanego) dodać link „Profil" → `/profile`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Build/typecheck przechodzi: `npm run build`
- Linting przechodzi: `npm run lint`
- Unit hooka/util (jeśli wydzielony testowalnie) przechodzi: `npm test`

#### Weryfikacja ręczna:

- `/profile` bez zalogowania → redirect na `/auth/signin`
- Zapis klucza w UI pokazuje zamaskowany hint bez przeładowania
- „Usuń" wraca do formularza, status „nieskonfigurowany"
- Input typu password nie ujawnia klucza; `pending` blokuje przycisk
- `npm audit` czysty po dodaniu komponentów shadcn

---

## Faza 4: Bramkowanie US-06 — baner braku klucza

### Przegląd

Komunikat „Skonfiguruj Klucz API OpenAI" na dashboardzie, sterowany statusem klucza z Fazy 2, z linkiem do strony OpenAI i do profilu.

### Wymagane zmiany:

#### 1. Baner braku klucza

**Plik**: `src/components/profile/MissingKeyBanner.astro` (nowy)

**Cel**: wyświetlić komunikat bramkujący z dwoma linkami (US-06).

**Kontrakt**: props `keysUrl` (z `AI_PROVIDER_KEYS_URL`), `providerName` (`AI_PROVIDER_NAME`); treść „Skonfiguruj Klucz API {providerName} w ustawieniach", link zewnętrzny do `keysUrl` (nowa karta, `rel="noopener"`) + link wewnętrzny do `/profile`. Render warunkowy po stronie wołającego.

#### 2. Wpięcie na dashboardzie

**Plik**: `src/pages/dashboard.astro`

**Cel**: pokazać baner, dopóki klucz nieskonfigurowany.

**Kontrakt**: serwerowo `createClient(...)` + `getKeyStatus(user.id)`; gdy `!configured` → render `<MissingKeyBanner .../>`. Gdy klucz jest — baner pominięty.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Build/typecheck przechodzi: `npm run build`
- Linting przechodzi: `npm run lint`

#### Weryfikacja ręczna:

- Dashboard bez klucza → baner „Skonfiguruj Klucz API OpenAI" z linkiem do `platform.openai.com/api-keys` + do `/profile`
- Po zapisaniu klucza → baner znika
- Linki działają (OpenAI w nowej karcie; `/profile` wewnętrznie)

---

## Strategia testowania

### Testy jednostkowe (CI — `npm test`):

- `maskKeyForDisplay`: prefiks+sufiks dla typowego klucza, klucz `<=8` znaków (same kropki), `trim`, brak ujawnienia środka.
- Czyste helpery (np. mapowanie statusu) bez zależności od DB/sieci.

### Testy integracyjne (lokalnie — `npm run test:integration`, wymaga Supabase + `BYOK_KEK`):

- **RLS**: użytkownik A nie odczytuje/nie modyfikuje wiersza B; anon bez sesji nie czyta `profiles`.
- **Endpoint**: `POST` zapisuje (status `configured:true`, poprawny `hint`), `GET` zwraca status, `DELETE` zeruje (status `configured:false`); roundtrip koperty odszyfrowuje się tym samym KEK.

### Kroki testowania ręcznego:

1. Zaloguj się, wejdź `/profile`, zapisz klucz `sk-…` → pojawia się zamaskowany hint.
2. Odśwież → status trwały (z `initialStatus`). Usuń → formularz wraca.
3. Dashboard bez klucza → baner; po zapisaniu → baner znika.
4. Wyloguj, wejdź `/profile` → redirect na signin.
5. Oględziny logów: brak fragmentu klucza w jakimkolwiek wpisie.

## Uwagi dotyczące wydajności

Bez budżetu krytycznego. Podgląd z `api_key_hint` unika deszyfracji przy każdym renderze profilu/dashboardu (brak operacji KEK na ścieżce odczytu). Operacje to pojedyncze zapytania po PK (`id`).

## Uwagi dotyczące migracji

Pierwsza domenowa migracja. Lokalnie `supabase db reset` (idempotentne); na cloud `supabase db push` za jawną zgodą (operacja na prod DB). Brak danych do migracji (nowa tabela). Rollback: tabela `profiles` jest izolowana — `drop table public.profiles` cofa zmianę bez wpływu na auth.

## Referencje

- Roadmapa: `context/foundation/roadmap.md` → S-01 (`byok-key-config`)
- PRD: US-06, FR-021, FR-022, FR-024, FR-026; `## Access Control → BYOK`
- Crypto F-01: `src/lib/services/byok-crypto.ts:48,53`, `src/lib/crypto/aes-gcm.ts`
- Masker/logger F-01: `src/lib/services/mask.ts:35`, `src/lib/services/logger.ts`
- Wzorce: `src/pages/api/auth/signin.ts`, `src/lib/supabase.ts`, `src/middleware.ts`, `src/pages/dashboard.astro`, `src/components/auth/SignInForm.tsx`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>`, gdy krok zostanie zrealizowany. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Dane — tabela `profiles` + RLS + typ

#### Automatyczne

- [x] 1.1 Migracja aplikuje się czysto lokalnie (`npx supabase db reset`) — 89f1648
- [x] 1.2 Linting przechodzi (`npm run lint`) — 89f1648
- [x] 1.3 Build/typecheck przechodzi (`npm run build`) — 89f1648
- [x] 1.4 Integ-test RLS przechodzi (`npm run test:integration`) — 89f1648

#### Ręczne

- [x] 1.5 RLS zweryfikowane: user A nie widzi/nie modyfikuje wiersza usera B — 89f1648
- [ ] 1.6 Migracja wypchnięta na cloud (`supabase db push`) — za jawną zgodą

### Faza 2: Backend — display-mask + config + serwis + endpoint

#### Automatyczne

- [x] 2.1 Unit `maskKeyForDisplay` przechodzi (`npm test`) — 69dc1ec
- [x] 2.2 Integ-test endpointu POST→GET→DELETE przechodzi (`npm run test:integration`) — 69dc1ec
- [x] 2.3 Linting przechodzi (`npm run lint`) — 69dc1ec
- [x] 2.4 Build/typecheck przechodzi (`npm run build`) — 69dc1ec

#### Ręczne

- [x] 2.5 Zapis→status→usuń przez curl/REST zwraca poprawne kody i hint — c4b35af
- [x] 2.6 Log z udanego i nieudanego zapisu NIE zawiera fragmentu klucza — c4b35af
- [x] 2.7 Zapis przy niepoprawnym KEK → 503 generyczny (bez wycieku) — c4b35af

### Faza 3: Frontend profilu — strona `/profile` + island

#### Automatyczne

- [x] 3.1 Build/typecheck przechodzi (`npm run build`) — 52777ba
- [x] 3.2 Linting przechodzi (`npm run lint`) — 52777ba
- [x] 3.3 Unit hooka/util przechodzi, jeśli wydzielony (`npm test`) — 52777ba

#### Ręczne

- [x] 3.4 `/profile` bez zalogowania → redirect na signin — 52777ba
- [x] 3.5 Zapis klucza w UI pokazuje zamaskowany hint bez przeładowania — 52777ba
- [x] 3.6 „Usuń" wraca do formularza, status „nieskonfigurowany" — 52777ba
- [x] 3.7 Input password nie ujawnia klucza; pending blokuje przycisk — 52777ba
- [x] 3.8 `npm audit` czysty po dodaniu komponentów shadcn — 52777ba

### Faza 4: Bramkowanie US-06 — baner braku klucza

#### Automatyczne

- [x] 4.1 Build/typecheck przechodzi (`npm run build`) — 9dbc8cd
- [x] 4.2 Linting przechodzi (`npm run lint`) — 9dbc8cd

#### Ręczne

- [x] 4.3 Dashboard bez klucza → baner z linkiem do OpenAI + do `/profile` — 9dbc8cd
- [x] 4.4 Po zapisaniu klucza → baner znika — 9dbc8cd
- [x] 4.5 Linki działają (OpenAI nowa karta; `/profile` wewnętrznie) — 9dbc8cd
