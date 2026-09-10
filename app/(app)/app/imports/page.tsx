import { PageHeader } from "@/components/app-shell/page-header";
import { EmailIntake } from "@/components/imports/email-intake";
export default function ImportsPage() { return <div className="page-container"><PageHeader eyebrow="Recipe import" title="Bring a recipe into PerfectPlate" description="Paste a recipe link, or forward one to the shared inbox after verifying your account email." /><EmailIntake /></div>; }
