"use client";

import { useAction, useQuery } from "convex/react";
import { Check, Clipboard, Inbox, Mail } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";

export function EmailIntake() {
  const inbox = useQuery(api.email.currentInbox);
  const provisionInbox = useAction(api.email.provisionInbox);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isProvisioning, setIsProvisioning] = useState(false);

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

  return (
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
        {message && <p className="mt-4 rounded-lg bg-primary-soft p-3 text-sm font-semibold text-primary" role="status">{message}</p>}
        {error && <Alert className="mt-4 border-red-200 bg-red-50" role="alert"><AlertTitle>Inbox unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      </CardContent>
    </Card>
  );
}
