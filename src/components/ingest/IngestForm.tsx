// Island formularza wsadu paste (US-01 / FR-002). Pole z licznikiem n/100000, blokadą wprowadzania
// po limicie i live-sanityzacją (normalizeForInput — bez trim, by spacje dało się wpisywać). Submit
// otwiera blokujący ClassificationModal i woła hook klasyfikacji. Gdy brak klucza — submit wyłączony
// (strona renderuje wtedy bramkę US-06 zamiast formularza, prop jest defensywą).

import React, { useState, type ChangeEvent } from "react";

import { useClassification } from "@/components/hooks/useClassification";
import { ClassificationModal } from "@/components/ingest/ClassificationModal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INPUT_MAX_CHARS, normalizeForInput } from "@/lib/text/sanitize";
import { cn } from "@/lib/utils";
import type { ByokKeyStatus } from "@/types";

interface Props {
  initialKeyStatus: ByokKeyStatus;
}

export default function IngestForm({ initialKeyStatus }: Props) {
  const [text, setText] = useState("");
  const { state, itemCount, errorCode, run, reset } = useClassification();
  const configured = initialKeyStatus.configured;
  const atLimit = text.length >= INPUT_MAX_CHARS;

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    // Live-sanityzacja (NFC + usunięcie znaków sterujących) + twarda blokada limitu paste (FR-002).
    setText(normalizeForInput(e.target.value).slice(0, INPUT_MAX_CHARS));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!configured || !text.trim()) return;
    void run(text);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Label htmlFor="ingest-text">Wklej tekst do klasyfikacji</Label>
      <Textarea
        id="ingest-text"
        value={text}
        onChange={handleChange}
        disabled={!configured || state === "processing"}
        placeholder="Wklej luźne myśli, notatki, listę zadań…"
        className="min-h-48 font-mono text-sm"
      />
      <div className="flex items-center justify-between">
        <span className={cn("text-xs", atLimit ? "text-amber-400" : "text-muted-foreground")}>
          {text.length.toLocaleString("pl-PL")} / {INPUT_MAX_CHARS.toLocaleString("pl-PL")} znaków
        </span>
        <Button type="submit" disabled={!configured || !text.trim() || state === "processing"}>
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
  );
}
