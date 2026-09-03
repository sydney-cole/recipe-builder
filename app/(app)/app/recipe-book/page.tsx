import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recipes } from "@/lib/data/mock-data";
export default function RecipeBookPage() { return <div className="page-container"><PageHeader eyebrow="Your collection" title="Recipe Book" description="Every recipe you save or approve after import lives here." actions={<Button asChild><Link href="/app/imports">Import recipe</Link></Button>} /><div className="mb-6 flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><span className="sr-only">Search Recipe Book</span><Search className="absolute left-3 top-3.5 text-muted-foreground" size={17} /><Input className="pl-10" placeholder="Search your Recipe Book" /></label><Button variant="secondary"><SlidersHorizontal size={17} />Filter</Button></div><div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold">19 saved recipes</p><label className="text-sm text-muted-foreground">Sort: <select className="rounded-md border border-border bg-white p-2 font-bold text-foreground"><option>Recently added</option><option>Quickest</option><option>A–Z</option></select></label></div><div className="grid-auto">{recipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} />)}</div></div>; }
