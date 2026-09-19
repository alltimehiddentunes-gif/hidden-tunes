import { join } from 'node:path';
import { loadAdminEnv } from '../lib/radioExpansion25k/env';
import { getSupabaseAdmin } from '../lib/supabaseAdmin';

const root = join(import.meta.dirname, '..');

async function main() {
  loadAdminEnv(root);
  const ids = (process.env.HT_TV_CANDIDATE_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  if (!ids.length) throw new Error('HT_TV_CANDIDATE_IDS is required');
  const db = getSupabaseAdmin();
  const { data, error } = await db.from('tv_videos').select('id,title,source_url').in('id', ids);
  if (error) throw error;
  const rows = (data ?? []).map((row: any) => {
    try {
      const url = new URL(row.source_url);
      return { id: row.id, title: row.title, host: url.hostname, protocol: url.protocol.replace(':', '') };
    } catch {
      return { id: row.id, title: row.title, host: null, protocol: null };
    }
  });
  console.log(JSON.stringify({ count: rows.length, rawUrlsEmitted: 0, rows }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
