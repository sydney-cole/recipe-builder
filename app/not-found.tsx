import Link from "next/link";
import { ChefHat } from "lucide-react";
import { Button } from "@/components/ui/button";
export default function NotFound() { return <main id="main-content" className="grid min-h-screen place-items-center p-6 text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary"><ChefHat /></span><p className="eyebrow mt-6">404</p><h1 className="font-display text-4xl font-semibold">That recipe wandered off.</h1><p className="mt-3 text-muted-foreground">Let’s get you back to the kitchen.</p><Button asChild className="mt-6"><Link href="/app">Go home</Link></Button></div></main>; }
