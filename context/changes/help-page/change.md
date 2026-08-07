---
change_id: help-page
title: Pomoc dla użytkownika — strona w aplikacji opisująca działanie
status: impl_reviewed
created: 2026-08-07
updated: 2026-08-07
archived_at: null
---

## Notes

Cel: dodać **pomoc dla użytkownika końcowego** (po polsku) opisującą działanie TaskerLight — widoczną w aplikacji, nie w repo.

Kierunek uzgodniony wstępnie (do potwierdzenia w `/10x-frame`):

- **Osobna strona w aplikacji**, trasa `/help`, etykieta „Pomoc" w **stopce sidebara obok „Ustawienia"** (utility nav). Angielska trasa + polska etykieta — jak `/profile`→„Ustawienia", `/ingest`→„Skrzynka wejściowa".
- Renderowana w `AppLayout`; treść statyczna (Astro), stylowana istniejącym designem.
- Mechanicznie ~ ta sama zmiana co S-16 „Kosz": nowy wariant ikony w `Icon.astro`, pozycja w `AppSidebar.astro`, matcher w `nav-active.ts` (+ test), nowa strona `src/pages/help.astro`.
- Zakres treści (zadaniowo): Skrzynka wejściowa → klasyfikacja → akceptacja/odrzucenie/edycja pendingów; cykl życia (Aktywne/W toku/Zakończone/Anulowane); Kosz (przywróć/wyczyść, pochodzenie na badge); Sesje importu + ponów; klucz BYOK w profilu.

Do rozstrzygnięcia w `/10x-frame`:

- Forma: osobna strona vs „?" panel kontekstowy w topbarze vs podpowiedzi w pustych stanach (albo kombinacja).
- Głębokość: ile opisywać; jedna strona vs sekcje/podstrony.
- Dostęp: strona chroniona (za logowaniem) czy publiczna.
- Śledzenie: samodzielna zmiana czy wpis `S-NN` na roadmapie + Issue na boardzie.

Poza zakresem: dokumentacja dla deweloperów/agentów (`README`, `AGENTS.md`) — inny odbiorca (`/10x-agents-md`).
