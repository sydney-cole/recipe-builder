"use client";

import { useMutation } from "convex/react";
import { Link2, Send } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { announceRecipeImport } from "@/lib/recipe-import-events";

export function RecipeLinkImport() {
  const queueUrl = useMutation(api.email.queueUrl);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isQueueing, setIsQueueing] = useState(false);

  async function submitUrl(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsQueueing(true);
    try {
      const importId = await queueUrl({ sourceUrl: url.trim() });
      announceRecipeImport(importId);
      setUrl("");
      setMessage("Recipe link queued. We’ll let you know when the card is ready to view.");
    } catch {
      setError("We couldn’t queue that link. Check the URL and try again.");
    } finally {
      setIsQueueing(false);
    }
  }

  return (
    <Card className="discovery-import-card">
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
        {message && (
          <p className="mt-3 rounded-lg bg-primary-soft p-3 text-sm font-semibold text-primary" role="status">
            {message}
          </p>
        )}
        {error && (
          <Alert className="mt-3 border-red-200 bg-red-50" role="alert">
            <AlertTitle>Import unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
