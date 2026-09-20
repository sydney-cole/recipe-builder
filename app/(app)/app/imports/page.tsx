import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmailIntake } from "@/components/imports/email-intake";

export const metadata: Metadata = { title: "Recipe Inbox" };

export default function ImportsPage() { return <div className="page-container"><PageHeader eyebrow="Recipe email" title="Recipe Inbox" description="Get your forwarding address and follow the recipes you’ve emailed to PerfectPlate." /><EmailIntake /></div>; }
