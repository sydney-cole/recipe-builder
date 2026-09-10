"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Clipboard, Link2, Mail, RefreshCw, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";

type ImportStatus = "queued" | "scraping" | "parsed" | "completed" | "failed";

function displayStatus(status: ImportStatus, stage?: "retrieving" | "generating") {
  if (status === "queued") return "Waiting";
  if (status === "scraping") return stage === "generating" ? "Generating" : "Retrieving";
  if (status === "failed") return "Needs attention";
  if (status === "parsed") return "Ready to review";
  return "Saved";
}

function importDetail(status: ImportStatus, stage?: "retrieving" | "generating") {
  if (status === "queued") return "Waiting to retrieve the recipe page";
  if (status === "scraping") {
    return stage === "generating"
      ? "Creating a reviewable recipe draft"
      : "Retrieving recipe content from the source";
  }
  if (status === "failed") return "This import needs attention";
  if (status === "parsed") return "Review the generated draft before saving";
  return "Added to your Recipe Book";
}

function sourceLabel(sourceUrl: string) {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "Recipe link";
  }
}

export function EmailIntake() {
  const inbox = useQuery(api.email.currentInbox);
  const imports = useQuery(api.email.recentImports);
  const queueUrl = useMutation(api.email.queueUrl);
  const retryImport = useMutation(api.imports.retry);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isQueueing, setIsQueueing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  async function copyAddress() {
    if (!inbox?.email) return;
    try {
      await navigator.clipboard.writeText(inbox.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setError("Your browser could not copy the shared inbox address.");
    }
  }

  async function submitUrl(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsQueueing(true);
    try {
      await queueUrl({ sourceUrl: url.trim() });
      setUrl("");
      setMessage("Recipe link queued. Progress will update below.");
    } catch {
      setError("We couldn’t queue that link. Check the URL and try again.");
    } finally {
      setIsQueueing(false);
    }
  }

  async function retry(importId: Parameters<typeof retryImport>[0]["importId"]) {
    setError("");
    setRetryingId(importId);
    try {
      await retryImport({ importId });
    } catch {
      setError("That import could not be retried. Refresh and try again.");
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
      <div className="stack">
        <Card className="import-hero">
          <CardContent className="p-6 sm:p-8">
            <span className="mb-5 grid size-12 place-items-center rounded-xl bg-accent-soft text-accent"><Link2 size={24} /></span>
            <p className="eyebrow">Import a recipe</p>
            <h2 className="font-display text-3xl font-semibold">Paste a recipe link to create a draft.</h2>
            <p className="mt-3 max-w-xl leading-7 text-muted-foreground">PerfectPlate retrieves the page and generates a structured draft for you to review before anything is saved.</p>
            <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={submitUrl}>
              <label className="flex-1"><span className="sr-only">Recipe URL</span><Input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/favorite-recipe" /></label>
              <Button type="submit" disabled={isQueueing}><Send size={17} />{isQueueing ? "Queueing…" : "Import recipe"}</Button>
            </form>
            {message && <p className="mt-3 rounded-lg bg-primary-soft p-3 text-sm font-semibold text-primary" role="status">{message}</p>}
            {error && <Alert className="mt-3 border-red-200 bg-red-50" role="alert"><AlertTitle>Import unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="cluster"><Mail className="text-primary" size={20} /><h2 className="section-heading">Forward to the shared inbox</h2></div>
            <p className="section-copy">Optional: forward an email containing recipe links from your verified account address. This is one inbox shared by the whole site.</p>
            {inbox === undefined ? (
              <Skeleton className="mt-4 h-16" />
            ) : inbox === null || !inbox.isConfigured ? (
              <p className="mt-4 rounded-xl border border-border bg-surface-subtle p-4 text-sm font-bold">Email forwarding is not configured for this deployment.</p>
            ) : !inbox.isEligible ? (
              <p className="mt-4 rounded-xl border border-border bg-surface-subtle p-4 text-sm font-bold">Verify {inbox.accountEmail ?? "your account email"} before using email forwarding.</p>
            ) : (
              <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-white p-3 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap px-2 text-sm font-bold">{inbox.email}</code>
                <Button variant="secondary" onClick={copyAddress}>{copied ? <Check size={17} /> : <Clipboard size={17} />}{copied ? "Copied" : "Copy address"}</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="recent-imports-title">
        <div className="section-row"><div><h2 id="recent-imports-title" className="section-heading">Recent imports</h2><p className="section-copy">Updates arrive here while your recipes are processed.</p></div></div>
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {imports === undefined ? (
              <div className="grid gap-3 p-5">{[0, 1, 2].map((item) => <Skeleton className="h-20" key={item} />)}</div>
            ) : imports.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Your first pasted or forwarded recipe will appear here.</div>
            ) : imports.map((item) => (
              <article className="p-4 sm:p-5" key={item._id}>
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="font-extrabold">{item.sourceSubject ?? sourceLabel(item.sourceUrl)}</h3><p className="mt-1 text-xs text-muted-foreground">{sourceLabel(item.sourceUrl)}</p></div>
                  <StatusBadge status={displayStatus(item.status, item.processingStage)} />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{item.errorMessage ?? importDetail(item.status, item.processingStage)}</p>
                {item.status === "parsed" && <Button asChild size="sm" className="mt-3"><Link href={`/app/imports/${item._id}/review`}>Review draft</Link></Button>}
                {item.status === "completed" && item.recipeId && <Button asChild size="sm" variant="secondary" className="mt-3"><Link href={`/app/recipe-book/${item.recipeId}`}>View recipe</Link></Button>}
                {item.status === "failed" && item.errorRetryable && <Button size="sm" variant="secondary" className="mt-3" disabled={retryingId === item._id} onClick={() => retry(item._id)}><RefreshCw size={15} />{retryingId === item._id ? "Retrying…" : "Retry"}</Button>}
              </article>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
