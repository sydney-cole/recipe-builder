"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowRight, CheckCircle2, LockKeyhole, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { Brand } from "@/components/brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeAppRedirect } from "@/lib/navigation";

type AuthErrorMessage = {
  title: string;
  description: string;
};

export function getAuthErrorMessage(
  caughtError: unknown,
  mode: "sign-in" | "sign-up",
): AuthErrorMessage {
  const message = caughtError instanceof Error ? caughtError.message : "";
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("invalidaccountid")) {
    return {
      title: "Account not found",
      description:
        "We couldn’t find an account with that email. Check the address or create a new account.",
    };
  }

  if (normalizedMessage.includes("invalidsecret")) {
    return {
      title: "Incorrect password",
      description: "That password isn’t correct. Check it and try again.",
    };
  }

  if (normalizedMessage.includes("toomanyfailedattempts")) {
    return {
      title: "Too many sign-in attempts",
      description:
        "Sign-in is temporarily locked for this account. Wait a little while, then try again.",
    };
  }

  if (normalizedMessage.includes("already exists")) {
    return {
      title: "Account already exists",
      description:
        "An account with this email already exists. Sign in instead, or use a different email.",
    };
  }

  if (normalizedMessage.includes("invalid password")) {
    return {
      title: "Password doesn’t meet the requirements",
      description: "Choose a password with at least 8 characters.",
    };
  }

  // Older Convex Auth versions combine an unknown email and a wrong password
  // into one error, so avoid claiming which field was incorrect in this case.
  if (normalizedMessage.includes("invalid credentials")) {
    return {
      title: "Email or password is incorrect",
      description: "Check your email and password, then try again.",
    };
  }

  if (
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("networkerror") ||
    normalizedMessage.includes("network error")
  ) {
    return {
      title: "Connection problem",
      description: "Check your internet connection and try again.",
    };
  }

  return {
    title: mode === "sign-up" ? "Couldn’t create your account" : "Couldn’t sign you in",
    description: "We couldn’t complete that request. Please try again.",
  };
}

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<AuthErrorMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSignUp = mode === "sign-up";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    formData.set("flow", isSignUp ? "signUp" : "signIn");

    try {
      const result = await signIn("password", formData);
      if (!result.signingIn) {
        throw new Error("Sign-in could not be completed. Please try again.");
      }

      router.replace(safeAppRedirect(searchParams.get("next")));
      router.refresh();
    } catch (caughtError) {
      setError(getAuthErrorMessage(caughtError, mode));
      setIsSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div>
          <p className="eyebrow text-white/70">Your recipes, ready when you are</p>
          <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
            Turn recipe clutter into a calm plan for dinner.
          </h1>
          <ul className="mt-8 grid gap-4 text-sm text-white/80">
            {["Email recipe links straight to your book", "Find ideas from ingredients and cravings", "Build one tidy, editable grocery list"].map((item) => (
              <li className="flex gap-3" key={item}>
                <CheckCircle2 className="mt-px shrink-0" size={19} />{item}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/60">Secure account access powered by Convex Auth.</p>
      </section>

      <section className="auth-panel">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden"><Brand /></div>
          <p className="eyebrow">Welcome {isSignUp ? "to PerfectPlate" : "back"}</p>
          <h2 className="font-display text-4xl font-semibold">
            {isSignUp ? "Create your account" : "Sign in to your kitchen"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {isSignUp ? "Save inspiration, simplify shopping, and keep dinner moving." : "Pick up where you left off."}
          </p>

          {error && (
            <Alert className="mt-6 border-red-200 bg-red-50" role="alert">
              <AlertTitle>{error.title}</AlertTitle>
              <AlertDescription>{error.description}</AlertDescription>
            </Alert>
          )}

          <form className="mt-8 grid gap-4" onSubmit={handleSubmit}>
            {isSignUp && (
              <label className="grid gap-2 text-sm font-bold">
                Name
                <Input required name="name" autoComplete="name" placeholder="Your name" />
              </label>
            )}
            <label className="grid gap-2 text-sm font-bold">
              Email
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} aria-hidden />
                <Input className="auth-input-with-icon" required name="email" type="email" autoComplete="email" placeholder="you@example.com" />
              </div>
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Password
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} aria-hidden />
                <Input className="auth-input-with-icon" required minLength={8} name="password" type="password" autoComplete={isSignUp ? "new-password" : "current-password"} placeholder="At least 8 characters" />
              </div>
            </label>
            {!isSignUp && (
              <Link className="justify-self-end text-sm font-bold text-primary underline underline-offset-4" href="/forgot-password">
                Forgot your password?
              </Link>
            )}
            <Button disabled={isSubmitting} type="submit" size="lg" className="mt-2">
              {isSubmitting ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
              {!isSubmitting && <ArrowRight size={17} />}
            </Button>
          </form>

          <p className="mt-6 text-sm text-muted-foreground">
            {isSignUp ? "Already have an account?" : "New to PerfectPlate?"}{" "}
            <Link className="font-bold text-primary underline underline-offset-4" href={isSignUp ? "/sign-in" : "/sign-up"}>
              {isSignUp ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
