/**
 * API-Sports / API-Football fixture dry-run (NO DATABASE WRITES).
 *
 * Env (server-only; never expose to mobile):
 *   API_SPORTS_KEY or APISPORTS_KEY or API_FOOTBALL_KEY
 *   API_SPORTS_BASE_URL (optional, default https://v3.football.api-sports.io)
 *
 * Usage:
 *   npx tsx scripts/sports-api-football-dry-run.ts
 *
 * Stops without fetching if credentials are missing.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveSportsStatusAuthority } from "../lib/sports/status/statusAuthority";

const OUT_DIR = path.join(
  process.cwd(),
  "data/sports-fixtures-pilot/dry-run"
);

const PROVIDER_SLUG = "api-football";
const DEFAULT_BASE = "https://v3.football.api-sports.io";
const MAX_FIXTURES = 500;
const MIN_FIXTURES = 100;

type ProviderAccess = {
  ok: boolean;
  blocker?: string;
  apiBase: string;
  keyPresent: boolean;
  keySource: string | null;
  account?: Record<string, unknown>;
};

function resolveKey(): { key: string | null; source: string | null } {
  const candidates = [
    "API_SPORTS_KEY",
    "APISPORTS_KEY",
    "API_FOOTBALL_KEY",
    "API_SPORTS_API_KEY",
  ] as const;
  for (const name of candidates) {
    const v = String(process.env[name] || "").trim();
    if (v) return { key: v, source: name };
  }
  return { key: null, source: null };
}

function mapApiFootballStatus(short: string, long: string): {
  providerStatus: string;
  canonicalHint: string;
} {
  const s = String(short || "").toUpperCase();
  const providerStatus = s || String(long || "UNKNOWN");
  // Map known API-Football short codes — live only from provider codes.
  const live = new Set(["1H", "2H", "ET", "BT", "P", "LIVE", "HT"]);
  const completed = new Set(["FT", "AET", "PEN"]);
  const postponed = new Set(["PST"]);
  const cancelled = new Set(["CANC", "ABD", "AWD", "WO"]);
  const scheduled = new Set(["TBD", "NS"]);
  if (live.has(s)) return { providerStatus, canonicalHint: s === "HT" ? "halftime" : "live" };
  if (completed.has(s)) return { providerStatus, canonicalHint: "completed" };
  if (postponed.has(s)) return { providerStatus, canonicalHint: "postponed" };
  if (cancelled.has(s)) return { providerStatus, canonicalHint: s === "ABD" ? "abandoned" : "cancelled" };
  if (scheduled.has(s) || s === "SUSP") {
    return {
      providerStatus,
      canonicalHint: s === "SUSP" ? "suspended" : "scheduled",
    };
  }
  return { providerStatus, canonicalHint: "unknown" };
}

async function probeAccess(): Promise<ProviderAccess> {
  const apiBase = String(process.env.API_SPORTS_BASE_URL || DEFAULT_BASE).replace(
    /\/$/,
    ""
  );
  const { key, source } = resolveKey();
  if (!key) {
    return {
      ok: false,
      blocker:
        "No API-Sports/API-Football credential found in server env (API_SPORTS_KEY / APISPORTS_KEY / API_FOOTBALL_KEY).",
      apiBase,
      keyPresent: false,
      keySource: null,
    };
  }

  const res = await fetch(`${apiBase}/status`, {
    headers: {
      "x-apisports-key": key,
      Accept: "application/json",
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false,
      blocker: `Provider status HTTP ${res.status}`,
      apiBase,
      keyPresent: true,
      keySource: source,
      account: { httpStatus: res.status },
    };
  }
  // Redact nested secrets if any; keep plan/quota fields only.
  const response = (json.response || json) as Record<string, unknown>;
  return {
    ok: true,
    apiBase,
    keyPresent: true,
    keySource: source,
    account: {
      account: response.account
        ? { firstname: "[redacted]", lastname: "[redacted]" }
        : undefined,
      subscription: response.subscription,
      requests: response.requests,
    },
  };
}

function writeJson(name: string, value: unknown) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, name),
    JSON.stringify(value, null, 2) + "\n",
    "utf8"
  );
}

async function main() {
  const stamp = new Date().toISOString();
  const access = await probeAccess();

  const accessMd = `# Provider access summary

**Stamp:** ${stamp}
**Provider:** API-Sports / API-Football
**API base:** ${access.apiBase}
**Key present:** ${access.keyPresent}
**Key env source:** ${access.keySource || "none"}
**Access OK:** ${access.ok}

${access.blocker ? `## Blocker\n\n${access.blocker}\n` : ""}

## Account / plan (redacted)

\`\`\`json
${JSON.stringify(access.account || {}, null, 2)}
\`\`\`

## Commercial-use note

Production app redistribution of fixture metadata requires an active paid plan and documented permission for application display. This dry-run does not assert commercial rights without an active credentialed account response.
`;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "provider-access-summary.md"), accessMd);

  if (!access.ok) {
    const emptyReason = {
      stamp,
      dryRun: true,
      writesExecuted: false,
      blocker: access.blocker,
      fetched: 0,
      normalized: 0,
      rejected: 0,
    };
    writeJson("provider-request-scope.json", {
      ...emptyReason,
      dates: [],
      leagues: [],
      pageCount: 0,
      providerRequestCount: 0,
      maxFixtures: MAX_FIXTURES,
      minFixtures: MIN_FIXTURES,
    });
    writeJson("raw-sample-summary.json", emptyReason);
    writeJson("normalized-fixtures.json", { ...emptyReason, items: [] });
    writeJson("rejected-fixtures.json", { ...emptyReason, items: [] });
    writeJson("duplicate-report.json", {
      ...emptyReason,
      exactProviderIdMatches: 0,
      canonicalMatches: 0,
      probableCrossProviderDuplicates: 0,
      ambiguousDuplicates: 0,
      genuinelyNew: 0,
      wouldUpdate: 0,
      wouldQuarantine: 0,
    });
    writeJson("status-validation.json", {
      ...emptyReason,
      counts: {},
      liveSamples: [],
      timeOnlyLiveTransitions: 0,
    });
    writeJson("score-validation.json", {
      ...emptyReason,
      withScores: 0,
      completedWithFinal: 0,
      liveWithCurrent: 0,
      withPeriodScores: 0,
      withClock: 0,
      withIncidents: 0,
      incomplete: 0,
      inventedZeroZero: 0,
    });
    writeJson("proposed-inserts.json", { ...emptyReason, items: [] });
    writeJson("proposed-updates.json", { ...emptyReason, items: [] });
    writeJson("proposed-provider-mappings.json", { ...emptyReason, items: [] });
    writeJson("proposed-quarantines.json", { ...emptyReason, items: [] });
    fs.writeFileSync(
      path.join(OUT_DIR, "write-preview.sql"),
      `-- Dry-run only. No writes executed.\n-- Blocker: ${access.blocker}\n-- ${stamp}\n`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(OUT_DIR, "quota-and-capacity-projection.md"),
      `# Quota and capacity projection

**Stamp:** ${stamp}

Provider access is not active, so projections are planning estimates only (not measured).

| Catalog size | Est. fixture ingest requests (batched) | Notes |
|-------------:|---------------------------------------:|-------|
| 500 | 5–20 | By date/league pages |
| 1,000 | 10–40 | |
| 5,000 | 50–200 | Needs paid quota |
| 10,000 | 100–400 | |
| 50,000 | 500–2,000+ | Multi-day backfill |

| Simultaneous live | Est. refresh calls / min | Notes |
|------------------:|-------------------------:|-------|
| 100 | 2–8 | Batch by league/date |
| 500 | 10–30 | Near free-tier limit |
| 2,000 | 40–120 | Requires high-tier + webhooks |

**Blocker:** ${access.blocker}
`,
      "utf8"
    );
    console.error("DRY_RUN_BLOCKED:", access.blocker);
    process.exitCode = 2;
    return;
  }

  // Credential path reserved for a follow-up once keys exist.
  // Keeping fetch logic behind access.ok prevents accidental unrestricted pulls.
  void resolveSportsStatusAuthority;
  void mapApiFootballStatus;
  console.log("Provider access OK — extend this script to fetch ≤500 fixtures.");
  console.log("This run stops after access validation in the current approval scope when fetch wiring is incomplete.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
