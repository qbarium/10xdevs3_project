// Island formularza wsadu paste (US-01 / FR-002). Pole z licznikiem n/100000, blokadą wprowadzania
// po limicie i live-sanityzacją (normalizeForInput — bez trim, by spacje dało się wpisywać). Submit
// otwiera blokujący ClassificationModal i woła hook klasyfikacji. Gdy brak klucza — submit wyłączony
// (strona renderuje wtedy bramkę US-06 zamiast formularza, prop jest defensywą).

import React, { useRef, useState, type ChangeEvent } from "react";

import { useClassification } from "@/components/hooks/useClassification";
import { ClassificationModal } from "@/components/ingest/ClassificationModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INPUT_MAX_CHARS, normalizeForInput } from "@/lib/text/sanitize";
import { cn } from "@/lib/utils";
import type { ByokKeyStatus } from "@/types";

/** Minimalna długość wsadu (po trim) odblokowująca klasyfikację — gate UX (serwer i tak odrzuca pusty). */
const MIN_INPUT_CHARS = 5;

interface Props {
  initialKeyStatus: ByokKeyStatus;
}

export default function IngestForm({ initialKeyStatus }: Props) {
  const [text, setText] = useState("");
  const { state, itemCount, errorCode, run, reset } = useClassification();
  const configured = initialKeyStatus.configured;
  const atLimit = text.length >= INPUT_MAX_CHARS;
  const tooShort = text.trim().length < MIN_INPUT_CHARS;
  // Znacznik czasu ostatniego Esc — podwójny Esc (≤ 500 ms) czyści pole. Ref, by pierwszy Esc nie re-renderował.
  const lastEscapeAt = useRef(0);

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    // Live-sanityzacja (NFC + usunięcie znaków sterujących) + twarda blokada limitu paste (FR-002).
    setText(normalizeForInput(e.target.value).slice(0, INPUT_MAX_CHARS));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Escape") return;
    const now = Date.now();
    if (now - lastEscapeAt.current < 500) {
      setText(""); // drugi Esc w oknie 500 ms → wyczyść
      lastEscapeAt.current = 0;
    } else {
      lastEscapeAt.current = now; // pierwszy Esc — uzbrój
    }
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!configured || tooShort) return;
    void run(text);
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Klasyfikacja wsadu</CardTitle>
        <CardDescription>
          Wklej luźne myśli, notatki lub listę — zamienimy je na typowane itemy. Podwójny Esc czyści pole.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Label htmlFor="ingest-text">Tekst do klasyfikacji</Label>
          <Textarea
            id="ingest-text"
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={!configured || state === "processing"}
            placeholder="Wklej luźne myśli, notatki, listę zadań…"
            className="field-sizing-fixed h-64 resize-none overflow-y-auto font-mono text-sm"
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className={cn("text-xs", atLimit ? "text-amber-400" : "text-muted-foreground")}>
                {text.length.toLocaleString("pl-PL")} / {INPUT_MAX_CHARS.toLocaleString("pl-PL")} znaków
              </span>
              {text.length > 0 && tooShort && (
                <span className="text-xs text-amber-400">Wpisz co najmniej {MIN_INPUT_CHARS} znaków</span>
              )}
            </div>
            <Button type="submit" disabled={!configured || tooShort || state === "processing"}>
              Klasyfikuj
            </Button>
          </div>

          <ClassificationModal
            state={state}
            itemCount={itemCount}
            errorCode={errorCode}
            onRetry={() => {
              void run(text);
            }}
            onClose={reset}
          />
        </form>
      </CardContent>
    </Card>
  );
}
