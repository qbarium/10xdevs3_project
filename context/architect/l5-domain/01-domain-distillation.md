---
title: "Destylacja domeny TaskerLight — mapa domeny (DDD, L5 element ⑤)"
created: 2026-08-02
type: domain-distillation
project: TaskerLight
sources:
  - context/foundation/prd.md
  - context/foundation/tech-stack.md
  - src/** (weryfikacja plik:linia — patrz dowody)
  - supabase/migrations/**
method: "Prompt destylacji domeny z 10xDevs M4L5 (tryb: dokument kontekstowy kontra realny kod). Dowody z kodu zebrane dwoma równoległymi sub-agentami; synteza w głównej sesji."
---

# Destylacja domeny TaskerLight

**Produkt tej analizy to MAPA domeny, nie kod.** Pokazuje, gdzie język PRD rozjeżdża się z językiem kodu, które byty są kandydatami na agregaty i który niezmiennik jest jednocześnie najbardziej rdzeniowy i najsłabiej pilnowany. Żadna nazwa bytu ani numer wymagania nie były zakładane z góry — wszystko odkryte z dokumentów i kodu.

**Legenda dowodów:** **[E]** evidence (zweryfikowane w pliku), **[I]** inference (wniosek), **[U]** unknown (biała plama).

---

## KROK 0 — Kontekst projektu

**Czym jest TaskerLight.** Użytkownik generuje w ciągu dnia zaszumiony strumień myśli (głos/tekst) w sytuacjach, gdzie strukturalny zapis jest niemożliwy lub niepożądany. Aplikacja przyjmuje surowy wsad i **automatycznie dekomponuje go na typowane wpisy** (`task` / `note` / `idea` / `decision` / `other`), zdejmując z użytkownika koszt klasyfikacji, ale zostawiając mu kontrolę przez **bramę akceptacji**. Sedno produktu (`prd.md:24, 286-292`): decyzja „co to jest" przesuwa się z momentu zapisu (drogiego) do momentu przeglądu (taniego).

**Stack** (`tech-stack.md`): Astro 6 SSR + wyspy React 19 + Supabase (Postgres + Auth + Storage) + Cloudflare Workers. Klasyfikacja synchroniczna z timeoutem 60 s, model **BYOK** (Bring Your Own Key) do zewnętrznego dostawcy AI (OpenAI). Projekt zaliczeniowy, solo, MVP.

**Warstwy — gdzie żyje logika biznesowa:**

| Warstwa | Katalog | Rola | Gęstość logiki |
|---|---|---|---|
| API routes | `src/pages/api/**` | Granica HTTP: auth-guard, walidacja żądania, mapowanie kodów — orkiestracja | Cienka (wyjątek: `ingest/classify.ts` niesie sekwencję wsad→sesja→klasyfikacja) |
| Serwisy | `src/lib/services/**` | Realna logika nad Supabase: mutacje ze status-guardami, cykl życia sesji, BYOK | **Gruba — większość reguł tu** |
| Logika domenowa | `src/lib/items/**` | Graf dozwolonych przejść stanu operacyjnego (kuracja UI) | Wąska (jedna stała) |
| Walidacja | `src/lib/validation/**` | Schematy zod payloadów + niezmienniki tworzenia wpisu | Średnia |
| AI | `src/lib/ai/**` | Klasyfikacja: wywołanie providera, prompt, schemat, wybór endpointu z modelu | Gruba |
| Typy/kontrakty | `src/types.ts` | Encje, DTO, unie enumów, błędy domenowe | Deklaratywna |
| Etykiety | `src/lib/labels.ts` | Mapowanie enumów DB (EN) → etykiety UI (PL) | Cienkie opakowanie |
| Persystencja | `supabase/migrations/**` | Enumy, tabele, RLS per-operacja, **RPC `persist_classification` z realną logiką** | **Gruba w RPC** (atomowy insert + finalizacja sesji) |

**Obserwacja przekrojowa [E]:** logika domenowa jest **rozdzielona** między serwis TS (`items-mutation.ts`), stałą grafu (`operational-transitions.ts`) i procedurę SQL (`persist_classification`). Derywacja stanu `'new'` przy tworzeniu żyje w DWÓCH miejscach (RPC + `deriveOperationalStatus`, `items-mutation.ts:48`), świadomie zsynchronizowanych. **Baza ma enumy, ale ZERO CHECK/trigger na przejścia** — RLS pilnuje wyłącznie własności wiersza (`user_id`), nie legalności przejścia. To znaczy: **maszyna stanów wpisu żyje w warstwie serwisu, nie w bazie.**

---

## KROK 1 — Ubiquitous Language

### Encje

| Byt (kod) | Definicja | Gdzie żyje |
|---|---|---|
| `Item` / wpis | Typowany wpis; rdzeń domeny. Pola: `type, title, description, acceptance_status, operational_status, import_session_id` | **[E]** `types.ts:127`; tabela `items` `classification_schema.sql:49` |
| `ImportSession` / sesja importu | Audit-trail jednego przebiegu klasyfikacji; `raw_input` (paste) lub null (plik) | **[E]** `types.ts:85`; tabela `import_sessions` `classification_schema.sql:30` |
| `ImportFile` | Plik wsadu w Storage (bucket `import-files`); relacja 1 sesja → N plików (MVP: ≤1) | **[E]** `types.ts:101` |
| `ClassifiedItem` | Kontrakt zwracany przez klasyfikator — **tylko** `type/title/description`, bez pól DB | **[E]** `types.ts:141` |
| `Profile` | 1:1 z `auth.users`; nośnik klucza BYOK (`api_key_encrypted`/`hint`) | **[E]** `types.ts:51` |

### Enumy (wartości stanu)

| Enum | Wartości | Gdzie |
|---|---|---|
| `AcceptanceStatus` | `pending \| accepted \| rejected \| deleted` | **[E]** `types.ts:73`, `classification_schema.sql:16` |
| `OperationalStatus` | `new \| in_progress \| done \| cancelled` (od S-04 dla WSZYSTKICH typów) | **[E]** `types.ts:79`, `classification_schema.sql:19` |
| `ItemType` | `task \| note \| idea \| decision \| other` | **[E]** `types.ts:70`, `classification_schema.sql:12` |
| `SessionStatus` | `processing \| completed_with_items \| completed_no_items \| failed` | **[E]** `types.ts:82` |

### Rdzeń modelu: dwa NIEZALEŻNE wymiary stanu wpisu

Wpis ma dwie **rozłączne** osie stanu (`classification_schema.sql:14-19`, `types.ts:73,79`):
- **akceptacja** — czy wpis przeszedł bramę walidacji (`pending`→`accepted`/`rejected`→`deleted`);
- **operacyjny** — postęp pracy nad wpisem (`new`/`in_progress`/`done`/`cancelled`).

Widoki UI (Aktywne/Zakończone/Anulowane/Do akceptacji/Kosz) są **projekcją kombinacji obu osi** — nie odrębnym stanem (`services/items.ts:81-96`).

### Pojęcia bez odpowiednika 1:1 w kodzie (byty syntetyczne / BRAK w kodzie)

| Pojęcie | Status | Dowód |
|---|---|---|
| „Aktywne" / `active` | **BRAK jako enum** — to widok = `accepted ∧ (new ∨ in_progress)` | **[E]** `services/items.ts:86`, `state-filter.ts:38` |
| „Kosz" / `trash` | **BRAK jako enum** — jeden koncept UI zwija DWA enumy `rejected`+`deleted` | **[E]** `services/items.ts:95`, `trash.astro:2` |
| „propozycja"/„draft"/„candidate" | **BRAK w kodzie** — koncept reprezentowany wyłącznie przez `pending` + „Do akceptacji" | **[E]** grep bez trafień w warstwie itemów |
| „sesja generacji" (PRD/lekcja) | W kodzie występuje jako **„import session"** | **[E]** `classification_schema.sql:30` |

---

## Wielonazwość — jeden byt, wiele nazw (problem „3×Account")

To najcenniejsza część mapy językowej. Kolejność wg siły rozjazdu.

### A. `item` / „wpis" / „element" / „entry" — TEN SAM byt, 4 nazwy w 4 warstwach ⚠️ najsilniejszy
- `item`/`items` — kod i DB wszędzie. **[E]** `types.ts:127`, `services/items.ts:13`, `classification_schema.sql:49`
- „wpis" — nagłówki, tytuły stron, nawigacja, helper `entryNoun`. **[E]** `labels.ts:87`, `active.astro:43,49`, `Topbar.astro:20`
- „element" — dialogi i toosty. **[E]** `AddItemDialog.tsx:84,59`, `EditItemDialog.tsx:153,231`, `AcceptedItemsView.tsx:58-62`
- „entry"/„entries" — nazwa komponentu-wyspy. **[E]** `SessionEntriesView.tsx` (`items.astro:103`)

**Dowód twardy [E]:** ten sam helper polskiej odmiany istnieje DWA razy pod różnymi słowami — `entryNoun` → „wpis/wpisy/wpisów" (`labels.ts:87`) vs `elementNoun` → „element/elementy/elementów" (`AcceptedItemsView.tsx:65`). Dublowanie sięga samego kodu.

### B. stan `done` — 5+ powierzchni nazewniczych ⚠️
enum DB `done` (`types.ts:79`) / ścieżka+etykieta „Zakończone" (`state-filter.ts:46`, `done.astro:2`) / generyczna etykieta „Zrobione" (`labels.ts:18`) / per-typ „Obsłużona/Podjęta/Obsłużony" (`labels.ts:26-29`) / czasownik przejścia „Zrealizuj" (`operational-transitions.ts:17,21`). Wszystkie **[E]**.

### C. stan `pending` — enum vs „Do akceptacji" vs „staging" vs `ClassifiedItem`
enum `pending` (`types.ts:73`) / etykieta+tytuł „Do akceptacji" (`labels.ts:33`, `items.astro:86`) / pojęcie „staging" w regułach karty (`item-card.ts:13`) / byt przed utrwaleniem `ClassifiedItem` (`types.ts:141`). Wszystkie **[E]**.

### D. przepływ wejścia — „Skrzynka wejściowa" / ingest / classify / import (≥4 nazwy)
URL `/ingest` + „Skrzynka wejściowa" (`Topbar.astro:14`, `ingest.astro:31`) / API `/api/ingest/classify` / DB+serwisy pod „import": `import_sessions`, bucket `import-files`, „Sesje importu" (`Topbar.astro:23`). Wszystkie **[E]**.

### E. `type` wpisu — „typ" vs „rodzaj" (nigdy „kategoria")
kod/DB `type`/`item_type` (`types.ts:70`) / UI raz „filtr typu", raz „filtr rodzaju" (`state-filter.ts:61,72`). **[E]**

### F. (pomniejsze) ponowienie: `reopen` / `retry` / „Spróbuj ponownie" — ta sama operacja pod trzema czasownikami. **[I]** `import-session.ts:226`, `/api/import-sessions/retry`, `useSessionRetry`.

---

## Ustalenia właściciela produktu (kanon nazw)

> Najcenniejsza część mapy — to rozstrzygnięcia **człowieka**, nie AI. Katalog wielonazwości wyżej pokazał problem; tu zapada decyzja, która nazwa obowiązuje. Porządki w kodzie wynikające z tych decyzji to osobne, mechaniczne zmiany — **poza zakresem L5** (który daje ustalenie/plan, nie przebudowę).

- **`Item` ⟷ „wpis"** — decyzja 2026-08-02. Nazwa w kodzie bez zmian (`Item`/`item`). Kanon dla użytkownika: **„wpis"**. Do wycofania (ujednolicić na „wpis"): „element" (`elementNoun` + teksty dialogów/toastów — `AddItemDialog.tsx`, `EditItemDialog.tsx`, `AcceptedItemsView.tsx`) oraz „entry" (`SessionEntriesView`). Docelowo jeden helper odmiany zamiast `entryNoun` + `elementNoun`.
- **stan „done" — jedna nazwa na rolę** (decyzja 2026-08-02). To pojęcie żyje w różnych rolach i **nie** scalamy go do jednego słowa:
  - kod (enum): `done` — bez zmian;
  - widok/lista: „Zakończone" — bez zmian;
  - etykieta stanu na wpisie: „Zrobione" (generyczna) + **celowe warianty per typ** wg FR-009 (notatka „Obsłużona", decyzja „Podjęta", pomysł „Obsłużony") — zostają, to zamierzona funkcja, nie bałagan;
  - przycisk akcji (czasownik): **„Zakończ"** — ujednolicenie (dziś „Zrealizuj", kuleje dla nie-zadań). Domyka spójność **akcja „Zakończ" → stan `done` → widok „Zakończone"**; para powrotna „Otwórz ponownie" zostaje.

---

## KROK 2 — Subdomeny: Core / Supporting / Generic

| Obszar | Klasa | Uzasadnienie (wg celów produktu) |
|---|---|---|
| **Brama akceptacji + typologia wpisu** (model wpisu z dwoma wymiarami stanu) | **CORE** | Sedno produktu: „praca klasyfikacji zdjęta, decyzja kontroli zachowana" (`prd.md:292`). Sukces mierzony **acceptance rate ≥ 70%** (`prd.md:43`) — czyli jakością rozdziału typów i wygodą bramy. To jest przewaga. |
| **Jakość klasyfikacji** (co i jak jest typowane) | **CORE (wartość) / GENERIC (silnik)** | Wartość rdzeniowa, ale realizacja to wywołanie zewnętrznego dostawcy — silnik jest wymienialny, więc implementacyjnie generic **za portem** (`src/lib/ai/resolver.ts:21`). Patrz kandydat pod ACL (element ③ przyszłej analizy). |
| **Sesja importu / audit trail / dziennik sesji** | **SUPPORTING** | Wspiera odtwarzalność („z jakiego wsadu pochodzi wpis", `prd.md:50`), nie jest sensem produktu. Silnie egzekwowana. |
| **Listy z filtrami / widoki** | **SUPPORTING** | Projekcja stanów wpisu; wygoda pracy, nie rdzeń. |
| **Auth (Supabase)** | **GENERIC** | Flat user model, delegowane do platformy (`prd.md:298`). |
| **BYOK: szyfrowanie klucza, maskowanie, hash z solą** | **GENERIC (security)** | Klasyczna higiena sekretów; bardzo dobrze zrealizowana, ale nie różnicuje produktu. |
| **Upload/Storage, dekodowanie kodowań, sanityzacja wsadu** | **GENERIC** | Utility na granicy wejścia. |

**Wniosek [I]:** rdzeń domeny to **model wpisu** (dwa wymiary stanu + brama akceptacji + typologia). Klasyfikacja AI daje wartość, ale jako silnik jest generyczna i powinna zostać za portem. Reszta to wsparcie i higiena.

---

## KROK 3 — Kandydaci na agregaty i ich niezmienniki

Status: **EGZEKWOWANY** (kod aktywnie pilnuje) / **DEKLAROWANY** (zapisane, bez egzekucji) / **NARUSZALNY** (da się złamać obejściem warstwy).

### Kandydat A — `Item` (agregat maszyny stanów)

| # | Niezmiennik | Status | Dowód |
|---|---|---|---|
| N2 | Dwa niezależne wymiary stanu; move-to-trash zmienia tylko akceptację, operacyjny nietknięty | **EGZEKWOWANY** (serwis) | `moveToTrash` `items-mutation.ts:143-153`; `types.ts:73,79` |
| N3 | Legalne przejścia akceptacji: `pending→accepted/rejected`, `accepted→deleted`, restore `deleted→accepted` i `rejected→pending`, hard-delete tylko „Wyczyść kosz" | **EGZEKWOWANY w serwisie, NARUSZALNY poza nim** | guardy `WHERE`/`eq` `items-mutation.ts:95-209`; RLS bez CHECK `classification_schema.sql:104-107` |
| N4 | Przejścia operacyjne — wszystkie 4 wzajemnie przechodnie (graf w menu to tylko UI) | **EGZEKWOWANY** (przechodniość to cecha, nie luka) | `operationalActionSchema` `validation/items.ts:39`; `operational-transitions.ts:1-5,25` |
| N5 | Wpis edytowalny tylko w `pending`/`accepted`; Kosz read-only; optimistic concurrency (409) | **EGZEKWOWANY** (serwis+endpoint) | `editItem` `items-mutation.ts:224-259`; `[id].ts:57` |
| N6 | Wpis ręczny (FR-028): niezmienniki (`accepted`+`new`+`session=NULL`) ustala SERWER, nie klient | **EGZEKWOWANY** (serwis+zod) | `createManualItem` `items-mutation.ts:62-83`; `validation/items.ts:92` |

### Kandydat B — `ImportSession` (agregat cyklu życia)

| # | Niezmiennik | Status | Dowód |
|---|---|---|---|
| N1 | Sesja to realny byt z momentem finalizacji; itemy+finalizacja w JEDNEJ transakcji (atomowość) | **EGZEKWOWANY** (RPC/transakcja) | `persist_classification` `20260610075357.sql:18-36` |
| N9 | Błąd/śmieć z AI → sesja `failed`, ZERO itemów w bazie; kontrakt walidowany przed zapisem; >100 itemów → `failed` | **EGZEKWOWANY** (serwis AI+RPC) | `runClassification` `classify-core.ts:76-100`; `classifier.ts:96-116` |
| — | „Utknięte" `processing` (ubity Worker) → reaper `>5 min → failed`; ponowienie atomowym guardem TOCTOU | **EGZEKWOWANY** | `reapStaleProcessing` `import-session.ts:254`; `reopenSession:226` |

### Kandydat C — `Profile` / klucz BYOK (agregat-strażnik sekretu)

| # | Niezmiennik | Status | Dowód |
|---|---|---|---|
| N7 | Klucz ZAWSZE zaszyfrowany przed zapisem (fail-closed); NIGDY plaintext/koperta do klienta | **EGZEKWOWANY** (wąskie gardło) | `saveApiKey`/`getApiKeyStatus` `profile-key.ts:16-67`; `byok-crypto.ts:26-40` |
| N8 | Klucz NIGDY w logach/błędach — każdy komunikat i pole przez `maskSecrets`/`maskUnknown` przed `console.*` | **EGZEKWOWANY** (choke point) | `logger.ts:16,80`; `mask.ts:35-71` |
| N11 | Identyfikator usera do providera = HMAC-SHA256 z solą, nie surowy (FR-025) | **EGZEKWOWANY** | `hashUserId` `user-hash.ts:12-26` |

### Fundament — izolacja per-user

| N10 | Wszystkie tabele: RLS ON + 4 polityki per-operacja na `user_id`; RPC `SECURITY INVOKER` | **EGZEKWOWANY** (baza — najmocniejsza warstwa) | `classification_schema.sql:71-111`; `persist_classification.sql:2` |

---

## KROK 4 — Rozjazdy MODEL vs KOD

| # | Dokument mówi X | Kod robi Y | Na czym polega rozjazd |
|---|---|---|---|
| R1 | Guardrail: „**Każdy zaakceptowany item** zachowuje powiązanie z sesją importu — audit trail zawsze odtwarzalny" (`prd.md:50`) | Wpisy ręczne mają `import_session_id = NULL` od utworzenia (`items-mutation.ts:75`); link klasyfikowanych `on delete set null` (`classification_schema.sql:52`) | Guardrail w brzmieniu absolutnym jest **fałszywy dla wpisów ręcznych**. PRD łagodzi to dopiero w FR-028 (`prd.md:155`) i FR-015 („link best-effort", `prd.md:204`). **Sprzeczność wewnątrz PRD**; kod realizuje wersję z FR-015/FR-028. W MVP niegroźne — brak akcji usuwania sesji (`prd.md:349`). |
| R2 | Status sesji i akceptacja itemów są rozłączne (FR-006/FR-009) | Sesja osiąga `completed_with_items` w tej samej transakcji, w której itemy są `pending` (`persist_classification.sql:18-36`) | **Nie naruszenie, lecz świadomy model** — ale nazwa `completed_*` bywa myląca: sesja jest „klasyfikacyjnie kompletna", nie „rozstrzygnięta". Kandydat na doprecyzowanie języka. |
| R3 | Komentarz migracji bazowej: `operational_status` „tylko dla `type='task'`; null dla pozostałych" (`classification_schema.sql:18-19`) | Późniejsza migracja backfilluje NULL→`new`, RPC nadaje `new` KAŻDEMU typowi (`operational_status_all_types.sql:14-17`) | Komentarz SQL **nieaktualny** względem Decyzji 2026-06-15 (`prd.md:242`). Kod spójny z decyzją; stała jest tylko dokumentacja. |
| R4 | „Każdy wpis ma stan operacyjny" (FR-009 rozszerzony na wszystkie typy) | Kolumna `operational_status` **nullable, bez CHECK/NOT NULL**; typ `OperationalStatus \| null` (`classification_schema.sql:57`, `types.ts:79`) | Niezmiennik jest **tylko DEKLAROWANY/konwencyjny** (utrzymywany przez RPC + `deriveOperationalStatus`), nie utwardzony w bazie. Świadomy dług („NOT NULL = opcjonalne utwardzenie później"). |
| R5 | „Nie da się przejść nielegalnie" (implikacja maszyny stanów akceptacji) | Legalność przejść wyłącznie w klauzulach `WHERE` serwisu; RLS pilnuje tylko `user_id` (`items-mutation.ts:104,128,148,176`; `classification_schema.sql:104-107`) | **Największy strukturalny rozjazd „gdzie żyje niezmiennik".** Przez własne endpointy — egzekwowany; bezpośredni PostgREST z JWT usera dopuściłby dowolny self-UPDATE enuma (przeskok bramy). **Baza nie jest strażnikiem maszyny stanów — jest nim serwis.** |
| R6 | `import_files` jako „sesja → wiele plików" + audio (FR-004/FR-019) | Audio poza MVP (`prd.md:337`); tabela istnieje, ścieżka `.txt`/`.md` tworzy ≤1 plik; brak reconciliacji sierot (`prd.md:350`) | **Forward-compatibility, nie błąd** — schemat wyprzedza produkt. Odnotowane jako „tak ma być". |

---

## KROK 5 — Ranking refaktoru (wartość × ryzyko)

Kryterium: **wartość** = jak rdzeniowy niezmiennik chroni; **ryzyko** = jak słabo jest dziś egzekwowany.

**#1 — `Item` jako agregat-strażnik maszyny stanów akceptacji.** ⭐
- *Wartość: wysoka.* Brama akceptacji to sedno produktu (KROK 2), a legalność przejść akceptacji jest jej istotą.
- *Ryzyko: wysokie.* Niezmiennik żyje **wyłącznie w klauzulach `WHERE` serwisu** — baza nie ma CHECK/trigger, RLS pilnuje tylko własności wiersza (R5). Dodatkowo „wpis zawsze ma stan operacyjny" jest tylko deklarowany (R4, kolumna nullable). Reguła jest „wszędzie i nigdzie": w serwisie egzekwowana, poza nim naruszalna.
- *Docelowy kształt:* jeden strażnik przejść (metoda agregatu lub utwardzenie w bazie: CHECK/trigger + `NOT NULL` na `operational_status`), tak by „nie da się przejść nielegalnie" było prawdą niezależnie od trasy wywołania.
- **To jest naturalny wsad do promptu #2 z L5** (`02-invariant-aggregate-refactor.md`).

**#2 — Ujednolicenie języka wpisu (item/wpis/element/entry) i stanów (`done`, `pending`/staging).**
- *Wartość: średnia-wysoka (porządkowa).* Spójny język taniej się utrzymuje i mniej myli agenta w kolejnych zmianach.
- *Ryzyko: średnie.* Rozjazd sięga samego kodu (dwa helpery odmiany: `entryNoun` vs `elementNoun`). To nie agregat — to ubiquitous language; naprawa tania, głównie mechaniczna.

**#3 — `ImportSession` — doprecyzowanie nazwy `completed_*` (R2).**
- *Wartość: niska (kosmetyka języka).* *Ryzyko: niskie* — agregat jest silnie egzekwowany (atomowość RPC, reaper, TOCTOU-guard). **Nie priorytet.**

**Poza rankingiem — `Profile`/BYOK.** Niezmienniki N7/N8/N11 są wzorowo egzekwowane (wąskie gardła szyfrowania i logowania). **Nie kandydat do refaktoru** — kandydat na wzorzec do naśladowania.

---

## Ograniczenia tej analizy

- Dowody `plik:linia` zebrano dwoma sub-agentami (tryb tylko-odczyt) i zsyntetyzowano; numery linii odzwierciedlają stan repo na `created`. Twierdzenia strukturalne (liczby, „tylko tutaj") nie były tu weryfikowane `ast-grep` — jeśli któraś decyzja stanie na konkretnej liczbie, warto ją potwierdzić (technika z M4L3).
- Statusy **NARUSZALNY** oparte na modelu zagrożeń „bezpośredni PostgREST z JWT usera" — **[I]**, nie zaobserwowany exploit.
- Analiza celowo **nie projektuje** docelowej architektury poza nazwaniem kandydatów — projekt agregatu i ACL należy do promptów #2 i #3 z L5.

---

## Podsumowanie (dla czytelnika)

Artefakt mapuje domenę TaskerLight z PRD i kodu: słownik pojęć z `plik:linia`, katalog wielonazwości, klasyfikację subdomen, listę niezmienników ze statusem egzekwowania oraz rozjazdy model-vs-kod. Rdzeniem domeny jest **model wpisu** — dwa niezależne wymiary stanu (akceptacja × operacyjny) oraz brama akceptacji, która realizuje sens produktu („decyzja co to jest przesunięta z zapisu do przeglądu"). Najmocniejsze niezmienniki (izolacja per-user, atomowość zapisu klasyfikacji, szyfrowanie i niewycieklość klucza BYOK) są realnie egzekwowane — część nawet w bazie (RLS, RPC/transakcja). Najsłabiej utwardzona jest **maszyna stanów wpisu**: legalność przejść akceptacji i „zawsze niepusty stan operacyjny" żyją wyłącznie w warstwie serwisu, bo baza ma enumy bez CHECK/trigger. Największy pojedynczy rozjazd to R5 — „gdzie żyje niezmiennik": strażnikiem przejść jest serwis, nie baza. Najgroźniejsza wielonazwość to `item`/`wpis`/`element`/`entry` (dubluje się nawet w kodzie) oraz stan `done` (5+ nazw). **Wniosek #1: kandydatem do refaktoru jest `Item` jako agregat maszyny stanów akceptacji** — jednocześnie najbardziej rdzeniowy i najsłabiej pilnowany — i to on jest wsadem do kolejnego kroku L5 (niezmiennik → agregat).
