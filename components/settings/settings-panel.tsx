"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

export function SettingsPanel() {
  const user = useQuery(api.users.current);

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

  return <SettingsContent key={user._id} user={user} />;
}

function SettingsContent({ user }: { user: Doc<"users"> }) {
  const updateProfile = useMutation(api.users.updateProfile);
  const deleteAccount = useMutation(api.users.deleteAccount);
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [name, setName] = useState(user.name ?? "");
  const [profileState, setProfileState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteState, setDeleteState] = useState<"idle" | "deleting" | "error">("idle");

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

  async function handleDeleteAccount() {
    if (deleteConfirmation !== "DELETE") return;
    setDeleteState("deleting");
    try {
      await deleteAccount({ confirmation: deleteConfirmation });
      await signOut();
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setDeleteState("error");
    }
  }

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
            <Trash2 className="shrink-0 text-red-700" />
            <div><h2 className="section-heading">Delete account</h2><p className="section-copy">Permanently delete your account and all of your PerfectPlate data.</p></div>
          </div>
          <Dialog onOpenChange={(open) => { if (!open && deleteState !== "deleting") { setDeleteConfirmation(""); setDeleteState("idle"); } }}>
            <DialogTrigger asChild><Button className="mt-5" variant="destructive">Delete account</Button></DialogTrigger>
            <DialogContent>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>This permanently deletes your profile, saved recipes, grocery lists, and recipe inbox data. This action cannot be undone.</DialogDescription>
              <label className="mt-5 grid gap-2 text-sm font-bold">
                Type DELETE to confirm
                <Input autoComplete="off" value={deleteConfirmation} onChange={(event) => { setDeleteConfirmation(event.target.value); setDeleteState("idle"); }} />
              </label>
              {deleteState === "error" && <p className="mt-3 text-sm font-bold text-red-700" role="alert">Your account couldn’t be deleted. Try again.</p>}
              <div className="mt-5 flex justify-end">
                <Button variant="destructive" disabled={deleteConfirmation !== "DELETE" || deleteState === "deleting"} onClick={() => void handleDeleteAccount()}>
                  {deleteState === "deleting" ? "Deleting account…" : "Permanently delete account"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
      <p className="flex gap-2 text-xs text-muted-foreground"><ShieldCheck size={16} className="shrink-0" />Your settings are saved securely to your PerfectPlate account.</p>
    </div>
  );
}
