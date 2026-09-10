"use client";

import { useMutation, useQuery } from "convex/react";
import { ArrowRight, CheckCircle2, Plus, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";

export default function GroceryListsPage() {
  const router = useRouter();
  const lists = useQuery(api.grocery.list);
  const createList = useMutation(api.grocery.create);
  const renameList = useMutation(api.grocery.rename);
  const setStatus = useMutation(api.grocery.setStatus);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Enter a list name.");
    try {
      const listId = await createList({ name });
      router.push(`/app/grocery-lists/${listId}`);
    } catch {
      setError("The list could not be created. Try again.");
    }
  }

  return <div className="page-container">
    <PageHeader eyebrow="Plan and shop" title="Grocery lists" description="Persistent lists for recipe ingredients and one-off items." actions={<Button onClick={() => setCreating(true)}><Plus size={17} />New list</Button>} />
    {creating && <Card className="mb-6"><CardContent><form className="flex flex-col gap-3 sm:flex-row" onSubmit={create}><label className="flex-1"><span className="sr-only">List name</span><Input autoFocus value={name} onChange={(event) => { setName(event.target.value); setError(""); }} placeholder="List name" /></label><Button type="submit">Create list</Button><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button></form>{error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}</CardContent></Card>}
    {lists === undefined ? <div className="grid-auto" aria-label="Loading grocery lists">{[0, 1].map((key) => <Skeleton key={key} className="h-56" />)}</div> : lists.length === 0 ? <EmptyState icon={ShoppingBasket} title="No grocery lists yet" description="Create your first list, then add ingredients from a saved recipe." action={<Button onClick={() => setCreating(true)}>Create your first list</Button>} /> : <div className="grid-auto">{lists.map((list) => <Card key={list._id}><CardContent className="p-6"><div className="flex items-start justify-between gap-3"><span className="grid size-12 place-items-center rounded-xl bg-primary-soft text-primary"><ShoppingBasket /></span>{list.status === "completed" && <span className="text-sm font-bold text-green-700"><CheckCircle2 className="inline" size={16} /> Complete</span>}</div><label className="mt-4 block text-xs font-bold text-muted-foreground">List name<Input className="mt-1 font-extrabold" defaultValue={list.name} onBlur={(event) => { if (event.target.value.trim() && event.target.value.trim() !== list.name) void renameList({ listId: list._id, name: event.target.value }); }} /></label><p className="mt-2 text-sm text-muted-foreground">{list.itemCount} items · {list.checkedCount} checked</p><div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4"><Button asChild size="sm"><Link href={`/app/grocery-lists/${list._id}`}>Open <ArrowRight size={16} /></Link></Button><Button size="sm" variant="secondary" onClick={() => setStatus({ listId: list._id, status: list.status === "completed" ? "active" : "completed" })}>{list.status === "completed" ? "Reopen" : "Complete"}</Button><Button size="sm" variant="ghost" onClick={() => setStatus({ listId: list._id, status: "archived" })}>Archive</Button></div></CardContent></Card>)}</div>}
  </div>;
}
