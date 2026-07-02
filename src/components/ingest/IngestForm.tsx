// Island formularza wsadu (US-01 / FR-002 / FR-018). Dwa wzajemnie wykluczające się tryby wsadu
// (paste XOR plik — jeden element na submit): pole paste z licznikiem n/100000 i live-sanityzacją,
// oraz strefa drag-and-drop .txt/.md (PR2, Faza 8). Wybór pliku blokuje pole paste i odwrotnie.
// Submit otwiera blokujący ClassificationModal i woła hook klasyfikacji (paste → JSON, plik → multipart).
// Gdy brak klucza — submit wyłączony (strona renderuje wtedy bramkę US-06; prop jest defensywą).

import React, { useRef, useState, type ChangeEvent } from "react";

import { useClassification } from "@/components/hooks/useClassification";
import { ClassificationModal } from "@/components/ingest/ClassificationModal";
import { FileDropZone, validateImportFile } from "@/components/ingest/FileDropZone";
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
  const [file, setFile] = useState<File | null>(null);
  const { state, itemCount, errorCode, run, reset } = useClassification();
  const configured = initialKeyStatus.configured;
  const processing = state === "processing";
  const atLimit = text.length >= INPUT_MAX_CHARS;
  const tooShort = text.trim().length < MIN_INPUT_CHARS;

  // Tryby wykluczają się (jeden element wsadu, FR-018): plik → paste zablokowane; tekst → dropzone zablokowana.
  const hasText = text.trim().length > 0;
  const hasFile = file !== null;
  const textValid = hasText && !tooShort && text.length <= INPUT_MAX_CHARS;
  const fileValid = hasFile && validateImportFile(file) === null;
  const canSubmit = configured && !processing && (hasFile ? fileValid : textValid);

  // Znacznik czasu ostatniego Esc — podwójny Esc (≤ 500 ms) czyści pole. Ref, by pierwszy Esc nie re-renderował.
  const lastEscapeAt = useRef(0);

  /** Submituje aktualnie wybrany element wsadu (plik ma pierwszeństwo nad tekstem). Reużywane przez „Spróbuj ponownie”. */
  function submitCurrent() {
    if (!canSubmit) return;
    void run(file ?? text); // File → multipart, string → JSON (XOR egzekwowane przez canSubmit)
  }

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
    submitCurrent();
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Klasyfikacja wsadu</CardTitle>
        <CardDescription>
          Wklej luźne myśli, notatki lub listę — albo wrzuć plik .txt/.md. Zamienimy je na typowane wpisy. Podwójny Esc
          czyści pole.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Label htmlFor="ingest-text">Tekst do klasyfikacji</Label>
          {/* Wysokość względem viewportu (clamp 6rem–14rem): na laptopie cały formularz (pole + strefa
              dropu + „Wyślij") mieści się bez przewijania, na dużym ekranie pole nadal rośnie do 14rem. */}
          <Textarea
            id="ingest-text"
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={!configured || processing || hasFile}
            placeholder="Wklej luźne myśli, notatki, listę zadań…"
            className="field-sizing-fixed h-[clamp(6rem,22vh,14rem)] resize-none overflow-y-auto font-mono text-sm"
          />
          <div className="flex flex-col">
            <span className={cn("text-xs", atLimit ? "text-amber-400" : "text-muted-foreground")}>
              {text.length.toLocaleString("pl-PL")} / {INPUT_MAX_CHARS.toLocaleString("pl-PL")} znaków
            </span>
            {text.length > 0 && tooShort && (
              <span className="text-xs text-amber-400">Wpisz co najmniej {MIN_INPUT_CHARS} znaków</span>
            )}
          </div>

          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <span className="bg-border h-px flex-1" />
            albo
            <span className="bg-border h-px flex-1" />
          </div>

          <FileDropZone
            selectedFile={file}
            onFile={setFile}
            disabled={!configured || processing || (hasText && !hasFile)}
          />

          <div className="flex justify-end">
            <Button type="submit" disabled={!canSubmit}>
              Wyślij
            </Button>
          </div>

          <ClassificationModal
            state={state}
            itemCount={itemCount}
            errorCode={errorCode}
            onRetry={submitCurrent}
            onClose={reset}
          />
        </form>
      </CardContent>
    </Card>
  );
}
