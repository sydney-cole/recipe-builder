"use client";

import { useQuery } from "convex/react";
import { BookOpen, Check, Clipboard, Inbox, LoaderCircle, Mail, MailCheck } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { RecipePreviewModal } from "@/components/recipes/recipe-preview-modal";

export function EmailIntake() {
  const inbox = useQuery(api.email.currentInbox);
  const recentEmails = useQuery(api.email.recentInboundEmails);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [previewRecipeId, setPreviewRecipeId] = useState<Id<"recipes"> | null>(null);

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

  const statusLabels = {
    received: "Received",
    processing: "Importing recipes",
    imported: "Recipes imported",
    needs_review: "Needs review",
    failed: "Recipe failed to download",
    no_links: "No recipe links found",
    already_imported: "Recipes already imported",
  } as const;
  const activeEmail = recentEmails?.find((email) => email.status === "processing");

  return (
    <div className="grid gap-6">
      <Card className="import-hero">
        <CardContent className="p-6 sm:p-8">
          <span className="mb-5 grid size-12 place-items-center rounded-xl bg-primary-soft text-primary"><Mail size={24} /></span>
          <p className="eyebrow">Your recipe inbox</p>
          <h2 className="font-display text-3xl font-semibold">Forward a recipe. We’ll organize the useful parts.</h2>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">Forward an email containing a recipe link to the address below. Use the email address associated with your PerfectPlate account so the import appears in your history.</p>

          {inbox === undefined ? (
            <div className="mt-6" role="status" aria-live="polite"><span className="sr-only">Loading recipe inbox address…</span><Skeleton className="h-16" /></div>
          ) : inbox === null ? (
            <Alert className="mt-6 border-red-200 bg-red-50" role="alert">
              <AlertTitle>Inbox unavailable</AlertTitle>
              <AlertDescription>The shared PerfectPlate inbox is not configured on this deployment.</AlertDescription>
            </Alert>
          ) : (
            <div className="mt-6 flex flex-col gap-2 rounded-xl border border-border bg-white p-3 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap px-2 text-sm font-bold">{inbox.email}</code>
              <Button variant="secondary" onClick={copyAddress}>
                {copied ? <Check size={17} /> : <Clipboard size={17} />}{copied ? "Copied" : "Copy address"}
              </Button>
            </div>
          )}
          {error && <p className="mt-4 text-sm font-bold text-red-700" role="alert">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><Inbox size={20} /></span>
            <div>
              <h2 className="section-heading">Forwarded emails</h2>
              <p className="section-copy">Your most recent recipe emails and their import status.</p>
            </div>
          </div>

          {activeEmail && (
            <div className="mt-6 flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary-soft p-4 sm:flex-row sm:items-center" role="status">
              <MailCheck className="shrink-0 text-primary" size={22} />
              <div className="min-w-0 flex-1">
                <p className="font-extrabold">Email received</p>
                <p className="mt-1 truncate text-sm text-muted-foreground">{activeEmail.subject ?? "Recipe email"}</p>
              </div>
              <span className="flex shrink-0 items-center gap-2 text-sm font-bold text-primary">
                <LoaderCircle className="animate-spin" size={18} /> Creating recipe card…
              </span>
            </div>
          )}

          {recentEmails === undefined ? (
            <div className="mt-6 grid gap-3" role="status" aria-live="polite"><span className="sr-only">Loading forwarded emails…</span><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
          ) : recentEmails.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-border p-8 text-center">
              <Inbox className="mx-auto text-muted-foreground" size={28} />
              <p className="mt-3 font-bold">No forwarded emails yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Forward a recipe email to your address above and it will appear here.</p>
            </div>
          ) : (
            <ul className="mt-6 divide-y divide-border rounded-xl border border-border bg-white">
              {recentEmails.map((email) => (
                <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" key={email._id}>
                  <div className="min-w-0">
                    <p className="truncate font-bold">{email.subject ?? "Recipe email"}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {email.sender ?? "Unknown sender"} · <time dateTime={new Date(email.receivedAt).toISOString()}>{new Date(email.receivedAt).toLocaleString()}</time>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {email.status !== "already_imported" && (
                      <span className="rounded-full bg-surface-subtle px-3 py-1 text-xs font-bold text-foreground">{statusLabels[email.status]}</span>
                    )}
                    <span className="text-xs text-muted-foreground">{email.linkCount} {email.linkCount === 1 ? "link" : "links"}</span>
                    {email.recipeId && (
                      <Button size="sm" variant="secondary" onClick={() => setPreviewRecipeId(email.recipeId!)}>
                        <BookOpen size={16} /> View recipe
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {previewRecipeId && <RecipePreviewModal recipeId={previewRecipeId} onClose={() => setPreviewRecipeId(null)} />}
    </div>
  );
}
