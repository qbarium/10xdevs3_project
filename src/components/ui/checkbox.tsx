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
        // Faza 2 (prod-feedback-fixes, ticket ef87e4f8): stan niezaznaczony w dark był praktycznie
        // niewidoczny — `border-input`/`--input` to biel ~15% alfa, wtapiająca się w ciemne tło karty
        // (`--card`). `dark:border-white/40` + `dark:bg-white/10` (zastępuje dawne `dark:bg-input/30`)
        // podnoszą kontrast TYLKO w dark i TYLKO gdy niezaznaczony — `data-[state=checked]:*` niżej ma tę
        // samą specyficzność co warianty `dark:`, a w praktyce (jak dotychczasowe `dark:bg-input/30` obok
        // `data-[state=checked]:bg-primary`) wygrywa dla zaznaczonego stanu w obu motywach. Jasny motyw
        // (bez `dark:`) i stan zaznaczony (`bg-primary`/`border-primary`) — bez zmian.
        "peer border-input data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/40 dark:bg-white/10",
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
