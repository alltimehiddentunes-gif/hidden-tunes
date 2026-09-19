import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadAdminEnv } from '../lib/radioExpansion25k/env';
import { getSupabaseAdmin } from '../lib/supabaseAdmin';

const root = join(import.meta.dirname, '..');
const id = process.env.HT_TV_CANDIDATE_ID;
const output = process.env.HT_TV_CANDIDATE_OUTPUT;
async function main() {
  if (!id || !output) throw new Error('Candidate id and output are required');
  loadAdminEnv(root);
  const { data, error } = await getSupabaseAdmin().from('tv_videos').select('source_url').eq('id', id).single();
  if (error || !data?.source_url) throw error ?? new Error('Candidate source missing');
  await writeFile(output, data.source_url, 'utf8');
  console.log(JSON.stringify({ written: true, rawUrlEmitted: 0 }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
