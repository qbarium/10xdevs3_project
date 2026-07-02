// Island zarządzania kluczem BYOK w profilu (US-06 / FR-021/FR-024). UI sterowane `status.configured`:
//  - brak klucza → formularz z `input type="password"` + „Zapisz";
//  - klucz jest → karta z zamaskowanym hintem (`sk-…AB12`), datą i „Usuń" (dwustopniowe potwierdzenie).
// `pending` blokuje akcje, `error` ląduje w `Alert`. Logika sieci/stanu siedzi w hooku `useApiKey`.
// Pełny klucz nigdy nie jest renderowany ani trzymany w stanie po udanym zapisie.

import React, { useState } from "react";
import { KeyRound, Save, ShieldCheck, Trash2 } from "lucide-react";

import { useApiKey } from "@/components/hooks/useApiKey";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AI_PROVIDER_NAME } from "@/lib/config/byok";
import type { ByokKeyStatus } from "@/types";

interface Props {
  initialStatus: ByokKeyStatus;
}

export default function ApiKeyManager({ initialStatus }: Props) {
  const { status, pending, error, save, remove } = useApiKey(initialStatus);
  const [draft, setDraft] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function handleSave(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    const ok = await save(trimmed);
    // Nie przechowuj plaintextu klucza w stanie po udanym zapisie.
    if (ok) setDraft("");
  }

  async function handleRemove() {
    await remove();
    setConfirmRemove(false);
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-5" />
          Klucz API {AI_PROVIDER_NAME}
        </CardTitle>
        <CardDescription>
          Klucz jest szyfrowany i przechowywany bezpiecznie. Nigdy nie pokazujemy go w całości.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {status.configured ? (
          <div className="flex flex-col gap-4">
            <div className="bg-muted/40 flex flex-col gap-1 rounded-lg border px-4 py-3">
              <span className="text-muted-foreground text-xs">Skonfigurowany klucz</span>
              <span className="flex items-center gap-2 font-mono text-sm">
                <ShieldCheck className="size-4 text-emerald-600" />
                {status.hint ?? "•••"}
              </span>
              {status.updatedAt && (
                <span className="text-muted-foreground text-xs">Zapisano {status.updatedAt.slice(0, 10)}</span>
              )}
            </div>

            {confirmRemove ? (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-sm">Na pewno usunąć zapisany klucz?</p>
                <div className="flex gap-2">
                  <Button type="button" variant="destructive" disabled={pending} onClick={handleRemove}>
                    <Trash2 className="size-4" />
                    {pending ? "Usuwanie…" : "Tak, usuń"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      setConfirmRemove(false);
                    }}
                  >
                    Anuluj
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="self-start"
                disabled={pending}
                onClick={() => {
                  setConfirmRemove(true);
                }}
              >
                <Trash2 className="size-4" />
                Usuń klucz
              </Button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="apiKey">Klucz API {AI_PROVIDER_NAME}</Label>
              {/* autoFocus: jedyne pole formatki — kursor od razu w polu po wejściu na stronę
                  (decyzja użytkownika 2026-07-02), bez dodatkowego kliknięcia. */}
              <Input
                id="apiKey"
                type="password"
                autoComplete="off"
                placeholder="sk-…"
                autoFocus
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                }}
                disabled={pending}
              />
            </div>
            <Button type="submit" className="self-start" disabled={pending || !draft.trim()}>
              <Save className="size-4" />
              {pending ? "Zapisywanie…" : "Zapisz"}
            </Button>
          </form>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Coś poszło nie tak</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
