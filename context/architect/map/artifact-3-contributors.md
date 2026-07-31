# Artifact 3 — Kontekst kontrybutorów (kto wie co)

- **Metoda:** `git log --author --since=12mc -- <obszar>`; boty i agenty odfiltrowane (`[bot]`, dependabot, renovate, github-actions, huppy, claude/codex/copilot); próbka tematów z `%s`.
- **Granica:** pokazuje, kto **dotykał** obszaru — nie formalne własności, nie czy nadal w firmie, nie czy dawne decyzje wciąż słuszne. Punkt wejścia do rozmowy/PR-ów, nie lista autorytetów.

## Kluczowi kontrybutorzy per obszar (12 mies.)

| Obszar | 1. | 2. | 3. |
|--------|----|----|----|
| `editor` (silnik) | **Steve Ruiz** (95) | Mime Čuvalo (59) | Mitja Bezenšek (22) |
| `tldraw` (SDK) | **Steve Ruiz** (137) | Mime Čuvalo (96) | Mitja Bezenšek (36) |
| `tlschema` (kontrakt) | **Steve Ruiz** (21) | Mime Čuvalo (13) | Guillaume Richard (4) |
| `sync-core` (real-time) | Steve Ruiz (15) | **David Sheldrick** (13) | Mime Čuvalo (12) |
| `apps/dotcom` (produkcja) | **Mitja Bezenšek** (119) | Steve Ruiz (94) | David Sheldrick (54) |
| `commenting` (świeży) | **Jessica Claire Edwards** (autor feature) | — | — |

## Specjalizacje (oparte na tematach commitów)

- **Steve Ruiz** — lead/architekt **rdzenia SDK**. Tematy: geometria, hit-test, shapes, arrows, font load, page-state (editor+tldraw+tlschema). Obecny praktycznie wszędzie → pierwszy kontakt do SDK i schematu.
- **Mitja Bezenšek** — właściciel **dotcom (produkcja)**. Tematy: assets, admin page, integracja **`@rocicorp/zero`** (silnik sync w dotcom). Zna infrastrukturę produkcyjną.
- **David Sheldrick** — specjalista **sync/persistence**. Tematy: WebSocket hibernation, `tlsync`, per-record persistence, migracje sqlite, perf. Głęboka wiedza o `sync-core`.
- **Mime Čuvalo** — szeroki drugi wszędzie (editor, tldraw, dotcom, i18n); ostatni commit repo. Dobry „drugi telefon" do rdzenia.
- **alex**, **Kostya Farber** — generaliści rdzenia SDK (editor/tldraw).
- **Jessica Claire Edwards** — autorka **commenting** (świeży feature) + obecna w dotcom.

## Kogo zapytać (per strefa)

- Rdzeń SDK (`editor`/`tldraw`/`tlschema`, cykle `Editor.ts`) → **Steve Ruiz**, then Mime Čuvalo.
- Synchronizacja `sync-core`/`tlsync` (sqlite, WebSocket) → **David Sheldrick**, then Steve Ruiz.
- Produkcja `dotcom` + sync przez `@rocicorp/zero` → **Mitja Bezenšek**, then David Sheldrick.
- `commenting` (nowy) → **Jessica Claire Edwards**.

## Sygnały ryzyka z kontekstu ludzi

- **Dwa systemy synchronizacji obok siebie:** własny `tlsync` (`sync-core`, David) **oraz** `@rocicorp/zero` w dotcom (Mitja). Przy zmianie „sync" trzeba wiedzieć, o którym mowa — to realna pułapka legacy (nazwa „sync" myląca między warstwami).
- **Skupiona wiedza / niski bus factor:** rdzeń SDK to głównie Steve; sync-core to głównie David; dotcom to głównie Mitja. Przed dużą zmianą w tych obszarach — rozmowa z właściwym specjalistą przed, nie po.

## Unknowns

- Nie znamy formalnych właścicieli ani tego, którzy kontrybutorzy są nadal aktywni — to dane historyczne z 12 mies.
- `commenting` ma za mało historii, by ocenić rozproszenie wiedzy (na razie jedna osoba).
