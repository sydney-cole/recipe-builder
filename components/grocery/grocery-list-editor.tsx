"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type FailedEdit = {
  itemId: Id<"groceryListItems">;
  name: string;
  quantity?: number;
  quantityText?: string;
  unit?: string;
  notes?: string;
};

export function GroceryListEditor({ listId }: { listId: Id<"groceryLists"> }) {
  const data = useQuery(api.grocery.detail, { listId });
  const addItem = useMutation(api.grocery.addItem);
  const updateItem = useMutation(api.grocery.updateItem);
  const checkItem = useMutation(api.grocery.checkItem);
  const removeItem = useMutation(api.grocery.removeItem);
  const undoRemove = useMutation(api.grocery.undoRemove);
  const cleanupExpired = useMutation(api.grocery.cleanupExpired);
  const [name, setName] = useState("");
  const [removed, setRemoved] = useState<{ id: Id<"groceryListItems">; name: string } | null>(null);
  const [message, setMessage] = useState("");
  const [failedEdit, setFailedEdit] = useState<FailedEdit | null>(null);

  useEffect(() => { void cleanupExpired({ listId }); }, [cleanupExpired, listId]);
  if (data === undefined) return <div className="page-container" aria-label="Loading grocery list"><Skeleton className="h-24" /><Skeleton className="mt-5 h-96" /></div>;
  if (data === null) return <div className="page-container"><Alert role="alert"><AlertTitle>Grocery list not found</AlertTitle><AlertDescription>This list is unavailable or belongs to another account. <Link className="underline" href="/app/grocery-lists">Back to your lists</Link></AlertDescription></Alert></div>;
  const remaining = data.items.filter((item) => !item.isChecked).length;

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try { await addItem({ listId, name }); setName(""); setMessage(`${name.trim()} added.`); }
    catch { setMessage("Item was not added. Try again."); }
  }

  type GroceryItem = NonNullable<typeof data>["items"][number];
  async function persist(item: GroceryItem, patch: Partial<GroceryItem>) {
    const next: FailedEdit = {
      itemId: item._id,
      name: "name" in patch ? patch.name ?? "" : item.name,
      quantity: "quantity" in patch ? patch.quantity : item.quantity,
      quantityText: "quantityText" in patch ? patch.quantityText : item.quantityText,
      unit: "unit" in patch ? patch.unit : item.unit,
      notes: "notes" in patch ? patch.notes : item.notes,
    };
    try { await updateItem(next); setFailedEdit(null); setMessage(`${next.name} saved.`); }
    catch { setFailedEdit(next); setMessage(`${next.name} has unsaved changes.`); }
  }

  return <div className="page-container overflow-x-hidden">
    <Button asChild variant="ghost" className="mb-5"><Link href="/app/grocery-lists"><ArrowLeft size={17} />All grocery lists</Link></Button>
    <PageHeader eyebrow="Grocery list" title={data.groceryList.name} description="Edits, checkoffs, removals, and recipe sources persist automatically." />
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]"><div className="stack"><Card><CardContent><form className="flex flex-col gap-3 sm:flex-row" onSubmit={add}><label className="flex-1"><span className="sr-only">Ingredient name</span><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Add an ingredient" /></label><Button type="submit"><Plus size={17} />Add item</Button></form></CardContent></Card>
      {data.items.length === 0 ? <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">This list is empty. Add an item or choose ingredients from a recipe.</p> : <Card><CardContent className="divide-y divide-border p-0">{data.items.map((item) => <div className="grocery-row" key={item._id}>
        <Checkbox checked={item.isChecked} onCheckedChange={(checked) => void checkItem({ itemId: item._id, isChecked: checked === true })} aria-label={`Mark ${item.name} complete`} />
        <Input className={`ingredient-name ${item.isChecked ? "line-through opacity-55" : ""}`} defaultValue={item.name} onBlur={(event) => { if (event.target.value !== item.name) void persist(item, { name: event.target.value }); }} aria-label={`Name for ${item.name}`} />
        <Input className="quantity-input" defaultValue={item.quantity ?? item.quantityText ?? ""} onBlur={(event) => { const value = event.target.value.trim(); const numeric = Number(value); void persist(item, Number.isFinite(numeric) && value !== "" ? { quantity: numeric, quantityText: undefined } : { quantity: undefined, quantityText: value || undefined }); }} aria-label={`Quantity for ${item.name}`} />
        <Input className="unit-input" defaultValue={item.unit ?? ""} onBlur={(event) => void persist(item, { unit: event.target.value || undefined })} aria-label={`Unit for ${item.name}`} placeholder="unit" />
        <Button variant="ghost" size="icon" aria-label={`Remove ${item.name}`} onClick={async () => { await removeItem({ itemId: item._id }); setRemoved({ id: item._id, name: item.name }); setMessage(`${item.name} removed.`); }}><Trash2 size={17} /></Button>
        {item.sources.length > 0 && <p className="item-source">From {item.sources.map((source, index) => <span key={source._id}>{index > 0 && ", "}{source.recipeHref ? <Link className="underline" href={source.recipeHref}>{source.recipeTitle}</Link> : source.recipeTitle}{source.quantityAdded !== undefined ? ` (${source.quantityAdded} ${item.unit ?? ""})` : ""}</span>)}</p>}
      </div>)}</CardContent></Card>}
    </div><aside className="stack self-start xl:sticky xl:top-20"><Card><CardContent><p className="eyebrow">List summary</p><p className="font-display text-4xl font-semibold">{remaining}</p><p className="text-sm text-muted-foreground">items left to pick up</p></CardContent></Card>{removed && <div className="rounded-xl border border-border bg-white p-4 text-sm shadow-sm"><p><strong>{removed.name}</strong> removed.</p><Button variant="ghost" className="mt-2" onClick={async () => { await undoRemove({ itemId: removed.id }); setMessage(`${removed.name} restored.`); setRemoved(null); }}><RotateCcw size={15} />Undo</Button></div>}{failedEdit && <Alert role="alert"><AlertTitle>Unsaved edit</AlertTitle><AlertDescription>Your text is retained. <Button size="sm" variant="secondary" className="mt-2" onClick={() => updateItem(failedEdit).then(() => setFailedEdit(null))}>Retry save</Button></AlertDescription></Alert>}</aside></div>
    <p className="sr-only" aria-live="polite">{message}</p>
  </div>;
}
