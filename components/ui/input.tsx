import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-11 w-full rounded-xl border border-ink/15 bg-white px-3 text-base placeholder:text-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";
