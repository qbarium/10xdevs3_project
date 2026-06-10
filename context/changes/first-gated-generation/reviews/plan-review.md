<!-- PLAN-REVIEW-REPORT -->
# Przegląd planu: Pierwsza bramkowana generacja (S-02)

- **Plan**: `context/changes/first-gated-generation/plan.md`
- **Tryb**: Głęboki
- **Data**: 2026-06-10
- **Werdykt**: DO POPRAWY → **SOLIDNY** (po sortowaniu 2026-06-10: 4/4 ustalenia naprawione)
- **Ustalenia**: 0 krytycznych · 3 ostrzeżenia · 1 obserwacja — wszystkie NAPRAWIONE

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność ze stanem końcowym | ZALICZONY |
| Oszczędna realizacja | ZALICZONY |
| Dopasowanie architektoniczne | ZALICZONY |
| Martwe punkty | OSTRZEŻENIE → ZALICZONY (F1, F3, F4 naprawione) |
| Kompletność planu | OSTRZEŻENIE → ZALICZONY (F2 naprawione) |

## Ugruntowanie

16/16 ścieżek ✓ (wszystkie pliki bazowe istnieją), 4/4 symbole ✓ (`decryptApiKey`→`byok-crypto.ts:53`, `getKeyStatus`→`profile-key.ts:40`, `maskKeyForDisplay`→`byok-display.ts:11`, `PROTECTED_ROUTES`→`middleware.ts:4`), brief↔plan ✓, Postęp↔Faza 8/8 ✓ (format zgodny z wdrożonym planem `byok-key-config` — dowód parsowalności przez `/10x-implement`). `contract-surfaces.md` nie istnieje → sprawdzenie powierzchni kontraktu pominięte (opt-in).

Weryfikacja bazy kodu (subagent): A) wzorzec `envField.string({context,access,optional})` powtarzalny 1:1, brak globalnego `OPENAI_API_KEY` w runtime (jedyne trafienie `supabase/config.toml:95` to klucz Studio AI). B) gałąź zalogowanego w `Topbar.astro:10-25` istnieje. C) wzorzec RLS z `profiles` potwierdzony; **ryzyko `on delete restrict` potwierdzone** (F1). D) Responses `text.format` potwierdzone w docs; `user` „being replaced by `safety_identifier`" (docs nie używa dosłownie „deprecated"); nazwy pól Chat Completions nie ma w docs, ale nic sprzecznego. E) `PROTECTED_ROUTES` lokalne/izolowane, brak wcześniejszego `AbortController`, `zod` faktycznie nowy.

## Ustalenia

### F1 — `on delete restrict` może zablokować kaskadowe usunięcie użytkownika

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 1 — migracja `classification_schema`
- **Szczegóły**: Migracja nadaje OBU tabelom (`items`, `import_sessions`) `user_id ... references auth.users(id) on delete cascade` (jawna intencja: sprzątać po usunięciu konta), ale `items.import_session_id ... on delete restrict` koliduje z tą kaskadą. Gdy usuwany jest wiersz `auth.users`, kaskada chce skasować `import_sessions`, podczas gdy `items` wciąż je referują. `RESTRICT` jest nieodraczalny i sprawdzany natychmiast → zgłasza błąd i blokuje całe usunięcie usera. `NO ACTION` (domyślny, odraczalny do końca instrukcji) przepuściłby je, bo `items` znikają własną kaskadą `user_id`. Potwierdzone weryfikacją semantyki PostgreSQL. Wewnętrzna sprzeczność w obrębie samej migracji (cascade vs restrict). Nie blokuje głównej ścieżki S-02 (stąd OSTRZEŻENIE, nie KRYTYCZNE), ale uderza przy usunięciu konta / żądaniu GDPR.
- **Poprawka A ⭐ Zalecana**: `on delete restrict` → `on delete no action` na `items.import_session_id`
  - Siła: NO ACTION przepuszcza kaskadę usera (items znikają własną kaskadą `user_id` przed odroczonym sprawdzeniem), a JEDNOCZEŚNIE samodzielny `DELETE` sesji z itemami nadal zgłasza błąd — guard audit trail (FR-015) zachowany. Zero osłabienia intencji.
  - Kompromis: Subtelność NO ACTION vs RESTRICT bywa myląca przy czytaniu migracji — wymaga jednolinijkowego komentarza intencji.
  - Pewność: WYSOKA — weryfikacja potwierdziła mechanizm odraczania; wzorzec auth.users cascade już sprawdzony w `profiles`.
  - Martwy punkt: Niezweryfikowane realnym integ-testem usunięcia usera (warto dodać w kryteriach Fazy 1).
- **Poprawka B**: `on delete restrict` → `on delete cascade` na `items.import_session_id`
  - Siła: Najprostsza semantyka; kaskada usera działa bezwarunkowo, brak subtelności NO ACTION.
  - Kompromis: Osłabia guard „nie da się skasować sesji z itemami" na poziomie DB — sprzeczne z deklaracją „brak usuwania sesji w MVP" + celem audit trail (FR-015).
  - Pewność: WYSOKA — cascade jest jednoznaczny.
  - Martwy punkt: Wymaga gwarancji app-level, że nie ma ścieżki kasowania sesji (inaczej ciche kasowanie itemów).
- **Decyzja**: NAPRAWIONE (Napraw inaczej — wybrano `on delete set null` zamiast restrict/no-action/cascade: usunięcie sesji czyści link, item zostaje; kaskada `user_id` usuwa wszystko przy usunięciu konta, a SET NULL jako akcja nie blokuje kaskady. Naniesione: SQL migracji Faza 1 + nota; PRD FR-015 złagodzony do best-effort audit trail; nowa lekcja w `lessons.md`.)

### F2 — Niejednoznaczny przepływ `userId` vs `userHash` (endpoint ↔ classify)

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Kompletność planu
- **Lokalizacja**: Faza 2 #8 (`classify`) ↔ Faza 3 (sekwencja endpointu)
- **Szczegóły**: `classify(rawText, { apiKey, userId, signal })` przyjmuje `userId`, ale `buildChatRequest({ … userHash })` oczekuje `userHash`, a sekwencja endpointu (Faza 3) wymienia osobny krok „hashUserId; … classify(…)". Nie jest rozstrzygnięte, GDZIE pada `hashUserId` ani czy jego wynik wpływa do żądania — grozi to podwójnym albo nieużytym hashem. Implementator musi zgadywać.
- **Poprawka**: Ustal jedno miejsce hashowania — `classify` przyjmuje `userId` i woła `hashUserId` wewnętrznie tuż przed `buildChatRequest`; usuń osobny krok „hashUserId" z sekwencji Fazy 3 (albo odwrotnie: endpoint liczy `userHash`, a sygnatura `classify` bierze `userHash`). Jedno źródło prawdy.
- **Decyzja**: NAPRAWIONE (Napraw w planie — hashowanie wewnątrz `classify`: Faza 2 #8 pokazuje `hashUserId(userId)` → `buildChatRequest({…, userHash})`, Faza 2 #6 zaznacza „wołany przez classify, nie endpoint", a sekwencja Fazy 3 nie zawiera już osobnego `hashUserId`.)

### F3 — Relacja limitu 300 KB (plik) ↔ 100 000 znaków (paste) nieokreślona

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 7 (dekodowanie/upload) ↔ Faza 2 #7 (`sanitizeInput`)
- **Szczegóły**: Plik ≤ 300 KB (FR-018) po dekodowaniu daje do ~150–300k znaków (Windows-1250 ≈ 1 bajt/znak), co przekracza `INPUT_MAX_CHARS = 100000` (FR-002). Plan kieruje plik przez `sanitizeInput` i „dalej identyczna ścieżka jak paste" (gdzie „za długi → fail"). Czy więc poprawny plik ≤ 300 KB bywa odrzucany za > 100k znaków? Dwa limity w różnych jednostkach kolidują, a plan tego nie godzi.
- **Poprawka**: W Fazie 7 jawnie określ, czy `INPUT_MAX_CHARS` obowiązuje wejście plikowe. Jeśli plik może je przekroczyć — oddziel kontrolę limitu znaków (tylko paste) od `sanitizeInput`, a dla pliku zdefiniuj zachowanie (odrzuć z komunikatem o limicie treści LUB świadomie dopuść, bo 300 KB ≈ 75–100k tokenów mieści się w oknie 128k gpt-4o-mini).
  - Siła: Usuwa zgadywanie implementatora; godzi FR-018 (≤300 KB) z FR-002 (≤100k znaków).
  - Kompromis: Wymaga decyzji produktowej (czy plik > 100k znaków dozwolony) przed Fazą 7.
  - Pewność: ŚREDNIA — intencja produktowa nieudokumentowana w PRD.
  - Martwy punkt: Niepoliczone dokładnie tokeny 300 KB wsadu vs okno 128k (zgrubnie mieści się).
- **Decyzja**: NAPRAWIONE (Plik tylko limit 300 KB — `INPUT_MAX_CHARS` to bramka wyłącznie paste; plik ≤300 KB klasyfikuje się nawet >100k znaków (okno 128k tokenów). Naniesione: Faza 2 #7 `sanitizeInput` „tylko normalizuje, limit paste-only egzekwowany przez wołającego"; Faza 7 #3 „limit pliku = wyłącznie 300 KB, INPUT_MAX_CHARS nie egzekwowany na treści pliku".)

### F4 — `OPENAI_MAX_TOKENS=8000` vs safety-net 100 itemów (napięcie arytmetyczne)

- **Waga**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 2 #1 (config) ↔ „Krytyczne szczegóły implementacji" (safety net 100)
- **Szczegóły**: 8000 tokenów / 100 itemów ≈ 80 tokenów/item z narzutem JSON. Itemy z wielozdaniowym `description` łatwo to przekroczą → obcięcie → błąd kontraktu → sesja `failed`, nawet dla poprawnie dużego wsadu. Plan oznacza maxTokens „do kalibracji", więc ryzyko jest dostrzeżone — stąd obserwacja, nie ostrzeżenie.
- **Poprawka**: Odnotuj to napięcie wprost; skalibruj domyślny limit w górę LUB ogranicz długość `description` w prompcie, by 100 itemów się zmieściło bez obcięcia.
- **Decyzja**: NAPRAWIONE (Napraw inaczej — twardy default `OPENAI_MAX_TOKENS` podniesiony 8000 → `16000` (~160 tokenów/item przy safety-net 100). Naniesione: Faza 2 #1 config + jawne uzasadnienie napięcia i odejścia od wytycznych §6.)
