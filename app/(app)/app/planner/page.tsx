import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { PlannerWeek } from "@/components/planner/planner-week";

export default function PlannerPage() {
  return (
    <div className="page-container">
      <PageHeader eyebrow="Plan your week" title="Planner" description="Breakfast, lunch and dinner for the week. Type a meal, press Enter, keep going." />
      {/* The week comes from the URL, which needs a Suspense boundary to prerender. */}
      <Suspense>
        <PlannerWeek />
      </Suspense>
    </div>
  );
}
