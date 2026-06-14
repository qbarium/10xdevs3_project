import { Toaster as Sonner, type ToasterProps } from "sonner";

// Adaptacja shadcn `sonner` dla Astro: BEZ `next-themes` (projekt nie jest Next.js). Motyw `dark`
// pod UI „cosmic". Osadzany w drzewie React islandu (PendingItemsView) jako system feedbacku akcji.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
