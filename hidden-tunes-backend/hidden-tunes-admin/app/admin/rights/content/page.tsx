import AdminShell from "@/components/AdminShell";
import RightsContentConsole from "@/app/admin/rights/_components/RightsContentConsole";
import RightsNav from "@/app/admin/rights/_components/RightsNav";

export default function RightsContentPage() {
  return <AdminShell title="Rights content" description="Composable server filters, exact counts, immutable select-all snapshots, and write-free dry runs."><RightsNav /><RightsContentConsole /></AdminShell>;
}

