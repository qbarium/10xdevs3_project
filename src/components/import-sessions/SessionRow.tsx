// Pojedynczy wiersz dziennika sesji importu (S-08). Komponent React, by status mógł zmieniać się
// W MIEJSCU po ponowieniu — bez przeładowania strony i bez znikania wiersza z listy. Po rozstrzygnięciu
// ponowienia (stan `done`) wiersz bierze nowy status/itemCount/code z wyniku i przerysowuje sam siebie
// (Błąd → Gotowe / Brak itemów / nowy powód błędu). Wiersz ZOSTAJE na liście niezależnie od aktywnego
// filtra — listę przefiltrowuje dopiero jawne „Zastosuj" (server-side GET). Błąd ŻĄDANIA (`error`:
// usunięty klucz / not_retryable / 404 / 503 / sieć) NIE zmienia statusu sesji → wiersz pozostaje
// `failed`, a nad przyciskiem pojawia się komunikat akcji (przycisk dalej dostępny do kolejnej próby).

import { Loader2 } from "lucide-react";

import { useSessionRetry } from "@/components/hooks/useSessionRetry";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ingestErrorMessage } from "@/lib/ingest-errors";
import { entryNoun, importSessionStatusLabel } from "@/lib/labels";
import type { ImportSessionStatus } from "@/types";

/** Odchudzone dane wiersza (liczone serwerowo) — bez pełnego `raw_input`, tylko gotowy podgląd. */
export interface SessionRowData {
  id: string;
  isFile: boolean;
  preview: string;
  dateLabel: string;
  status: ImportSessionStatus;
  itemCount: number | null;
  errorCode: string | null;
}

/** Kolor badge'a statusu (tailwind) — wizualne rozróżnienie stanów przebiegu. */
const STATUS_BADGE: Record<ImportSessionStatus, string> = {
  processing: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  completed_with_items: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  completed_no_items: "border-white/15 bg-white/10 text-white/70",
  failed: "border-red-300/30 bg-red-400/10 text-red-100",
};

export function SessionRow({ row }: { row: SessionRowData }) {
  const { state, result, error, retry } = useSessionRetry();

  // Po rozstrzygnięciu ponowienia (done) nadpisujemy widok wyniku w miejscu; inaczej zostaje stan z SSR.
  const resolved = state === "done" && result ? result : null;
  const status: ImportSessionStatus = resolved ? resolved.status : row.status;
  const itemCount = resolved ? resolved.itemCount : (row.itemCount ?? 0);
  const errorCode = resolved ? resolved.code : row.errorCode;
  const isRetrying = state === "retrying";

  return (
    <li className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-xs font-medium text-white/70">
              {row.isFile ? "Plik" : "Wklejka"}
            </span>
            <time className="text-xs text-white/50">{row.dateLabel}</time>
          </div>
          <p className="mt-1 truncate text-sm text-white/90" title={row.preview}>
            {row.preview}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status]}`}>
          {importSessionStatusLabel(status)}
        </span>
      </div>

      <div className="mt-2 text-sm">
        {status === "completed_with_items" && (
          <div className="flex flex-col gap-1">
            <span className="text-emerald-200">
              {itemCount} {entryNoun(itemCount)}
            </span>
            <a href="/items" className="w-fit text-purple-300 underline transition-colors hover:text-purple-100">
              Przejdź do walidacji
            </a>
          </div>
        )}
        {status === "completed_no_items" && <span className="text-white/60">Brak wpisów do akceptacji.</span>}
        {status === "processing" && <span className="text-white/60">Przetwarzanie w toku…</span>}
        {status === "failed" && (
          <div className="flex flex-col gap-2">
            <p className="text-red-200/90">{ingestErrorMessage(errorCode)}</p>
            {state === "error" && (
              <Alert variant="destructive">
                <AlertDescription>{error ?? ingestErrorMessage(result?.code ?? null)}</AlertDescription>
              </Alert>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isRetrying}
              onClick={() => {
                void retry(row.id);
              }}
              className="w-fit"
            >
              {isRetrying ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Ponawianie…
                </>
              ) : (
                "Spróbuj ponownie"
              )}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
