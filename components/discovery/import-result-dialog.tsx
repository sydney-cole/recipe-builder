"use client";

import { useQuery } from "convex/react";
import { BookPlus, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { recipeImportFailureMessage } from "@/lib/recipe-import-errors";

export function ImportResultDialog({
  importId,
  open,
  onOpenChange,
}: {
  importId: Id<"recipeImports"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const importResult = useQuery(
    api.email.importResult,
    importId === null ? "skip" : { importId },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,640px)]">
        <DialogTitle>Recipe result</DialogTitle>
        <DialogDescription>
          The link is processed once. Choose the result to open its recipe page before deciding whether to save it.
        </DialogDescription>
        {importResult?.status === "failed" ? (
          <Alert className="mt-5 border-red-300 bg-red-50 text-red-900" role="alert">
            <AlertTitle>Recipe import failed</AlertTitle>
            <AlertDescription>{recipeImportFailureMessage(importResult.errorMessage)}</AlertDescription>
          </Alert>
        ) : importResult?.recipeId ? (
          <Card className="mt-5">
            <CardContent className="stack p-5">
              <div>
                <h3>{importResult.title ?? "Imported recipe"}</h3>
                {importResult.description && (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{importResult.description}</p>
                )}
              </div>
              <Button onClick={() => router.push(`/app/recipes/${importResult.recipeId}`)}>
                <BookPlus size={16} />
                Choose recipe
              </Button>
            </CardContent>
          </Card>
        ) : (
          <p className="mt-5 flex items-center gap-2 rounded-lg bg-primary-soft p-4 text-sm font-semibold text-primary" role="status">
            <LoaderCircle className="animate-spin" size={17} />
            Reading the recipe and preparing your result…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
