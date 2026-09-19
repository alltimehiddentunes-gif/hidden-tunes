import assert from 'node:assert/strict';import fs from 'node:fs';
const sql=fs.readFileSync(new URL('../supabase/migrations/20260813150000_crossplay_phase_a.sql',import.meta.url),'utf8');
for(const token of ['enable row level security','auth.uid()','security definer','set search_path=public,pg_temp','progress version conflict',"content_type in ('music','podcast','audiobook','lecture','motivational','radio','tv')",'p_content_type in (\'radio\',\'tv\')'])assert.ok(sql.toLowerCase().includes(token.toLowerCase()),token);
assert.ok(!/service.?role/i.test(sql));assert.match(sql,/revoke all on function[\s\S]+from public,anon/);
console.log('PASS Cross Play Phase A migration static security/ordering/live-content contract');
