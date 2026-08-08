// Źródło prawdy dla UX kuracji przejść stanu operacyjnego (S-04) — ODDZIELONE od walidacji, która
// dopuszcza wszystkie 4 stany (przechodniość na warstwie danych, FR-009 „wzajemnie przechodnie").
// Menu per-item wystawia tylko przejścia sensowne ze stanu źródłowego; graf jest silnie spójny przez
// hub `nowe` (każdy stan osiąga każdy inny, czasem w 2 krokach), więc kuracja nie zamyka żadnej ścieżki.
// Verby generyczne — per-typ nadpisania verbów poza zakresem S-04 (patrz plan §Czego NIE robimy).

import type { OperationalStatus } from "@/types";

export interface OperationalTransition {
  target: OperationalStatus;
  label: string;
}

export const OPERATIONAL_TRANSITIONS: Record<OperationalStatus, OperationalTransition[]> = {
  new: [
    { target: "in_progress", label: "Rozpocznij" },
    { target: "done", label: "Zakończ" },
    { target: "cancelled", label: "Anuluj" },
  ],
  in_progress: [
    { target: "done", label: "Zakończ" },
    { target: "new", label: "Cofnij do „nowe”" },
    { target: "cancelled", label: "Anuluj" },
  ],
  done: [{ target: "new", label: "Otwórz ponownie" }],
  cancelled: [{ target: "new", label: "Przywróć" }],
};
