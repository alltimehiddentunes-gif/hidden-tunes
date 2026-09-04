import AdminShell from "@/components/AdminShell";
import RightsListClient from "@/app/admin/rights/_components/RightsListClient";
import RightsNav from "@/app/admin/rights/_components/RightsNav";
export default function Page(){return <AdminShell title="Rights providers" description="Provider-level policies inherit without copying settings to every catalog row."><RightsNav/><RightsListClient endpoint="/api/admin/rights/providers" collection="providers" empty="No providers exist until the additive migration and an owner-approved metadata setup are run."/></AdminShell>}

