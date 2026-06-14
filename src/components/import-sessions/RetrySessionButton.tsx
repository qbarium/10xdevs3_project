// Inline akcja „Spróbuj ponownie" w wierszu sesji `failed` (S-08, Faza 4). React island (client:load)
// montowany przez SessionsList tylko dla sesji `failed`. Stan w wierszu (bez modalu): spinner w trakcie,
// po zakończeniu nowy wynik inline — sukces (liczba itemów + link do /items), brak itemów, albo Alert
// destructive z czytelnym komunikatem (ponowna porażka / błąd żądania, np. usunięty klucz). Guard
// podwójnego kliku: przycisk disabled w trakcie + strażnik stanu w hooku.
//
// Odświeżenie wiersza: badge statusu i komunikat błędu są renderowane przez SSR (SessionsList), poza tą
// wyspą — gdy ponowienie ROZSTRZYGNIE sesję (stan `done`: sukces lub ponowna porażka), status w bazie
// się zmienił, więc po krótkim potwierdzeniu przeładowujemy stronę, by SSR przerysował wiersz z nowym
// stanem (inaczej zostałby stary „Błąd"). Błędy ŻĄDANIA (`error`: usunięty klucz, not_retryable, 404,
// 503, sieć) NIE zmieniają statusu sesji → bez reloadu, by zachować komunikat akcji.

import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { useSessionRetry } from "@/components/hooks/useSessionRetry";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ingestErrorMessage } from "@/lib/ingest-errors";
import { itemNoun } from "@/lib/labels";

interface Props {
  sessionId: string;
}

/** Opóźnienie reloadu po rozstrzygnięciu — krótka chwila na zobaczenie potwierdzenia wyniku. */
const REFRESH_DELAY_MS = 1500;

export function RetrySessionButton({ sessionId }: Props) {
  const { state, result, error, retry } = useSessionRetry();

  useEffect(() => {
    if (state !== "done") return;
    const id = setTimeout(() => {
      window.location.reload();
    }, REFRESH_DELAY_MS);
    return () => {
      clearTimeout(id);
    };
  }, [state]);

  if (state === "done" && result) {
    const refreshing = <span className="mt-1 block text-xs text-white/40">Odświeżam widok…</span>;

    if (result.status === "completed_with_items") {
      return (
        <div>
          <p className="text-sm text-emerald-200">
            Ponowiono: {result.itemCount} {itemNoun(result.itemCount)} —{" "}
            <a href="/items" className="underline transition-colors hover:text-emerald-100">
              przejdź do walidacji
            </a>
          </p>
          {refreshing}
        </div>
      );
    }
    if (result.status === "completed_no_items") {
      return (
        <div>
          <p className="text-sm text-white/70">Ponowiono — brak itemów do akceptacji.</p>
          {refreshing}
        </div>
      );
    }
    // status === "failed" — ponowna porażka klasyfikacji (status w bazie zaktualizowany).
    return (
      <div>
        <Alert variant="destructive">
          <AlertDescription>{ingestErrorMessage(result.code)}</AlertDescription>
        </Alert>
        {refreshing}
      </div>
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
