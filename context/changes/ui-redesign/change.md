---
change_id: ui-redesign
title: Nowa szata graficzna (wariant techniczny) + powłoka nawigacyjna
status: implementing
created: 2026-08-03
updated: 2026-08-04
archived_at: null
---

## Notes

Redesign szaty graficznej TaskerLight — wariant „techniczny" (jasny + ciemny) + trwała powłoka nawigacyjna (sidebar + topbar). Multi-page, wszystkie widoki; widoki spoza makiety wnioskowane z jej języka. Bez metadanych przyszłości (priorytet/termin/tagi) i bez „pewności %".

Zmiana **prezentacyjna** — zachowanie wg PRD nienaruszone.

Kotwice (przeżywają `/clear`):

- Spec wizualny: `context/foundation/ui-design-system.md`
- Źródło prawdy wizualnej (makieta): `context/foundation/ui-mockup/taskerlight-list.html`
- Wycinek roadmapy: **S-15** (`context/foundation/roadmap.md`) — pełne decyzje w bloku „Decyzje (uzgodnione 2026-08-03)"
- Board: Issue #177 (kolumna In Progress)
- Nośnik pracy: gałąź `feature/ui-redesign`, jeden PR na końcu (bez merge per faza)

## Weryfikacja (ustalenie użytkownika, 2026-08-04)

- **E2E / weryfikację funkcjonalną każdej fazy robi agent SAM przez Playwright CLI** — nie odsyła listy kroków użytkownikowi do ręcznego klikania.
- **Testy ręczne** (wizualny przegląd w obu motywach, wszystkie widoki) — **dopiero na KOŃCU całej zmiany**, jednym przejściem (nie per faza). Do tego czasu wiersze „Ręczne" w `## Postęp` pozostają nieodhaczone.
- **Commity faz i przejścia między fazami — agent decyduje SAM, bez pytania** (2026-08-04). Bez bramki „zatwierdź wiadomość commita" i bez pytań „następna faza / wyczyść / przegląd". `git push` / PR / merge nadal wymagają jawnej komendy użytkownika (ścieżka prod).
