---
change_id: byok-secret-security
title: Bezpieczna warstwa sekretu BYOK — szyfrowanie at-rest + filtr maskujący w logach
status: implemented
created: 2026-06-07
updated: 2026-06-07
archived_at: null
---

## Notes

Źródło: `@context/foundation/roadmap.md` → F-01 (fundament, status `ready`, gwiazda przewodnia łańcucha A).

Wynik: helper szyfrowania/odszyfrowania klucza BYOK w spoczynku (KEK z konfiguracji aplikacji) + aktywny filtr maskujący ciągi w kształcie klucza w warstwie loggera i raportowania błędów — działa, zanim jakikolwiek klucz zostanie zapisany lub użyty.

Odnośniki PRD: FR-021, FR-026, NFR „Klucze API w stanie spoczynku", NFR „Prywatność wsadu".
Odblokowuje: S-01 (zapis zaszyfrowanego klucza), S-02 (wywołanie dostawcy AI bez wycieku klucza do logów).
Niewiadoma do rozstrzygnięcia w planie: polityka rotacji KEK (PRD OQ7) — dla MVP wystarcza statyczny KEK w konfiguracji.
GitHub: parent Issue #4 (etykieta `foundation` + `north-star`).
