// Hook mutacji itemów: hermetyzuje `fetch` akcji zbiorczej i edycji + stan (`pending`, `error`)
// z dala od komponentu (reguła CLAUDE.md: hooki w `src/components/hooks/`). Wywołania trafiają do
// `/api/items/bulk` i `/api/items/[id]`. Błąd mapowany na komunikat UI — bez szczegółów sieci/DB.

import { useState } from "react";

import type { CreateItemInput, EditItemInput } from "@/lib/validation/items";
import type { Item, OperationalStatus } from "@/types";

const BULK_ENDPOINT = "/api/items/bulk";
const OPERATIONAL_ENDPOINT = "/api/items/operational";
const TRASH_EMPTY_ENDPOINT = "/api/items/trash/empty";
const CREATE_ENDPOINT = "/api/items";

interface BulkResponse {
  ok?: boolean;
  updatedIds?: string[];
  count?: number;
  status?: OperationalStatus;
  /** S-10: tylko dla `action:"restore"` — świeże wiersze (panel sesji podmienia element z poprawnym `updated_at`). */
  items?: Item[];
}
interface EmptyResponse {
  ok?: boolean;
  deletedCount?: number;
}
interface EditResponse {
  ok?: boolean;
  item?: Item;
}
interface CreateResponse {
  ok?: boolean;
  item?: Item;
}

/**
 * Wynik edycji: sukces; „nie do edycji" (404 — item nie istnieje / nieedytowalny); „konflikt"
 * (409 — równoległa edycja, compare-and-swap na `updated_at` odrzucił zapis); ogólny błąd.
 */
export type EditItemResult = { ok: true; item: Item } | { ok: false; reason: "not_found" | "conflict" | "failed" };

/** Wynik tworzenia itemu ręcznego (S-07): sukces z wierszem albo ogólny błąd (sieć / 4xx / 5xx). */
export type CreateItemResult = { ok: true; item: Item } | { ok: false; reason: "failed" };

export interface UseItemMutation {
  pending: boolean;
  error: string | null;
  /** Tworzy item ręczny (POST /api/items); zwraca utworzony wiersz albo `{ok:false}` przy błędzie. */
  createItem: (input: CreateItemInput) => Promise<CreateItemResult>;
  /** Zatwierdza zaznaczone; zwraca liczbę FAKTYCZNIE zmienionych (guard pomija nie-pending), null przy błędzie. */
  bulkAccept: (ids: string[]) => Promise<number | null>;
  /** Odrzuca zaznaczone; zwraca liczbę FAKTYCZNIE zmienionych (guard pomija nie-pending), null przy błędzie. */
  bulkReject: (ids: string[]) => Promise<number | null>;
  /** Zmienia stan operacyjny zaznaczonych accepted; zwraca liczbę FAKTYCZNIE zmienionych (guard pomija nie-accepted), null przy błędzie. */
  setOperationalStatus: (ids: string[], status: OperationalStatus) => Promise<number | null>;
  /** Przenosi zaznaczone accepted do kosza (S-06); zwraca liczbę FAKTYCZNIE przeniesionych (guard pomija nie-accepted), null przy błędzie. */
  moveToTrash: (ids: string[]) => Promise<number | null>;
  /** Przywraca zaznaczone z kosza (S-06, dwukierunkowo deleted→accepted / rejected→pending); zwraca liczbę FAKTYCZNIE przywróconych, null przy błędzie. */
  restoreFromTrash: (ids: string[]) => Promise<number | null>;
  /** S-10: przywraca z kosza i ZWRACA świeże wiersze (panel sesji podmienia element z poprawnym `updated_at`); null przy błędzie. */
  restoreFromTrashItems: (ids: string[]) => Promise<Item[] | null>;
  /** Trwale opróżnia kosz usera (S-06, FR-016); zwraca liczbę skasowanych wierszy (`deletedCount`), null przy błędzie. */
  emptyTrash: () => Promise<number | null>;
  /** Edytuje pending/accepted z compare-and-swap (`expectedUpdatedAt`); zwraca item lub powód (404 / 409 / błąd). */
  editItem: (id: string, input: EditItemInput, expectedUpdatedAt: string) => Promise<EditItemResult>;
}

export function useItemMutation(): UseItemMutation {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Zwraca liczbę faktycznie zmienionych itemów z serwera (guard `pending` pomija nie-uprawnione),
  // lub null przy błędzie / porażce sieci.
  async function bulk(ids: string[], action: "accept" | "reject" | "trash" | "restore"): Promise<number | null> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(BULK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      const data = (await res.json()) as BulkResponse;
      if (!res.ok || !data.ok) {
        setError("Nie udało się wykonać akcji. Spróbuj ponownie.");
        return null;
      }
      return data.count ?? data.updatedIds?.length ?? 0;
    } catch {
      setError("Błąd połączenia. Spróbuj ponownie.");
      return null;
    } finally {
      setPending(false);
    }
  }

  const bulkAccept = (ids: string[]): Promise<number | null> => bulk(ids, "accept");
  const bulkReject = (ids: string[]): Promise<number | null> => bulk(ids, "reject");
  // S-06: kosz reużywa ten sam endpoint bulk (rozgałęzia po `action` w serwisie).
  const moveToTrash = (ids: string[]): Promise<number | null> => bulk(ids, "trash");
  const restoreFromTrash = (ids: string[]): Promise<number | null> => bulk(ids, "restore");

  // S-10: wariant restore zwracający ŚWIEŻE wiersze (`items` z odpowiedzi bulk), nie liczbę. Panel sesji
  // podmienia przywrócony element z poprawnym `updated_at`, by edycja po restore nie dała fałszywego 409.
  // Główne widoki (Kosz) używają `restoreFromTrash` (liczba) — ten wariant ich nie dotyka.
  async function restoreFromTrashItems(ids: string[]): Promise<Item[] | null> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(BULK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action: "restore" }),
      });
      const data = (await res.json()) as BulkResponse;
      if (!res.ok || !data.ok) {
        setError("Nie udało się przywrócić. Spróbuj ponownie.");
        return null;
      }
      return data.items ?? [];
    } catch {
      setError("Błąd połączenia. Spróbuj ponownie.");
      return null;
    } finally {
      setPending(false);
    }
  }

  // Trwałe opróżnienie kosza (S-06, FR-016) — osobny endpoint bez body (operacja globalna). Wzorzec
  // jak `bulk`: zwraca `deletedCount` z serwera (liczba faktycznie skasowanych wierszy) lub null przy
  // błędzie / porażce sieci.
  async function emptyTrash(): Promise<number | null> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(TRASH_EMPTY_ENDPOINT, { method: "POST" });
      const data = (await res.json()) as EmptyResponse;
      if (!res.ok || !data.ok) {
        setError("Nie udało się opróżnić kosza. Spróbuj ponownie.");
        return null;
      }
      return data.deletedCount ?? 0;
    } catch {
      setError("Błąd połączenia. Spróbuj ponownie.");
      return null;
    } finally {
      setPending(false);
    }
  }

  // Zmiana stanu operacyjnego accepted itemów (S-04). Wzorzec jak `bulk`: zwraca realną liczbę
  // zmienionych z serwera (guard `accepted` pomija nie-uprawnione) lub null przy błędzie / porażce sieci.
  async function setOperationalStatus(ids: string[], status: OperationalStatus): Promise<number | null> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(OPERATIONAL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status }),
      });
      const data = (await res.json()) as BulkResponse;
      if (!res.ok || !data.ok) {
        setError("Nie udało się wykonać akcji. Spróbuj ponownie.");
        return null;
      }
      return data.count ?? data.updatedIds?.length ?? 0;
    } catch {
      setError("Błąd połączenia. Spróbuj ponownie.");
      return null;
    } finally {
      setPending(false);
    }
  }

  async function editItem(id: string, input: EditItemInput, expectedUpdatedAt: string): Promise<EditItemResult> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, expectedUpdatedAt }),
      });
      if (res.status === 404) {
        setError("Element nie jest już dostępny do edycji.");
        return { ok: false, reason: "not_found" };
      }
      if (res.status === 409) {
        setError("Element został zmieniony w innym miejscu — odśwież i spróbuj ponownie.");
        return { ok: false, reason: "conflict" };
      }
      const data = (await res.json()) as EditResponse;
      if (!res.ok || !data.ok || !data.item) {
        setError("Nie udało się zapisać zmian. Spróbuj ponownie.");
        return { ok: false, reason: "failed" };
      }
      return { ok: true, item: data.item };
    } catch {
      setError("Błąd połączenia. Spróbuj ponownie.");
      return { ok: false, reason: "failed" };
    } finally {
      setPending(false);
    }
  }

  // Tworzenie itemu ręcznego (S-07). Wzorzec jak `editItem`: POST, mapowanie odpowiedzi na wynik
  // dyskryminowany, komunikat błędu bez szczegółów sieci/DB. Endpoint zwraca 201 `{ ok, item }`.
  async function createItem(input: CreateItemInput): Promise<CreateItemResult> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(CREATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = (await res.json()) as CreateResponse;
      if (!res.ok || !data.ok || !data.item) {
        setError("Nie udało się dodać elementu. Spróbuj ponownie.");
        return { ok: false, reason: "failed" };
      }
      return { ok: true, item: data.item };
    } catch {
      setError("Błąd połączenia. Spróbuj ponownie.");
      return { ok: false, reason: "failed" };
    } finally {
      setPending(false);
    }
  }

  // Scalenie S-06 (kosz) + S-07 (item ręczny): zwracamy KOMPLET metod z interfejsu UseItemMutation.
  return {
    pending,
    error,
    createItem,
    bulkAccept,
    bulkReject,
    setOperationalStatus,
    moveToTrash,
    restoreFromTrash,
    restoreFromTrashItems,
    emptyTrash,
    editItem,
  };
}
