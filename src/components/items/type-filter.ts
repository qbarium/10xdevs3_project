// Wartości i walidacja filtra typu — współdzielone przez prezentacyjny `TypeFilter.tsx`, `parseListCriteria`
// (`list-criteria.ts`) oraz `create-form.ts`. Po migracji S-09 (Faza 4) filtr typu jest SERWEROWY: derywacja
// listy odbywa się w `listItems` wg `ListCriteria` z parametrów URL, więc kliencki `applyTypeFilter` i cookie
// `tl_typefilter` zniknęły — został TYLKO wspólny słownik wartości + tolerancyjny parser pojedynczej wartości.

import { ITEM_TYPES } from "@/lib/ai/schema";

/**
 * Wartości filtra typu: „wszystkie" + 5 typów `ItemType`. Wyprowadzone z kanonicznego `ITEM_TYPES`
 * (jedno źródło prawdy — dodanie typu w schemacie automatycznie poszerza filtr). Kolejność = kolejność
 * przycisków UI: „Wszystkie" pierwsze, dalej typy w kolejności `ITEM_TYPES`.
 */
export const TYPE_FILTER_VALUES = ["all", ...ITEM_TYPES] as const;
export type TypeFilterValue = (typeof TYPE_FILTER_VALUES)[number];

/** Waliduje surową wartość (z URL / dowolnego źródła) → poprawny `TypeFilterValue` lub fallback "all". */
export function parseTypeFilter(value: string | undefined | null): TypeFilterValue {
  return value != null && (TYPE_FILTER_VALUES as readonly string[]).includes(value)
    ? (value as TypeFilterValue)
    : "all";
}
