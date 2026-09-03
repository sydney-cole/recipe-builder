"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import type { ComponentProps } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root className={cn("checkbox", className)} {...props}>
      <CheckboxPrimitive.Indicator><Check size={15} strokeWidth={2.5} /></CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
