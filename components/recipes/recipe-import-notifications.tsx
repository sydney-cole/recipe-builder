"use client";

import { useQuery } from "convex/react";
import { BookOpen, CheckCircle2, LoaderCircle, PencilLine, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { RECIPE_IMPORT_STARTED_EVENT } from "@/lib/recipe-import-events";
import { recipeImportFailureMessage } from "@/lib/recipe-import-errors";
import { ManualRecipeDialog } from "./manual-recipe-dialog";
import { RecipePreviewModal } from "./recipe-preview-modal";

type ImportStartedEvent = CustomEvent<{ importId: string }>;

export function RecipeImportNotifications() {
  const imports = useQuery(api.email.recentImports);
  const [trackedIds, setTrackedIds] = useState<string[]>([]);
  const [previewRecipeId, setPreviewRecipeId] = useState<Id<"recipes"> | null>(null);
  const [manualImportId, setManualImportId] = useState<string | null>(null);
  const seenIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    function track(event: Event) {
      const { importId } = (event as ImportStartedEvent).detail;
      setTrackedIds((current) => current.includes(importId) ? current : [...current, importId]);
    }
    window.addEventListener(RECIPE_IMPORT_STARTED_EVENT, track);
    return () => window.removeEventListener(RECIPE_IMPORT_STARTED_EVENT, track);
  }, []);

  useEffect(() => {
    if (imports === undefined) return;
    if (seenIds.current === null) {
      seenIds.current = new Set(imports.map((item) => item._id));
      const activeIds = imports
        .filter((item) => !["completed", "needs_review", "failed"].includes(item.status))
        .map((item) => item._id);
      if (activeIds.length > 0) {
        const timeout = window.setTimeout(() => {
          setTrackedIds((current) => [...new Set([...current, ...activeIds])]);
        }, 0);
        return () => window.clearTimeout(timeout);
      }
      return;
    }

    const newIds = imports
      .filter((item) => !seenIds.current!.has(item._id))
      .map((item) => item._id);
    for (const item of imports) seenIds.current.add(item._id);
    if (newIds.length > 0) {
      const timeout = window.setTimeout(() => {
        setTrackedIds((current) => [...new Set([...current, ...newIds])]);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [imports]);

  const trackedCandidates = trackedIds
    .map((id) => imports?.find((item) => item._id === id))
    .filter((item): item is Doc<"recipeImports"> => item !== undefined);
  const groupedCandidates = new Map<string, Array<Doc<"recipeImports">>>();
  for (const item of trackedCandidates) {
    const key = item.sourceEventId ?? item._id;
    groupedCandidates.set(key, [...(groupedCandidates.get(key) ?? []), item]);
  }
  const trackedImportGroups = [...groupedCandidates.entries()].flatMap(([key, group]) => {
    const active = group.find((item) =>
      !["completed", "needs_review", "failed"].includes(item.status),
    );
    if (active) return [{ key, item: active, ids: group.map((item) => item._id) }];

    // One forwarded email is one user-visible job. If any URL from that email
    // produced a recipe, suppress failures from unrelated signature links.
    const completed = group.find((item) =>
      (item.status === "completed" || item.status === "needs_review") && item.recipeId !== undefined,
    );
    if (completed) return [{ key, item: completed, ids: group.map((item) => item._id) }];
    const failed = group.find((item) => item.status === "failed");
    if (failed) {
      return [{ key, item: failed, ids: group.map((item) => item._id) }];
    }
    return [];
  });

  return (
    <>
      <div className="fixed bottom-24 right-4 z-40 grid w-[min(92vw,24rem)] gap-3 md:bottom-6" aria-live="polite" aria-label="Recipe import notifications">
        {trackedImportGroups.map(({ key, item: recipeImport, ids }) => {
          const failed = recipeImport.status === "failed";
          const completed = recipeImport.status === "completed" || recipeImport.status === "needs_review";
          return (
            <div className="rounded-xl border border-border bg-white p-4 shadow-2xl" key={key} role={failed ? "alert" : "status"}>
              <div className="flex items-start gap-3">
                {failed ? <TriangleAlert className="mt-0.5 shrink-0 text-red-600" size={20} /> : completed ? <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={20} /> : <LoaderCircle className="mt-0.5 shrink-0 animate-spin text-primary" size={20} />}
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold">{failed ? "Recipe import failed" : completed ? "Your recipe is ready" : "Creating your recipe card"}</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{failed ? recipeImportFailureMessage(recipeImport.errorMessage) : completed ? "Review the recipe card, then save it when it looks right." : "We’re processing the source. You can keep using PerfectPlate while it finishes."}</p>
                  {failed && <Button className="mt-3" size="sm" onClick={() => setManualImportId(recipeImport._id)}><PencilLine size={16} />Add manually</Button>}
                  {completed && recipeImport.recipeId && <Button className="mt-3" size="sm" onClick={() => { setPreviewRecipeId(recipeImport.recipeId!); setTrackedIds((current) => current.filter((id) => !ids.includes(id as Id<"recipeImports">))); }}><BookOpen size={16} />View recipe</Button>}
                </div>
                <button className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-surface-subtle" onClick={() => setTrackedIds((current) => current.filter((id) => !ids.includes(id as Id<"recipeImports">)))} aria-label="Dismiss recipe notification"><X size={16} /></button>
              </div>
            </div>
          );
        })}
      </div>
      {previewRecipeId && <RecipePreviewModal recipeId={previewRecipeId} onClose={() => setPreviewRecipeId(null)} />}
      <ManualRecipeDialog
        key={manualImportId ?? "closed-manual-recipe"}
        open={manualImportId !== null}
        onOpenChange={(open) => { if (!open) setManualImportId(null); }}
        initialSourceUrl={imports?.find((item) => item._id === manualImportId)?.sourceUrl ?? ""}
        onCreated={(recipeId) => {
          if (manualImportId) setTrackedIds((current) => current.filter((id) => id !== manualImportId));
          setManualImportId(null);
          setPreviewRecipeId(recipeId);
        }}
      />
    </>
  );
}
