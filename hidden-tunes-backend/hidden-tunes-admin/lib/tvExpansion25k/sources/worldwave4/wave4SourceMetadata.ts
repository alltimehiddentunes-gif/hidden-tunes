export type Wave4SourceClassification =
  | "Independent official upstream"
  | "Independent public directory"
  | "Independent licensed provider"
  | "Derived inventory"
  | "Fixed seed list";

export type Wave4SourceApprovalStatus =
  | "discovered"
  | "legal-review-pending"
  | "technical-review-pending"
  | "approved"
  | "rejected"
  | "suspended";

export type Wave4SourceRecord = {
  adapterName: string;
  adapterId: string;
  upstreamOrganisation: string;
  baseDomain: string;
  dataOrigin: string;
  accessMethod: string;
  termsLicensingStatus: string;
  robotsOrApiRestrictions: string;
  geographicalScope: string;
  categories: string;
  estimatedCandidateCount: string;
  expectedStreamFormats: string;
  updateFrequency: string;
  deduplicationRisk: string;
  implementationComplexity: string;
  classification: Wave4SourceClassification;
  approvalStatus: Wave4SourceApprovalStatus;
  contentScope: "normal" | "mature";
};

export const WAVE4_SOURCE_RECORDS: Wave4SourceRecord[] = [
  {
    adapterName: "iptv-org GitHub country streams (wave4)",
    adapterId: "iptv-org-github-countries-wave4",
    upstreamOrganisation: "iptv-org community directory",
    baseDomain: "github.com/iptv-org/iptv",
    dataOrigin: "Per-country stream markdown files not consumed in wave3 residual pass",
    accessMethod: "GitHub raw markdown fetch at build time; JSON snapshot adapter at runtime",
    termsLicensingStatus: "Public community directory; streams remain operator responsibility",
    robotsOrApiRestrictions: "GitHub rate limits; bounded retries",
    geographicalScope: "Global country partitions",
    categories: "General, News, Sports, Culture, Regional",
    estimatedCandidateCount: "5000–15000 unseen HTTPS entries",
    expectedStreamFormats: "HLS (.m3u8), occasional DASH",
    updateFrequency: "Daily upstream commits",
    deduplicationRisk: "High — requires multi-signal dedupe against 10K+ existing catalogue",
    implementationComplexity: "Medium",
    classification: "Derived inventory",
    approvalStatus: "approved",
    contentScope: "normal",
  },
  {
    adapterName: "Country official manifests (wave4)",
    adapterId: "country-official-manifests-wave4",
    upstreamOrganisation: "Multiple national public broadcasters",
    baseDomain: "Various official CDN domains",
    dataOrigin: "Curated Wave 4 official HLS seeds",
    accessMethod: "Fixed JSON snapshot",
    termsLicensingStatus: "Official public broadcaster streams",
    robotsOrApiRestrictions: "None for direct manifest URLs",
    geographicalScope: "Europe, Americas, Asia-Pacific",
    categories: "General, News, Public service",
    estimatedCandidateCount: "200–800",
    expectedStreamFormats: "HLS",
    updateFrequency: "Manual seed refresh",
    deduplicationRisk: "Medium",
    implementationComplexity: "Low",
    classification: "Independent official upstream",
    approvalStatus: "approved",
    contentScope: "normal",
  },
  {
    adapterName: "Parliament and government (wave4)",
    adapterId: "parliament-government-wave4",
    upstreamOrganisation: "National legislatures and government broadcasters",
    baseDomain: "Official .gov / parliamentary domains",
    dataOrigin: "Curated Wave 4 parliamentary seeds",
    accessMethod: "Fixed JSON snapshot",
    termsLicensingStatus: "Official government public streams",
    robotsOrApiRestrictions: "None for direct manifests",
    geographicalScope: "Global legislatures",
    categories: "Parliament, Government",
    estimatedCandidateCount: "50–200",
    expectedStreamFormats: "HLS",
    updateFrequency: "Manual seed refresh",
    deduplicationRisk: "Medium",
    implementationComplexity: "Low",
    classification: "Independent official upstream",
    approvalStatus: "approved",
    contentScope: "normal",
  },
  {
    adapterName: "International news (wave4)",
    adapterId: "international-news-wave4",
    upstreamOrganisation: "International public broadcasters",
    baseDomain: "france24.com, dw.com, cgtn.com, nhk.or.jp",
    dataOrigin: "Curated official international news HLS endpoints",
    accessMethod: "Fixed JSON snapshot",
    termsLicensingStatus: "Official public international news streams",
    robotsOrApiRestrictions: "CDN manifest access only",
    geographicalScope: "International",
    categories: "News",
    estimatedCandidateCount: "30–150",
    expectedStreamFormats: "HLS",
    updateFrequency: "Manual seed refresh",
    deduplicationRisk: "High — overlaps with wave2 official org adapters",
    implementationComplexity: "Low",
    classification: "Independent official upstream",
    approvalStatus: "approved",
    contentScope: "normal",
  },
  {
    adapterName: "Religious and education (wave4)",
    adapterId: "religious-education-wave4",
    upstreamOrganisation: "Licensed religious and education broadcasters",
    baseDomain: "ewtn.com, nasa.gov, un.org",
    dataOrigin: "Curated official religious/education seeds",
    accessMethod: "Fixed JSON snapshot",
    termsLicensingStatus: "Official licensed or public institution streams",
    robotsOrApiRestrictions: "Manifest-only access",
    geographicalScope: "US, INT",
    categories: "Religious, Education, Science",
    estimatedCandidateCount: "20–100",
    expectedStreamFormats: "HLS",
    updateFrequency: "Manual seed refresh",
    deduplicationRisk: "Medium",
    implementationComplexity: "Low",
    classification: "Independent official upstream",
    approvalStatus: "approved",
    contentScope: "normal",
  },
  {
    adapterName: "Regional community playlists (wave4)",
    adapterId: "regional-community-wave4",
    upstreamOrganisation: "Independent regional free-TV directories",
    baseDomain: "github.com community IPTV repositories",
    dataOrigin: "Build-time fetch of permitted public M3U playlists",
    accessMethod: "Build snapshot + JSON adapter",
    termsLicensingStatus: "Public community listings; operator responsibility",
    robotsOrApiRestrictions: "GitHub/raw host rate limits",
    geographicalScope: "Regional community TV worldwide",
    categories: "Community, Regional, Local",
    estimatedCandidateCount: "1000–5000",
    expectedStreamFormats: "HLS",
    updateFrequency: "Weekly build refresh",
    deduplicationRisk: "Very high",
    implementationComplexity: "Medium",
    classification: "Independent public directory",
    approvalStatus: "approved",
    contentScope: "normal",
  },
  {
    adapterName: "Free community playlists (wave4)",
    adapterId: "free-community-playlists-wave4",
    upstreamOrganisation: "Free-TV and community IPTV maintainers",
    baseDomain: "github.com/Free-TV, raw.githubusercontent.com",
    dataOrigin: "Alternate Free-TV branches and community M3U not in wave2/3",
    accessMethod: "Build-time M3U parse",
    termsLicensingStatus: "Public free-TV community project",
    robotsOrApiRestrictions: "GitHub rate limits",
    geographicalScope: "Global",
    categories: "General, Regional",
    estimatedCandidateCount: "2000–8000",
    expectedStreamFormats: "HLS",
    updateFrequency: "Daily upstream",
    deduplicationRisk: "Very high",
    implementationComplexity: "Medium",
    classification: "Independent public directory",
    approvalStatus: "approved",
    contentScope: "normal",
  },
  {
    adapterName: "Education and culture (wave4)",
    adapterId: "education-culture-wave4",
    upstreamOrganisation: "Public cultural and education broadcasters",
    baseDomain: "arte.tv, smithsonianchannel.com",
    dataOrigin: "Curated Wave 4 culture/education seeds",
    accessMethod: "Fixed JSON snapshot",
    termsLicensingStatus: "Official public/cultural institution streams",
    robotsOrApiRestrictions: "Manifest-only",
    geographicalScope: "EU, US",
    categories: "Culture, Education",
    estimatedCandidateCount: "20–80",
    expectedStreamFormats: "HLS",
    updateFrequency: "Manual seed refresh",
    deduplicationRisk: "Medium",
    implementationComplexity: "Low",
    classification: "Independent official upstream",
    approvalStatus: "approved",
    contentScope: "normal",
  },
  {
    adapterName: "Official FAST providers (wave4)",
    adapterId: "official-fast-providers-wave4",
    upstreamOrganisation: "Samsung TV Plus and Pluto TV",
    baseDomain: "jmp2.uk, samsung.com, pluto.tv",
    dataOrigin: "Public FAST channel catalogs residual to earlier waves",
    accessMethod: "Build-time gzip JSON catalog fetch + JSON snapshot adapter",
    termsLicensingStatus: "Official free ad-supported FAST catalogs",
    robotsOrApiRestrictions: "Catalog CDN rate limits",
    geographicalScope: "Global FAST regions",
    categories: "General, Entertainment, News, Kids",
    estimatedCandidateCount: "500–3000 unseen",
    expectedStreamFormats: "HLS via FAST redirectors",
    updateFrequency: "Weekly catalog refresh",
    deduplicationRisk: "Medium — prior Pluto/Samsung adapters may overlap",
    implementationComplexity: "Medium",
    classification: "Independent licensed provider",
    approvalStatus: "approved",
    contentScope: "normal",
  },
];

export const WAVE4_INDEPENDENT_SOURCE_IDS = WAVE4_SOURCE_RECORDS.filter(
  (row) => row.classification !== "Derived inventory" && row.contentScope === "normal"
).map((row) => row.adapterId);

export const WAVE4_APPROVED_NORMAL_SOURCE_IDS = WAVE4_SOURCE_RECORDS.filter(
  (row) => row.approvalStatus === "approved" && row.contentScope === "normal"
).map((row) => row.adapterId);
