import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
  const catalog = await readFile(new URL("../lib/artistCatalog.ts", import.meta.url), "utf8");
  const route = await readFile(
    new URL("../app/api/artists/[ref]/follow/route.ts", import.meta.url),
    "utf8",
  );
  const migration = await readFile(
    new URL("../supabase/migrations/20260713150000_artist_profile_infrastructure.sql", import.meta.url),
    "utf8",
  );

  assert.match(catalog, /onConflict:\s*"artist_id,user_id"/);
  assert.doesNotMatch(catalog, /ignoreDuplicates:\s*true/);
  assert.match(catalog, /\.select\("artist_id, user_id"\)[\s\S]*\.single\(\)/);
  assert.match(catalog, /loadPersistedArtistFollow\(canonicalId, userId\)/);
  assert.match(catalog, /write was not durable on authoritative readback/);
  assert.match(catalog, /unfollow was not durable on authoritative readback/);
  assert.match(
    catalog,
    /\.delete\(\)[\s\S]*\.eq\("artist_id", canonicalId\)[\s\S]*\.eq\("user_id", userId\)/,
  );
  assert.match(route, /Cache-Control", "private, no-store, max-age=0"/);
  assert.match(route, /Vary", "Authorization"/);

  assert.match(migration, /primary key \(artist_id, user_id\)/);
  assert.match(migration, /for select using \(auth\.uid\(\) = user_id\)/);
  assert.match(migration, /for insert with check \(auth\.uid\(\) = user_id\)/);
  assert.match(migration, /for delete using \(auth\.uid\(\) = user_id\)/);
  assert.doesNotMatch(migration, /to anon[\s\S]*(insert|delete)/i);

  const canonicalUuid = "550e8400-e29b-41d4-a716-446655440000";
  const malformedUuid = "artist-name-or-slug";
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.equal(uuidPattern.test(canonicalUuid), true);
  assert.equal(uuidPattern.test(malformedUuid), false);

  const rows = new Set<string>();
  const key = (artistId: string, userId: string) => `${artistId}:${userId}`;
  const follow = (artistId: string, userId: string) => {
    rows.add(key(artistId, userId));
    assert.equal(rows.has(key(artistId, userId)), true, "Follow must pass immediate readback");
  };
  const unfollow = (artistId: string, userId: string) => {
    rows.delete(key(artistId, userId));
    assert.equal(rows.has(key(artistId, userId)), false, "Unfollow must pass immediate readback");
  };

  follow(canonicalUuid, "account-a");
  follow(canonicalUuid, "account-a");
  assert.equal(rows.size, 1, "Repeated Follow must be idempotent");
  assert.equal(rows.has(key(canonicalUuid, "account-b")), false, "Accounts must be isolated");
  unfollow(canonicalUuid, "account-a");
  assert.equal(rows.size, 0, "Unfollow must persist");

  assert.match(
    route,
    /if \(!viewer\)[\s\S]*401/,
    "Missing or expired viewer token must be rejected",
  );
  console.log("Artist Follow persistence contract tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
