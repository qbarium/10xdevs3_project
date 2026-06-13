// Hook mutacji itemów: hermetyzuje `fetch` akcji zbiorczej i edycji + stan (`pending`, `error`)
// z dala od komponentu (reguła CLAUDE.md: hooki w `src/components/hooks/`). Wywołania trafiają do
// `/api/items/bulk` i `/api/items/[id]`. Błąd mapowany na komunikat UI — bez szczegółów sieci/DB.

import { useState } from "react";

import type { EditItemInput } from "@/lib/validation/items";
import type { Item } from "@/types";

const BULK_ENDPOINT = "/api/items/bulk";

interface BulkResponse {
  ok?: boolean;
  updatedIds?: string[];
  count?: number;
}
interface EditResponse {
  ok?: boolean;
  item?: Item;
}

/** Wynik edycji: rozróżnia sukces, „nie do edycji" (404 — item nie jest już pending) i ogólny błąd. */
export type EditItemResult = { ok: true; item: Item } | { ok: false; reason: "not_found" | "failed" };

export interface UseItemMutation {
  pending: boolean;
  error: string | null;
  /** Zatwierdza zaznaczone; `true` przy sukcesie (commit optimistic), `false` → rollback. */
  bulkAccept: (ids: string[]) => Promise<boolean>;
  /** Odrzuca zaznaczone; `true` przy sukcesie (commit optimistic), `false` → rollback. */
  bulkReject: (ids: string[]) => Promise<boolean>;
  /** Edytuje pending; zwraca zaktualizowany item lub powód niepowodzenia (404 / błąd). */
  editItem: (id: string, input: EditItemInput) => Promise<EditItemResult>;
}

export function useItemMutation(): UseItemMutation {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function bulk(ids: string[], action: "accept" | "reject"): Promise<boolean> {
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
        return false;
      }
      return true;
    } catch {
      setError("Błąd połączenia. Spróbuj ponownie.");
      return false;
    } finally {
      setPending(false);
    }
  }

  const bulkAccept = (ids: string[]): Promise<boolean> => bulk(ids, "accept");
  const bulkReject = (ids: string[]): Promise<boolean> => bulk(ids, "reject");

  async function editItem(id: string, input: EditItemInput): Promise<EditItemResult> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (res.status === 404) {
        setError("Element nie jest już dostępny do edycji.");
        return { ok: false, reason: "not_found" };
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

  return { pending, error, bulkAccept, bulkReject, editItem };
}
