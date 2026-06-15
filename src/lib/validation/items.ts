// Jedno źródło prawdy o kształcie wielopolowych payloadów akcji zbiorczej i edycji itemu
// (hard rule: wejście wielopolowe → zod PRZED jakimkolwiek efektem ubocznym). Enumy `type`
// reużywają `ITEM_TYPES` z warstwy klasyfikacji — `satisfies readonly ItemType[]` tam wiąże
// tuple z unią `ItemType` z `@/types`, więc spójność jest egzekwowana kompilacyjnie w 1 miejscu.

import { z } from "zod";

import { ITEM_TYPES } from "@/lib/ai/schema";
import type { OperationalStatus } from "@/types";

/**
 * Payload akcji zbiorczej zatwierdź/odrzuć. `ids` to UUID-y zaznaczonych pendingów; `.max(100)`
 * to safety net spójny z FR-020 (i progiem 100/sesja z S-02) — odrzuca nadmiarowy payload, zanim
 * dotknie bazy. `action` decyduje o docelowym `acceptance_status` (accepted|rejected).
 */
export const bulkActionSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
  action: z.enum(["accept", "reject"]),
});
export type BulkActionInput = z.infer<typeof bulkActionSchema>;

/** Cztery stany operacyjne związane kompilacyjnie z unią `OperationalStatus` (wzorzec `ITEM_TYPES`). */
const OPERATIONAL_STATUSES = [
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
 * Payload edycji pendingu w stagingu. `title` wymagany (trim + reject pusty). `description`
 * nullable — pusty/whitespace normalizujemy do `null` (kolumna nullable). `type` z pięciu wartości
 * `ItemType`; derywacja `operational_status` z typu należy do serwisu, nie do schematu.
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
});
export type EditItemInput = z.infer<typeof editItemSchema>;
