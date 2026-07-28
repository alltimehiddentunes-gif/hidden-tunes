import { RADIO_MATURE_EXPANSION_SOURCE_KEY } from "@/lib/radioMature/constants";

export type MatureRadioSourceApprovalStatus =
  | "approved"
  | "manual_review"
  | "partnership_required"
  | "permission_required"
  | "blocked_terms"
  | "rejected"
  | "exhausted";

export type MatureRadioSourceRecord = {
  source_key: string;
  source_name: string;
  provider_name: string;
  official_url: string;
  discovery_url: string;
  country_or_region: string;
  languages: string;
  rights_status: string;
  rights_notes: string;
  automation_status: "automatic" | "manual_only" | "blocked";
  embedding_status: string;
  playback_status: string;
  approval_status: MatureRadioSourceApprovalStatus;
  requires_manual_review: boolean;
  adapter_name: string;
};

export const MATURE_RADIO_SOURCE_REGISTRY: MatureRadioSourceRecord[] = [
  {
    source_key: RADIO_MATURE_EXPANSION_SOURCE_KEY,
    source_name: "Radio Browser API (mature-filtered worldwide)",
    provider_name: "radio-browser.info community",
    official_url: "https://www.radio-browser.info/",
    discovery_url: "https://docs.radio-browser.info/",
    country_or_region: "Global",
    languages: "Multi-language",
    rights_status: "approved",
    rights_notes:
      "Aggregated metadata placed in public domain by maintainer; stream rights remain with broadcasters; click-count on playback required.",
    automation_status: "automatic",
    embedding_status: "none at directory level",
    playback_status: "stream-per-broadcaster",
    approval_status: "approved",
    requires_manual_review: false,
    adapter_name: "radioBrowserMatureWorldwideV1",
  },
  {
    source_key: "laut-fm-erotic-search",
    source_name: "laut.fm Search API",
    provider_name: "laut.ag",
    official_url: "https://laut.fm/",
    discovery_url: "https://api.laut.fm/documentation/search",
    country_or_region: "DACH + global UGC",
    languages: "German, English",
    rights_status: "partnership_required",
    rights_notes: "Third-party stream embedding prohibited without partnership (AGB).",
    automation_status: "blocked",
    embedding_status: "prohibited_without_partnership",
    playback_status: "blocked",
    approval_status: "partnership_required",
    requires_manual_review: true,
    adapter_name: "lautFmMatureSearch",
  },
  {
    source_key: "streema-onlineradiobox-mytuner",
    source_name: "Streema / OnlineRadioBox / myTuner",
    provider_name: "Commercial aggregators",
    official_url: "https://mytuner-radio.com/",
    discovery_url: "",
    country_or_region: "Global",
    languages: "Multi",
    rights_status: "blocked",
    rights_notes: "Scraping and bulk extraction prohibited by terms.",
    automation_status: "blocked",
    embedding_status: "platform_player_required",
    playback_status: "blocked",
    approval_status: "blocked_terms",
    requires_manual_review: true,
    adapter_name: "",
  },
  {
    source_key: "tunein-iheart",
    source_name: "TuneIn / iHeart",
    provider_name: "TuneIn",
    official_url: "https://tunein.com/",
    discovery_url: "",
    country_or_region: "Global",
    languages: "Multi",
    rights_status: "rejected",
    rights_notes: "No authorized consumer redistribution API.",
    automation_status: "blocked",
    embedding_status: "syndication_agreement_required",
    playback_status: "blocked",
    approval_status: "rejected",
    requires_manual_review: true,
    adapter_name: "",
  },
  {
    source_key: "live365-mature",
    source_name: "Live365",
    provider_name: "Live365",
    official_url: "https://live365.com/",
    discovery_url: "",
    country_or_region: "US/CA/MX",
    languages: "English, Spanish",
    rights_status: "partnership_required",
    rights_notes: "No authorized bulk API; partnership required.",
    automation_status: "blocked",
    embedding_status: "platform_required",
    playback_status: "blocked",
    approval_status: "partnership_required",
    requires_manual_review: true,
    adapter_name: "",
  },
  {
    source_key: "rautemusik-sex-network",
    source_name: "RauteMusik.FM Sex channels",
    provider_name: "RauteMusik.FM",
    official_url: "https://www.rautemusik.fm/",
    discovery_url: "https://guide.rautemusik.fm/guide/direkte-rautemusik-einschaltadressen",
    country_or_region: "Germany / EU",
    languages: "German",
    rights_status: "permission_required",
    rights_notes: "Fixed seed list; commercial in-app playback requires written permission.",
    automation_status: "manual_only",
    embedding_status: "unknown",
    playback_status: "manual_review",
    approval_status: "permission_required",
    requires_manual_review: true,
    adapter_name: "rautemusikSexFixedSeed",
  },
  {
    source_key: "kiss-fm-sex-time",
    source_name: "KISS FM Sex Time",
    provider_name: "KISS FM Berlin",
    official_url: "https://www.kissfm.de/streams/unsere-kiss-streams/sex-time",
    discovery_url: "",
    country_or_region: "Germany",
    languages: "German",
    rights_status: "permission_required",
    rights_notes: "Licensed commercial sub-stream.",
    automation_status: "manual_only",
    embedding_status: "commercial_license_required",
    playback_status: "manual_review",
    approval_status: "permission_required",
    requires_manual_review: true,
    adapter_name: "",
  },
  {
    source_key: "full-swap-radio-live",
    source_name: "Full Swap Radio Network",
    provider_name: "Full Swap Radio",
    official_url: "https://fullswapradio.com/",
    discovery_url: "https://fullswapradio.com/listen-live/",
    country_or_region: "United States",
    languages: "English",
    rights_status: "permission_required",
    rights_notes: "18+ gated lifestyle network; broadcaster permission required.",
    automation_status: "manual_only",
    embedding_status: "unknown",
    playback_status: "manual_review",
    approval_status: "manual_review",
    requires_manual_review: true,
    adapter_name: "",
  },
];

export function getApprovedMatureRadioSources() {
  return MATURE_RADIO_SOURCE_REGISTRY.filter((row) => row.approval_status === "approved");
}

export function getMatureRadioSource(sourceKey: string) {
  return MATURE_RADIO_SOURCE_REGISTRY.find((row) => row.source_key === sourceKey) || null;
}

export function isAutomaticMatureRadioSource(sourceKey: string) {
  const row = getMatureRadioSource(sourceKey);
  return row?.approval_status === "approved" && row.automation_status === "automatic";
}
