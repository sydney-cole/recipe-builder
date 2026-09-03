"use client";

import { useState } from "react";
import { Check, Clipboard, Link2, Mail, Send } from "lucide-react";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { imports } from "@/lib/data/mock-data";

const demoInbox = "recipes@inbox.perfectplate.local";

export function EmailIntake() {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");

  async function copyAddress() {
    try { await navigator.clipboard.writeText(demoInbox); } catch { /* Preview still confirms the interaction. */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
      <div className="stack">
        <Card className="import-hero">
          <CardContent className="p-6 sm:p-8">
            <span className="mb-5 grid size-12 place-items-center rounded-xl bg-accent-soft text-accent"><Mail size={24} /></span>
            <p className="eyebrow">Your recipe inbox</p>
            <h2 className="font-display text-3xl font-semibold">Forward a recipe. We’ll organize the useful parts.</h2>
            <p className="mt-3 max-w-xl leading-7 text-muted-foreground">Send any email containing a recipe link. PerfectPlate will eventually use AgentMail to receive it and Firecrawl to extract ingredients and instructions.</p>
            <div className="mt-6 flex flex-col gap-2 rounded-xl border border-border bg-white p-3 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap px-2 text-sm font-bold">{demoInbox}</code>
              <Button variant="secondary" onClick={copyAddress}>{copied ? <Check size={17} /> : <Clipboard size={17} />}{copied ? "Copied" : "Copy address"}</Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Demo address only — connect the real assigned AgentMail inbox during backend work.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="cluster"><Link2 className="text-primary" size={20} /><h2 className="section-heading">Or paste a recipe link</h2></div>
            <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (url.trim()) { setMessage("Link queued in this local preview."); setUrl(""); } }}>
              <label className="flex-1"><span className="sr-only">Recipe URL</span><Input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/favorite-recipe" /></label>
              <Button type="submit"><Send size={17} />Import recipe</Button>
            </form>
            {message && <p className="mt-3 rounded-lg bg-primary-soft p-3 text-sm font-semibold text-primary" role="status">{message}</p>}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="recent-imports-title">
        <div className="section-row"><div><h2 id="recent-imports-title" className="section-heading">Recent imports</h2><p className="section-copy">Frontend examples for every processing state.</p></div></div>
        <Card><CardContent className="divide-y divide-border p-0">
          {imports.map((item) => <article className="p-4 sm:p-5" key={item.id}>
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-extrabold">{item.subject}</h3><p className="mt-1 text-xs text-muted-foreground">{item.source}</p></div><StatusBadge status={item.status} /></div>
            <p className="mt-3 text-sm text-muted-foreground">{item.detail}</p>
          </article>)}
        </CardContent></Card>
      </section>
    </div>
  );
}
