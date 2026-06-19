// Jedno źródło prawdy o kształcie wielopolowych payloadów akcji zbiorczej i edycji itemu
// (hard rule: wejście wielopolowe → zod PRZED jakimkolwiek efektem ubocznym). Enumy `type`
// reużywają `ITEM_TYPES` z warstwy klasyfikacji — `satisfies readonly ItemType[]` tam wiąże
// tuple z unią `ItemType` z `@/types`, więc spójność jest egzekwowana kompilacyjnie w 1 miejscu.

import { z } from "zod";

import { ITEM_TYPES } from "@/lib/ai/schema";
import type { OperationalStatus } from "@/types";

/**
 * Payload akcji zbiorczej operującej na liście id. `ids` to UUID-y zaznaczonych itemów; `.max(100)`
 * to safety net spójny z FR-020 (i progiem 100/sesja z S-02) — odrzuca nadmiarowy payload, zanim
 * dotknie bazy. `action` wybiera mutację w endpoincie: `accept`/`reject` → `setAcceptanceStatus`;
 * `trash` → `moveToTrash` (accepted → deleted, S-06); `restore` → `restoreFromTrash` (dwukierunkowe:
 * deleted → accepted ORAZ rejected → pending, S-06). Twardy DELETE „wyczyść kosz" (FR-016) NIE jedzie
 * tędy — to osobny endpoint bez `ids` (operacja globalna).
 */
export const bulkActionSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
  action: z.enum(["accept", "reject", "trash", "restore"]),
});
export type BulkActionInput = z.infer<typeof bulkActionSchema>;

/** Cztery stany operacyjne związane kompilacyjnie z unią `OperationalStatus` (wzorzec `ITEM_TYPES`). */
export const OPERATIONAL_STATUSES = [
  "new",
  "in_progress",
  "done",
  "cancelled",
] as const satisfies readonly OperationalStatus[];

/**
 * Payload zbiorczej zmiany stanu operacyjnego (S-04). `ids` jak w `bulkActionSchema` (UUID-y,
 * 1..100 — safety net przed bazą). `status` dopuszcza WSZYSTKIE 4 stany: przechodniość żyje na
 * warstwie danych (FR-009 „wzajemnie przechodnie"), a kuracja widocznych przejść to osobny moduł
 * UX (Faza 4), nie walidacja.
 */
export const operationalActionSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
  status: z.enum(OPERATIONAL_STATUSES),
});
export type OperationalActionInput = z.infer<typeof operationalActionSchema>;

/**
 * Pola edycji itemu (title/description/type/operationalStatus) — rdzeń wspólny dla pendingów i
 * zaakceptowanych (S-05). `title` wymagany (trim + reject pusty). `description` nullable —
 * pusty/whitespace normalizujemy do `null` (kolumna nullable). `type` z pięciu wartości `ItemType`.
 * `operationalStatus` (S-05, rewizja UX) jedzie JAWNIE z dialogu — UI prefilluje bieżącą wartość, więc
 * edycja treści bez tknięcia selektora zachowuje stan; pierwotne ryzyko decyzji #3 (cichy reset przez
 * auto-derywację `→'new'`) nie wraca, bo serwer zapisuje wartość podaną, a nie derywowaną z typu.
 * Ten typ (`EditItemInput`) pozostaje rdzeniem konsumowanym przez `buildEditPayload` i serwis —
 * `expectedUpdatedAt` żyje osobno w `editItemBodySchema`, by nie wyciekać do budowy payloadu w UI.
 */
export const editItemSchema = z.object({
  title: z.string().trim().min(1),
  description: z
    .string()
    .nullable()
    .transform((value) => {
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    }),
  type: z.enum(ITEM_TYPES),
  operationalStatus: z.enum(OPERATIONAL_STATUSES),
});
export type EditItemInput = z.infer<typeof editItemSchema>;

/**
 * Payload PATCH `/api/items/[id]` = pola edycji + `expectedUpdatedAt` dla optimistic concurrency
 * (S-05, lekcja „lost update"). `expectedUpdatedAt` to `updated_at` z chwili otwarcia dialogu; serwer
 * dokłada compare-and-swap `.eq('updated_at', expectedUpdatedAt)` i przy rozjeździe zwraca 409. Format
 * ISO 8601 z offsetem — dokładnie kształt `updated_at` z PostgREST (`…Z` lub `…+00:00`). Trzymany
 * ROZŁĄCZNIE od `editItemSchema`, by `EditItemInput` (i `buildEditPayload`) nie zyskał pola znacznika.
 */
export const editItemBodySchema = editItemSchema.extend({
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
});
export type EditItemBodyInput = z.infer<typeof editItemBodySchema>;

/**
 * Payload tworzenia itemu RĘCZNEGO (S-07) — WYŁĄCZNIE pola, które user podaje w formularzu. Niezmienniki
 * domenowe (`acceptance_status='accepted'`, `operational_status`, `import_session_id=NULL`, `user_id`) ustala
 * SERWER, nie klient — dlatego ich tu celowo NIE ma. To fail-closed na ciele żądania API: rozszerza lekcję
 * „nie ufaj wejściu" z konfiguracji na payload (zod domyślnie USUWA nadmiarowe pola, więc ewentualnie
 * przemycony `acceptance_status`/`operational_status`/`import_session_id` zostaje zignorowany, nie zapisany).
 * `title` wymagany (trim + reject pusty), `description` nullable z normalizacją pusty/whitespace → null
 * (lustro `editItemSchema`), `type` z pięciu wartości `ItemType`. BRAK `operationalStatus` — przy tworzeniu stan
 * jest derywowany serwerowo (`deriveOperationalStatus`), nie wybierany w UI (inaczej niż przy edycji).
 */
export const createItemSchema = z.object({
  title: z.string().trim().min(1),
  description: z
    .string()
    .nullable()
    .transform((value) => {
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    }),
  type: z.enum(ITEM_TYPES),
});
export type CreateItemInput = z.infer<typeof createItemSchema>;
