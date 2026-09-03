import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: React.ReactNode }) {
  return (
    <Card className="border-dashed">
      <CardContent className="grid min-h-64 place-items-center text-center">
        <div className="max-w-md">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-primary-soft text-primary"><Icon size={23} /></span>
          <h2 className="text-lg font-extrabold">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          {action && <div className="mt-5 flex justify-center">{action}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
