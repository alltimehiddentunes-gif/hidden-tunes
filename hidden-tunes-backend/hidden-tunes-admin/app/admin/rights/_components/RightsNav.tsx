import Link from "next/link";

const SECTIONS = [
  ["/admin/rights", "Overview"],
  ["/admin/rights/content", "Content"],
  ["/admin/rights/providers", "Providers"],
  ["/admin/rights/licenses", "Licenses"],
  ["/admin/rights/evidence", "Evidence"],
  ["/admin/rights/expiring", "Expiring"],
  ["/admin/rights/review", "Review Queue"],
  ["/admin/rights/jobs", "Bulk Jobs"],
  ["/admin/rights/audit", "Audit Log"],
] as const;

export default function RightsNav() {
  return (
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Rights sections">
      {SECTIONS.map(([href, label]) => (
        <Link key={href} href={href} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-white/70 transition hover:border-yellow-300/30 hover:text-yellow-100">
          {label}
        </Link>
      ))}
    </nav>
  );
}

