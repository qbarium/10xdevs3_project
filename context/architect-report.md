---
title: "Raport architektoniczny — 10xDevs moduł 4 (ścieżka 10xArchitect)"
created: 2026-08-02
type: architect-report
author: Jakub
scope: "Synteza czterech artefaktów modułu 4. Oparta wyłącznie na artefaktach źródłowych, nie na pamięci o kodzie."
sources:
  - context/architect/map/repo-map.md            # L2 (tldraw)
  - context/architect/l3-research/research.md     # L3 (tldraw)
  - context/architect/l4-plan/research.md         # L4 element ④ (tldraw)
  - context/architect/l4-plan/plan.md             # L4 plan (tldraw)
  - context/architect/l5-domain/01-domain-distillation.md      # L5 (TaskerLight; oryginały w context/domain/)
  - context/architect/l5-domain/02-invariant-aggregate-refactor.md
  - context/architect/l5-domain/03-anti-corruption-layer.md
---

# Raport architektoniczny — moduł 4 (10xArchitect)

Zwięzła synteza czterech technik modułu: mapa repozytorium (L2), analiza feature (L3), plan refaktoryzacji (L4) i notatki domenowe DDD (L5). Każda sekcja zbiera esencję jednego artefaktu.

## 1. Opisane projekty

Praca celowo objęła **dwa repozytoria** — kurs wprost na to pozwala, a wybór był świadomy (uzasadnienie w §6).

| Repo | Charakter | Stack / skala | Artefakty |
|---|---|---|---|
| **tldraw** | Obce open-source (ćwiczenie na cudzym legacy) | Whiteboard SDK w TypeScript; monorepo yarn+lerna; ~5 lat historii, 6134 commity na `main` | **L2, L3, L4** |
| **TaskerLight** | Własny projekt kursowy (MVP) | Astro 6 SSR + React 19 + Supabase (Postgres/Auth/Storage) + Cloudflare Workers; klasyfikacja AI w modelu BYOK | **L5** |

L2–L4 to analiza obcego, dużego legacy (mapowanie → jeden przepływ → plan). L5 to modelowanie domeny na własnym kodzie, gdzie znajomość dziedziny pozwala ocenić trafność nazw i reguł.

## 2. Mapa projektu — L2 (tldraw)

- **Architektura to czysta piramida:** fundament (`utils`, `state`, `store`, `tlschema`, `validate`) → silnik (`editor`) → pakiet-produkt (`tldraw`) → synchronizacja (`tlsync`/`sync-core`) → aplikacje (`apps/dotcom` = produkcja).
- **Praca skupia się w dwóch centrach:** produkcyjny `apps/dotcom` (spike Q4-2025) oraz rdzeń SDK (`editor` + `tldraw`, stałe centrum każdego kwartału). `Editor.ts` to najgorętszy plik repo (87 zmian).
- **Strefy ryzyka:** `Editor.ts` (hub silnika, 50 cykli plikowych), `tlschema` (kontrakt danych — zmiana rozlewa się przez wszystkie warstwy), `utils` (Ca=20, największy zasięg zmiany), dwa systemy sync obok siebie (`tlsync` vs `@rocicorp/zero`).
- **Granice pakietów trzymają:** graf pokazał **0 cykli międzypakietowych** — splątanie jest *wewnątrz* rdzenia, nie między warstwami.
- **Ograniczenie mapy:** okno ~12 miesięcy historii gita; aktywność ≠ ważność (np. `fairy-shared` był gorący, ale został usunięty).

## 3. Analiza feature — L3 (tldraw)

**Badany przepływ:** zapis kształtu (`editor.createShape/updateShape` → `Store.put` → walidatory `tlschema`). Wybrany, bo to strefa ryzyka #1 z mapy (hub silnika sprzężony z warstwą `store` i kontraktem `tlschema`), a jednocześnie biznesowy rdzeń SDK — każda zmiana na tablicy przechodzi tędy.

**Feature overview:** gruby stos warstw okazał się w większości **fasadami** — realna praca dzieje się w trzech miejscach: `createShapes` (przygotowanie), `Store.put` (mutacja + walidacja + efekty) i validator `tlschema`. „Zapisz jeden kształt" to pod spodem operacja **wsadowa**; dane po zapisie **nie wracają z bazy** (to te same obiekty z pamięci, zwalidowane i zamrożone); undo powstaje jako **przechwycony efekt uboczny** `Store.put`, nie jako jawna akcja.

**Technical debt (najważniejsze ryzyka):**
1. **props ↔ migracja bez bariery** — każdy plik kształtu trzyma ręcznie synchronizowaną triadę (walidatory + numery wersji + migracje); nic nie wymusza migracji przy zmianie walidatora. Historia dowodzi kosztu: łańcuch bugów desync, w tym **utrata danych (#2302)**. *(ast-grep: triada w **12** plikach `tlschema/src/shapes`.)*
2. **wersjonowanie schematu ↔ sync-core** — serwer migruje zapisy klienta do swojej wersji; rozjazd wersji może zepsuć klientów, czego kompilator nie łapie.
3. **luki testowe** — walidatory rekordu kształtu **bez własnych testów** *(ast-grep: 0 plików testowych `TLShape`/`TLBaseShape`)*; cichy upsert przy kolizji `id` w `createShapes` bez strażnika i bez testu.

## 4. Plan refaktoryzacji — L4 (tldraw)

**Co refaktoryzowane:** guard na rozjazd props↔migracja (deterministyczny **snapshot schematu jako test**) + charakteryzacja cichego upsertu. Filozofia: **„guard, nie przebudowa"** — architektura migracji zostaje nietknięta, wszystkie fazy to *dodanie testów*, zero zmian w kodzie produkcyjnym.

**Czego świadomie NIE robimy:** nie ruszamy architektury migracji; nie tykamy `Store.put` (upsert jest tam zamierzony i zablokowany testem); nie tykamy sync-core (dojrzały, działający protokół — adekwatny ruch to nota o inwariancie, nie refaktor); nie dopisujemy brakujących migracji.

| Faza | Cel | Weryfikacja |
|---|---|---|
| 1 | Snapshot sekwencji migracji (`createTLSchema().serialize()`) | auto: test przechodzi; zmiana numeru wersji → czerwony · ręczna: przegląd `.snap` |
| 2 | Snapshot kluczy propsów per kształt (z jawną granicą: łapie dodanie/usunięcie pola, nie zmianę typu) | auto: przypadek pozytywny (czerwony) + negatywny (zostaje zielony, udokumentowany) · ręczna: 13 typów |
| 3 | Test charakteryzujący cichego upsertu w `createShapes` | auto: test przechodzi · ręczna: komentarz zaznacza „utrwala obecne, nie docelowe" |

Każda faza jest osobno odwracalnym commitem, ułożonym od najtańszej.

## 5. Domena wg DDD — L5 (TaskerLight)

**Ubiquitous language i rozjazdy.** Rdzeń domeny to **wpis** (`Item`) z dwoma niezależnymi wymiarami stanu: akceptacja (`pending`/`accepted`/`rejected`/`deleted`) × operacyjny (`new`/`in_progress`/`done`/`cancelled`); dalej **sesja importu** (`ImportSession`), **propozycja** (`ClassifiedItem`) i **klucz BYOK** (`Profile`). Najsilniejsze rozjazdy: ten sam byt nazywany `item`/„wpis"/„element"/„entry" (dubluje się nawet w kodzie — dwa helpery odmiany); stan `done` w 5+ nazwach; „Aktywne"/„Kosz" to byty syntetyczne UI bez odpowiednika w enumie; sprzeczność wewnątrz PRD (guardrail „każdy wpis powiązany z sesją" vs FR-015 `set null`).

**Niezmiennik #1 i agregat.** Wybrany: **legalność przejść akceptacji wpisu** — agregat `Item`. Jest jednocześnie najbardziej rdzeniowy (brama akceptacji to sedno produktu) i najsłabiej pilnowany: reguła żyje wyłącznie w **sześciu rozproszonych guardach `WHERE`** w warstwie serwisu, a baza ma enumy **bez CHECK/trigger**. Naruszalność **udowodniona we własnych testach integracyjnych** (bezpośredni user-scoped insert w stanie `deleted`). Rekomendacja: agregat w TS (dom modelu) + **twardy backstop w bazie** (`NOT NULL` + trigger), bo tylko baza łapie ruch omijający aplikację.

**Anti-Corruption Layer.** Przeciek #1 to **Supabase**: surowy `SupabaseClient` i jego DSL przenikają przez **~30+ plików** we wszystkich warstwach, a granica „biblioteka nie w bundlu przeglądarki" jest dziś pilnowana ręcznie komentarzami. Uczciwie odrzucono kandydata AI — jest już dobrze odseparowany (brak SDK OpenAI, wywołanie surowym `fetch`, wyjście to czysty typ domenowy). Projekt: porty repozytoriów w języku domeny + jeden adapter Supabase; kryterium sukcesu sprawdzalne grepem (pakiet tylko w katalogu adaptera).

## 6. Decyzje, które należą do mnie

AI pełniło rolę analityka — zbierało dowody, rysowało mapy i proponowało rankingi — ale rozstrzygnięcia są moje. **Wybrałem dwa repozytoria świadomie:** tldraw do ćwiczenia analizy na cudzym, dużym legacy (L2–L4), a własny TaskerLight do modelowania domeny (L5), bo znajomość dziedziny pozwala mi ocenić, czy nazwy i reguły w kodzie odpowiadają biznesowi — czego na obcym repo bym nie obronił. W L3 **zawęziłem cel** do jednego przepływu (zapis kształtu), a nie całego silnika, żeby analiza była głęboka, a nie rozlana. W L4 **przesądziłem filozofię „guard, nie przebudowa"** i odrzuciłem efektowniejszego kandydata (przebudowę sync-core) na rzecz wąskiego, odwracalnego zakresu — mimo że wyglądał ambitniej, historia dowodziła, że jest dojrzały i nie warto go ruszać. W L5 **rozstrzygnąłem język domeny** (kanon „wpis" spośród czterech nazw; stan „done" jako jedna nazwa na rolę z czasownikiem „Zakończ") oraz — po zważeniu trzech osi (rdzeniowość, rozproszenie, egzekwowanie) — **zatwierdziłem bramę akceptacji jako cel #1**, opierając decyzję na dowodzie naruszalności z testów, a nie na samej rekomendacji agenta.
