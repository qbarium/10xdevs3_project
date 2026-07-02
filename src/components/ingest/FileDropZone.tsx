// Strefa drag-and-drop jednego pliku .txt/.md (PR2, Faza 8). Walidacja client-side typu i rozmiaru
// (FR-018) PRZED submitem — przyjazny komunikat zamiast cichego odrzucenia przez serwer. Limity są
// reużyte z file-upload.ts (jedno źródło prawdy FR-018): import czystych stałych jest bezpieczny dla
// bundla wyspy — `import type` Supabase znika przy budowaniu, a uploadImportFile wytrząsa tree-shaking.
// Komponent jest semi-kontrolowany: stan wybranego pliku trzyma rodzic (IngestForm), tu tylko UI + DnD.

import { useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { FileText, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ALLOWED_EXTENSIONS, fileExtension, MAX_FILE_BYTES } from "@/lib/services/file-upload";
import { cn } from "@/lib/utils";

/**
 * Czysta walidacja pliku po stronie klienta (FR-018). Zwraca komunikat błędu (PL) albo `null`, gdy plik
 * jest poprawny. Reużywa stałych z file-upload.ts, więc client i serwer egzekwują identyczny kontrakt.
 * Wydzielona i eksportowana, by była unit-testowalna w środowisku `node` (bez renderu React).
 */
export function validateImportFile(file: File): string | null {
  const ext = fileExtension(file.name);
  if (ext === null || !(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return "Obsługiwane są tylko pliki .txt i .md.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return `Plik jest za duży — maksymalny rozmiar to ${Math.round(MAX_FILE_BYTES / 1024)} KB.`;
  }
  return null;
}

/** Czytelny rozmiar pliku dla podglądu (KB z jedną cyfrą po przecinku). */
function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} KB`;
}

interface Props {
  selectedFile: File | null;
  /** Wywoływane z poprawnym plikiem albo `null` (wyczyszczenie wyboru). Plik niepoprawny NIE jest przekazywany. */
  onFile: (file: File | null) => void;
  disabled?: boolean;
}

export function FileDropZone({ selectedFile, onFile, disabled = false }: Props) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  /** Wspólna ścieżka dla drop i wyboru z dialogu: waliduje i albo zgłasza plik, albo pokazuje błąd. */
  function accept(file: File | undefined): void {
    if (!file) return;
    const message = validateImportFile(file);
    if (message) {
      setError(message);
      onFile(null);
      return;
    }
    setError(null);
    onFile(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragActive(false);
    if (disabled) return;
    accept(e.dataTransfer.files[0]); // single-file: bierzemy tylko pierwszy
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    if (!disabled) setDragActive(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragActive(false);
  }

  function handleSelect(e: ChangeEvent<HTMLInputElement>): void {
    accept(e.target.files?.[0]);
    e.target.value = ""; // reset, by ponowny wybór tego samego pliku wyzwolił onChange
  }

  function handleRemove(): void {
    setError(null);
    onFile(null);
  }

  if (selectedFile) {
    return (
      <div className="border-input bg-muted/30 flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="size-4 shrink-0 text-purple-400" />
          <span className="truncate text-sm" title={selectedFile.name}>
            {selectedFile.name}
          </span>
          <span className="text-muted-foreground shrink-0 text-xs">{formatBytes(selectedFile.size)}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={handleRemove}
          disabled={disabled}
          aria-label="Usuń wybrany plik"
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          // Jeden WIERSZ (ikona + tekst + przycisk, flex-wrap na wąskich ekranach) zamiast pionowej kolumny
          // — formularz wsadu mieści się na laptopie bez przewijania (decyzja użytkownika 2026-07-02).
          "flex flex-wrap items-center justify-center gap-3 rounded-md border border-dashed px-4 py-3 text-center transition-colors",
          dragActive ? "border-purple-400 bg-purple-400/5" : "border-input",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <Upload className="text-muted-foreground size-5" />
        <p className="text-muted-foreground text-sm">
          Przeciągnij plik <span className="font-medium">.txt</span> lub <span className="font-medium">.md</span> (maks.{" "}
          {Math.round(MAX_FILE_BYTES / 1024)} KB)
        </p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".txt,.md"
          className="sr-only"
          onChange={handleSelect}
          disabled={disabled}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={disabled}>
          Wybierz plik
        </Button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
