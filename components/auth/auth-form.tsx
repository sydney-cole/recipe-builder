"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CheckCircle2, LockKeyhole, Mail } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [submitted, setSubmitted] = useState(false);
  const isSignUp = mode === "sign-up";
  return (
    <main id="main-content" className="auth-layout">
      <section className="auth-story"><Brand /><div><p className="eyebrow text-white/70">Your recipes, ready when you are</p><h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">Turn recipe clutter into a calm plan for dinner.</h1><ul className="mt-8 grid gap-4 text-sm text-white/80">{["Email recipe links straight to your book", "Find ideas from ingredients and cravings", "Build one tidy, editable grocery list"].map((item) => <li className="flex gap-3" key={item}><CheckCircle2 className="mt-px shrink-0" size={19} />{item}</li>)}</ul></div><p className="text-xs text-white/60">Frontend preview — authentication is not connected yet.</p></section>
      <section className="auth-panel">
        <div className="w-full max-w-md"><div className="mb-10 lg:hidden"><Brand /></div><p className="eyebrow">Welcome {isSignUp ? "to PerfectPlate" : "back"}</p><h2 className="font-display text-4xl font-semibold">{isSignUp ? "Create your account" : "Sign in to your kitchen"}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{isSignUp ? "Save inspiration, simplify shopping, and keep dinner moving." : "Pick up where you left off."}</p>
          {submitted ? <div className="mt-8 rounded-xl border border-border bg-primary-soft p-5" role="status"><CheckCircle2 className="text-primary" /><h3 className="mt-3 font-extrabold">Frontend flow complete</h3><p className="mt-1 text-sm text-muted-foreground">Authentication will be wired to Convex in the backend phase.</p><Button asChild className="mt-5"><Link href="/app">Open preview<ArrowRight size={17} /></Link></Button></div> :
          <form className="mt-8 grid gap-4" onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
            {isSignUp && <label className="grid gap-2 text-sm font-bold">Name<Input required autoComplete="name" placeholder="Your name" /></label>}
            <label className="grid gap-2 text-sm font-bold">Email<div className="relative"><Mail className="absolute left-3 top-3.5 text-muted-foreground" size={17} /><Input className="pl-10" required type="email" autoComplete="email" placeholder="you@example.com" /></div></label>
            <label className="grid gap-2 text-sm font-bold">Password<div className="relative"><LockKeyhole className="absolute left-3 top-3.5 text-muted-foreground" size={17} /><Input className="pl-10" required minLength={8} type="password" autoComplete={isSignUp ? "new-password" : "current-password"} placeholder="At least 8 characters" /></div></label>
            <Button type="submit" size="lg" className="mt-2">{isSignUp ? "Create account" : "Sign in"}<ArrowRight size={17} /></Button>
          </form>}
          <p className="mt-6 text-sm text-muted-foreground">{isSignUp ? "Already have an account?" : "New to PerfectPlate?"} <Link className="font-bold text-primary underline underline-offset-4" href={isSignUp ? "/sign-in" : "/sign-up"}>{isSignUp ? "Sign in" : "Create an account"}</Link></p>
        </div>
      </section>
    </main>
  );
}
