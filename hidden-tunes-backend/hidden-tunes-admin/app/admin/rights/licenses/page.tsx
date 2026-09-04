import AdminShell from "@/components/AdminShell";
import RightsListClient from "@/app/admin/rights/_components/RightsListClient";
import RightsNav from "@/app/admin/rights/_components/RightsNav";
export default function Page(){return <AdminShell title="Rights licenses" description="Attach one agreement to a typed provider, catalog, batch, territory, platform, and date scope."><RightsNav/><RightsListClient endpoint="/api/admin/rights/licenses" collection="licenses" empty="No license records yet."/></AdminShell>}

