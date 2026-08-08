// Hook zarządzania kluczem BYOK: hermetyzuje `fetch` (zapis/usuń) + stan (`status`, `pending`,
// `error`) z dala od komponentu (reguła CLAUDE.md: hooki w `src/components/hooks/`). Wywołania
// trafiają do `/api/profile/byok-key` (Faza 2). Błąd serwera mapowany na komunikat dla użytkownika —
// NIGDY nie zawiera materiału klucza (endpoint zwraca wyłącznie generyczne komunikaty, FR-026).

import { useState } from "react";

import { dispatchKeyChanged } from "@/components/shell/sidebar-events";
import type { ByokKeyStatus } from "@/types";

const ENDPOINT = "/api/profile/byok-key";

/** Odpowiedź endpointu zapisu/statusu — pełny klucz nigdy nie wraca, tylko `hint`. */
interface KeyResponse {
  ok?: boolean;
  error?: string;
  configured?: boolean;
  hint?: string | null;
  updatedAt?: string | null;
}

export interface UseApiKey {
  status: ByokKeyStatus;
  pending: boolean;
  error: string | null;
  /** Zapisuje klucz; zwraca `true` przy sukcesie (pozwala wołającemu wyczyścić draft). */
  save: (plain: string) => Promise<boolean>;
  remove: () => Promise<void>;
}

export function useApiKey(initial: ByokKeyStatus): UseApiKey {
  const [status, setStatus] = useState<ByokKeyStatus>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(plain: string): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: plain }),
      });
      const data = (await res.json()) as KeyResponse;
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Nie udało się zapisać klucza.");
        return false;
      }
      setStatus({ configured: true, hint: data.hint ?? null, updatedAt: data.updatedAt ?? null });
      // Powłoka (sidebar) liczy wskaźnik klucza serwerowo raz na render — bez tego zdarzenia zostaje
      // nieaktualna do reloadu (ticket 80c4f735). Most wyspa→powłoka: `sidebar-events.ts`.
      dispatchKeyChanged(true);
      return true;
    } catch {
      setError("Błąd połączenia. Spróbuj ponownie.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function remove(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(ENDPOINT, { method: "DELETE" });
      const data = (await res.json()) as KeyResponse;
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Nie udało się usunąć klucza.");
        return;
      }
      setStatus({ configured: false, hint: null, updatedAt: null });
      // Jak wyżej (save) — zsynchronizuj wskaźnik w powłoce bez reloadu.
      dispatchKeyChanged(false);
    } catch {
      setError("Błąd połączenia. Spróbuj ponownie.");
    } finally {
      setPending(false);
    }
  }

  return { status, pending, error, save, remove };
}
