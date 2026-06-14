// Czysty model zaznaczania + krok optimistic dla widoku walidacyjnego (PendingItemsView). Wydzielony
// z komponentu, by był testowalny w środowisku node (bez DOM). Wszystkie funkcje immutable — zwracają
// nowe struktury, zgodnie z semantyką stanu Reacta.

import type { Item } from "@/types";

/** Przełącza obecność `id` w zbiorze zaznaczonych; zwraca NOWY Set (immutable dla Reacta). */
export function toggleSelection(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Zbiór wszystkich widocznych id — dla gestu „zaznacz wszystkie". */
export function allIds(items: readonly Item[]): Set<string> {
  return new Set(items.map((item) => item.id));
}

/** Czy zaznaczono wszystkie widoczne itemy (i jest co zaznaczać). */
export function isAllSelected(selectedCount: number, total: number): boolean {
  return total > 0 && selectedCount === total;
}

/**
 * Akcja zbiorcza wymaga lekkiego potwierdzenia, gdy obejmuje WSZYSTKIE widoczne itemy (gest
 * „zaznacz wszystkie", OQ4). Ręczny podzbiór (część widocznych) → bez potwierdzenia.
 */
export function requiresConfirmation(selectedCount: number, total: number): boolean {
  return isAllSelected(selectedCount, total);
}

/** Optimistic remove: lista bez zaznaczonych id (krok „usuń zaznaczone z listy" przed odpowiedzią). */
export function removeByIds(items: readonly Item[], ids: ReadonlySet<string>): Item[] {
  return items.filter((item) => !ids.has(item.id));
}
