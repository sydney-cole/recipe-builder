import Link from "next/link";
import { ArrowRight, BookOpen, Inbox, ListChecks, Search, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { recipes } from "@/lib/data/mock-data";

const quickActions = [{ href: "/app/discover", icon: Search, label: "Find a recipe", detail: "Search by ingredients or mood" }, { href: "/app/imports", icon: Inbox, label: "Import by email", detail: "Forward a recipe link" }, { href: "/app/grocery-lists/weeknight", icon: ListChecks, label: "Open grocery list", detail: "6 items left to pick up" }];

export default function DashboardPage() { return <div className="page-container"><PageHeader eyebrow="Good afternoon" title="What are we cooking?" description="Your kitchen command center, filled with frontend-only sample data for now." actions={<Button asChild><Link href="/app/discover"><Sparkles size={17} />Discover dinner</Link></Button>} />
  <section className="grid gap-4 md:grid-cols-3" aria-label="Quick actions">{quickActions.map(({ href, icon: Icon, label, detail }) => <Link className="quick-action" href={href} key={href}><span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary"><Icon size={20} /></span><span><strong>{label}</strong><small>{detail}</small></span><ArrowRight className="ml-auto text-muted-foreground" size={18} /></Link>)}</section>
  <section className="mt-10"><div className="section-row"><div><h2 className="section-heading">Recently saved</h2><p className="section-copy">Pick up a recipe you were excited about.</p></div><Button asChild variant="ghost"><Link href="/app/recipe-book">View Recipe Book<ArrowRight size={16} /></Link></Button></div><div className="grid-auto">{recipes.slice(0, 3).map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} />)}</div></section>
  <section className="mt-10 grid gap-4 lg:grid-cols-2"><Card><CardContent className="flex items-center gap-4 p-6"><span className="grid size-12 place-items-center rounded-xl bg-accent-soft text-accent"><Inbox /></span><div><p className="font-extrabold">1 import needs your attention</p><p className="text-sm text-muted-foreground">Choose the recipe link from “Weekend brunch ideas.”</p></div><Button asChild variant="secondary" size="sm" className="ml-auto"><Link href="/app/imports">Review</Link></Button></CardContent></Card><Card><CardContent className="flex items-center gap-4 p-6"><span className="grid size-12 place-items-center rounded-xl bg-aqua-soft text-primary"><BookOpen /></span><div><p className="font-extrabold">19 recipes in your book</p><p className="text-sm text-muted-foreground">Four were added this week.</p></div></CardContent></Card></section>
  </div>; }
