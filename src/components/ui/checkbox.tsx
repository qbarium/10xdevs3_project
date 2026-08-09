import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// shadcn „new-york" checkbox na istniejącym unified `radix-ui` (bez nowej zależności npm).
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // Ticket ef87e4f8 (prod-feedback-fixes): w trybie ciemnym checkboxy były niewidoczne. Niezaznaczony
        // wtapiał się w ciemną kartę, więc dokładamy jasną ramkę/tło (`white/40` + `white/10`) — ale TYLKO
        // w stanie `unchecked`. Pomiar (E2E) pokazał, że bez tego zawężenia `dark:bg-white/10` miało tę samą
        // specyficzność co `data-[state=checked]:bg-primary` i jako późniejsze WYGRYWAŁO również dla stanu
        // zaznaczonego — pole zostawało ciemne, a ciemny ptaszek (`primary-foreground`) był na nim niewidoczny.
        // Ograniczenie do `data-[state=unchecked]` przywraca zaznaczonemu jasne tło `primary`, na którym
        // ptaszek wyraźnie kontrastuje. Jasny motyw i stan zaznaczony poza `dark` — bez zmian.
        "peer border-input data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 dark:data-[state=unchecked]:border-white/40 dark:data-[state=unchecked]:bg-white/10",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
