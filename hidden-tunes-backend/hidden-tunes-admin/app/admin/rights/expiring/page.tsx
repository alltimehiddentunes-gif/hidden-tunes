import AdminShell from "@/components/AdminShell";
import RightsListClient from "@/app/admin/rights/_components/RightsListClient";
import RightsNav from "@/app/admin/rights/_components/RightsNav";
export default function Page(){return <AdminShell title="Expiring rights" description="90, 30, and 7-day evidence and license warning workflow."><RightsNav/><RightsListClient endpoint="/api/admin/rights/expiring?days=90" collection="licenses" empty="No active licenses expire within 90 days."/></AdminShell>}

