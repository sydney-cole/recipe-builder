"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Check, Clipboard, Inbox, Link2, Mail, Send } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";

type DisplayStatus = "received" | "scraping" | "ready" | "attention";

function displayStatus(status: "queued" | "scraping" | "scraped" | "parsed" | "completed" | "failed"): DisplayStatus {
  if (status === "queued") return "received";
  if (status === "scraping") return "scraping";
  if (status === "failed") return "attention";
  return "ready";
}

function importDetail(status: "queued" | "scraping" | "scraped" | "parsed" | "completed" | "failed") {
  if (status === "queued") return "Waiting for recipe extraction";
  if (status === "scraping") return "Extracting ingredients and instructions";
  if (status === "failed") return "Import needs attention";
  if (status === "scraped") return "Source captured and ready for recipe processing";
  if (status === "parsed") return "Ready to review";
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
  const provisionInbox = useAction(api.email.provisionInbox);
  const queueUrl = useMutation(api.email.queueUrl);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);

  async function copyAddress() {
    if (!inbox) return;
    try {
      await navigator.clipboard.writeText(inbox.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Your browser could not copy the inbox address.");
    }
  }

  async function connectInbox() {
    setError("");
    setIsProvisioning(true);
    try {
      await provisionInbox();
      setMessage("Your existing recipe inbox is connected.");
    } catch (caughtError) {
      const details = caughtError instanceof Error ? caughtError.message : "";
      setError(
        details.includes("AGENTMAIL_API_KEY") || details.includes("AGENTMAIL_INBOX_ID")
          ? "AgentMail is not configured on this Convex deployment yet."
          : "We couldn’t connect your recipe inbox. Please try again.",
      );
    } finally {
      setIsProvisioning(false);
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
      setMessage("Recipe link queued for extraction.");
    } catch {
      setError("We couldn’t queue that link. Check the URL and try again.");
    } finally {
      setIsQueueing(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
      <div className="stack">
        <Card className="import-hero">
          <CardContent className="p-6 sm:p-8">
            <span className="mb-5 grid size-12 place-items-center rounded-xl bg-accent-soft text-accent"><Mail size={24} /></span>
            <p className="eyebrow">Your recipe inbox</p>
            <h2 className="font-display text-3xl font-semibold">Forward a recipe. We’ll organize the useful parts.</h2>
            <p className="mt-3 max-w-xl leading-7 text-muted-foreground">Send or forward an email containing recipe links. AgentMail securely delivers it to PerfectPlate and queues each link for extraction.</p>

            {inbox === undefined ? (
              <Skeleton className="mt-6 h-16" />
            ) : inbox === null ? (
              <div className="mt-6 rounded-xl border border-border bg-white p-4">
                <p className="text-sm font-bold">Connect the existing PerfectPlate recipe inbox to your account.</p>
                <Button className="mt-3" onClick={connectInbox} disabled={isProvisioning}>
                  <Inbox size={17} />{isProvisioning ? "Connecting inbox…" : "Connect recipe inbox"}
                </Button>
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-2 rounded-xl border border-border bg-white p-3 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap px-2 text-sm font-bold">{inbox.email}</code>
                <Button variant="secondary" onClick={copyAddress}>
                  {copied ? <Check size={17} /> : <Clipboard size={17} />}{copied ? "Copied" : "Copy address"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="cluster"><Link2 className="text-primary" size={20} /><h2 className="section-heading">Or paste a recipe link</h2></div>
            <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={submitUrl}>
              <label className="flex-1"><span className="sr-only">Recipe URL</span><Input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/favorite-recipe" /></label>
              <Button type="submit" disabled={isQueueing}><Send size={17} />{isQueueing ? "Queueing…" : "Import recipe"}</Button>
            </form>
            {message && <p className="mt-3 rounded-lg bg-primary-soft p-3 text-sm font-semibold text-primary" role="status">{message}</p>}
            {error && <Alert className="mt-3 border-red-200 bg-red-50" role="alert"><AlertTitle>Import unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="recent-imports-title">
        <div className="section-row"><div><h2 id="recent-imports-title" className="section-heading">Recent imports</h2><p className="section-copy">Updates arrive here as your recipes are processed.</p></div></div>
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {imports === undefined ? (
              <div className="grid gap-3 p-5">{[0, 1, 2].map((item) => <Skeleton className="h-20" key={item} />)}</div>
            ) : imports.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Your first emailed or pasted recipe will appear here.</div>
            ) : imports.map((item) => (
              <article className="p-4 sm:p-5" key={item._id}>
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="font-extrabold">{item.sourceSubject ?? sourceLabel(item.sourceUrl)}</h3><p className="mt-1 text-xs text-muted-foreground">{sourceLabel(item.sourceUrl)}</p></div>
                  <StatusBadge status={displayStatus(item.status)} />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{item.errorMessage ?? importDetail(item.status)}</p>
              </article>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
