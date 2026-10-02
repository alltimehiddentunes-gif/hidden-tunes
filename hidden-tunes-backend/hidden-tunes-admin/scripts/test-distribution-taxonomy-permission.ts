/** Isolated security contract for the missing taxonomy permission export repair.
 * Loads the actual route and shared auth source; repositories are inert mocks.
 * Run from the Admin root. Never contacts Supabase or writes catalog data.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { runInThisContext } from "node:vm";
import { NextRequest, NextResponse } from "next/server";
import * as ts from "typescript";

type Handler = (request: NextRequest, context?: { params: Promise<{ id: string }> }) => Promise<Response>;
type ModuleExports = Record<string, unknown>;
const nativeRequire = createRequire(import.meta.url);
const root = process.cwd();
const originalFetch = globalThis.fetch;
const authEnv = {
  SUPABASE_URL: "https://taxonomy-permission-test.invalid",
  NEXT_PUBLIC_SUPABASE_URL: "https://taxonomy-permission-test.invalid",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "isolated-taxonomy-anon",
  SUPABASE_SERVICE_ROLE_KEY: "isolated-taxonomy-service",
};
const originalEnvironment = Object.fromEntries(Object.keys(authEnv).map(key => [key, process.env[key]]));
let role: string | null | undefined = "owner", accountStatus = "active";
let writes = 0, bodyReads = 0;
const lists: Array<{ statuses: string[]; includeUsage: boolean }> = [];
const network: string[] = [];
const modules = new Map<string, ModuleExports>();
const repository = {
  listMusicTaxonomyTerms: async (options: { statuses: string[]; includeUsage: boolean }) => { lists.push(options); return { terms: [], total: 0 }; },
  getMusicTaxonomyTerm: async () => null,
  listMusicTaxonomyAliases: async () => [],
  createMusicTaxonomyTerm: async () => { writes++; throw new Error("ISOLATED_VALIDATION"); },
  updateMusicTaxonomyTerm: async () => { writes++; throw new Error("ISOLATED_VALIDATION"); },
  mergeMusicTaxonomyTerm: async () => { writes++; throw new Error("ISOLATED_VALIDATION"); },
  createMusicTaxonomyAlias: async () => { writes++; throw new Error("ISOLATED_VALIDATION"); },
  deleteMusicTaxonomyAlias: async () => { writes++; throw new Error("ISOLATED_VALIDATION"); },
};
const actualAliases: Record<string, string> = {
  "@/lib/adminPermissions": "lib/adminPermissions.ts",
  "@/lib/requireUploadPermission": "lib/requireUploadPermission.ts",
  "@/lib/supabaseAdmin": "lib/supabaseAdmin.ts",
};
function load(relativePath: string): ModuleExports {
  if (modules.has(relativePath)) return modules.get(relativePath)!;
  const filename = join(root, relativePath);
  const result = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }, fileName: filename,
  });
  const module = { exports: {} as ModuleExports };
  modules.set(relativePath, module.exports);
  const requireMock = (specifier: string): unknown => {
    if (actualAliases[specifier]) return load(actualAliases[specifier]);
    if (specifier === "@/lib/musicTaxonomyRepository") return repository;
    if (specifier === "@/lib/musicTaxonomy") return { MUSIC_TAXONOMY_TYPES: ["genre"], isMusicTaxonomyType: (value: unknown) => value === "genre" };
    if (specifier === "@/lib/musicTaxonomyHttp") return { musicTaxonomyErrorResponse: (error: unknown) => {
      assert.ok(error instanceof Error && error.message === "ISOLATED_VALIDATION", "Positive permission path reaches only the harmless mocked repository");
      return NextResponse.json({ error: "Isolated validation boundary reached" }, { status: 400 });
    } };
    if (["next/server", "@supabase/supabase-js"].includes(specifier)) return nativeRequire(specifier);
    throw new Error("Unexpected dependency in isolated taxonomy permission test: " + specifier);
  };
  const wrapper = runInThisContext(`(function(require,module,exports){${result.outputText}\n})`, { filename }) as (require: typeof requireMock, module: { exports: ModuleExports }, exports: ModuleExports) => void;
  wrapper(requireMock, module, module.exports);
  modules.set(relativePath, module.exports);
  return module.exports;
}
function request(path: string, method: string, authenticated = true): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authenticated) headers.Authorization = "Bearer isolated-taxonomy-token";
  const value = new NextRequest("https://admin.hiddentunes.com" + path, { method, headers });
  Object.defineProperty(value, "json", { value: async () => { bodyReads++; return {}; } });
  return value;
}

async function main() {
  Object.assign(process.env, authEnv);
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    network.push(method + " " + url);
    assert.equal(method, "GET", "Shared permission checks perform only mocked reads");
    assert.ok(url.startsWith("https://taxonomy-permission-test.invalid/"), "No real service can be reached");
    const id = "00000000-0000-4000-8000-000000000001";
    if (url.includes("/auth/v1/user")) return Response.json({ id, aud: "authenticated", email: "isolated@example.invalid", created_at: "2020-01-01T00:00:00Z" });
    if (url.includes("/rest/v1/uploader_profiles")) return Response.json({ id, email: "isolated@example.invalid", role, status: accountStatus });
    throw new Error("Unexpected network request in isolated taxonomy permission test");
  };
  const permissions = load("lib/adminPermissions.ts");
  assert.equal(typeof permissions.canManageMusicTaxonomy, "function", "Required narrow permission export exists");
  const canManage = permissions.canManageMusicTaxonomy as (role?: string | null) => boolean;
  for (const allowed of ["owner", "admin"]) assert.equal(canManage(allowed), true, allowed);
  for (const denied of ["upload_manager", "uploader", "creator", "artist", "moderator", "unknown", "Owner", "ADMIN", "owner ", "", null, undefined]) assert.equal(canManage(denied), false, String(denied));

  const list = load("app/api/admin/music/taxonomy/route.ts");
  const detail = load("app/api/admin/music/taxonomy/[id]/route.ts");
  const merge = load("app/api/admin/music/taxonomy/[id]/merge/route.ts");
  const aliases = load("app/api/admin/music/taxonomy/[id]/aliases/route.ts");
  const actions: Array<{ handler: Handler; method: string; path: string }> = [
    { handler: list.POST as Handler, method: "POST", path: "/api/admin/music/taxonomy" },
    { handler: detail.PATCH as Handler, method: "PATCH", path: "/api/admin/music/taxonomy/isolated-term" },
    { handler: merge.POST as Handler, method: "POST", path: "/api/admin/music/taxonomy/isolated-term/merge" },
    { handler: aliases.POST as Handler, method: "POST", path: "/api/admin/music/taxonomy/isolated-term/aliases" },
    { handler: aliases.DELETE as Handler, method: "DELETE", path: "/api/admin/music/taxonomy/isolated-term/aliases?aliasId=isolated-alias" },
  ];
  async function deniedActions(expected: number, authenticated = true) {
    for (const action of actions) {
      const beforeWrites = writes, beforeReads = bodyReads;
      const response = await action.handler(request(action.path, action.method, authenticated), { params: Promise.resolve({ id: "isolated-term" }) });
      assert.equal(response.status, expected, `${role}/${accountStatus} ${action.method} ${action.path}`);
      assert.equal(writes, beforeWrites, "Denied mutation never reaches a repository method");
      assert.equal(bodyReads, beforeReads, "Denied mutation never reads its body");
    }
  }
  role = "owner";
  await deniedActions(401, false);
  for (role of ["owner", "admin"]) { accountStatus = "inactive"; await deniedActions(403); }
  accountStatus = "active";
  for (role of ["upload_manager", "uploader", "creator", "artist", "moderator", "unknown", "Owner", "ADMIN", null, undefined]) await deniedActions(403);
  for (role of ["upload_manager", "uploader", "creator"]) {
    const before = lists.length;
    const response = await (list.GET as Handler)(request("/api/admin/music/taxonomy?status=HIDDEN", "GET"));
    assert.equal(response.status, 200);
    assert.equal(lists.length, before + 1);
    assert.deepEqual(lists[lists.length - 1].statuses, ["ACTIVE"], "Non-manager cannot request hidden/deprecated/merged terms");
    assert.equal(lists[lists.length - 1].includeUsage, false, "Non-manager does not receive manager usage metadata");
  }
  for (role of ["artist", "moderator", "unknown"]) {
    const before = lists.length;
    assert.equal((await (list.GET as Handler)(request("/api/admin/music/taxonomy", "GET"))).status, 403);
    assert.equal(lists.length, before);
  }
  for (role of ["owner", "admin"]) {
    for (const action of actions) {
      const before = writes;
      const response = await action.handler(request(action.path, action.method), { params: Promise.resolve({ id: "isolated-term" }) });
      assert.equal(response.status, 400, "Active manager reaches the harmless mocked validation boundary");
      assert.equal(writes, before + 1);
    }
    assert.equal((await (list.GET as Handler)(request("/api/admin/music/taxonomy", "GET"))).status, 200);
    assert.deepEqual(lists[lists.length - 1].statuses, ["ACTIVE", "HIDDEN", "DEPRECATED", "MERGED"]);
    assert.equal(lists[lists.length - 1].includeUsage, true);
  }
  assert.ok(network.length > 0 && network.every(item => item.includes("/auth/v1/user") || item.includes("/rest/v1/uploader_profiles")));
  console.log("Taxonomy permission repair: PASS (only owner/admin; negative roles/case/null denied; actual auth chain and five actual mutation routes; anonymous401/inactive403; denied before repository/body; ACTIVE-only non-manager lists; no real network/catalog writes)");
}

void main().finally(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnvironment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});
