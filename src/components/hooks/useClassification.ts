// Hook maszyny stanów submitu klasyfikacji: hermetyzuje `fetch` do /api/ingest/classify i mapuje
// odpowiedź na jeden z czterech stanów przebiegu (FR-006). Logika sieci/stanu z dala od komponentu
// (reguła CLAUDE.md: hooki w src/components/hooks/). Nie ujawnia szczegółów technicznych — tylko kod.

import { useState } from "react";

export type ClassificationState = "idle" | "processing" | "completed_with_items" | "completed_no_items" | "failed";

/** Odpowiedź endpointu klasyfikacji (kształt z Fazy 3). */
interface ClassifyResponse {
  ok?: boolean;
  sessionId?: string;
  status?: string;
  itemCount?: number;
  code?: string;
}

export interface UseClassification {
  state: ClassificationState;
  sessionId: string | null;
  itemCount: number;
  errorCode: string | null;
  run: (text: string) => Promise<void>;
  reset: () => void;
}

const ENDPOINT = "/api/ingest/classify";

export function useClassification(): UseClassification {
  const [state, setState] = useState<ClassificationState>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [itemCount, setItemCount] = useState(0);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function run(text: string): Promise<void> {
    setState("processing");
    setErrorCode(null);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as ClassifyResponse;
      setSessionId(data.sessionId ?? null);

      if (data.status === "completed_with_items") {
        setItemCount(data.itemCount ?? 0);
        setState("completed_with_items");
      } else if (data.status === "completed_no_items") {
        setItemCount(0);
        setState("completed_no_items");
      } else {
        // status:"failed" z kodem ALBO twardy błąd żądania (400/409/503 bez statusu).
        setErrorCode(data.code ?? "request");
        setState("failed");
      }
    } catch {
      setErrorCode("network");
      setState("failed");
    }
  }

  function reset(): void {
    setState("idle");
    setSessionId(null);
    setItemCount(0);
    setErrorCode(null);
  }

  return { state, sessionId, itemCount, errorCode, run, reset };
}
