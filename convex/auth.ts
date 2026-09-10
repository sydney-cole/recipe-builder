import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import {
  convexAuth,
  type EmailConfig,
  type GenericActionCtxWithAuthConfig,
} from "@convex-dev/auth/server";
import type { DataModel } from "./_generated/dataModel";
import { agentmail } from "./lib/agentmail";
import {
  generateVerificationCode,
  VERIFICATION_CODE_TTL_SECONDS,
  verificationEmail,
} from "./lib/verification";

const emailVerification = Email({
  id: "password-email-verification",
  maxAge: VERIFICATION_CODE_TTL_SECONDS,
  generateVerificationToken: generateVerificationCode,
  sendVerificationRequest: (async (
    { identifier, token }: { identifier: string; token: string },
    ctx: GenericActionCtxWithAuthConfig<DataModel>,
  ) => {
    const inboxId = process.env.AGENTMAIL_INBOX_ID?.trim();
    if (!inboxId) throw new Error("Email verification is not configured");
    await agentmail.sendMessage(
      ctx as unknown as Parameters<typeof agentmail.sendMessage>[0],
      inboxId,
      {
      to: identifier,
      ...verificationEmail(token),
      labels: ["account-verification"],
      },
    );
  }) as unknown as EmailConfig["sendVerificationRequest"],
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      verify: emailVerification,
      profile(params) {
        const email = params.email;
        if (typeof email !== "string") {
          throw new Error("Email is required");
        }

        return {
          email: email.trim().toLowerCase(),
          name: typeof params.name === "string" ? params.name.trim() : "",
        };
      },
    }),
  ],
});
