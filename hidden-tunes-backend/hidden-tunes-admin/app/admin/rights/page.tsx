import AdminShell from "@/components/AdminShell";
import RightsNav from "@/app/admin/rights/_components/RightsNav";
import RightsOverviewClient from "@/app/admin/rights/_components/RightsOverviewClient";

export default function RightsOverviewPage() {
  return (
    <AdminShell title="Rights & Licensing" description="Catalog-scale policy, evidence, dry runs, changesets, and audit. Production enforcement remains server-gated OFF.">
      <RightsNav />
      <RightsOverviewClient />
    </AdminShell>
  );
}

