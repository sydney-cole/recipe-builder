"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]" /><DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl border border-border bg-white p-6 shadow-2xl", className)} {...props}>{children}<DialogPrimitive.Close className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg hover:bg-surface-subtle" aria-label="Close dialog"><X size={18} /></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>;
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) { return <DialogPrimitive.Title className={cn("font-display text-2xl font-semibold", className)} {...props} />; }
export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) { return <DialogPrimitive.Description className={cn("mt-2 text-sm leading-6 text-muted-foreground", className)} {...props} />; }
