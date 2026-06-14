// Inline akcja „Spróbuj ponownie" w wierszu sesji `failed` (S-08, Faza 4). React island (client:load)
// montowany przez SessionsList tylko dla sesji `failed`. Stan w wierszu (bez modalu): spinner w trakcie,
// po zakończeniu nowy wynik inline — sukces (liczba itemów + link do /items), brak itemów, albo Alert
// destructive z czytelnym komunikatem (ponowna porażka / błąd żądania, np. usunięty klucz). Guard
// podwójnego kliku: przycisk disabled w trakcie + strażnik stanu w hooku.

import { Loader2 } from "lucide-react";

import { useSessionRetry } from "@/components/hooks/useSessionRetry";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ingestErrorMessage } from "@/lib/ingest-errors";
import { itemNoun } from "@/lib/labels";

interface Props {
  sessionId: string;
}

export function RetrySessionButton({ sessionId }: Props) {
  const { state, result, error, retry } = useSessionRetry();

  if (state === "done" && result) {
    if (result.status === "completed_with_items") {
      return (
        <p className="text-sm text-emerald-200">
          Ponowiono: {result.itemCount} {itemNoun(result.itemCount)} —{" "}
          <a href="/items" className="underline transition-colors hover:text-emerald-100">
            przejdź do walidacji
          </a>
        </p>
      );
    }
    if (result.status === "completed_no_items") {
      return <p className="text-sm text-white/70">Ponowiono — brak itemów do akceptacji.</p>;
    }
    // status === "failed" — ponowna porażka klasyfikacji.
    return (
      <Alert variant="destructive">
        <AlertDescription>{ingestErrorMessage(result.code)}</AlertDescription>
      </Alert>
    );
  }

  if (state === "error") {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error ?? ingestErrorMessage(result?.code ?? null)}</AlertDescription>
      </Alert>
    );
  }

  const busy = state === "retrying";
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={() => {
        void retry(sessionId);
      }}
      className="w-fit"
    >
      {busy ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Ponawianie…
        </>
      ) : (
        "Spróbuj ponownie"
      )}
    </Button>
  );
}
