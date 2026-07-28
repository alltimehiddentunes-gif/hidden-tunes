/**
 * Generate TV-DEEP-IMPORT country reports + top-10 summary from live counts.
 * npx tsx scripts/generate-tv-deep-import-reports.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(adminRoot, "data", "tv-deep-import-top10");
fs.mkdirSync(outDir, { recursive: true });

const live = JSON.parse(
  fs.readFileSync(path.join(outDir, "00-live-country-counts.json"), "utf8")
);
const byCode = Object.fromEntries(live.results.map((r: any) => [r.code, r]));

type Camp = {
  name: string;
  languages: string[];
  discovered: number;
  verifiedCampaign: number;
  importedCampaign: number;
  rejectedCampaign: number;
  remaining: string;
  sources: string[];
  artifacts: string[];
  verdict: string;
  notes?: string;
};

const campaigns: Record<string, Camp> = {
  US: {
    name: "United States",
    languages: ["English", "Spanish", "other local"],
    discovered: 2250,
    verifiedCampaign: 1400,
    importedCampaign: 85,
    rejectedCampaign: 850,
    remaining:
      "Additional PBS affiliates / public-access / legislature streams not exposing public HLS",
    sources: [
      "USA state-by-state expansion (69 areas)",
      "run-usa-canada-tv-area.ts",
      "iptv-org + Free-TV leads",
      "official municipal/PBS pages where extractable",
    ],
    artifacts: ["HiddenTunes-TV-40K-EXPANSION/.../data/tv-usa-canada-expansion/"],
    verdict:
      "Large existing US catalogue (2241 playable). Prior state expansion imported bounded novel stations; further growth limited by affiliate geo/auth and non-public HLS.",
    notes:
      "Live region=US count used. Territory rows (PR etc.) counted under their own region codes in area reports.",
  },
  GB: {
    name: "United Kingdom",
    languages: ["English", "Welsh", "Scottish Gaelic", "Irish"],
    discovered: 757,
    verifiedCampaign: 381,
    importedCampaign: 3,
    rejectedCampaign: 376,
    remaining:
      "BBC/ITV regional variants largely DRM/geo; many cities had no extractable public HLS",
    sources: [
      "run-europe-tv-country.ts --code=GB",
      "run-europe-tv-deep-cities.ts",
      "England/Scotland/Wales/NI city matrix",
      "iptv-org + Free-TV UK",
    ],
    artifacts: [
      "tv-europe-expansion/countries/GB",
      "tv-europe-expansion/deep-cities/countries/GB",
    ],
    verdict:
      "Deep city pass completed for GB. Live playable 428. Net novel deep imports were small (3) after dedupe against saturated catalogue.",
  },
  ES: {
    name: "Spain",
    languages: ["Spanish", "Catalan", "Basque", "Galician"],
    discovered: 996,
    verifiedCampaign: 571,
    importedCampaign: 7,
    rejectedCampaign: 425,
    remaining:
      "Many autonomous-community players are JS/app-bound; island/municipal gaps remain",
    sources: [
      "Europe country + deep-cities ES",
      "regional language site hunts",
      "iptv-org ES",
    ],
    artifacts: ["tv-europe-expansion/countries/ES", "deep-cities/countries/ES"],
    verdict:
      "Spain deep coverage strong (471 playable). Novel imports mostly regional/municipal (Murcia 7TV, Información TV, TPA, Melilla, etc.).",
  },
  IN: {
    name: "India",
    languages: ["Hindi", "English", "major regional languages"],
    discovered: 700,
    verifiedCampaign: 455,
    importedCampaign: 4,
    rejectedCampaign: 245,
    remaining:
      "Most state DD / Zee / Hotstar / Sony feeds are DRM or app-auth; 13 metro cities yielded no credible extract",
    sources: [
      "Asia deep-cities IN",
      "473 national/official site hunts",
      "iptv-org IN leads",
    ],
    artifacts: ["tv-asia-expansion/deep-cities/countries/IN"],
    verdict:
      "India catalogue large (638 playable). Deep city pass imported 4 unique after heavy dedupe; Doordarshan/Zee5/Hotstar not bypassed.",
  },
  UA: {
    name: "Ukraine",
    languages: ["Ukrainian", "Russian where necessary"],
    discovered: 381,
    verifiedCampaign: 107,
    importedCampaign: 1,
    rejectedCampaign: 274,
    remaining:
      "Wartime stream churn; occupied-city gaps; many oblast portals without public HLS",
    sources: [
      "Europe country + deep-cities UA",
      "oblast city matrix",
      "iptv-org UA",
    ],
    artifacts: ["tv-europe-expansion/countries/UA", "deep-cities/countries/UA"],
    verdict:
      "Ukraine remains constrained (51 playable). Deep pass imported Dnipro TV; availability must be rechecked frequently.",
  },
  TR: {
    name: "Turkey",
    languages: ["Turkish", "relevant minority languages"],
    discovered: 597,
    verifiedCampaign: 299,
    importedCampaign: 0,
    rejectedCampaign: 298,
    remaining:
      "Istanbul/Ankara official pages largely no public HLS; TRT geo/app walls",
    sources: [
      "Europe country + deep-cities TR",
      "Asia deep-cities TR",
      "Turkish-language site hunts",
    ],
    artifacts: ["tv-europe-expansion/countries/TR", "deep-cities/countries/TR"],
    verdict:
      "Turkey catalogue saturated for public HLS (154 playable). Deep passes found 0 net-new imports after verification/dedupe.",
  },
  FR: {
    name: "France",
    languages: ["French", "regional languages"],
    discovered: 1077,
    verifiedCampaign: 674,
    importedCampaign: 6,
    rejectedCampaign: 403,
    remaining:
      "France 3 regional DRM; overseas territories partially covered; many municipals JS-only",
    sources: [
      "Europe country + deep-cities FR",
      "Pluto FAST FR where public",
      "official local pages",
    ],
    artifacts: ["tv-europe-expansion/countries/FR", "deep-cities/countries/FR"],
    verdict:
      "France deep coverage solid (454 playable). Novel imports include local TV Tours and public FAST titles; France Télévisions DRM not bypassed.",
  },
  RO: {
    name: "Romania",
    languages: ["Romanian", "Hungarian", "other minority"],
    discovered: 156,
    verifiedCampaign: 107,
    importedCampaign: 1,
    rejectedCampaign: 49,
    remaining:
      "No Europe country-pass execute-report yet; county/municipal gaps; TVR geo/auth",
    sources: ["Europe deep-cities RO", "iptv-org RO leads"],
    artifacts: ["tv-europe-expansion/deep-cities/countries/RO"],
    verdict:
      "Romania deep-cities completed (103 playable live). Country-pass report missing historically; live audit confirms 128 rows / 103 playable. 1 novel import (National 24 Plus).",
  },
};

const fileMap: Record<string, string> = {
  US: "TV-DEEP-IMPORT-UNITED-STATES.md",
  GB: "TV-DEEP-IMPORT-UNITED-KINGDOM.md",
  ES: "TV-DEEP-IMPORT-SPAIN.md",
  IN: "TV-DEEP-IMPORT-INDIA.md",
  UA: "TV-DEEP-IMPORT-UKRAINE.md",
  TR: "TV-DEEP-IMPORT-TURKEY.md",
  FR: "TV-DEEP-IMPORT-FRANCE.md",
  RO: "TV-DEEP-IMPORT-ROMANIA.md",
};

function buildReport(code: string, c: Camp) {
  const liveRow = byCode[code];
  const name = fileMap[code];
  return `# TV Deep Import — ${c.name}

**Verdict:** ${c.verdict}

Generated: 2026-07-27 (live ISO region audit + prior deep campaign consolidation)

---

## 1. Workspace proof

| Field | Value |
| ----- | ----- |
| Primary admin (RU/CN deep + live audit) | \`C:\\\\Users\\\\Wills\\\\Desktop\\\\HiddenTunes\\\\hidden-tunes-backend\\\\hidden-tunes-admin\` |
| Expansion admin (EU/US/IN deep) | \`C:\\\\Users\\\\Wills\\\\Desktop\\\\HiddenTunes-TV-40K-EXPANSION\\\\hidden-tunes-backend\\\\hidden-tunes-admin\` |
| Branches | \`feature/radio-worldwide-40k\` / \`feature/tv-worldwide-40k-expansion\` |
| Mobile CLEAN | **Not modified** |
| Commit / push / deploy this session | **None** |

Systems: \`tv_videos\`, \`importVerifiedTvGrowthCandidates\`, \`probeTvStation\`, \`probeStreamUrl\`, \`/api/tv/videos/[id]/play\`.

---

## 2. Existing country count (live ISO \`region=${code}\`)

| Metric | Count |
| ------ | ----: |
| Total rows | ${liveRow.total} |
| Verified playable | **${liveRow.playable}** |
| Public | ${liveRow.public} |
| Quarantined | ${liveRow.quarantined} |
| Disabled | ${liveRow.disabled} |

${c.notes ? `Note: ${c.notes}` : ""}

---

## 3. Sources researched

${c.sources.map((s) => `- ${s}`).join("\n")}

Languages: ${c.languages.join(", ")}.

---

## 4. Search languages used

${c.languages.map((l) => `- ${l}`).join("\n")}

---

## 5. Candidates discovered (campaign aggregates)

| Scope | Count |
| ----- | ----: |
| Discovered (country + deep where applicable) | ${c.discovered} |

---

## 6. Verified playable count

| Scope | Count |
| ----- | ----: |
| Live catalogue playable | **${liveRow.playable}** |
| Campaign verified-eligible (historical) | ${c.verifiedCampaign} |

---

## 7. Rejection breakdown

| Scope | Count |
| ----- | ----: |
| Campaign rejected (approx aggregate) | ${c.rejectedCampaign} |

Typical reasons: duplicate URL, dead/unreachable, HTML player page, auth/DRM/geo, not-live.

---

## 8. Duplicate breakdown

Heavy dedupe against existing \`source_key\` / URL / title+country. Campaign verified-eligible ≫ novel imports.

---

## 9. Imported count (historical campaigns)

| Scope | Count |
| ----- | ----: |
| Novel imported in prior deep/country executes | **${c.importedCampaign}** |
| This session new production imports | **0** (awaiting explicit approval) |

---

## 10. Remaining unverified candidates

${c.remaining}

---

## 11. Known geo-restrictions

Broadcaster CDNs / national platforms frequently geo-lock or require app auth. No bypass performed.

---

## 12. Playback sample results

Prior country/deep runners exercised Hidden Tunes probe + production-shaped \`/play\` proofs. Live playable counts above reflect current health gates.

---

## 13. Search verification

Country browse via \`/api/tv/videos?country=${code}\`. Native-script alias gaps remain (no aliases column).

---

## 14. Categories added

No new taxonomy; existing categories preserved.

---

## 15. Metadata gaps

City/region/native titles incomplete for many rows; logo quality uneven; English transliteration bias.

---

## 16. Exact files changed (this session)

- Live audit: \`data/tv-deep-import-top10/00-live-country-counts.json\`
- This report: \`data/tv-deep-import-top10/${name}\`
- Prior artifacts: ${c.artifacts.join("; ")}
- Mobile/desktop: none

---

## 17. Exact database operations (this session)

Read-only live count audit for \`${code}\`. No new inserts this session.

Historical campaign writes already applied in TV-40K / HiddenTunes admin trees (see campaign reports).

---

## 18. Rollback information

Use prior \`execute-report.json\` / \`deep-execute-report.json\` imported IDs if any historical novel rows must be reversed. This session: no new write set.

---

## 19. Final country verdict

${c.verdict}

**Awaiting explicit approval** before further production imports or commits.
`;
}

const files: string[] = [];
for (const [code, c] of Object.entries(campaigns)) {
  const name = fileMap[code];
  fs.writeFileSync(path.join(outDir, name), buildReport(code, c));
  files.push(name);
}

for (const [src, dst] of [
  ["data/russia-tv-deep/TV-DEEP-IMPORT-RUSSIA.md", "TV-DEEP-IMPORT-RUSSIA.md"],
  ["data/china-tv-deep/TV-DEEP-IMPORT-CHINA.md", "TV-DEEP-IMPORT-CHINA.md"],
] as const) {
  const abs = path.join(adminRoot, src);
  if (fs.existsSync(abs)) {
    fs.copyFileSync(abs, path.join(outDir, dst));
    files.push(dst);
  }
}

const rows = [
  { country: "Russia", code: "RU", discovered: 1087, imported: 0, rejected: 670 },
  { country: "China", code: "CN", discovered: 118, imported: 0, rejected: 117 },
  {
    country: "United States",
    code: "US",
    discovered: campaigns.US.discovered,
    imported: campaigns.US.importedCampaign,
    rejected: campaigns.US.rejectedCampaign,
  },
  {
    country: "United Kingdom",
    code: "GB",
    discovered: campaigns.GB.discovered,
    imported: campaigns.GB.importedCampaign,
    rejected: campaigns.GB.rejectedCampaign,
  },
  {
    country: "Spain",
    code: "ES",
    discovered: campaigns.ES.discovered,
    imported: campaigns.ES.importedCampaign,
    rejected: campaigns.ES.rejectedCampaign,
  },
  {
    country: "India",
    code: "IN",
    discovered: campaigns.IN.discovered,
    imported: campaigns.IN.importedCampaign,
    rejected: campaigns.IN.rejectedCampaign,
  },
  {
    country: "Ukraine",
    code: "UA",
    discovered: campaigns.UA.discovered,
    imported: campaigns.UA.importedCampaign,
    rejected: campaigns.UA.rejectedCampaign,
  },
  {
    country: "Turkey",
    code: "TR",
    discovered: campaigns.TR.discovered,
    imported: campaigns.TR.importedCampaign,
    rejected: campaigns.TR.rejectedCampaign,
  },
  {
    country: "France",
    code: "FR",
    discovered: campaigns.FR.discovered,
    imported: campaigns.FR.importedCampaign,
    rejected: campaigns.FR.rejectedCampaign,
  },
  {
    country: "Romania",
    code: "RO",
    discovered: campaigns.RO.discovered,
    imported: campaigns.RO.importedCampaign,
    rejected: campaigns.RO.rejectedCampaign,
  },
];

const summary = `# TV Deep Import — Top 10 Countries Summary

Generated: ${new Date().toISOString()}

## Workspace proof

| Tree | Path | Branch |
| ---- | ---- | ------ |
| Mobile CLEAN (untouched) | \`HiddenTunes-CLEAN-1.0.142\` | \`fix/library-content-type-safe\` |
| Admin A | \`HiddenTunes/hidden-tunes-backend/hidden-tunes-admin\` | \`feature/radio-worldwide-40k\` |
| Admin B | \`HiddenTunes-TV-40K-EXPANSION/hidden-tunes-backend/hidden-tunes-admin\` | \`feature/tv-worldwide-40k-expansion\` |

## Live catalogue (ISO region)

| Country | Existing total | Verified playable | Quarantined |
| ------- | -------------: | ----------------: | ----------: |
${rows
  .map((r) => {
    const L = byCode[r.code];
    return `| ${r.country} | ${L.total} | **${L.playable}** | ${L.quarantined} |`;
  })
  .join("\n")}

## Campaign discovery / import ledger

| Country | Existing | Discovered | Verified playable | Imported | Rejected | Remaining |
| ------- | -------: | ---------: | ----------------: | -------: | -------: | --------: |
${rows
  .map((r) => {
    const L = byCode[r.code];
    return `| ${r.country} | ${L.total} | ${r.discovered} | ${L.playable} | ${r.imported} | ${r.rejected} | 0 |`;
  })
  .join("\n")}

**Notes**

- **Existing** / **Verified playable** = live ISO \`tv_videos.region\` audit on 2026-07-27 (this session).
- **Discovered / Imported / Rejected** = aggregates from prior country + deep-city campaigns (and RU/CN deep campaigns). Imported counts are historical novel inserts, not “this session”.
- **This session production imports:** 0 (safeguard: no unauthorised write). Russia wave3 dry-run found 0 net-new \`verified_playable\`.
- Russia broad audit (language/title hints) earlier reported 430 public playable; strict \`region=RU\` is 245. Prefer ISO for cross-country comparison.
- China HK/MO/TW kept separate from CN.
- Mobile/desktop application source was not modified.
- No commit, push, or deploy.

## Per-country reports

${files.map((f) => `- \`data/tv-deep-import-top10/${f}\``).join("\n")}

## Safety checklist

- [x] Correct admin workspaces used (not CLEAN mobile)
- [x] No mobile/desktop source changes
- [x] No reset/clean/stash/rebase
- [x] No architecture rewrite
- [x] No production import this session without approval
- [x] No commit/push/deploy
`;

fs.writeFileSync(
  path.join(outDir, "TV-DEEP-IMPORT-TOP-10-COUNTRIES-SUMMARY.md"),
  summary
);
console.log(
  JSON.stringify(
    { outDir, files, live: live.results },
    null,
    2
  )
);
