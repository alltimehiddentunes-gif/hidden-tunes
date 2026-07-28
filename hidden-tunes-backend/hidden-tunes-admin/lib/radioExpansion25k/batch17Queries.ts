import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";

/**
 * Wave 10 — include Radio Browser stations marked broken.
 * Prior waves used hidebroken=true; many still verify playable via HTTPS/HLS/relay.
 */

const COUNTRY_CODES = [
  "US", "CA", "MX", "BR", "AR", "CO", "PE", "CL", "VE", "EC", "BO", "PY", "UY", "CR", "PA",
  "GT", "HN", "SV", "NI", "DO", "CU", "JM", "TT", "HT", "PR",
  "GB", "IE", "FR", "DE", "IT", "ES", "PT", "NL", "BE", "CH", "AT", "PL", "CZ", "SK", "HU",
  "RO", "BG", "RS", "HR", "SI", "BA", "MK", "AL", "GR", "TR", "CY", "MT", "IS", "NO", "SE",
  "DK", "FI", "EE", "LV", "LT", "UA", "BY", "MD", "RU", "GE", "AM", "AZ",
  "NG", "GH", "KE", "ZA", "EG", "MA", "TN", "DZ", "SN", "CI", "CM", "ET", "TZ", "UG", "RW",
  "AO", "MZ", "ZW", "ZM", "MW", "BW", "NA", "MG", "MU",
  "IN", "PK", "BD", "LK", "NP", "ID", "MY", "SG", "TH", "VN", "PH", "KH", "MM", "LA",
  "CN", "JP", "KR", "TW", "HK", "MN", "KZ", "UZ", "AU", "NZ", "FJ", "PG",
  "SA", "AE", "QA", "KW", "BH", "OM", "IQ", "IR", "IL", "JO", "LB", "SY", "YE",
  "AF", "CD", "CG", "SS", "SO", "LY", "SD", "YE", "PS", "XK", "ME", "LU", "MO",
] as const;

export function buildRadioExpansionBatch17Queries(): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];

  for (const kind of ["global_include_broken"] as const) {
    queries.push({
      key: `radio_browser:${kind}:wave10`,
      kind,
      value: kind,
      categorySlug: "global",
      priority: 1,
    });
  }

  // Second global pass via ascending votes to walk the long tail.
  queries.push({
    key: "radio_browser:global_include_broken:wave10-b",
    kind: "global_include_broken",
    value: "global_include_broken_b",
    categorySlug: "global",
    priority: 1,
  });

  for (const code of COUNTRY_CODES) {
    queries.push({
      key: `radio_browser:country_include_broken:${code.toLowerCase()}:wave10`,
      kind: "country_include_broken",
      value: code,
      categorySlug: "global",
      priority: 2,
    });
  }

  return queries;
}
