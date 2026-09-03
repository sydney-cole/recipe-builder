import { PageHeader } from "@/components/app-shell/page-header";
import { SubscriptionsPanel } from "@/components/subscriptions/subscriptions-panel";
export default function SubscriptionsPage() { return <div className="page-container"><PageHeader eyebrow="Recipe agent" title="Food blog subscriptions" description="Manage the newsletters and recipe sources your agent follows on your behalf." /><SubscriptionsPanel /></div>; }
