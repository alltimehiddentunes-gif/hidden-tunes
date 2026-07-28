import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";

/** Wave 6 — deeper pagination on obscure orderings + regional name variants. */

const REGIONAL_NAMES = [
  "Radio Nacional", "Radio Nacional de", "Radio Publica", "Radio Pública", "Radio Municipale",
  "Radio Communautaire", "Radio Comunitaria", "Radio Comunitária", "Radio Locale", "Radio Local",
  "Radio Regionale", "Radio Régionale", "Radio Regional", "Radio University", "Radio Universidad",
  "Campus Radio", "College Radio", "Student Radio", "Community Radio", "Public Radio",
  "BBC", "NPR", "CBC", "ABC Radio", "RNZ", "SABC", "All India Radio", "NHK", "KBS",
  "France Inter", "France Info", "France Culture", "Deutschlandfunk", "ORF", "SRF",
  "RAI", "RNE", "RTP", "NRK", "SVT", "YLE", "DR Radio", "Polskie Radio", "Cesky Rozhlas",
  "Radio Free", "Voice of", "Radio Islam", "Radio Maria", "Radio Vatican", "Vatican Radio",
  "Jazz FM", "Classic FM", "Talk Radio", "News Radio", "Sports Radio", "Hit Radio",
  "Hot FM", "Cool FM", "Love Radio", "Kiss FM", "Energy FM", "Power FM", "Star FM",
] as const;

const MORE_COUNTRIES = [
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
] as const;

const TAGS = [
  "news", "talk", "sports", "music", "pop", "rock", "jazz", "classical", "folk", "world",
  "electronic", "dance", "hip hop", "rap", "rnb", "soul", "blues", "country", "gospel",
  "christian", "islamic", "community", "university", "local", "regional", "national",
] as const;

function slug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
}

export function buildRadioExpansionBatch13Queries(): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];

  for (const kind of ["lastcheck_asc", "votes_asc", "clicks_asc", "lastchange_asc", "name_order"] as const) {
    queries.push({
      key: `radio_browser:${kind}:wave6`,
      kind,
      value: kind,
      categorySlug: "global",
      priority: 1,
    });
  }

  for (const name of REGIONAL_NAMES) {
    queries.push({
      key: `radio_browser:name:${slug(name)}:wave6`,
      kind: "name",
      value: name,
      categorySlug: "world",
      priority: 2,
    });
  }

  for (const code of MORE_COUNTRIES) {
    for (const tag of TAGS) {
      queries.push({
        key: `radio_browser:combo:${code.toLowerCase()}:${slug(tag)}:wave6`,
        kind: "combo",
        value: `${code}|${tag}`,
        categorySlug: tag,
        priority: 3,
      });
    }
  }

  return queries;
}
