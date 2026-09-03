import { cn } from "@/lib/utils";

export function Alert({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div role="status" className={cn("rounded-xl border border-border bg-white p-4 text-sm shadow-sm", className)} {...props} />; }
export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) { return <h3 className={cn("font-extrabold", className)} {...props} />; }
export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) { return <p className={cn("mt-1 leading-6 text-muted-foreground", className)} {...props} />; }
