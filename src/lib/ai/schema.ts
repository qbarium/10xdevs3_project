// Jedno źródło prawdy o kształcie itemu: zod do walidacji granicznej (przed zapisem) oraz
// odpowiadający strict json_schema do Structured Outputs (wymusza kształt po stronie modelu).
// zod domyślnie USUWA nadmiarowe pola modelu — utrwalamy tylko type/title/description (FR-005).

import { z } from "zod";

import type { ItemType } from "@/types";

/** Pięć typów itemu; `satisfies` wiąże tuple ze unią `ItemType` (kompilacyjny check spójności). */
export const ITEM_TYPES = ["task", "note", "idea", "decision", "other"] as const satisfies readonly ItemType[];

/** Walidacja pojedynczego itemu na granicy. `description` może być pusty (prompt to dopuszcza). */
export const classifiedItemSchema = z.object({
  type: z.enum(ITEM_TYPES),
  title: z.string().min(1),
  description: z.string(),
});

/** Wynik klasyfikacji = tablica itemów. Anomalię > 100 itemów obsługuje serwis (Faza 3), nie schemat. */
export const classificationResultSchema = z.array(classifiedItemSchema);

/** Nazwa schematu Structured Outputs — wspólna dla json_schema i diagnostyki. */
export const CLASSIFICATION_SCHEMA_NAME = "classification";

/**
 * Strict json_schema dla Structured Outputs. Root MUSI być obiektem (wymóg API), więc tablica
 * itemów jest opakowana w `{ items: [...] }`. Strict wymaga `additionalProperties:false` i WSZYSTKICH
 * pól jako `required` na każdym poziomie — inaczej API odrzuci żądanie.
 */
export function buildJsonSchema() {
  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: [...ITEM_TYPES] },
            title: { type: "string" },
            description: { type: "string" },
          },
          required: ["type", "title", "description"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  } as const;
}
