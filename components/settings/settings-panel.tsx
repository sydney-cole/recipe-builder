"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Bell, Check, Clipboard, Inbox, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

type NotificationPreferences = {
  recipeImportReady: boolean;
  importNeedsReview: boolean;
  subscriptionNeedsAttention: boolean;
};

const defaultPreferences: NotificationPreferences = {
  recipeImportReady: true,
  importNeedsReview: true,
  subscriptionNeedsAttention: true,
};

export function SettingsPanel() {
  const user = useQuery(api.users.current);
  const inbox = useQuery(api.email.currentInbox);

  if (user === undefined) {
    return (
      <div className="grid max-w-3xl gap-5" aria-label="Loading settings">
        <Skeleton className="h-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (user === null) {
    return (
      <Alert className="max-w-3xl border-red-200 bg-red-50" role="alert">
        <AlertTitle>Settings unavailable</AlertTitle>
        <AlertDescription>Sign in again to manage your settings.</AlertDescription>
      </Alert>
    );
  }

  return <SettingsContent key={user._id} user={user} inbox={inbox} />;
}

function SettingsContent({
  user,
  inbox,
}: {
  user: Doc<"users">;
  inbox: Doc<"userInboxes"> | null | undefined;
}) {
  const updateProfile = useMutation(api.users.updateProfile);
  const updateNotificationPreferences = useMutation(api.users.updateNotificationPreferences);
  const provisionInbox = useAction(api.email.provisionInbox);
  const [name, setName] = useState(user.name ?? "");
  const [preferences, setPreferences] = useState(user.notificationPreferences ?? defaultPreferences);
  const [profileState, setProfileState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [notificationState, setNotificationState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [inboxState, setInboxState] = useState<"idle" | "connecting" | "copied" | "error">("idle");

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      setProfileState("error");
      return;
    }
    setProfileState("saving");
    try {
      await updateProfile({ name: normalizedName });
      setName(normalizedName);
      setProfileState("saved");
    } catch {
      setProfileState("error");
    }
  }

  async function changePreference(key: keyof NotificationPreferences, checked: boolean) {
    const previous = preferences;
    const next = { ...preferences, [key]: checked };
    setPreferences(next);
    setNotificationState("saving");
    try {
      await updateNotificationPreferences({ preferences: next });
      setNotificationState("saved");
    } catch {
      setPreferences(previous);
      setNotificationState("error");
    }
  }

  async function connectInbox() {
    setInboxState("connecting");
    try {
      await provisionInbox();
      setInboxState("idle");
    } catch {
      setInboxState("error");
    }
  }

  async function copyInbox() {
    if (!inbox) return;
    try {
      await navigator.clipboard.writeText(inbox.email);
      setInboxState("copied");
      window.setTimeout(() => setInboxState("idle"), 1800);
    } catch {
      setInboxState("error");
    }
  }

  const notificationOptions: Array<{ key: keyof NotificationPreferences; label: string }> = [
    { key: "recipeImportReady", label: "A recipe import is ready" },
    { key: "importNeedsReview", label: "An import needs review or fails" },
    { key: "subscriptionNeedsAttention", label: "A subscription needs attention" },
  ];

  return (
    <div className="grid max-w-3xl gap-5">
      <Card>
        <CardContent>
          <div className="flex gap-3">
            <UserRound className="shrink-0 text-primary" />
            <div><h2 className="section-heading">Profile</h2><p className="section-copy">How your name appears in PerfectPlate.</p></div>
          </div>
          <form className="mt-5" onSubmit={saveProfile}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold">
                Name
                <Input required maxLength={100} value={name} onChange={(event) => { setName(event.target.value); setProfileState("idle"); }} />
              </label>
              <label className="grid gap-2 text-sm font-bold">
                Account email
                <Input type="email" value={user.email ?? ""} disabled aria-describedby="account-email-help" />
              </label>
            </div>
            <p id="account-email-help" className="mt-2 text-xs text-muted-foreground">Your sign-in email can’t be changed here.</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={profileState === "saving"}>{profileState === "saving" ? "Saving…" : "Save profile"}</Button>
              {profileState === "saved" && <p className="text-sm font-bold text-primary" role="status">Profile saved.</p>}
              {profileState === "error" && <p className="text-sm font-bold text-red-700" role="alert">Enter a name and try again.</p>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="flex gap-3">
            <Mail className="shrink-0 text-primary" />
            <div><h2 className="section-heading">Recipe inbox</h2><p className="section-copy">Forward recipe emails to your personal intake address.</p></div>
          </div>
          {inbox === undefined ? <Skeleton className="mt-5 h-16" /> : inbox === null ? (
            <div className="mt-5 rounded-lg bg-surface-subtle p-4">
              <p className="text-sm font-bold">No recipe inbox is connected yet.</p>
              <Button className="mt-3" onClick={connectInbox} disabled={inboxState === "connecting"}>
                <Inbox size={17} />{inboxState === "connecting" ? "Connecting…" : "Connect recipe inbox"}
              </Button>
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-2 rounded-lg bg-surface-subtle p-3 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap px-1 text-sm font-bold">{inbox.email}</code>
              <Button variant="secondary" onClick={copyInbox}>
                {inboxState === "copied" ? <Check size={17} /> : <Clipboard size={17} />}{inboxState === "copied" ? "Copied" : "Copy address"}
              </Button>
            </div>
          )}
          {inboxState === "error" && <p className="mt-3 text-sm font-bold text-red-700" role="alert">We couldn’t access the recipe inbox. Try again.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="flex gap-3">
            <Bell className="shrink-0 text-primary" />
            <div><h2 className="section-heading">Notifications</h2><p className="section-copy">Choose which updates should get your attention.</p></div>
          </div>
          <div className="mt-1">
            {notificationOptions.map(({ key, label }) => (
              <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 border-t border-border pt-4 text-sm font-bold" key={key}>
                {label}
                <Checkbox checked={preferences[key]} disabled={notificationState === "saving"} onCheckedChange={(checked) => void changePreference(key, checked === true)} aria-label={label} />
              </label>
            ))}
          </div>
          <div className="mt-4 min-h-5 text-xs font-bold" aria-live="polite">
            {notificationState === "saving" && <p className="text-muted-foreground">Saving preferences…</p>}
            {notificationState === "saved" && <p className="text-primary">Preferences saved.</p>}
            {notificationState === "error" && <p className="text-red-700" role="alert">Preferences weren’t saved. Try again.</p>}
          </div>
        </CardContent>
      </Card>
      <p className="flex gap-2 text-xs text-muted-foreground"><ShieldCheck size={16} className="shrink-0" />Your settings are saved securely to your PerfectPlate account.</p>
    </div>
  );
}
