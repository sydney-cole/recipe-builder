"use client";

import { useMemo, useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { groceryItems as initialItems } from "@/lib/data/mock-data";
import type { GroceryItem } from "@/lib/data/types";

export function GroceryListEditor() {
  const [items, setItems] = useState(initialItems);
  const [name, setName] = useState("");
  const [removed, setRemoved] = useState<GroceryItem | null>(null);
  const groups = useMemo(() => Object.entries(items.reduce<Record<string, GroceryItem[]>>((grouped, item) => {
    (grouped[item.category] ??= []).push(item);
    return grouped;
  }, {})), [items]);

  function updateItem(id: string, patch: Partial<GroceryItem>) { setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item)); }
  function removeItem(item: GroceryItem) { setItems((current) => current.filter((candidate) => candidate.id !== item.id)); setRemoved(item); }
  function addItem(event: React.FormEvent) { event.preventDefault(); if (!name.trim()) return; setItems((current) => [...current, { id: crypto.randomUUID(), name: name.trim(), quantity: "1", unit: "", category: "Other", checked: false }]); setName(""); }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="stack">
        <Card><CardContent><form className="flex flex-col gap-3 sm:flex-row" onSubmit={addItem}><label className="flex-1"><span className="sr-only">Ingredient name</span><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Add an ingredient" /></label><Button type="submit"><Plus size={17} />Add item</Button></form></CardContent></Card>
        {groups.map(([category, categoryItems]) => categoryItems && <section key={category} aria-labelledby={`group-${category}`}><h2 id={`group-${category}`} className="mb-2 text-sm font-extrabold uppercase tracking-[.08em] text-muted-foreground">{category}</h2><Card><CardContent className="divide-y divide-border p-0">{categoryItems.map((item) => <div className="grocery-row" key={item.id}>
          <Checkbox checked={item.checked} onCheckedChange={(checked) => updateItem(item.id, { checked: checked === true })} aria-label={`Mark ${item.name} complete`} />
          <Input className={`ingredient-name ${item.checked ? "line-through opacity-55" : ""}`} value={item.name} onChange={(event) => updateItem(item.id, { name: event.target.value })} aria-label="Ingredient" />
          <Input className="quantity-input" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: event.target.value })} aria-label={`Quantity for ${item.name}`} />
          <Input className="unit-input" value={item.unit} onChange={(event) => updateItem(item.id, { unit: event.target.value })} aria-label={`Unit for ${item.name}`} placeholder="unit" />
          <Button variant="ghost" size="icon" aria-label={`Remove ${item.name}`} onClick={() => removeItem(item)}><Trash2 size={17} /></Button>
          {item.source && <p className="item-source">From {item.source}</p>}
        </div>)}</CardContent></Card></section>)}
      </div>
      <aside className="stack self-start xl:sticky xl:top-20">
        <Card><CardContent><p className="eyebrow">List summary</p><p className="font-display text-4xl font-semibold">{items.filter((item) => !item.checked).length}</p><p className="text-sm text-muted-foreground">items left to pick up</p><div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full bg-primary" style={{ width: `${items.length ? (items.filter((item) => item.checked).length / items.length) * 100 : 0}%` }} /></div></CardContent></Card>
        {removed && <div className="rounded-xl border border-border bg-white p-4 text-sm shadow-sm" role="status"><p><strong>{removed.name}</strong> removed.</p><Button variant="ghost" size="sm" className="mt-2" onClick={() => { setItems((current) => [...current, removed]); setRemoved(null); }}><RotateCcw size={15} />Undo</Button></div>}
      </aside>
    </div>
  );
}
