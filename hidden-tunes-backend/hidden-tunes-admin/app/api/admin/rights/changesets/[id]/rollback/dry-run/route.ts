import { NextRequest, NextResponse } from "next/server";

import { rightsJsonError } from "@/lib/rights/api";
import { hashRightsValue } from "@/lib/rights/filterSchema";
import { requireRightsPermission } from "@/lib/rights/permissions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const permission = await requireRightsPermission(request, "rollback");
  if (permission.errorResponse) return permission.errorResponse;
  const { id } = await context.params;
  const client = getSupabaseAdmin();
  const [changeset, entries] = await Promise.all([
    client.from("rights_changesets").select("*").eq("id", id).maybeSingle(),
    client.from("rights_changeset_entries").select("id,content_type,content_id,field_name,expected_version,rollback_conflict")
      .eq("changeset_id", id),
  ]);
  if (changeset.error || entries.error) return rightsJsonError("Unable to preview rollback.", 500, changeset.error?.message ?? entries.error?.message);
  if (!changeset.data) return rightsJsonError("Changeset not found.", 404);
  const conflicts = (entries.data ?? []).filter((entry) => Boolean(entry.rollback_conflict));
  const preview = {
    changesetId: id,
    matching: entries.data?.length ?? 0,
    conflicts: conflicts.length,
    safeToRollback: (entries.data?.length ?? 0) - conflicts.length,
    writes: false,
  };
  return NextResponse.json({ success: true, preview, confirmationHash: hashRightsValue(preview) });
}

