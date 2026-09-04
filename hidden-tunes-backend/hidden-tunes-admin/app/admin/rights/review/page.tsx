import AdminShell from "@/components/AdminShell";
import RightsListClient from "@/app/admin/rights/_components/RightsListClient";
import RightsNav from "@/app/admin/rights/_components/RightsNav";
export default function Page(){return <AdminShell title="Rights review queue" description="UNKNOWN, conflicting, missing-evidence, and explicitly assigned catalog records."><RightsNav/><RightsListClient endpoint="/api/admin/rights/review" collection="items" empty="The review queue is empty."/></AdminShell>}

