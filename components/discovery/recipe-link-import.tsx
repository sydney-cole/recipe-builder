"use client";

import { useMutation, useQuery } from "convex/react";
import { BookPlus, Link2, LoaderCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { announceRecipeImport } from "@/lib/recipe-import-events";
import { recipeImportFailureMessage } from "@/lib/recipe-import-errors";

export function RecipeLinkImport() {
  const router = useRouter();
  const queueUrl = useMutation(api.email.queueUrl);
  const [importId, setImportId] = useState<Id<"recipeImports"> | null>(null);
  const importResult = useQuery(
    api.email.importResult,
    importId === null ? "skip" : { importId },
  );
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [isQueueing, setIsQueueing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function submitUrl(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsQueueing(true);
    try {
      const queuedImportId = await queueUrl({ sourceUrl: url.trim() });
      announceRecipeImport(queuedImportId);
      setImportId(queuedImportId);
      setDialogOpen(true);
      setUrl("");
    } catch {
      setError("We couldn’t queue that link. Check the URL and try again.");
    } finally {
      setIsQueueing(false);
    }
  }

  return (
    <Card className="discovery-import-card" id="paste-recipe">
      <CardContent className="discovery-import-content">
        <div className="cluster">
          <Link2 className="text-primary" size={20} />
          <h2 className="font-display text-3xl font-semibold tracking-tight">Paste a recipe link</h2>
        </div>
        <form className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]" onSubmit={submitUrl}>
          <label className="flex-1">
            <span className="sr-only">Recipe URL</span>
            <Input
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/favorite-recipe"
            />
          </label>
          <Button className="w-full" type="submit" size="lg" disabled={isQueueing}>
            <Send size={17} />
            {isQueueing ? "Queueing…" : "Import recipe"}
          </Button>
        </form>
        {error && (
          <Alert className="mt-3 border-red-200 bg-red-50" role="alert">
            <AlertTitle>Import unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
    </Card>
  );
}
