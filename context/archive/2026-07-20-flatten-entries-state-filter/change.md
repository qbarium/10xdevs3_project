---
change_id: flatten-entries-state-filter
title: Konsolidacja filtra stanu Wpisów — jedna kontrolka zamiast rozwijanej listy + pigułek
status: archived
created: 2026-07-20
updated: 2026-07-22
archived_at: 2026-07-22T05:29:32Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- **2026-07-20 — /10x-frame, triaż ram ZAKOŃCZONY (pewność WYSOKA):** obserwacja „combo »Aktywne ▾« + pigułki »Wszystkie/Nowe/W toku« to dublowanie" → rozstrzygnięta jako **NIE duplikacja**. To dwa przybliżenia tej samej osi operacyjnej (gruby przełącznik widoku + drobny podfiltr), plus Kosz (oś akceptacji) doklejony do combo. Usunięcie którejkolwiek kontrolki traci funkcję. Brief: `frame.md`.
- **Decyzje użytkownika w trakcie ramowania (2026-07-20):**
  - Kierunek: **spłaszczyć oś stanu do jednej kontrolki** (nie usuwać wariantu).
  - **Kosz zostaje w filtrze stanu** (odrzucono wcześniejszą tezę frame o wynoszeniu Kosza do osobnej nawigacji) — „stan" produktowo = kubełek cyklu życia razem z koszem, wg szkicu docelowego.
  - Kształt osi: **worek „Wszystko aktywne" + rozłączne stany** → *Wszystko aktywne / Nowe / W toku / Zakończone / Anulowane / Kosz* (kolejność cyklu życia, zgodna z `BULK_TARGETS`).
  - **Dwa horyzonty:** (a) **teraz, stary UI** — te pozycje wchodzą do istniejącej **rozwijanej listy** `EntriesViewSelect` + porządek; pigułki `OperationalSubFilter` znikają. (b) **docelowo** — ta sama zawartość jako **poziome taby** wg szkicu (osobny, późniejszy krok).
- Szkic docelowy: załącznik użytkownika 2026-07-20 (poziomy filtr stanu z licznikami + osobny rząd pigułek typu).
