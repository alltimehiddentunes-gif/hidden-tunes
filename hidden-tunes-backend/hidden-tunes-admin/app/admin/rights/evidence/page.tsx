import AdminShell from "@/components/AdminShell";
import RightsListClient from "@/app/admin/rights/_components/RightsListClient";
import RightsNav from "@/app/admin/rights/_components/RightsNav";
export default function Page(){return <AdminShell title="Rights evidence" description="Private evidence metadata and SHA-256 integrity records; private object keys are never returned here."><RightsNav/><RightsListClient endpoint="/api/admin/rights/evidence" collection="evidence" empty="No rights evidence records yet."/></AdminShell>}

