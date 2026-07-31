# Artifact 2 — Struktura (jak to jest zbudowane)

- **Metoda:** graf zależności **międzypakietowych** z `package.json` (prod+peer deps, 31 pakietów `packages/`+`apps/`+`internal/`) → Ca/Ce/instability + cykle; **cykle plikowe** przez `madge --circular` na rdzeniowych `src/`.
- **Granica metody:** graf pakietowy patrzy na deklarowane deps (prod+peer), nie na każdy import; nie widzi runtime coupling (DI, config, feature flag, codegen). Cykle plikowe policzone, ale nie każdy przeanalizowany co do treści. → `unknowns` niżej.

## Architektura warstwowa (Ca/Ce/instability, poziom pakietów)

| Warstwa | Pakiet | Ca (zależy od) | Ce (zależy na) | instability | Rola |
|---------|--------|---:|---:|---:|------|
| **Fundament (stabilny)** | `@tldraw/utils` | **20** | 0 | **0.00** | Czysty fundament — pół monorepo od niego zależy, sam od nikogo |
| | `@tldraw/state` | 8 | 1 | 0.11 | Reaktywny state (signals) |
| | `@tldraw/validate` | 5 | 1 | 0.17 | Walidacja |
| | `@tldraw/store` | 7 | 2 | 0.22 | Store danych |
| | `@tldraw/tlschema` | 6 | 4 | 0.40 | **Kontrakt danych** (schema) |
| **Silnik** | `@tldraw/editor` | 2 | 6 | 0.75 | Silnik canvas — komponuje fundament; hub `Editor.ts` |
| **SDK** | `tldraw` | **8** | 3 | 0.27 | Pakiet-produkt (editor+UI+shapes); baza dla aplikacji |
| **Sync** | `@tldraw/sync-core` | 3 | 4 | 0.57 | Rdzeń synchronizacji |
| | `@tldraw/sync` / `sync-collaboration` | 1/0 | 5/4 | 0.83/1.00 | Warstwy sync real-time |
| | `@tldraw/dotcom-shared` | 2 | 6 | 0.75 | Shared dotcom↔SDK |
| **Aplikacje/peryferia** | `apps/examples`, `apps/docs`, `apps/bemo-worker`, `apps/dotcom` | 0 | 8/3/7/… | **1.00** | Czyści konsumenci (entry pointy) |

**Odczyt:** klasyczna piramida — `utils` u podstawy (inst 0.00 = maksymalnie stabilny), przez `state`/`store`/`validate`/`tlschema`, silnik `editor`, pakiet-produkt `tldraw`, aż po aplikacje (inst 1.00 = czyste wejścia).

## Granice warstw

- **Trzymają na poziomie pakietów:** `madge`/graf pokazał **ZERO cykli międzypakietowych** — kierunek zależności jest acykliczny (DAG). Fundament nie importuje w górę. To zdrowy sygnał architektoniczny.
- **Kontrakt między warstwami:** `@tldraw/tlschema` (schema) + `@tldraw/store` — to przez nie przechodzą dane; zmiana schematu ma szeroki, wielowarstwowy zasięg (potwierdza co-change `tlschema`↔`editor`/`tldraw` z `artifact-1`).

## Cykle plikowe (wewnątrz pakietów) — splątane granice

| Pakiet | Cykle plikowe | Charakter |
|--------|---:|-----------|
| `packages/editor/src` | **50** | Hub `Editor.ts` ↔ managery (Click/Focus/Font/Text/Theme/Tick/SpatialIndex…), tools, exports, komponenty. Wzorzec „centralny kontroler ↔ jego menedżery". |
| `packages/tldraw/src` | **49** | Warstwa UI/shapes gęsto spleciona (komponenty ↔ konteksty ↔ shape utils). |
| `packages/sync-core/src` | 6 | Wyraźnie czystsze granice mimo wrażliwości obszaru. |

→ Granice **pakietów** są czyste, ale **wnętrze rdzenia SDK** (editor, tldraw) jest gęsto splecione wokół `Editor.ts`. To podnosi blast radius zmian w sercu silnika i jest naturalnym kandydatem na **Deep Focus** (L3).

## Ryzyka testowalności (z grafu)

- **Testowalne w izolacji (tanio):** `utils`, `validate`, `state`, `store` — niskie Ce, brak cykli międzypakietowych, czyste funkcje/prymitywy.
- **Trudne w izolacji (dużo mockowania / raczej integracja):** `editor` (hub `Editor.ts` + 50 cykli, managery sprzężone), `tldraw` (49 cykli, UI+konteksty). Zmiana w `Editor.ts` naturalnie ciągnie wiele modułów.
- **Naturalnie e2e:** `apps/dotcom` (konta + sync + Durable Objects), `sync`/`sync-core` (real-time, stan współdzielony).

## Blast radius — kandydaci wysokiego ryzyka

- `@tldraw/utils` — **20 zależnych**, największy zasięg; ale stabilny (inst 0.00). Zmiana kontraktu utils = potencjalnie całe repo.
- `@tldraw/tlschema` — kontrakt danych; zmiana schematu przechodzi przez store→editor→tldraw→apps.
- `packages/editor` (`Editor.ts`) — serce silnika; niskie Ca bezpośrednie (idzie przez `tldraw`), ale 50 wewnętrznych cykli → lokalny blast radius wysoki.

## Unknowns

- Graf oparty na deklarowanych prod+peer deps — **runtime coupling** (DI, config, feature flags, codegen, dynamic import) niewidoczny → `unknown`.
- Treść 50/49 cykli plikowych nie w pełni przeanalizowana — czy to celowy wzorzec (kontroler↔menedżer) czy dług — `needs verification` w Deep Focus.
- `apps/*` (dotcom klient/worker) mają wewnętrzną strukturę nieobjętą tym przebiegiem pakietowym.
