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

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
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
        const email = formData.get("email");
        if (typeof email !== "string") {
          throw new Error("Email verification could not be started.");
        }
        setVerificationEmail(email.trim().toLowerCase());
        setVerificationCode("");
        setIsSubmitting(false);
        return;
      }

      router.replace(safeAppRedirect(searchParams.get("next")));
      router.refresh();
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Something went wrong.";
      setError(
        message.includes("Invalid credentials")
          ? "The email or password is incorrect."
          : message.includes("already exists")
            ? "An account with this email already exists."
            : "We couldn’t complete that request. Please try again.",
      );
      setIsSubmitting(false);
    }
  }

  async function handleVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (verificationEmail === null) return;
    setError(null);
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    formData.set("flow", "email-verification");
    formData.set("email", verificationEmail);
    try {
      const result = await signIn("password", formData);
      if (!result.signingIn) throw new Error("Invalid or expired code");
      router.replace(safeAppRedirect(searchParams.get("next")));
      router.refresh();
    } catch {
      setError("That verification code is invalid or expired. Request a new code and try again.");
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
            {verificationEmail
              ? "Verify your email"
              : isSignUp
                ? "Create your account"
                : "Sign in to your kitchen"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {verificationEmail
              ? `Enter the six-digit code sent to ${verificationEmail}.`
              : isSignUp
                ? "Save inspiration, simplify shopping, and keep dinner moving."
                : "Pick up where you left off."}
          </p>

          {error && (
            <Alert className="mt-6 border-red-200 bg-red-50" role="alert">
              <AlertTitle>Couldn&apos;t {isSignUp ? "create your account" : "sign you in"}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {verificationEmail ? (
            <form key="verification" className="mt-8 grid gap-4" onSubmit={handleVerification}>
              <label className="grid gap-2 text-sm font-bold">
                Verification code
                <Input
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  minLength={6}
                  name="code"
                  pattern="[0-9]{6}"
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value)}
                />
              </label>
              <Button disabled={isSubmitting} type="submit" size="lg">
                {isSubmitting ? "Verifying…" : "Verify email"}
                {!isSubmitting && <ArrowRight size={17} />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setVerificationEmail(null);
                  setVerificationCode("");
                  setError(null);
                }}
              >
                Use a different email
              </Button>
            </form>
          ) : (
          <form key="credentials" className="mt-8 grid gap-4" onSubmit={handleSubmit}>
            {isSignUp && (
              <label className="grid gap-2 text-sm font-bold">
                Name
                <Input required name="name" autoComplete="name" placeholder="Your name" />
              </label>
            )}
            <label className="grid gap-2 text-sm font-bold">
              Email
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 text-muted-foreground" size={17} />
                <Input className="pl-10" required name="email" type="email" autoComplete="email" placeholder="you@example.com" />
              </div>
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Password
              <div className="relative">
                <LockKeyhole className="absolute left-3 top-3.5 text-muted-foreground" size={17} />
                <Input className="pl-10" required minLength={8} name="password" type="password" autoComplete={isSignUp ? "new-password" : "current-password"} placeholder="At least 8 characters" />
              </div>
            </label>
            <Button disabled={isSubmitting} type="submit" size="lg" className="mt-2">
              {isSubmitting ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
              {!isSubmitting && <ArrowRight size={17} />}
            </Button>
          </form>
          )}

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
