import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type">;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    const [rippling, setRippling] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    function toggle() {
      setVisible((v) => !v);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setRippling(false);
      requestAnimationFrame(() => setRippling(true));
      timeoutRef.current = setTimeout(() => setRippling(false), 600);
    }

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pe-10 transition-[border-color,box-shadow] duration-300", className)}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={toggle}
          className="group absolute end-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-all duration-300 hover:bg-secondary hover:text-foreground active:scale-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {/* expanding ripple ring on each toggle */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 rounded-full border border-primary/40",
              rippling ? "ping-once" : "opacity-0",
            )}
          />
          {/* icons crossfade + rotate in place */}
          <span aria-hidden className="relative block size-4">
            <Eye
              className={cn(
                "absolute inset-0 size-4 transition-all duration-300 ease-out",
                visible ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100",
              )}
            />
            <EyeOff
              className={cn(
                "absolute inset-0 size-4 transition-all duration-300 ease-out",
                visible ? "scale-100 rotate-0 opacity-100" : "-rotate-90 scale-50 opacity-0",
              )}
            />
          </span>
        </button>
      </div>
    );
  },
);
