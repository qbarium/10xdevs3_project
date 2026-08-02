# context/architect/ — Ścieżka 10xArchitect (moduł 4)

Artefakty kursu **10xDevs 3.0, moduł 4** (odznaka **10xArchitect**). 

**Analizowane repozytoria:** L2–L4 na [`tldraw`](https://github.com/tldraw/tldraw) — open-source whiteboard SDK (TypeScript, monorepo), sklonowanym poza projektem: ćwiczenie mapowania i refaktoryzacji **obcego legacy**. **L5 (DDD) wykonano na własnym projekcie TaskerLight/10xdevs3** — modelowanie domeny działa najlepiej na znanym kodzie (kurs dopuszcza różne repo per lekcja).

## Zawartość

- **`map/` — L2: Mapa projektu (Wide Scan)** ✅
  - `repo-map.md` — finalna Mapa projektu (synteza trzech perspektyw)
  - `artifact-1-territory.md` — historia gita: aktywne obszary, kwartały, współzmiany
  - `artifact-2-structure.md` — graf zależności: Ca/Ce/instability, cykle plikowe
  - `artifact-3-contributors.md` — kontekst kontrybutorów: kto zna który obszar
- **`l3-research/` — L3: Analiza feature (Deep Focus)** ✅
  - `research.md` — przepływ zapisu kształtu w tldraw: ② feature overview + ③ technical debt, zweryfikowany ast-grep
- **`l4-plan/` — L4: Refaktoryzacja (plan bezpiecznej zmiany)** ✅
  - `research.md` — element ④ „Refactor opportunities": ranking szans refaktoru zapisu kształtu, zweryfikowany ast-grep
  - `plan.md` — plan jednej bezpiecznej zmiany (guard props↔migracja + charakteryzacja cichego upsertu), po świeżym przeglądzie
- **`l5-domain/` — L5: Legacy z DDD (na TaskerLight)** ✅
  - `01-domain-distillation.md` — słownik domeny (ubiquitous language) + rozjazdy model-vs-kod + ustalenia kanonu nazw („wpis"; stan „done" → „Zakończ")
  - `02-invariant-aggregate-refactor.md` — agregat-strażnik bramy akceptacji (niezmiennik #1)
  - `03-anti-corruption-layer.md` — warstwa antykorupcyjna: izolacja Supabase za portami repozytoriów
  - *(oryginały żyją w `context/domain/`; tu kopia jako dowód ścieżki architekta)*
- **Raport zbiorczy** → [`context/architect-report.md`](../architect-report.md) — dwustronicowa synteza L2–L5 do formularza odznaki **10xArchitect**.

## Uwaga dla agentów AI

Ten folder jest oznaczony do **ignorowania** przy pracy nad 10xdevs3 — patrz `CLAUDE.md` / `AGENTS.md` obok. 
