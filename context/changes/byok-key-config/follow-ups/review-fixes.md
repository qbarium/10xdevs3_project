# Review follow-ups — byok-key-config (S-01)

Działania wynikłe z triażu `/10x-impl-review` (raport: `reviews/impl-review.md`).

## F1 — CSRF na mutujących endpointach (ACCEPTED-AS-RISK, Fix A)

- **Decyzja**: zaakceptowane jako ryzyko; to dług dziedziczony z całej aplikacji, nie regresja S-01.
- **Weryfikacja SameSite (2026-06-09)**: `src/lib/supabase.ts` nie pinuje jawnie atrybutu `SameSite` — `setAll` przekazuje `options` z domyślnych `@supabase/ssr` (domyślnie `sameSite: 'lax'`). Mitygacja CSRF dla cross-site POST/DELETE istnieje więc przez domyślną bibliotekę + domyślną politykę przeglądarki (Lax), ale **nie jest jawnie zakotwiczona w kodzie repo**.
- **Follow-up (app-wide, poza S-01)**: rozważyć w osobnej zmianie ujednoliconą postawę CSRF dla wszystkich mutujących endpointów (auth + profile): albo jawne pinowanie `SameSite=Lax/Strict` na cookie sesji, albo walidacja `Origin`/`Referer`, albo token CSRF. Dotyczy też `src/pages/api/auth/*`.
- **Status**: nie blokuje merge S-01.
