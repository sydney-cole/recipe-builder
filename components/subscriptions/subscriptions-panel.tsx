import { MailCheck, Rss } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { subscriptions } from "@/lib/data/mock-data";

export function SubscriptionsPanel() {
  return (
    <div className="stack gap-6">
      <Alert>
        <Rss size={18} />
        <AlertTitle>Subscriptions are a preview</AlertTitle>
        <AlertDescription>PerfectPlate does not enroll in or manage newsletters yet. Forward a newsletter you receive to the shared recipe inbox instead.</AlertDescription>
      </Alert>
      <section className="grid-auto" aria-label="Example food blog subscriptions">
        {subscriptions.map((item) => <Card key={item.id}><CardContent>
          <span className="grid size-10 place-items-center rounded-lg bg-aqua-soft text-primary"><MailCheck size={20} /></span>
          <h2 className="mt-4 text-lg font-extrabold">{item.name}</h2>
          <p className="text-sm text-muted-foreground">{item.domain}</p>
          <p className="mt-5 rounded-lg bg-surface-subtle p-3 text-sm font-bold">Example only — no account data is changed.</p>
        </CardContent></Card>)}
      </section>
    </div>
  );
}
