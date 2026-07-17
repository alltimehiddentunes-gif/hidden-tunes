import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type SportsAdminDashboardStats = {
  liveEvents: number;
  startingSoon: number;
  publishedChannels: number;
  verifiedStreams: number;
  quarantinedStreams: number;
  rightsExpiring: number;
  providerHealth: Array<{ slug: string; status: string; enabled: boolean }>;
  recentFailures: number;
  pendingRightsReview: number;
};

export async function getSportsAdminDashboard(): Promise<SportsAdminDashboardStats> {
  const now = new Date();
  const soon = new Date(now.getTime() + 2 * 60 * 60_000).toISOString();
  const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60_000).toISOString();

  const [
    live,
    starting,
    channels,
    verified,
    quarantined,
    rightsExpiring,
    providers,
    failures,
    pendingRights,
  ] = await Promise.all([
    supabaseAdmin
      .from("sports_broadcasts")
      .select("id", { count: "exact", head: true })
      .eq("availability_status", "live"),
    supabaseAdmin
      .from("sports_broadcasts")
      .select("id", { count: "exact", head: true })
      .in("availability_status", ["scheduled", "verified"])
      .lte("starts_at", soon)
      .gte("starts_at", now.toISOString()),
    supabaseAdmin
      .from("sports_channels")
      .select("id", { count: "exact", head: true })
      .not("published_at", "is", null)
      .is("unpublished_at", null),
    supabaseAdmin
      .from("sports_stream_sources")
      .select("id", { count: "exact", head: true })
      .eq("status", "verified"),
    supabaseAdmin
      .from("sports_stream_sources")
      .select("id", { count: "exact", head: true })
      .eq("status", "quarantined"),
    supabaseAdmin
      .from("sports_rights_grants")
      .select("id", { count: "exact", head: true })
      .eq("evidence_status", "approved")
      .lte("valid_until", in30d)
      .gte("valid_until", now.toISOString()),
    supabaseAdmin
      .from("sports_providers")
      .select("slug, health_status, is_enabled, kill_switch")
      .order("slug"),
    supabaseAdmin
      .from("sports_play_failures")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(now.getTime() - 24 * 60 * 60_000).toISOString()),
    supabaseAdmin
      .from("sports_rights_grants")
      .select("id", { count: "exact", head: true })
      .eq("evidence_status", "pending"),
  ]);

  return {
    liveEvents: live.count || 0,
    startingSoon: starting.count || 0,
    publishedChannels: channels.count || 0,
    verifiedStreams: verified.count || 0,
    quarantinedStreams: quarantined.count || 0,
    rightsExpiring: rightsExpiring.count || 0,
    providerHealth: (providers.data || []).map((p) => ({
      slug: p.slug,
      status: p.kill_switch ? "disabled" : p.health_status,
      enabled: Boolean(p.is_enabled) && !p.kill_switch,
    })),
    recentFailures: failures.count || 0,
    pendingRightsReview: pendingRights.count || 0,
  };
}

export const SPORTS_ADMIN_EMERGENCY_ACTIONS = [
  "disable_stream",
  "disable_provider",
  "disable_competition",
  "disable_country",
  "force_external_only",
  "replace_playback_source",
  "unpublish_event",
  "quarantine_source",
  "revoke_rights",
  "restore_after_review",
] as const;

export type SportsAdminEmergencyAction =
  (typeof SPORTS_ADMIN_EMERGENCY_ACTIONS)[number];

/**
 * Emergency controls — audited, never expose secret playback URLs.
 * Phase 1 records intent; full DB mutations land with admin API wiring.
 */
export async function recordSportsAdminAction(input: {
  actorId?: string | null;
  actorEmail?: string | null;
  action: SportsAdminEmergencyAction;
  targetType: string;
  targetId: string;
  notes?: string;
}) {
  const { error } = await supabaseAdmin.from("sports_admin_audit_log").insert({
    actor_id: input.actorId || null,
    actor_email: input.actorEmail || null,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    after_state: { notes: input.notes || null, phase: "phase1_foundation" },
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}
