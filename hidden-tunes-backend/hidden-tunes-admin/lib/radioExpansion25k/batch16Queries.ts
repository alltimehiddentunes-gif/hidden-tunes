import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";

/**
 * Wave 9 — alternate country orderings + state depth.
 * Prior waves exhausted high-vote country pages after 5 duplicate-only pages;
 * ascending votes / clicks / lastcheck surfaces the long tail still in Radio Browser.
 */

const COUNTRY_CODES = [
  "AF", "AL", "DZ", "AO", "AR", "AM", "AU", "AT", "AZ", "BS", "BH", "BD", "BB", "BY", "BE", "BZ", "BJ", "BO",
  "BA", "BW", "BR", "BN", "BG", "BF", "BI", "KH", "CM", "CA", "CL", "CN", "CO", "CR", "CI", "HR", "CU", "CY",
  "CZ", "DK", "DO", "EC", "EG", "SV", "EE", "ET", "FI", "FR", "GA", "GE", "DE", "GH", "GR", "GT", "GN", "HT",
  "HN", "HK", "HU", "IS", "IN", "ID", "IR", "IQ", "IE", "IL", "IT", "JM", "JP", "JO", "KZ", "KE", "KW", "LV",
  "LB", "LY", "LT", "LU", "MG", "MY", "ML", "MT", "MX", "MD", "MA", "MZ", "MM", "NP", "NL", "NZ", "NI", "NG",
  "MK", "NO", "OM", "PK", "PA", "PY", "PE", "PH", "PL", "PT", "PR", "QA", "RO", "RU", "RW", "SA", "SN", "RS",
  "SG", "SK", "SI", "ZA", "KR", "ES", "LK", "SD", "SE", "CH", "SY", "TW", "TZ", "TH", "TG", "TT", "TN", "TR",
  "UG", "UA", "AE", "GB", "US", "UY", "UZ", "VE", "VN", "YE", "ZM", "ZW",
  "ME", "XK", "PS", "SS", "CD", "CG", "NA", "BW", "LS", "SZ", "MW", "SO", "DJ", "ER", "TD", "NE", "MR", "GM",
  "SL", "LR", "GQ", "ST", "CV", "KM", "SC", "MU", "BT", "MV", "TL", "SB", "VU", "WS", "TO", "NC", "PF", "GU",
  "AS", "VI", "CW", "AW", "SX", "MO", "LA", "MN", "TJ", "TM", "KG", "GY", "SR", "GF", "RE", "MQ", "GP",
] as const;

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida",
  "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
  "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska",
  "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas",
  "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "District of Columbia",
  "Puerto Rico",
] as const;

const CA_PROVINCES = [
  "Ontario", "Quebec", "British Columbia", "Alberta", "Manitoba", "Saskatchewan", "Nova Scotia",
  "New Brunswick", "Newfoundland and Labrador", "Prince Edward Island", "Northwest Territories", "Yukon",
  "Nunavut",
] as const;

const DE_STATES = [
  "Bayern", "Baden-Württemberg", "Berlin", "Brandenburg", "Bremen", "Hamburg", "Hessen",
  "Mecklenburg-Vorpommern", "Niedersachsen", "Nordrhein-Westfalen", "Rheinland-Pfalz", "Saarland",
  "Sachsen", "Sachsen-Anhalt", "Schleswig-Holstein", "Thüringen",
] as const;

const BR_STATES = [
  "São Paulo", "Rio de Janeiro", "Minas Gerais", "Bahia", "Paraná", "Rio Grande do Sul", "Pernambuco",
  "Ceará", "Pará", "Santa Catarina", "Goiás", "Maranhão", "Amazonas", "Espírito Santo", "Paraíba",
  "Mato Grosso", "Rio Grande do Norte", "Alagoas", "Piauí", "Distrito Federal", "Mato Grosso do Sul",
  "Sergipe", "Rondônia", "Tocantins", "Acre", "Amapá", "Roraima",
] as const;

const IN_STATES = [
  "Maharashtra", "Uttar Pradesh", "Tamil Nadu", "Karnataka", "Gujarat", "West Bengal", "Rajasthan",
  "Kerala", "Madhya Pradesh", "Andhra Pradesh", "Telangana", "Punjab", "Haryana", "Delhi", "Bihar",
  "Odisha", "Assam", "Jharkhand", "Chhattisgarh", "Uttarakhand", "Himachal Pradesh", "Goa",
] as const;

const MX_STATES = [
  "Ciudad de México", "Jalisco", "Nuevo León", "Puebla", "Guanajuato", "Veracruz", "Yucatán",
  "Quintana Roo", "Baja California", "Chihuahua", "Sonora", "Coahuila", "Tamaulipas", "Sinaloa",
  "Michoacán", "Oaxaca", "Chiapas", "Guerrero", "Hidalgo", "Querétaro", "Morelos", "Tabasco",
] as const;

const TAG_LONG_TAIL = [
  "news", "talk", "sports", "music", "pop", "rock", "jazz", "classical", "folk", "world",
  "electronic", "dance", "hip hop", "rap", "rnb", "soul", "blues", "country", "gospel",
  "christian", "islamic", "community", "university", "local", "regional", "national",
  "oldies", "80s", "90s", "metal", "punk", "indie", "ambient", "lofi", "reggae", "salsa",
  "cumbia", "bachata", "reggaeton", "afrobeats", "bollywood", "k-pop", "public radio",
] as const;

function slug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
}

function pushStates(
  queries: RadioExpansionQuery[],
  country: string,
  states: readonly string[],
  priority: number
) {
  for (const state of states) {
    queries.push({
      key: `radio_browser:state:${country.toLowerCase()}:${slug(state)}:wave9`,
      kind: "state",
      value: `${country}|${state}`,
      categorySlug: "local",
      priority,
    });
  }
}

export function buildRadioExpansionBatch16Queries(): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];

  for (const code of COUNTRY_CODES) {
    queries.push(
      {
        key: `radio_browser:country_votes_asc:${code.toLowerCase()}:wave9`,
        kind: "country_votes_asc",
        value: code,
        categorySlug: "global",
        priority: 1,
      },
      {
        key: `radio_browser:country_clicks:${code.toLowerCase()}:wave9`,
        kind: "country_clicks",
        value: code,
        categorySlug: "global",
        priority: 2,
      },
      {
        key: `radio_browser:country_lastcheck:${code.toLowerCase()}:wave9`,
        kind: "country_lastcheck",
        value: code,
        categorySlug: "global",
        priority: 2,
      },
      {
        key: `radio_browser:country_name:${slug(code)}:wave9`,
        kind: "country_name",
        value: code,
        categorySlug: "global",
        priority: 3,
      }
    );
  }

  pushStates(queries, "US", US_STATES, 1);
  pushStates(queries, "CA", CA_PROVINCES, 1);
  pushStates(queries, "DE", DE_STATES, 2);
  pushStates(queries, "BR", BR_STATES, 2);
  pushStates(queries, "IN", IN_STATES, 2);
  pushStates(queries, "MX", MX_STATES, 2);

  for (const tag of TAG_LONG_TAIL) {
    queries.push(
      {
        key: `radio_browser:tag_votes_asc:${slug(tag)}:wave9`,
        kind: "tag_votes_asc",
        value: tag,
        categorySlug: slug(tag),
        priority: 3,
      },
      {
        key: `radio_browser:tag_clicks:${slug(tag)}:wave9`,
        kind: "tag_clicks",
        value: tag,
        categorySlug: slug(tag),
        priority: 3,
      }
    );
  }

  return queries.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
}
