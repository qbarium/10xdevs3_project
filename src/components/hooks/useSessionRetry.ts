// Hook maszyny stanów ponowienia sesji (S-08, Faza 4): hermetyzuje `fetch` do
// /api/import-sessions/retry i mapuje odpowiedź na stan inline. Wzorzec analogiczny do
// useClassification — logika sieci/stanu z dala od komponentu (reguła CLAUDE.md: hooki w
// src/components/hooks/). Rozróżnia TRZY wyniki końcowe sesji (completed_with_items /
// completed_no_items / failed), nie dwa — sesja `failed` może po ponowieniu dać 0 itemów.

import { useState } from "react";

export type RetryState = "idle" | "retrying" | "done" | "error";

/** Odpowiedź endpointu retry (kontrakt identyczny z classify + opcjonalny `error` dla guardów). */
export interface RetryResponse {
  ok?: boolean;
  sessionId?: string;
  status?: string;
  itemCount?: number;
  code?: string;
  error?: string;
}

/** Wynik zakończonego ponowienia (stan `done`): rozstrzygnięty stan sesji + ewentualny kod/komunikat. */
export interface SessionRetryResult {
  status: "completed_with_items" | "completed_no_items" | "failed";
  itemCount: number;
  code: string | null;
  message: string | null;
}

export interface UseSessionRetry {
  state: RetryState;
  result: SessionRetryResult | null;
  /** Komunikat błędu ŻĄDANIA (missing_key / not_retryable / 404 / 503 / sieć) — stan `error`. */
  error: string | null;
  retry: (sessionId: string) => Promise<void>;
}

const ENDPOINT = "/api/import-sessions/retry";

const SESSION_STATES = new Set(["completed_with_items", "completed_no_items", "failed"]);

/** Wynik końcowy ponowienia wyprowadzony z odpowiedzi endpointu: stan + result + komunikat błędu żądania. */
export interface RetryOutcome {
  state: "done" | "error";
  result: SessionRetryResult;
  error: string | null;
}

/**
 * Czysta logika mapowania odpowiedzi endpointu retry na stan końcowy hooka (testowalna bez React).
 * `done` TYLKO gdy HTTP ok (200) i `status` to rozstrzygnięty stan sesji (completed_with_items /
 * completed_no_items / failed). W przeciwnym razie `error`: twardy 422 `too_many_items` (ok:false),
 * `missing_key` / `not_retryable` / 404 / 503. `res.ok` odróżnia normalny wynik przebiegu (200, w tym
 * sesja `failed` po ponownej porażce) od błędu żądania. Błąd sieci (catch) obsługiwany osobno w hooku.
 */
export function mapRetryResponse(ok: boolean, data: RetryResponse): RetryOutcome {
  if (ok && data.status && SESSION_STATES.has(data.status)) {
    return {
      state: "done",
      result: {
        status: data.status as SessionRetryResult["status"],
        itemCount: data.itemCount ?? 0,
        code: data.code ?? null,
        message: data.error ?? null,
      },
      error: null,
    };
  }
  return {
    state: "error",
    result: { status: "failed", itemCount: 0, code: data.code ?? "request", message: data.error ?? null },
    error: data.error ?? null,
  };
}

export function useSessionRetry(): UseSessionRetry {
  const [state, setState] = useState<RetryState>("idle");
  const [result, setResult] = useState<SessionRetryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function retry(sessionId: string): Promise<void> {
    if (state === "retrying") return; // guard podwójnego kliku (poza disabled na przycisku)
    setState("retrying");
    setError(null);
    setResult(null);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = (await res.json()) as RetryResponse;

      // Mapowanie odpowiedzi → stan końcowy w czystej mapRetryResponse (testowalne bez React, 4.2).
      const outcome = mapRetryResponse(res.ok, data);
      setResult(outcome.result);
      setError(outcome.error);
      setState(outcome.state);
    } catch {
      setError(null);
      setResult({ status: "failed", itemCount: 0, code: "network", message: null });
      setState("error");
    }
  }

  return { state, result, error, retry };
}
