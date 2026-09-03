import Link from "next/link";
import { ArrowLeft, MoreHorizontal, Share2 } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { GroceryListEditor } from "@/components/grocery/grocery-list-editor";
import { Button } from "@/components/ui/button";
export default function GroceryListPage() { return <div className="page-container"><Button asChild variant="ghost" className="mb-5"><Link href="/app/grocery-lists"><ArrowLeft size={17} />All grocery lists</Link></Button><PageHeader eyebrow="Grocery list" title="This week" description="Edit names and quantities, check items off, or remove anything you no longer need." actions={<><Button variant="secondary"><Share2 size={17} />Share</Button><Button variant="ghost" size="icon" aria-label="More list options"><MoreHorizontal /></Button></>} /><GroceryListEditor /></div>; }
