import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  Inbox,
  Link2,
  ListChecks,
  Mail,
  Search,
  ShoppingBasket,
  Sparkles,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { FoodArt } from "@/components/recipes/food-art";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const steps = [
  {
    icon: Search,
    title: "Find it or bring it",
    body: "Search by ingredient or craving, paste a recipe link, or forward one to your Recipe Inbox.",
  },
  {
    icon: BookOpen,
    title: "Review, then save",
    body: "PerfectPlate turns the source into a clear recipe card. You decide what belongs in your Recipe Book.",
  },
  {
    icon: ShoppingBasket,
    title: "Make the shopping list",
    body: "Choose a recipe, add its ingredients, and edit quantities as dinner plans change.",
  },
];

const productFeatures = [
  {
    icon: Sparkles,
    title: "Recipe discovery that understands dinner",
    body: "Combine ingredients, cuisines, cravings, and constraints to find a few useful matches—not an endless feed.",
  },
  {
    icon: Inbox,
    title: "A recipe inbox for everything you find",
    body: "Paste a URL or forward an email. Follow each import from receipt to a structured recipe preview.",
  },
  {
    icon: BookOpen,
    title: "A Recipe Book you choose",
    body: "Preview ingredients and instructions first, then save only the recipes you actually want to keep.",
  },
  {
    icon: ListChecks,
    title: "Grocery lists that stay editable",
    body: "Create lists from saved recipes, combine plans, rename items, adjust amounts, and check things off as you shop.",
  },
];

export default function LandingPage() {
  return (
    <main id="main-content">
      <header className="marketing-nav">
        <Brand />
        <nav className="hidden items-center gap-7 text-sm font-bold md:flex" aria-label="Landing page">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
        </nav>
        <div className="cluster ml-auto">
          <Button asChild variant="ghost" className="hidden sm:inline-flex"><Link href="/sign-in">Sign in</Link></Button>
          <Button asChild><Link href="/sign-up">Get started<ArrowRight size={17} /></Link></Button>
        </div>
      </header>

      <section className="hero-section">
        <div>
          <p className="eyebrow">A calmer way to decide what’s for dinner</p>
          <h1 className="font-display text-5xl font-semibold leading-[1.03] tracking-[-.045em] sm:text-6xl lg:text-7xl">
            Recipes in.<br />Dinner figured out.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            Discover recipes from the web, import the ones already in your tabs or inbox, and turn tonight’s pick into a grocery list you can actually edit.
          </p>
          <div className="mt-8 cluster">
            <Button asChild size="lg"><Link href="/sign-up">Build your Recipe Book<ArrowRight size={18} /></Link></Button>
            <Button asChild size="lg" variant="secondary"><a href="#how-it-works">See how it works</a></Button>
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Check size={14} className="text-primary" />Free to get started. Bring your first recipe in minutes.</p>
        </div>

        <div className="hero-board" aria-label="A recipe moving from the web into PerfectPlate">
          <div className="hero-note"><Sparkles size={17} />Recipe card ready to review</div>
          <Card className="hero-recipe">
            <FoodArt variant="garden" label="Imported from the web" />
            <CardContent>
              <p className="eyebrow">Tonight’s current recipe</p>
              <h2 className="font-display text-2xl font-semibold">Lemon herb orzo with spring greens</h2>
              <div className="mt-5 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">30 min · serves 4</span>
                <span className="grid size-10 place-items-center rounded-full bg-primary text-white"><BookOpen size={18} /></span>
              </div>
            </CardContent>
          </Card>
          <div className="hero-status"><span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary"><ListChecks size={17} /></span><span><strong>Grocery list started</strong><small>8 ingredients ready to edit</small></span></div>
        </div>
      </section>

      <section id="how-it-works" className="landing-section">
        <div className="mb-10 max-w-2xl">
          <p className="eyebrow">From “that looks good” to dinner</p>
          <h2 className="font-display text-4xl font-semibold">One place for the whole recipe journey.</h2>
          <p className="mt-3 leading-7 text-muted-foreground">PerfectPlate keeps discovery, recipe organizing, and grocery planning connected—without taking control away from you.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, index) => (
            <Card key={title}>
              <CardContent className="p-6">
                <span className="mb-10 flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary"><Icon size={21} /></span>
                  <span className="font-display text-3xl text-border">0{index + 1}</span>
                </span>
                <h3 className="text-lg font-extrabold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section id="features" className="landing-features">
        <div className="landing-feature-intro">
          <p className="eyebrow">Built for real-life cooking</p>
          <h2 className="font-display text-4xl font-semibold sm:text-5xl">Less recipe wrangling.<br />More useful planning.</h2>
          <p className="mt-5 max-w-lg leading-7 text-muted-foreground">Keep the recipes you care about moving naturally from discovery to your kitchen and grocery cart.</p>
          <div className="mt-7 flex flex-wrap gap-2 text-xs font-bold text-primary">
            <span className="landing-pill"><Search size={14} />Web discovery</span>
            <span className="landing-pill"><Link2 size={14} />Link imports</span>
            <span className="landing-pill"><Mail size={14} />Email forwarding</span>
          </div>
        </div>
        <div className="landing-feature-list">
          {productFeatures.map(({ icon: Icon, title, body }) => (
            <article className="landing-feature-item" key={title}>
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-primary shadow-sm"><Icon size={21} /></span>
              <div><h3 className="font-extrabold">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-cta">
        <p className="eyebrow text-white/70">Dinner starts with one good recipe</p>
        <h2 className="font-display text-4xl font-semibold sm:text-5xl">Bring yours to PerfectPlate.</h2>
        <p className="mt-4 max-w-2xl text-white/75">Search for something new, paste a favorite link, or forward the recipe waiting in your inbox.</p>
        <Button asChild variant="secondary" size="lg" className="mt-7"><Link href="/sign-up">Get started<ArrowRight size={18} /></Link></Button>
      </section>

      <footer className="marketing-footer"><Brand /><p>Recipes, organized for real life. · 2026</p></footer>
    </main>
  );
}
