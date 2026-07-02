// Wspólna karta wpisu (S-13 F3) — jedna implementacja zamiast trzech kopii inline w widokach głównych
// i czwartej w panelu S-10. Świadoma 4 stanów akceptacji, konfigurowana przez powierzchnię: badge'e,
// zaznaczanie, zestaw akcji (handlery opcjonalne). Akcja renderuje się TYLKO gdy podano handler ORAZ stan
// wpisu na nią pozwala (czysta funkcja `isActionAllowed` z `item-card.ts`). Układ akcji wynika ze STANU
// (nie z powierzchni): `pending` → kolumna Zatwierdź/Odrzuć/Edytuj po prawej (jak dotychczasowy widok
// akceptacji); `accepted` i kosz → akcje-duchy w wierszu badge'ów (jak dotychczasowe Aktywne/Kosz).
// `data-item-id` + `tabIndex={-1}` zawsze — uchwyt focusu świeżego wpisu (S-07) niewidoczny bez fokusu.

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { isActionAllowed } from "@/components/items/item-card";
import OperationalStatusBadge from "@/components/items/OperationalStatusBadge";
import { acceptanceOriginLabel, acceptanceStatusLabel, itemTypeLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Item } from "@/types";

/** Checkbox wyraźnie widoczny na ciemnym tle „cosmic" — współdzielony z nagłówkami „Zaznacz wszystkie" widoków. */
export const ITEM_CHECKBOX_CLASS =
  "size-5 border-white/40 data-[state=checked]:border-purple-400 data-[state=checked]:bg-purple-500 data-[state=checked]:text-white data-[state=indeterminate]:border-purple-400 data-[state=indeterminate]:bg-purple-500 data-[state=indeterminate]:text-white";

const GHOST_ACTION = "text-white/60 hover:bg-white/10 hover:text-white";

interface Props {
  item: Item;
  /** Które badge'e (poza zawsze obecnym badge typu) renderować — decyzja powierzchni. */
  badges: { acceptance?: boolean; operational?: boolean; origin?: boolean };
  /** Zaznaczanie (akcje zbiorcze widoków głównych). Tryb sesji nie podaje — checkbox znika. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Wpis w locie (mutacja trwa): wygaszenie `opacity-50` + blokada interakcji. */
  inFlight?: boolean;
  /** Blokada akcji MUTUJĄCYCH (akceptuj/odrzuć/kosz/przywróć) na czas innej mutacji; edycja/podgląd aktywne. */
  actionsDisabled?: boolean;
  onEdit?: (item: Item) => void;
  onAccept?: (item: Item) => void;
  onReject?: (item: Item) => void;
  onTrash?: (item: Item) => void;
  onRestore?: (item: Item) => void;
  onPreview?: (item: Item) => void;
}

export default function ItemCard({
  item,
  badges,
  selectable = false,
  selected = false,
  onToggleSelect,
  inFlight = false,
  actionsDisabled = false,
  onEdit,
  onAccept,
  onReject,
  onTrash,
  onRestore,
  onPreview,
}: Props) {
  const status = item.acceptance_status;
  // Akcja widoczna = handler podany ORAZ stan na nią pozwala (tabela w item-card.ts).
  const canEdit = onEdit != null && isActionAllowed(status, "edit");
  const canAccept = onAccept != null && isActionAllowed(status, "accept");
  const canReject = onReject != null && isActionAllowed(status, "reject");
  const canTrash = onTrash != null && isActionAllowed(status, "trash");
  const canRestore = onRestore != null && isActionAllowed(status, "restore");
  const canPreview = onPreview != null && isActionAllowed(status, "preview");

  // Kolumna akcji po prawej — wyłącznie stan `pending` (Zatwierdź/Odrzuć/Edytuj, jak dotychczasowy widok).
  const pendingActions = canAccept || canReject || (status === "pending" && canEdit);
  // Akcje-duchy w wierszu badge'ów — stany `accepted` (Edytuj/Do kosza) i koszowe (Podgląd/Przywróć).
  const inlineActions = (status !== "pending" && canEdit) || canTrash || canPreview || canRestore;

  return (
    <article
      data-item-id={item.id}
      tabIndex={-1}
      className={cn(
        "flex gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl transition-opacity focus:ring-2 focus:ring-purple-400/60 focus:outline-none",
        inFlight && "pointer-events-none opacity-50",
      )}
    >
      {selectable && (
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          aria-label={`Zaznacz: ${item.title}`}
          className={cn("mt-1", ITEM_CHECKBOX_CLASS)}
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-block rounded-full border border-purple-300/30 bg-purple-400/10 px-2 py-0.5 text-xs font-medium text-purple-100">
            {itemTypeLabel(item.type)}
          </span>
          {badges.acceptance && (
            <span className="inline-block rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs font-medium text-white/70">
              {acceptanceStatusLabel(status)}
            </span>
          )}
          {badges.operational && item.operational_status && <OperationalStatusBadge item={item} />}
          {badges.origin && (status === "rejected" || status === "deleted") && (
            <span className="inline-block rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs font-medium text-white/70">
              {acceptanceOriginLabel(status)}
            </span>
          )}

          {inlineActions && (
            <div className="ml-auto flex gap-2">
              {status !== "pending" && canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={GHOST_ACTION}
                  onClick={() => {
                    onEdit(item);
                  }}
                >
                  Edytuj
                </Button>
              )}
              {canTrash && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={GHOST_ACTION}
                  disabled={actionsDisabled}
                  onClick={() => {
                    onTrash(item);
                  }}
                >
                  Do kosza
                </Button>
              )}
              {canPreview && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={GHOST_ACTION}
                  onClick={() => {
                    onPreview(item);
                  }}
                >
                  Podgląd
                </Button>
              )}
              {canRestore && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={GHOST_ACTION}
                  disabled={actionsDisabled}
                  onClick={() => {
                    onRestore(item);
                  }}
                >
                  Przywróć
                </Button>
              )}
            </div>
          )}
        </div>

        <h3 className="mt-2 font-semibold text-white/90">{item.title}</h3>
        {item.description && <p className="mt-1 line-clamp-2 text-sm text-white/70">{item.description}</p>}
      </div>

      {pendingActions && (
        <div className="flex shrink-0 items-start gap-1">
          {canAccept && (
            <Button
              variant="default"
              size="sm"
              disabled={actionsDisabled}
              onClick={() => {
                onAccept(item);
              }}
            >
              Zatwierdź
            </Button>
          )}
          {canReject && (
            <Button
              variant="outline"
              size="sm"
              disabled={actionsDisabled}
              onClick={() => {
                onReject(item);
              }}
            >
              Odrzuć
            </Button>
          )}
          {status === "pending" && canEdit && (
            <Button
              variant="ghost"
              size="sm"
              className={GHOST_ACTION}
              onClick={() => {
                onEdit(item);
              }}
            >
              Edytuj
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
