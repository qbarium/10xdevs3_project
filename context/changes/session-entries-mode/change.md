---
change_id: session-entries-mode
title: Tryb „Pokaż wpisy" — kontekstowy widok wpisów sesji zamiast master-detail
status: implementing
created: 2026-07-01
updated: 2026-07-02
archived_at: null
---

## Notes

Realizuje element roadmapy **S-13** (`context/foundation/roadmap.md`, sekcja „S-13: Tryb «Pokaż wpisy»"). Skrót zamiaru:

- Dziennik sesji jako pełnoszerokie karty; „Pokaż wpisy" prowadzi do listy wpisów w trybie kontekstowym sesji (`?session=<id>`, baner z akcją powrotu, filtry ukryte, wszystkie stany akceptacji, akcje zachowane). Sesje `niepowodzenie` mają „Ponów".
- Zastępuje master-detail z S-10 (usuwa `SessionItemsPanel`/`useSessionItems`/dwukolumnowy layout); warstwa danych S-10 (endpoint items) zostaje do reużycia. Paginacja wpisów dochodzi też do zwykłej listy (dorobek S-11).
- Decyzje uzgodnione 2026-07-01 — patrz pole „Decyzje" w sekcji S-13 roadmapy.
- Roadmapa zaleca prowadzenie przez `/10x-frame` przed planem (cofamy decyzję projektową S-10).
