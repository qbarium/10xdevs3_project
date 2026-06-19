# Follow-ups z przeglądu implementacji — trash-lifecycle (S-06)

Źródło: `/10x-impl-review` z 2026-06-19. Werdykt: ZAAKCEPTOWANY. Poniżej ustalenia odłożone jako osobne zmiany (nie naprawiane w S-06).

## F3 — Utwardzenie anty-CSRF mutujących endpointów (ogólnoprojektowe)

- **Ważność**: 🔭 OBSERWACJA (nie regresja S-06)
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: `src/pages/api/items/trash/empty.ts`, `src/pages/api/items/bulk.ts`, `src/pages/api/items/operational.ts`, `src/pages/api/items/[id].ts`, `src/pages/api/items/index.ts`

**Problem**: Mutujące/kasujące endpointy POST/PATCH (w tym jedyny twardy DELETE `emptyTrash`) opierają obronę anty-CSRF wyłącznie na `SameSite=Lax` cookies sesji Supabase. Autoryzacja per-user jest poprawna (auth-gate `locals.user` + RLS), ale brak dodatkowej warstwy (origin-check / token CSRF). `SameSite=Lax` blokuje cross-site POST z innej domeny, więc ryzyko praktyczne jest niskie — ale operacja nieodwracalna (hard DELETE) polega na tej jednej warstwie.

**Zakres**: Ogólnoprojektowy — dotyczy wszystkich mutujących endpointów, nie tylko kosza. Świadomie NIE naprawiane w S-06 (poza zakresem; nie regresja).

**Proponowane rozwiązanie**: Wspólny guard origin-check (porównanie nagłówka `Origin`/`Referer` z dozwoloną domeną) w warstwie middleware lub helperze współdzielonym przez endpointy mutujące. Alternatywnie token CSRF dla form/fetch. Rozważyć przy najbliższej zmianie dotykającej warstwy API/auth.

**Status**: OTWARTE (follow-up, nie zaplanowane do konkretnej zmiany).

---

## F4 — restoreFromTrash atomowy przez RPC (ZAAKCEPTOWANE bez działania)

> Decyzja właściciela 2026-06-19: **akceptujemy bez zmian**. Pozostawione tu jako kontekst, nie jako otwarty follow-up.

`restoreFromTrash` (`src/lib/services/items-mutation.ts`) wykonuje dwa UPDATE-y poza transakcją (deleted→accepted, rejected→pending). Pełna atomowość wymagałaby funkcji Postgres (RPC) + migracji — świadomie poza zakresem S-06 (który był bez migracji). Ryzyko znikome, bez korupcji (stan spójny per-item po reloadzie). Gdyby kiedyś wracać: funkcja SQL `restore_from_trash(ids)` z `security invoker` (RLS) + podmiana serwisu na `supabase.rpc(...)`.
