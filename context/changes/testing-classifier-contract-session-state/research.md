---
date: 2026-07-12T12:51:08+02:00
researcher: Jakub
git_commit: 136e710a25acb2857ad6c5e91110f84763231634
branch: main
repository: 10xdevs3_project
topic: "Kontrakt odpowiedzi klasyfikatora i stan sesji importu (Faza 3 planu testów)"
tags: [research, codebase, classifier, contract, import-sessions, retry, fr-005, fr-020]
status: complete
last_updated: 2026-07-12
last_updated_by: Jakub
---

# Research: Kontrakt odpowiedzi klasyfikatora i stan sesji importu (Faza 3 planu testów)

**Date**: 2026-07-12T12:51:08+02:00
**Researcher**: Jakub
**Git Commit**: 136e710a25acb2857ad6c5e91110f84763231634
**Branch**: main
**Repository**: 10xdevs3_project

## Research Question

Faza 3 wdrożenia planu testów (`context/foundation/test-plan.md` §3, wiersz „Kontrakt klasyfikatora + stan sesji"). Ryzyka #6 i deterministyczna część #3. Cztery pytania z `change.md`, na które badanie ma dać kotwice plik:linia:

1. **Gdzie sprawdzany jest kształt odpowiedzi klasyfikatora** (walidacja kontraktu, FR-005) i co się dzieje przy braku pól obowiązkowych.
2. **Jak odróżnia się „0 itemów" od błędu** — czy pusta odpowiedź to poprawny wynik, a nie awaria.
3. **Gdzie działa limit 100** (safety-net FR-020) i co się dzieje powyżej.
4. **Gdzie zapisywany jest stan sesji** („nie udało się" + możliwość ponowienia).

## Summary

Wszystkie cztery zachowania **istnieją w kodzie i są rozłączne** — to dobra wiadomość dla planu testów: nie łatamy braków, tylko **przypinamy istniejący kontrakt testem regresyjnym**. Najważniejsze ustalenia:

- **Walidacja kontraktu jest czterowarstwowa** (dwa ręczne `JSON.parse` + ręczne sprawdzenie koperty OpenAI + jeden `zod.safeParse`). Każde naruszenie rzuca jeden typ wyjątku `ClassifierContractError`, który wyżej mapuje się na kod `"contract"` i kończy sesję jako `failed`. Sesja **nigdy nie zostaje w `processing`**.
- **Pusta odpowiedź `{"items":[]}` to ścieżka SUKCESU** (`completed_no_items`, HTTP 200, `ok:true`) — sprawdzana _przed_ ścieżką błędu i _osobnym_ statusem terminalnym. Jedyne „puste", które jest błędem, to brak treści (`content`) w kopercie modelu — a to prawdziwe naruszenie kontraktu, nie zero itemów.
- **Limit 100 to twarde ODRZUCENIE całego wsadu**, nie ucięcie (`slice`). Granica jest ostra: dokładnie 100 przechodzi, 101 → `failed` z kodem `too_many_items`, zero zapisanych itemów. Świadomie ulokowany w serwisie (`classify-core.ts`), NIE w schemacie zod.
- **Model stanu sesji ma cztery wartości** (`processing`, `completed_with_items`, `completed_no_items`, `failed`) — **bez `pending` i bez `succeeded`**. Ponowienie działa tylko dla `failed`, przez atomową bramkę TOCTOU (`WHERE status='failed'`), i reużywa ten sam wiersz. Wsad jest zachowany do ponowienia (paste w `raw_input`, plik w Storage `import-files`).

**Jedna pułapka do przekazania planistowi (behawioralna, nie luka):** zwykłe awarie klasyfikacji zwracają **HTTP 200 / `ok:true` / `status:"failed"`** — więc asercja `res.ok === false` przegapiłaby prawie wszystkie ścieżki błędu. Tylko `too_many_items` (422) i błędy na poziomie żądania używają `ok:false`. Test musi asertować `body.status === "failed"` + `body.code`, nie sam status HTTP.

**Jedna luka do negatywnej przestrzeni (nie do naprawy w tej fazie):** sesja z nieudanym uploadem pliku (`code: "storage"`) jest **trwale nie-do-ponowienia** — nie ma czego wczytać, a `loadSessionInput` znów rzuci. Warto to nazwać jako świadomie nietestowane / znany tryb awarii, nie jako regresję.

## Detailed Findings

### 1. Walidacja kontraktu odpowiedzi (FR-005) — cztery warstwy

Ścieżka wywołania: `POST /api/ingest/classify` → `runClassification` (`classify-core.ts`) → `classify()` (`classifier.ts`) → `parseChatResponse` (`request.ts`) + zod (`schema.ts`). To **nie** jest goły `JSON.parse` — walidacja jest rozłożona na cztery etapy:

- **Warstwa 1 — ciało HTTP jako JSON** (ręczny try/catch): [`src/lib/ai/classifier.ts:88-93`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/classifier.ts#L88-L93) → `ClassifierContractError("Odpowiedź klasyfikatora nie jest poprawnym JSON.")`.
- **Warstwa 2 — koperta OpenAI** (ręczne sprawdzenia): [`src/lib/ai/request.ts:59-72`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/request.ts#L59-L72), wołana z [`classifier.ts:96`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/classifier.ts#L96). Rzuca `ClassifierContractError` gdy: `finish_reason === "length"` (obcięcie, linia 61), `message.refusal` (odmowa modelu, linia 64), `content` nie jest niepustym stringiem (linia 68).
- **Warstwa 3 — treść jako JSON i wyciągnięcie `.items`** (ręczny try/catch): [`classifier.ts:98-103`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/classifier.ts#L98-L103). Bez pola `items` → `payload = undefined` → poleci na warstwie 4.
- **Warstwa 4 — zod na tablicy itemów**: [`classifier.ts:105-108`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/classifier.ts#L105-L108) woła `classificationResultSchema.safeParse(payload)`; przy `!success` → `ClassifierContractError(..., { cause: parsed.error })`.

**Schemat zod (kontrakt itemu)** — [`src/lib/ai/schema.ts:13-20`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/schema.ts#L13-L20):

```ts
export const classifiedItemSchema = z.object({
  type: z.enum(ITEM_TYPES),      // wymagane, jedno z 5
  title: z.string().min(1),      // wymagane, niepuste
  description: z.string(),       // wymagane, MOŻE być pustym stringiem
});
export const classificationResultSchema = z.array(classifiedItemSchema);
```

`ITEM_TYPES = ["task","note","idea","decision","other"]` — [`schema.ts:10`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/schema.ts#L10). Zwracany DTO `ClassifiedItem` bez pól DB — [`src/types.ts:141-145`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/types.ts#L141-L145).

**Pola nadmiarowe są cicho USUWANE, nie odrzucane** — schemat używa zwykłego `z.object` (bez `.strict()`); komentarz potwierdza to w [`schema.ts:2-3`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/schema.ts#L2-L3). To ważne dla testu „nadmiarowe pole" — oczekiwany wynik to _sukces z odrzuconym polem_, nie błąd kontraktu.

**Co się dzieje przy naruszeniu:** każdy z powyższych błędów → `ClassifierContractError` → złapany w [`classify-core.ts:78-86`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/classify-core.ts#L78-L86), zmapowany na kod `"contract"` przez `mapClassifyError` ([`classify-core.ts:41-49`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/classify-core.ts#L41-L49)), sesja → `failSession(..., "contract")`. **Uwaga do testu:** wszystkie różne naruszenia kontraktu kolapsują do jednego kodu `"contract"` — konkretny powód żyje tylko w nietransmitowanym polskim komunikacie. Test może rozróżnić przyczyny na poziomie `classify()`/`parseChatResponse` (typ wyjątku), ale nie na poziomie odpowiedzi HTTP.

Gwarancja po stronie modelu to Structured Outputs (`response_format: json_schema, strict`) budowany przez [`request.ts:30-33`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/request.ts#L30-L33) + `buildJsonSchema()` ([`schema.ts:30-48`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/schema.ts#L30-L48), `additionalProperties:false`, wszystkie pola `required`). Zod jest **drugą linią** — „broni na granicy" nawet gdyby model złamał kontrakt (dokładnie klasa testu, którą pisze Faza 3).

### 2. „0 itemów" vs błąd — rozłączne, sukces sprawdzany pierwszy

Zero itemów to pełnoprawna ścieżka sukcesu, sprawdzana **przed** ścieżką błędu — [`classify-core.ts:72-75`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/classify-core.ts#L72-L75):

```ts
if (items.length === 0) {
  await finalizeEmpty(supabase, sessionId);
  return { status: "completed_no_items", itemCount: 0 };
}
```

`finalizeEmpty` zapisuje `status: "completed_no_items", item_count: 0` — [`src/lib/services/import-session.ts:46-52`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/services/import-session.ts#L46-L52) — i **świadomie NIE woła RPC** (komentarz w migracji, [`classification_schema.sql:5`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/supabase/migrations/20260610052532_classification_schema.sql#L5)). Mapowanie HTTP zwraca sukces — [`classify-core.ts:102-104`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/classify-core.ts#L102-L104): `200 { ok:true, status:"completed_no_items", itemCount:0 }`.

**Kluczowe rozróżnienie:** poprawny składniowo `{"items":[]}` przechodzi zod (pusta tablica jest legalna) i trafia w gałąź zero-itemów. Jedyne „puste", które jest błędem, to **pusty `content`** w kopercie modelu (model nic nie zwrócił) — łapane wyżej w [`request.ts:67-70`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/request.ts#L67-L70) jako `ClassifierContractError` („nie zawiera treści"). To realne naruszenie kontraktu, odrębne od zera itemów.

### 3. Safety-net limitu 100 (FR-020) — twarde odrzucenie, nie ucięcie

Egzekwowany na **wyjściu** klasyfikatora (nie na wsadzie wejściowym), w serwisie, świadomie NIE w schemacie — [`classify-core.ts:22-23`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/classify-core.ts#L22-L23) i [`:67-71`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/classify-core.ts#L67-L71):

```ts
const MAX_ITEMS = 100;
...
if (items.length > MAX_ITEMS) {
  await failSession(supabase, sessionId, "too_many_items");
  logger.warn("classify: safety net > 100", { sessionId, count: items.length });
  return { status: "failed", code: "too_many_items" };
}
```

- **Odrzucenie całego wsadu**, nie `slice`/truncate — nic nie jest zapisane, sesja → `failed` z kodem `too_many_items`.
- **Granica ostra `>`**: dokładnie 100 itemów przechodzi i jest zapisane; 101+ odrzucone.
- Sprawdzenie jest **przed** gałęzią zero-itemów i przed zapisem — nie da się go ominąć.
- Schemat świadomie tego nie robi — komentarz [`schema.ts:19`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/schema.ts#L19): „Anomalię > 100 itemów obsługuje serwis (Faza 3), nie schemat."
- **Brak limitu liczby na WEJŚCIU** — paste ogranicza tylko znaki (`INPUT_MAX_CHARS`, [`classify.ts:80`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/pages/api/ingest/classify.ts#L80)), plik tylko bajty (300 KB, [`file-upload.ts:16`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/services/file-upload.ts#L16)). 100 to wyłącznie strażnik anomalii wyjścia.

**Uwaga:** nie mylić z limitem znaków paste `100000` — to inny koncept (długość wsadu, nie liczba itemów).

### 4. Stan sesji — model, zapis statusu, ponowienie

**Model stanu (enum, nie CHECK)** — [`classification_schema.sql:23-24`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/supabase/migrations/20260610052532_classification_schema.sql#L23-L24):

```sql
create type import_session_status as enum
  ('processing', 'completed_with_items', 'completed_no_items', 'failed');
```

Kolumna `status ... not null default 'processing'` ([`:33`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/supabase/migrations/20260610052532_classification_schema.sql#L33)). Lustro TS: `ImportSessionStatus` — [`src/types.ts:82`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/types.ts#L82). **Brak `pending`, brak `succeeded`** — „sukces" to dwa różne stany (`completed_with_items` / `completed_no_items`), a start ląduje wprost w `processing`.

**Gdzie zapisywany jest status** (wszystko przez klienta RLS w `src/lib/services/import-session.ts`, nie service-role):

| Przejście | Funkcja / kotwica | Wołane z |
| --- | --- | --- |
| → `processing` (start) | `createSession` — [`import-session.ts:23-25`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/services/import-session.ts#L23-L25) | `classify.ts:109` (plik), `classify.ts:147` (paste) |
| → `completed_with_items` | RPC `persist_classification` (atomowo) — [`operational_status_all_types.sql:58-60`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/supabase/migrations/20260615152731_operational_status_all_types.sql#L58-L60), przez `persistItems` [`:36-39`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/services/import-session.ts#L36-L39) | `classify-core.ts:76` |
| → `completed_no_items` | `finalizeEmpty` — [`import-session.ts:46-52`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/services/import-session.ts#L46-L52) | `classify-core.ts:73` |
| → `failed` | `failSession` (`status:"failed", error_message: code`) — [`import-session.ts:55-61`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/services/import-session.ts#L55-L61) | `classify-core.ts:68` (too_many_items), `:81` (dowolny wyjątek), `classify.ts:118/131/138` (storage/encoding/empty_file), `retry.ts:95/102` |
| `failed` → `processing` (ponów) | `reopenSession` (atomowy TOCTOU) — [`import-session.ts:226-235`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/services/import-session.ts#L226-L235) | `retry.ts:113` |

**Mapowanie błędów klasyfikacji na kody** — [`classify-core.ts:41-49`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/classify-core.ts#L41-L49): `AbortError → "timeout"` (60 s AbortController, [`:60-63`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/ai/classify-core.ts#L60-L63)), `ClassifierAuthError → "invalid_key"`, `ClassifierProviderError → "provider"`, `ClassifierContractError → "contract"`, `UnsupportedModelError → "unsupported_model"`, reszta → `"unknown"`.

**Ponowienie (retry)** — endpoint [`src/pages/api/import-sessions/retry.ts:25`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/pages/api/import-sessions/retry.ts#L25), body `{ sessionId }` (walidacja ręczna, skalar). Warunek retryowalności — [`retry.ts:54-56`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/pages/api/import-sessions/retry.ts#L54-L56): status musi być dokładnie `failed`, inaczej `409 not_retryable`. Druga bramka to atomowe `reopenSession` z `WHERE status='failed'` — równoległy drugi retry, który już przełączył wiersz, dostaje `reopened=false` → też `409` ([`retry.ts:118-120`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/pages/api/import-sessions/retry.ts#L118-L120)). Chroni przed podwójną klasyfikacją / duplikatami. Sekwencja: auth → walidacja body → własność (RLS) → status `failed` → re-check klucza BYOK → `loadSessionInput` → `reopenSession` → wspólne `runClassification` na **tym samym `sessionId`**.

Frontend: hook `useSessionRetry` — [`src/components/hooks/useSessionRetry.ts:75`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/components/hooks/useSessionRetry.ts#L75), maszyna stanów `idle|retrying|done|error`, czysty mapper `mapRetryResponse` ([`:55`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/components/hooks/useSessionRetry.ts#L55)) — dobry kandydat na test jednostkowy czystej funkcji.

**Zachowanie wsadu przy błędzie (deterministyczna część ryzyka #3):** wiersz sesji tworzony jest **przed** klasyfikacją właśnie po to, by wsad przeżył awarię (komentarz [`classify.ts:103`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/pages/api/ingest/classify.ts#L103)). Paste → `raw_input` (DB); plik → bajty w Storage `import-files` + wiersz `import_files`. `failSession` i `reopenSession` **nie ruszają** wsadu (`raw_input`, obiekt Storage, wiersz `import_files`) — więc oba typy wsadu są odzyskiwalne. Odczyt przy ponowieniu: `loadSessionInput` — [`src/lib/services/session-input.ts:32-52`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/services/session-input.ts#L32-L52) (paste z `raw_input`, plik przez re-download + dekodowanie; tekst pliku NIGDY nie jest trzymany w DB — komentarz [`:5-7`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/src/lib/services/session-input.ts#L5-L7)).

## Code References

- `src/lib/ai/classifier.ts:39` — `classify(rawText, opts): Promise<ClassifiedItem[]>`, jedyne wejście; fetch (`:66`), koperta (`:96`), zod (`:105-108`).
- `src/lib/ai/request.ts:59-72` — `parseChatResponse`: sprawdzenia koperty OpenAI (length / refusal / brak content).
- `src/lib/ai/schema.ts:13-20` — kontrakt zod itemu + tablicy; `:30-48` — strict json_schema; `:19` — komentarz „>100 obsługuje serwis".
- `src/lib/ai/classify-core.ts:22-23,67-71` — `MAX_ITEMS = 100` + odrzucenie; `:72-75` — gałąź 0-itemów; `:41-49` — `mapClassifyError`; `:78-86` — złapanie wyjątku → `failed`; `:98-109` — `classifyResultToResponse` (mapowanie HTTP).
- `src/pages/api/ingest/classify.ts:36` — endpoint; `:103` — sesja przed klasyfikacją; `:154-155` — delegacja do rdzenia + mapper.
- `src/lib/services/import-session.ts:23-25,46-52,55-61,226-235` — `createSession`/`finalizeEmpty`/`failSession`/`reopenSession`.
- `src/lib/services/session-input.ts:32-52` — `loadSessionInput` (paste vs plik).
- `src/pages/api/import-sessions/retry.ts:25,54-56,113,118-120` — endpoint retry + bramki `failed`/TOCTOU.
- `src/components/hooks/useSessionRetry.ts:55,75` — hook + czysty `mapRetryResponse`.
- `src/types.ts:82,141-145,150-188` — `ImportSessionStatus`, `ClassifiedItem`, klasy błędów klasyfikatora.
- `supabase/migrations/20260610052532_classification_schema.sql:23-24,33` — enum + kolumna status.
- `supabase/migrations/20260615152731_operational_status_all_types.sql:58-60` — RPC `persist_classification`.

### Istniejące testy do naśladowania (kotwica dla §6 książki kucharskiej)

- `src/lib/ai/classify-core.test.ts` — rdzeń: gałęzie 0-itemów / >100 / mapowanie błędów.
- `src/pages/api/ingest/classify.test.ts` — endpoint ingest (kształty odpowiedzi).
- `src/pages/api/import-sessions/retry.test.ts` — bramki retry.
- `src/components/hooks/useSessionRetry.test.ts` — czysty mapper hooka.
- `src/lib/services/import-session.test.ts`, `src/lib/services/session-input.test.ts` — serwis.
- `tests/integration/import-session.integration.test.ts` — poziom integracyjny.

## Architecture Insights

- **Rdzeń współdzielony przez ingest i retry.** `runClassification` + `classifyResultToResponse` (`classify-core.ts`) to jedno miejsce logiki i mapowania HTTP — ingest (`classify.ts`) i retry (`retry.ts`) wołają to samo. Test rdzenia pokrywa oba wejścia tanio; nie trzeba osobnych testów „od żądania" dla każdego.
- **Trzy kształty odpowiedzi, jedna konwencja tylko dla dwóch.** Zwykłe awarie klasyfikacji: `200 { ok:true, status:"failed", code }`. `too_many_items`: `422 { ok:false, code }`. Błędy żądania (auth/body/klucz/KEK): `4xx/5xx { ok:false, error, [code] }`. To świadomy projekt (FR-006: `failed` to jeden z normalnych stanów przepływu, nie błąd transportu) — spójne z lekcją „ujednolicony kształt błędu `{ ok:false, code, error }`", ale z wyjątkiem dla stanów przepływu. **Konsekwencja dla testu:** asertuj `body.status`/`body.code`, nie `res.ok`.
- **Walidacja dwuwarstwowa (model + granica).** Structured Outputs to gwarancja modelu; zod to obrona na granicy. Faza 3 testuje właśnie warstwę graniczną — symulując model, który złamał kontrakt (bo strict json_schema można ominąć tylko atrapą fetcha, zgodnie z §4 planu: mock na granicy HTTP, brak MSW).
- **Bramki bezpieczeństwa/prywatności są ortogonalne do tej fazy.** `assertSafeBaseUrl`/`assertNoStore` (`config/ai.ts`) i maskowanie klucza pokryła Faza 1 — tu ich nie ruszamy. `error_message` trzyma tylko krótki kod (FR-026), nie szczegóły — spójne z ryzykiem #1, ale nie jego przedmiot.

## Historical Context (from prior changes)

- **Kontrakt (S-02).** Decyzja „Structured Outputs (strict) + zod na granicy" — [`context/archive/2026-06-10-first-gated-generation/plan-brief.md:24,27`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/context/archive/2026-06-10-first-gated-generation/plan-brief.md#L24-L27); szczegóły schematu — `plan.md:179-185`. Obcięta odpowiedź = naruszenie kontraktu (`plan.md:64,241`).
- **Limit 100 (S-02).** „Safety net 100 (FR-020) ... NIE zapisuj żadnego itemu, sesja → `failed` ... to nie limit produktowy" — [`context/archive/2026-06-10-first-gated-generation/plan.md:62`](https://github.com/qbarium/10xdevs3_project/blob/136e710a25acb2857ad6c5e91110f84763231634/context/archive/2026-06-10-first-gated-generation/plan.md#L62); ulokowanie w serwisie, nie w zod — `plan.md:185`. Mapowanie `too_many_items → 422` we wspólnym helperze — `context/archive/2026-06-13-import-session-log-retry/plan.md:74`.
- **0 itemów jako sukces (S-02).** „0 itemów to poprawny wynik (FR-005) ... `completed_no_items`" — `plan.md:63`; `finalizeEmpty` bez RPC — `plan.md:266,274`.
- **Stan sesji + retry (S-02 / S-08).** Enum statusu — `plan.md:92`. Retry jako osobny endpoint reużywający wiersz, atomowy `reopenSession` TOCTOU, `409 not_retryable` — `context/archive/2026-06-13-import-session-log-retry/plan-brief.md:21-22`, `plan.md:55,140`. Przycisk „Ponów" tylko dla `failed` (S-12) — `context/archive/2026-07-01-session-entries-mode/plan.md:22,341`. Reużyta migracja/enum potwierdzone w `context/archive/2026-06-24-session-items-detail/research.md:42,77`.

Wszystkie cztery tematy mają zapisane wcześniejsze decyzje projektowe — badanie potwierdza, że **kod jest zgodny z intencją planów** (żadnego dryfu implementacja↔plan). To wzmacnia charakter Fazy 3 jako „przypnij istniejący kontrakt", nie „napraw i przetestuj".

## Related Research

- `context/archive/2026-06-24-session-items-detail/research.md` — wcześniejsza eksploracja schematu `import_sessions` i serwisu sesji.
- `context/foundation/test-plan.md` §2 (ryzyka #3, #6), §6.1 (wzorzec testu jednostkowego), §6.4 (test endpointu).
- `context/foundation/lessons.md` — „ujednolicony kształt błędu `{ ok:false, code, error }`", „konfiguracja wrażliwa na bezpieczeństwo: fail-closed".

## Open Questions

Nie są to braki do naprawienia w tej fazie — to punkty do rozstrzygnięcia przez `/10x-plan` (zakres testów) lub kandydaci do negatywnej przestrzeni (§7 planu testów):

1. **Sesja z nieudanym uploadem pliku (`code:"storage"`) jest trwale nie-do-ponowienia** — `loadSessionInput` znów rzuci `SessionInputStorageError`, sesja znów `failed` (`storage`). To realny, świadomy tryb awarii. Czy plan testów ma go przypiąć (test negatywny „storage → not retryable-in-practice"), czy nazwać w §7 jako znane ograniczenie? Rekomendacja: krótki test przypinający, że retry takiej sesji kończy się `failed`/`storage`, plus notka w §7.
2. **Kody `contract` kolapsują wiele przyczyn.** Test na poziomie HTTP nie odróżni „obcięcie" od „brak pola" (oba → `contract`). Rozróżnienie jest testowalne tylko na poziomie `classify()`/`parseChatResponse` (typ wyjątku). Plan powinien świadomie wybrać poziom asercji dla każdego scenariusza z `change.md` (0 / poprawne N / bez wymaganych pól / 101).
3. **Granica dokładnie 100.** Warto jawny test wartości brzegowej (100 przechodzi, 101 odrzucone) — łatwo o off-by-one przy przyszłym refaktorze `>` na `>=`.
4. **Warstwa mockowania.** §4 planu mówi „mock na granicy HTTP fetcha klasyfikatora, brak MSW". Do potwierdzenia w `/10x-plan`: czy atrapujemy globalny `fetch`, czy wstrzykujemy przez `opts` klasyfikatora — istniejący `classify-core.test.ts` pokaże przyjęty wzorzec.
