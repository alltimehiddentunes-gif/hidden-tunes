import AdminShell from "@/components/AdminShell";
import MusicTaxonomyManager from "@/components/MusicTaxonomyManager";

export default function MusicTaxonomyPage() {
  return (
    <AdminShell
      eyebrow="Music operations"
      title="Taxonomy manager"
      description="Manage the global canonical vocabulary, aliases, parent relationships, merge history, and classification health. Existing source, rights, storage, and playback records are outside this surface."
    >
      <MusicTaxonomyManager />
    </AdminShell>
  );
}
