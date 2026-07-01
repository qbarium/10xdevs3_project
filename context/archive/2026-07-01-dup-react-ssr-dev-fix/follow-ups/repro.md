# Repro deterministyczny — dup-React SSR (dev-only)

> Kopiowalna procedura odtworzenia i weryfikacji błędu „Invalid hook call / more than one copy of React"
> na wyspach React w `npm run dev` (Astro `output:"server"` + Vite + adapter workerd). Powstało w S-12.

## Kryterium „naprawione"

BRAK mid-session re-optymalizacji Vite na zimnym starcie (brak `optimized dependencies changed. reloading`)
na sesji, która realnie przechodzi wszystkie klasy późno-odkrywanych depów. Dodatkowo dowód strukturalny:
cała populacja przypięta na POCZĄTKU `deps_ssr/_metadata.json` (nie w ogonie), jeden `browserHash`.

## Procedura

1. Odstaw cache BEZ `--force` (nie usuwaj `node_modules`):

   ```bash
   # bez rm -rf: skasuj pliki, potem puste katalogi
   find node_modules/.vite -type f -delete; find node_modules/.vite -depth -type d -empty -delete
   find .astro -type f -delete; find .astro -depth -type d -empty -delete
   ```

   `--force` tłumi re-optymalizację → fałszywy zielony wynik.

2. Zimny start: `npm run dev` (nasłuch na IPv6 `::1`; wchodź przez `http://localhost:4321`, curl przez `http://[::1]:4321`).

3. Pokryj WSZYSTKIE klasy późnego odkrycia w jednej sesji:
   - middleware (`@supabase/ssr`) — dowolne żądanie;
   - render publicznych wysp bez logowania: `GET /auth/signin`, `/auth/signup` (`SignInForm`/`SignUpForm` — seeduje `deps_ssr`);
   - render ZALOGOWANYCH wysp: `/import-sessions`, `/items`, `/items/active`, `/items/trash`
     (ciągną `react-dom/server`, `lucide-react`, `sonner`, `radix-ui`, `button→cva/clsx/tailwind-merge`
     oraz graf `EditItemDialog`/`AddItemDialog` → `zod` przez importy statyczne);
   - trasa API z `zod`: `PATCH /api/items/[id]` (moduł ładuje `zod` nawet przy odpowiedzi 401).

4. Kryterium sukcesu: w logu dev ZERO `optimized dependencies changed. reloading` i zero `Invalid hook call`
   na całej sesji. Strukturalnie: `deps_ssr/_metadata.json` — populacja na początku `optimized`, jeden `browserHash`;
   żaden `_metadata.json` nieprzepisany po cold-scanie (mtime ze startu).

### Konto testowe przez curl (bez klikania w przeglądarce, workerd)

„Confirm email" = OFF w lokalnym Supabase → signup daje od razu logowalne konto. CSRF Astro (`checkOrigin`)
wymaga nagłówka `Origin` zgodnego z `Host`:

```bash
ORIGIN="http://[::1]:4321"
curl -s -H "Origin: $ORIGIN" -X POST "http://[::1]:4321/api/auth/signup" \
  --data-urlencode "email=s12test@example.com" --data-urlencode "password=Password123!"
curl -s -c cookies.txt -H "Origin: $ORIGIN" -X POST "http://[::1]:4321/api/auth/signin" \
  --data-urlencode "email=s12test@example.com" --data-urlencode "password=Password123!"
curl -s -b cookies.txt -o /dev/null -w "%{http_code}\n" "http://[::1]:4321/import-sessions"  # 200 = wyspa wyrenderowana
```

Statyczne importy `EditItemDialog`/`AddItemDialog` sprawiają, że render SSR strony ewaluuje graf `zod` —
nie trzeba fizycznie otwierać dialogu, by pokryć tę ścieżkę odkrycia depu.

## Co NIE jest dowodem

- **Zielony `npm run build`** — przy `output:"server"` build NIE SSR-uje stron, więc nie wykryje crashu runtime.
- **Pojedynczy udany render / zimny render** — nie wyzwala wyścigu (ten wymaga reopt w trakcie sesji).
- **Sesja z `--force`** — `--force` tłumi re-optymalizację → fałszywy zielony wynik.
- **`reopt_fired=0` bez pokrycia dialogu (`zod`) i trasy API** — mierzy pokrycie testu, nie eliminację populacji (luka S-10).
- **Ustabilizowany snapshot `_metadata.json`** — rozjazd generacji jest przejściowy (tylko w oknie reopt); snapshot
  w spoczynku pokaże jeden `browserHash`, nawet gdy bug żyje. Dowodem jest BRAK zdarzenia reopt, nie zgodność hashy w spoczynku.

## Wynik weryfikacji S-12 (2026-07-01)

Fix: `astro.config.mjs` — `ssr.optimizeDeps.include` rozszerzony do 15 specyfikatorów (cała populacja). Zimny start
bez `--force`, pełna sesja (middleware + publiczne + zalogowane wyspy + `zod` API): **zero reopt, zero Invalid hook call**.
`deps_ssr/_metadata.json` — 15 pinów w liniach 7–91 (początek `optimized`), `browserHash 217bc995`. Parytet top-level
zbędny (`deps_astro` bez populacji `?v=`). Commity: `27b46f0` (Faza 1), `df3b198` (Faza 2).
