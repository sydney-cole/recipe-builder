"use client";

import { Button } from "@/components/ui/button";

export default function PlannerError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="page-container">
      <div className="rounded-xl border border-red-200 bg-red-50 p-5" role="alert">
        <h1 className="section-heading">Your plan could not be loaded.</h1>
        <p className="mt-2 text-sm text-red-900">Check your connection, then try again.</p>
        <Button className="mt-4" variant="secondary" onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
