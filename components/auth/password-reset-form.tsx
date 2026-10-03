"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Brand } from "@/components/brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ResetError = {
  title: string;
  description: string;
};

function resetErrorMessage(error: unknown, step: "request" | "verify"): ResetError {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("invalid code") || message.includes("invalid verification")) {
    return {
      title: "Code not accepted",
      description: "That code is incorrect or has expired. Check the email and try again.",
    };
  }

  if (message.includes("invalid password")) {
    return {
      title: "Password doesn’t meet the requirements",
      description: "Choose a password with at least 8 characters.",
    };
  }

  if (message.includes("toomanyfailedattempts")) {
    return {
      title: "Too many attempts",
      description: "Wait a little while before requesting or entering another code.",
    };
  }

  return {
    title: step === "request" ? "Couldn’t send a reset code" : "Couldn’t reset your password",
    description: "We couldn’t complete that request. Please try again.",
  };
}

export function PasswordResetForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<ResetError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const normalizedEmail = String(formData.get("email") ?? "").trim().toLowerCase();
    formData.set("email", normalizedEmail);
    formData.set("flow", "reset");

    try {
      await signIn("password", formData);
      setEmail(normalizedEmail);
      setStep("verify");
    } catch (caughtError) {
      setError(resetErrorMessage(caughtError, "request"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    formData.set("email", email);
    formData.set("flow", "reset-verification");

    try {
      const result = await signIn("password", formData);
      if (!result.signingIn) {
        throw new Error("Password reset could not be completed");
      }
      router.replace("/app");
      router.refresh();
    } catch (caughtError) {
      setError(resetErrorMessage(caughtError, "verify"));
      setIsSubmitting(false);
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div>
          <p className="eyebrow eyebrow-on-primary">Account recovery</p>
          <p className="font-display text-4xl font-semibold leading-tight sm:text-5xl">
            Get back to your recipes and dinner plans.
          </p>
          <ul className="mt-8 grid gap-4 text-sm text-white/80">
            <li className="flex gap-3">
              <CheckCircle2 className="mt-px shrink-0" size={19} />
              Reset securely with a one-time email code
            </li>
            <li className="flex gap-3">
              <CheckCircle2 className="mt-px shrink-0" size={19} />
              Keep your saved recipes and grocery lists
            </li>
          </ul>
        </div>
        <p className="text-xs text-white">Secure account access powered by Convex Auth.</p>
      </section>

      <section className="auth-panel">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden"><Brand /></div>
          <p className="eyebrow">Reset your password</p>
          <h1 className="font-display text-4xl font-semibold">
            {step === "request" ? "Find your account" : "Check your email"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {step === "request"
              ? "Enter the email address you use for PerfectPlate."
              : `Enter the six-digit code sent to ${email}, then choose a new password.`}
          </p>

          {error && (
            <Alert className="mt-6 border-red-200 bg-red-50" role="alert">
              <AlertTitle>{error.title}</AlertTitle>
              <AlertDescription>{error.description}</AlertDescription>
            </Alert>
          )}

          {step === "request" ? (
            <form className="mt-8 grid gap-4" onSubmit={requestCode}>
              <label className="grid gap-2 text-sm font-bold">
                Email
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} aria-hidden />
                  <Input className="auth-input-with-icon" required name="email" type="email" autoComplete="email" placeholder="you@example.com" />
                </div>
              </label>
              <Button disabled={isSubmitting} type="submit" size="lg" className="mt-2">
                {isSubmitting ? "Sending code…" : "Send reset code"}
                {!isSubmitting && <ArrowRight size={17} />}
              </Button>
            </form>
          ) : (
            <form className="mt-8 grid gap-4" onSubmit={verifyCode}>
              <label className="grid gap-2 text-sm font-bold">
                Reset code
                <Input required name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="123456" />
              </label>
              <label className="grid gap-2 text-sm font-bold">
                New password
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} aria-hidden />
                  <Input className="auth-input-with-icon" required minLength={8} name="newPassword" type="password" autoComplete="new-password" placeholder="At least 8 characters" />
                </div>
              </label>
              <Button disabled={isSubmitting} type="submit" size="lg" className="mt-2">
                {isSubmitting ? "Resetting password…" : "Reset password"}
                {!isSubmitting && <ArrowRight size={17} />}
              </Button>
              <button
                className="text-sm font-bold text-primary underline underline-offset-4"
                type="button"
                onClick={() => {
                  setStep("request");
                  setError(null);
                }}
              >
                Use a different email
              </button>
            </form>
          )}

          <Link className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary underline underline-offset-4" href="/sign-in">
            <ArrowLeft size={16} /> Back to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
