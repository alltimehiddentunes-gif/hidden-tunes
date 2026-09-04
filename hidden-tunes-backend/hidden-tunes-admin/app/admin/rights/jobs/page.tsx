import AdminShell from "@/components/AdminShell";
import RightsListClient from "@/app/admin/rights/_components/RightsListClient";
import RightsNav from "@/app/admin/rights/_components/RightsNav";
export default function Page(){return <AdminShell title="Rights bulk jobs" description="Queued, running, completed, partial, failed, and cooperatively cancelled bounded jobs."><RightsNav/><RightsListClient endpoint="/api/admin/rights/jobs" collection="jobs" empty="No rights jobs have been queued."/></AdminShell>}

