import { PageHeader } from "@/components/app-shell/page-header";
import { SettingsPanel } from "@/components/settings/settings-panel";

export default function SettingsPage() {
  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Manage your profile, recipe inbox, and notification preferences."
      />
      <SettingsPanel />
    </div>
  );
}
