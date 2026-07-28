import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";

/**
 * Wave 2 — Regional depth: secondary cities, remaining provinces/territories,
 * and country×local-genre combos for mid-coverage markets.
 */

const SECONDARY_CITIES: Array<{ country: string; city: string }> = [
  { country: "US", city: "Boise" }, { country: "US", city: "Spokane" }, { country: "US", city: "Tulsa" },
  { country: "US", city: "Omaha" }, { country: "US", city: "Des Moines" }, { country: "US", city: "Madison" },
  { country: "US", city: "Grand Rapids" }, { country: "US", city: "Knoxville" }, { country: "US", city: "Chattanooga" },
  { country: "US", city: "Birmingham" }, { country: "US", city: "Mobile" }, { country: "US", city: "Little Rock" },
  { country: "US", city: "Shreveport" }, { country: "US", city: "Baton Rouge" }, { country: "US", city: "Jackson" },
  { country: "US", city: "Charleston" }, { country: "US", city: "Columbia" }, { country: "US", city: "Greensboro" },
  { country: "US", city: "Richmond" }, { country: "US", city: "Norfolk" }, { country: "US", city: "Buffalo" },
  { country: "US", city: "Rochester" }, { country: "US", city: "Syracuse" }, { country: "US", city: "Albany" },
  { country: "US", city: "Providence" }, { country: "US", city: "Hartford" }, { country: "US", city: "Worcester" },
  { country: "US", city: "Springfield" }, { country: "US", city: "Dayton" }, { country: "US", city: "Toledo" },
  { country: "US", city: "Akron" }, { country: "US", city: "Fort Wayne" }, { country: "US", city: "South Bend" },
  { country: "US", city: "Peoria" }, { country: "US", city: "Rockford" }, { country: "US", city: "Green Bay" },
  { country: "US", city: "Fargo" }, { country: "US", city: "Sioux Falls" }, { country: "US", city: "Billings" },
  { country: "US", city: "Missoula" }, { country: "US", city: "Boise" }, { country: "US", city: "Eugene" },
  { country: "US", city: "Salem" }, { country: "US", city: "Santa Fe" }, { country: "US", city: "Tucson" },
  { country: "US", city: "El Paso" }, { country: "US", city: "Corpus Christi" }, { country: "US", city: "Lubbock" },
  { country: "US", city: "Amarillo" }, { country: "US", city: "Waco" }, { country: "US", city: "Beaumont" },
  { country: "CA", city: "London" }, { country: "CA", city: "Kitchener" }, { country: "CA", city: "Windsor" },
  { country: "CA", city: "Sherbrooke" }, { country: "CA", city: "Trois-Rivières" }, { country: "CA", city: "Kelowna" },
  { country: "CA", city: "Kamloops" }, { country: "CA", city: "Prince George" }, { country: "CA", city: "Thunder Bay" },
  { country: "CA", city: "Sudbury" }, { country: "CA", city: "Moncton" }, { country: "CA", city: "Saint John" },
  { country: "GB", city: "Nottingham" }, { country: "GB", city: "Leicester" }, { country: "GB", city: "Coventry" },
  { country: "GB", city: "Hull" }, { country: "GB", city: "Plymouth" }, { country: "GB", city: "Southampton" },
  { country: "GB", city: "Brighton" }, { country: "GB", city: "Reading" }, { country: "GB", city: "Aberdeen" },
  { country: "GB", city: "Dundee" }, { country: "GB", city: "Swansea" }, { country: "GB", city: "Newport" },
  { country: "DE", city: "Bremen" }, { country: "DE", city: "Karlsruhe" }, { country: "DE", city: "Mannheim" },
  { country: "DE", city: "Augsburg" }, { country: "DE", city: "Wiesbaden" }, { country: "DE", city: "Münster" },
  { country: "DE", city: "Aachen" }, { country: "DE", city: "Kiel" }, { country: "DE", city: "Freiburg" },
  { country: "FR", city: "Rennes" }, { country: "FR", city: "Reims" }, { country: "FR", city: "Toulon" },
  { country: "FR", city: "Grenoble" }, { country: "FR", city: "Dijon" }, { country: "FR", city: "Angers" },
  { country: "FR", city: "Nîmes" }, { country: "FR", city: "Clermont-Ferrand" }, { country: "FR", city: "Tours" },
  { country: "IN", city: "Surat" }, { country: "IN", city: "Vadodara" }, { country: "IN", city: "Rajkot" },
  { country: "IN", city: "Coimbatore" }, { country: "IN", city: "Madurai" }, { country: "IN", city: "Tiruchirappalli" },
  { country: "IN", city: "Mysore" }, { country: "IN", city: "Mangalore" }, { country: "IN", city: "Hubli" },
  { country: "IN", city: "Visakhapatnam" }, { country: "IN", city: "Vijayawada" }, { country: "IN", city: "Warangal" },
  { country: "IN", city: "Ranchi" }, { country: "IN", city: "Jamshedpur" }, { country: "IN", city: "Raipur" },
  { country: "IN", city: "Bhubaneswar" }, { country: "IN", city: "Cuttack" }, { country: "IN", city: "Dehradun" },
  { country: "BR", city: "Campinas" }, { country: "BR", city: "Santos" }, { country: "BR", city: "São José dos Campos" },
  { country: "BR", city: "Niterói" }, { country: "BR", city: "Juiz de Fora" }, { country: "BR", city: "Uberlândia" },
  { country: "BR", city: "Florianópolis" }, { country: "BR", city: "Joinville" }, { country: "BR", city: "Londrina" },
  { country: "BR", city: "Maringá" }, { country: "BR", city: "Natal" }, { country: "BR", city: "Maceió" },
  { country: "BR", city: "João Pessoa" }, { country: "BR", city: "Teresina" }, { country: "BR", city: "Campo Grande" },
  { country: "MX", city: "Toluca" }, { country: "MX", city: "Morelia" }, { country: "MX", city: "Culiacán" },
  { country: "MX", city: "Hermosillo" }, { country: "MX", city: "Chihuahua" }, { country: "MX", city: "Saltillo" },
  { country: "MX", city: "Veracruz" }, { country: "MX", city: "Acapulco" }, { country: "MX", city: "Oaxaca" },
  { country: "NG", city: "Ilorin" }, { country: "NG", city: "Warri" }, { country: "NG", city: "Calabar" },
  { country: "NG", city: "Uyo" }, { country: "NG", city: "Makurdi" }, { country: "NG", city: "Maiduguri" },
  { country: "NG", city: "Zaria" }, { country: "NG", city: "Sokoto" }, { country: "NG", city: "Onitsha" },
  { country: "PH", city: "Bacolod" }, { country: "PH", city: "General Santos" }, { country: "PH", city: "Zamboanga" },
  { country: "PH", city: "Angeles" }, { country: "PH", city: "Tarlac" }, { country: "PH", city: "Naga" },
  { country: "ID", city: "Malang" }, { country: "ID", city: "Bogor" }, { country: "ID", city: "Depok" },
  { country: "ID", city: "Tangerang" }, { country: "ID", city: "Bekasi" }, { country: "ID", city: "Pontianak" },
  { country: "ID", city: "Balikpapan" }, { country: "ID", city: "Manado" }, { country: "ID", city: "Padang" },
  { country: "AU", city: "Geelong" }, { country: "AU", city: "Wollongong" }, { country: "AU", city: "Townsville" },
  { country: "AU", city: "Cairns" }, { country: "AU", city: "Toowoomba" }, { country: "AU", city: "Ballarat" },
  { country: "AU", city: "Bendigo" }, { country: "AU", city: "Launceston" }, { country: "AU", city: "Alice Springs" },
];

const REGION_DEPTH_COUNTRIES = [
  "US", "CA", "MX", "BR", "AR", "CO", "PE", "CL", "GB", "IE", "FR", "DE", "ES", "IT", "PT",
  "NL", "BE", "PL", "RO", "UA", "TR", "IN", "PK", "BD", "ID", "PH", "MY", "TH", "VN", "NG",
  "KE", "GH", "ZA", "EG", "MA", "AU", "NZ", "JP", "KR", "CN",
] as const;

const REGION_TAGS = [
  "local", "regional", "community", "news", "talk", "sports", "religious", "gospel",
  "university", "student", "folk", "traditional", "world", "indie", "alternative",
] as const;

function slug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
}

export function buildRadioExpansionBatch9Queries(): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];

  for (const entry of SECONDARY_CITIES) {
    queries.push({
      key: `radio_browser:name:${entry.country}:${slug(entry.city)}:wave2`,
      kind: "name",
      value: entry.city,
      categorySlug: "local",
      priority: 1,
    });
    queries.push({
      key: `radio_browser:combo:${entry.country}:${slug(entry.city)}:wave2`,
      kind: "combo",
      value: `${entry.country}|${entry.city}`,
      categorySlug: "local",
      priority: 2,
    });
  }

  for (const country of REGION_DEPTH_COUNTRIES) {
    for (const tag of REGION_TAGS) {
      queries.push({
        key: `radio_browser:combo:${country}:${slug(tag)}:wave2`,
        kind: "combo",
        value: `${country}|${tag}`,
        categorySlug: slug(tag),
        priority: 1,
      });
    }
  }

  const seen = new Set<string>();
  return queries
    .sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key))
    .filter((q) => {
      if (seen.has(q.key)) return false;
      seen.add(q.key);
      return true;
    });
}
