import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";

/**
 * Wave 11 — deep worldwide long-tail.
 * Full ISO-ish country set × include-broken + obscure global orderings.
 */

const COUNTRY_CODES = [
  "AF","AL","DZ","AO","AR","AM","AU","AT","AZ","BS","BH","BD","BB","BY","BE","BZ","BJ","BO",
  "BA","BW","BR","BN","BG","BF","BI","KH","CM","CA","CL","CN","CO","CR","CI","HR","CU","CY",
  "CZ","DK","DO","EC","EG","SV","EE","ET","FI","FR","GA","GE","DE","GH","GR","GT","GN","HT",
  "HN","HK","HU","IS","IN","ID","IR","IQ","IE","IL","IT","JM","JP","JO","KZ","KE","KW","LV",
  "LB","LY","LT","LU","MG","MY","ML","MT","MX","MD","MA","MZ","MM","NP","NL","NZ","NI","NG",
  "MK","NO","OM","PK","PA","PY","PE","PH","PL","PT","PR","QA","RO","RU","RW","SA","SN","RS",
  "SG","SK","SI","ZA","KR","ES","LK","SD","SE","CH","SY","TW","TZ","TH","TG","TT","TN","TR",
  "UG","UA","AE","GB","US","UY","UZ","VE","VN","YE","ZM","ZW","ME","XK","PS","SS","CD","CG",
  "NA","LS","SZ","MW","SO","DJ","ER","TD","NE","MR","GM","SL","LR","GQ","ST","CV","KM","SC",
  "MU","BT","MV","TL","SB","VU","WS","TO","NC","PF","GU","AS","VI","CW","AW","SX","MO","LA",
  "MN","TJ","TM","KG","GY","SR","GF","RE","MQ","GP","FO","GL","LI","AD","MC","SM","VA","IM",
  "JE","GG","AX","XK",
] as const;

export function buildRadioExpansionBatch18Queries(): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];

  for (const kind of [
    "votes_asc",
    "clicks_asc",
    "lastcheck_asc",
    "lastchange_asc",
    "name_order",
    "global_include_broken",
  ] as const) {
    queries.push({
      key: `radio_browser:${kind}:wave11-deep`,
      kind,
      value: kind,
      categorySlug: "global",
      priority: 1,
    });
  }

  for (const code of COUNTRY_CODES) {
    queries.push({
      key: `radio_browser:country_include_broken:${code.toLowerCase()}:wave11`,
      kind: "country_include_broken",
      value: code,
      categorySlug: "global",
      priority: 2,
    });
    queries.push({
      key: `radio_browser:country_votes_asc:${code.toLowerCase()}:wave11`,
      kind: "country_votes_asc",
      value: code,
      categorySlug: "global",
      priority: 3,
    });
  }

  return queries;
}
