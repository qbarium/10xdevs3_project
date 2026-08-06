---
change_id: trash-sidebar-relocation
title: Kosz jako osobne miejsce w panelu bocznym
status: archived
created: 2026-08-06
updated: 2026-08-06
archived_at: 2026-08-06T18:09:43Z
---

## Notes

Wywodzi się z roadmapy **S-16** (`trash-sidebar-relocation`). Reorganizacja IA: „Kosz" jako osobne miejsce w panelu bocznym (nie zakładka pod „Wpisami"); oś „Wpisów" zostaje tylko cyklem życia. Pochodzenie (odrzucone / usunięte) nadal widoczne przez badge na karcie — **bez osobnego filtra pochodzenia** (zdjęty z zakresu 2026-08-06). **Bez zmian zachowania** — US-05 / FR-013 / FR-016 dotknięte wyłącznie prezentacyjnie (przywracanie i „Wyczyść kosz" bez zmian).

Wymagania wstępne: **S-06** (`trash-lifecycle` — model kosza: `rejected`+`deleted`, restore świadomy pochodzenia), **S-15** (`ui-redesign` — powłoka/sidebar + płaska oś stanu; już zmergowane).

Niewiadoma do `/10x-plan`: czy dołożyć licznik kosza w sidebarze (jak licznik „Do akceptacji").

Ryzyko: wyjęcie „Kosza" z osi stanu rusza `state-filter.ts` i jego **zamrożony test** `state-filter.test.ts` (trasa `trash` + etykieta „Kosz") — legalna zmiana kontraktu, do zrobienia świadomie z testem.
