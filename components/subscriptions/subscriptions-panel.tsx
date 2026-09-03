"use client";

import { useState } from "react";
import { MailCheck, Pause, Plus, Rss } from "lucide-react";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { subscriptions as initialSubscriptions } from "@/lib/data/mock-data";
import type { Subscription } from "@/lib/data/types";

export function SubscriptionsPanel() {
  const [items, setItems] = useState(initialSubscriptions);
  const [url, setUrl] = useState("");

  function addSubscription(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    const domain = url.replace(/^https?:\/\//, "").split("/")[0];
    const item: Subscription = { id: crypto.randomUUID(), name: domain.split(".")[0].replace(/(^|-)\w/g, (m) => m.toUpperCase()), domain, status: "pending", lastReceived: "Waiting for confirmation", recipeCount: 0 };
    setItems((current) => [item, ...current]); setUrl("");
  }

  return (
    <div className="stack gap-6">
      <Card className="bg-primary text-white">
        <CardContent className="grid gap-5 p-6 lg:grid-cols-[1fr_auto] lg:items-end lg:p-8">
          <div><Rss size={25} /><h2 className="mt-4 font-display text-3xl font-semibold">Let favorite food blogs come to you.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">Sign your recipe agent up for newsletters. New recipe emails can be parsed and placed in your review queue.</p></div>
          <span className="rounded-full bg-white/12 px-4 py-2 text-sm font-bold">{items.filter((item) => item.status === "active").length} active</span>
        </CardContent>
      </Card>
      <Card><CardContent><h2 className="section-heading">Add a food blog</h2><p className="section-copy">Enter the blog or newsletter page now; real enrollment comes with the backend.</p><form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={addSubscription}><label className="flex-1"><span className="sr-only">Food blog URL</span><Input required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://favoritefoodblog.com/newsletter" /></label><Button type="submit"><Plus size={17} />Add subscription</Button></form></CardContent></Card>
      <section className="grid-auto" aria-label="Food blog subscriptions">
        {items.map((item) => <Card key={item.id}><CardContent>
          <div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-lg bg-aqua-soft text-primary"><MailCheck size={20} /></span><StatusBadge status={item.status} /></div>
          <h2 className="mt-4 text-lg font-extrabold">{item.name}</h2><p className="text-sm text-muted-foreground">{item.domain}</p>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-y border-border py-4 text-sm"><div><dt className="text-xs text-muted-foreground">Last received</dt><dd className="mt-1 font-bold">{item.lastReceived}</dd></div><div><dt className="text-xs text-muted-foreground">Recipes saved</dt><dd className="mt-1 font-bold">{item.recipeCount}</dd></div></dl>
          <Button className="mt-4" variant="ghost" size="sm"><Pause size={16} />Manage</Button>
        </CardContent></Card>)}
      </section>
    </div>
  );
}
