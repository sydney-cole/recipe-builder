import { PageHeader } from "@/components/app-shell/page-header";
import { EmailIntake } from "@/components/imports/email-intake";
export default function ImportsPage() { return <div className="page-container"><PageHeader eyebrow="Recipe email" title="Inboxes" description="Connect your AgentMail recipe inbox, then forward recipe links to PerfectPlate." /><EmailIntake /></div>; }
