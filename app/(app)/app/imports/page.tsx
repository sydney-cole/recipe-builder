import { PageHeader } from "@/components/app-shell/page-header";
import { EmailIntake } from "@/components/imports/email-intake";
export default function ImportsPage() { return <div className="page-container"><PageHeader eyebrow="Email import" title="Send recipes straight to PerfectPlate" description="Create an AgentMail inbox, forward recipe links, and follow each import from the queue." /><EmailIntake /></div>; }
