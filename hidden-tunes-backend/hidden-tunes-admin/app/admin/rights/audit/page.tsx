import AdminShell from "@/components/AdminShell";
import RightsListClient from "@/app/admin/rights/_components/RightsListClient";
import RightsNav from "@/app/admin/rights/_components/RightsNav";
export default function Page(){return <AdminShell title="Rights audit log" description="Append-only actor, reason, filter, job, changeset, count, and result events without secrets."><RightsNav/><RightsListClient endpoint="/api/admin/rights/audit" collection="events" empty="No rights audit events yet."/></AdminShell>}

