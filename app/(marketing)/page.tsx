import Link from "next/link";
import { ArrowRight, BookOpen, Mail, Search, ShoppingBasket, Sparkles } from "lucide-react";
import { Brand } from "@/components/brand";
import { FoodArt } from "@/components/recipes/food-art";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  { icon: Mail, title: "Forward the link", body: "Email a recipe page and let PerfectPlate prepare the ingredients and steps for review." },
  { icon: Search, title: "Search by real life", body: "Start with what is in the fridge, a craving, or the kind of meal you want to make." },
  { icon: ShoppingBasket, title: "Shop without the scramble", body: "Move missing ingredients into one list, then adjust quantities as your plans change." },
];

export default function LandingPage() {
  return <main id="main-content">
    <header className="marketing-nav"><Brand /><nav className="hidden items-center gap-7 text-sm font-bold md:flex" aria-label="Landing page"><a href="#how-it-works">How it works</a><a href="#features">Features</a></nav><div className="cluster ml-auto"><Button asChild variant="ghost" className="hidden sm:inline-flex"><Link href="/sign-in">Sign in</Link></Button><Button asChild><Link href="/sign-up">Get started<ArrowRight size={17} /></Link></Button></div></header>
    <section className="hero-section">
      <div><p className="eyebrow">A calmer way to decide what’s for dinner</p><h1 className="font-display text-5xl font-semibold leading-[1.03] tracking-[-.045em] sm:text-6xl lg:text-7xl">Recipes in.<br />Dinner figured out.</h1><p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">Collect recipes from email and the web, discover ideas that fit today, and turn your choices into an editable grocery list.</p><div className="mt-8 cluster"><Button asChild size="lg"><Link href="/sign-up">Start your Recipe Book<ArrowRight size={18} /></Link></Button><Button asChild size="lg" variant="secondary"><Link href="/app">Explore the demo</Link></Button></div><p className="mt-4 text-xs text-muted-foreground">Frontend preview. No account or backend required.</p></div>
      <div className="hero-board" aria-label="PerfectPlate recipe preview"><div className="hero-note"><Sparkles size={17} />Matched to spinach, lemon, and cozy</div><Card className="hero-recipe"><FoodArt variant="garden" label="30-minute dinner" /><CardContent><p className="eyebrow">Tonight’s best match</p><h2 className="font-display text-2xl font-semibold">Lemon herb orzo with spring greens</h2><div className="mt-5 flex items-center justify-between"><span className="text-sm text-muted-foreground">30 min · serves 4</span><span className="grid size-10 place-items-center rounded-full bg-primary text-white"><BookOpen size={18} /></span></div></CardContent></Card></div>
    </section>
    <section id="how-it-works" className="mx-auto max-w-[1200px] px-4 py-20 sm:px-8"><div className="mb-10 max-w-2xl"><p className="eyebrow">From inspiration to checkout</p><h2 className="font-display text-4xl font-semibold">One connected cooking rhythm.</h2></div><div className="grid gap-4 md:grid-cols-3">{features.map(({ icon: Icon, title, body }, index) => <Card key={title}><CardContent className="p-6"><span className="mb-10 flex items-center justify-between"><span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary"><Icon size={21} /></span><span className="font-display text-3xl text-border">0{index + 1}</span></span><h3 className="text-lg font-extrabold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p></CardContent></Card>)}</div></section>
    <section id="features" className="landing-cta"><p className="eyebrow text-white/70">Make room for the good part</p><h2 className="font-display text-4xl font-semibold sm:text-5xl">Spend less time organizing recipes.<br />Spend more time making them.</h2><Button asChild variant="accent" size="lg" className="mt-7"><Link href="/app/discover">Find something delicious<ArrowRight size={18} /></Link></Button></section>
    <footer className="marketing-footer"><Brand /><p>PerfectPlate frontend concept · 2026</p></footer>
  </main>;
}
