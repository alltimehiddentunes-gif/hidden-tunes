import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";

/** Wave 5 — additional worldwide city / capital name depth for gap closure. */

const CITIES: Array<{ country: string; city: string }> = [
  { country: "NG", city: "Lagos" }, { country: "NG", city: "Kano" }, { country: "NG", city: "Ibadan" },
  { country: "NG", city: "Abuja" }, { country: "NG", city: "Port Harcourt" }, { country: "NG", city: "Benin City" },
  { country: "KE", city: "Nairobi" }, { country: "KE", city: "Mombasa" }, { country: "KE", city: "Kisumu" },
  { country: "GH", city: "Accra" }, { country: "GH", city: "Kumasi" }, { country: "GH", city: "Tamale" },
  { country: "ZA", city: "Johannesburg" }, { country: "ZA", city: "Cape Town" }, { country: "ZA", city: "Durban" },
  { country: "ZA", city: "Pretoria" }, { country: "ZA", city: "Bloemfontein" }, { country: "ZA", city: "Port Elizabeth" },
  { country: "EG", city: "Cairo" }, { country: "EG", city: "Alexandria" }, { country: "EG", city: "Giza" },
  { country: "MA", city: "Casablanca" }, { country: "MA", city: "Rabat" }, { country: "MA", city: "Marrakech" },
  { country: "TZ", city: "Dar es Salaam" }, { country: "TZ", city: "Dodoma" }, { country: "TZ", city: "Arusha" },
  { country: "ET", city: "Addis Ababa" }, { country: "ET", city: "Dire Dawa" }, { country: "UG", city: "Kampala" },
  { country: "RW", city: "Kigali" }, { country: "SN", city: "Dakar" }, { country: "CI", city: "Abidjan" },
  { country: "CM", city: "Douala" }, { country: "CM", city: "Yaounde" }, { country: "AO", city: "Luanda" },
  { country: "MZ", city: "Maputo" }, { country: "ZW", city: "Harare" }, { country: "ZM", city: "Lusaka" },
  { country: "IN", city: "Mumbai" }, { country: "IN", city: "Delhi" }, { country: "IN", city: "Bengaluru" },
  { country: "IN", city: "Chennai" }, { country: "IN", city: "Kolkata" }, { country: "IN", city: "Hyderabad" },
  { country: "IN", city: "Pune" }, { country: "IN", city: "Ahmedabad" }, { country: "IN", city: "Jaipur" },
  { country: "IN", city: "Lucknow" }, { country: "IN", city: "Kanpur" }, { country: "IN", city: "Nagpur" },
  { country: "BD", city: "Dhaka" }, { country: "BD", city: "Chittagong" }, { country: "PK", city: "Karachi" },
  { country: "PK", city: "Lahore" }, { country: "PK", city: "Islamabad" }, { country: "PK", city: "Rawalpindi" },
  { country: "ID", city: "Jakarta" }, { country: "ID", city: "Surabaya" }, { country: "ID", city: "Bandung" },
  { country: "ID", city: "Medan" }, { country: "ID", city: "Makassar" }, { country: "ID", city: "Semarang" },
  { country: "PH", city: "Manila" }, { country: "PH", city: "Cebu" }, { country: "PH", city: "Davao" },
  { country: "VN", city: "Hanoi" }, { country: "VN", city: "Ho Chi Minh" }, { country: "VN", city: "Da Nang" },
  { country: "TH", city: "Bangkok" }, { country: "TH", city: "Chiang Mai" }, { country: "TH", city: "Phuket" },
  { country: "MY", city: "Kuala Lumpur" }, { country: "MY", city: "Penang" }, { country: "MY", city: "Johor Bahru" },
  { country: "CN", city: "Shanghai" }, { country: "CN", city: "Beijing" }, { country: "CN", city: "Guangzhou" },
  { country: "CN", city: "Shenzhen" }, { country: "CN", city: "Chengdu" }, { country: "CN", city: "Wuhan" },
  { country: "JP", city: "Tokyo" }, { country: "JP", city: "Osaka" }, { country: "JP", city: "Nagoya" },
  { country: "JP", city: "Sapporo" }, { country: "JP", city: "Fukuoka" }, { country: "KR", city: "Seoul" },
  { country: "KR", city: "Busan" }, { country: "KR", city: "Incheon" }, { country: "TW", city: "Taipei" },
  { country: "BR", city: "Sao Paulo" }, { country: "BR", city: "Rio de Janeiro" }, { country: "BR", city: "Brasilia" },
  { country: "BR", city: "Salvador" }, { country: "BR", city: "Fortaleza" }, { country: "BR", city: "Belo Horizonte" },
  { country: "BR", city: "Manaus" }, { country: "BR", city: "Curitiba" }, { country: "BR", city: "Recife" },
  { country: "MX", city: "Mexico City" }, { country: "MX", city: "Guadalajara" }, { country: "MX", city: "Monterrey" },
  { country: "MX", city: "Puebla" }, { country: "MX", city: "Tijuana" }, { country: "MX", city: "Leon" },
  { country: "AR", city: "Buenos Aires" }, { country: "AR", city: "Cordoba" }, { country: "AR", city: "Rosario" },
  { country: "CO", city: "Bogota" }, { country: "CO", city: "Medellin" }, { country: "CO", city: "Cali" },
  { country: "PE", city: "Lima" }, { country: "PE", city: "Arequipa" }, { country: "CL", city: "Santiago" },
  { country: "VE", city: "Caracas" }, { country: "EC", city: "Quito" }, { country: "EC", city: "Guayaquil" },
  { country: "BO", city: "La Paz" }, { country: "BO", city: "Santa Cruz" }, { country: "PY", city: "Asuncion" },
  { country: "UY", city: "Montevideo" }, { country: "CR", city: "San Jose" }, { country: "PA", city: "Panama City" },
  { country: "DO", city: "Santo Domingo" }, { country: "GT", city: "Guatemala City" }, { country: "HN", city: "Tegucigalpa" },
  { country: "NI", city: "Managua" }, { country: "SV", city: "San Salvador" }, { country: "CU", city: "Havana" },
  { country: "JM", city: "Kingston" }, { country: "TT", city: "Port of Spain" },
  { country: "US", city: "New York" }, { country: "US", city: "Los Angeles" }, { country: "US", city: "Chicago" },
  { country: "US", city: "Houston" }, { country: "US", city: "Phoenix" }, { country: "US", city: "Philadelphia" },
  { country: "US", city: "San Antonio" }, { country: "US", city: "San Diego" }, { country: "US", city: "Dallas" },
  { country: "US", city: "San Jose" }, { country: "US", city: "Austin" }, { country: "US", city: "Jacksonville" },
  { country: "US", city: "Fort Worth" }, { country: "US", city: "Columbus" }, { country: "US", city: "Charlotte" },
  { country: "US", city: "Indianapolis" }, { country: "US", city: "San Francisco" }, { country: "US", city: "Seattle" },
  { country: "US", city: "Denver" }, { country: "US", city: "Washington" }, { country: "US", city: "Boston" },
  { country: "US", city: "Nashville" }, { country: "US", city: "Detroit" }, { country: "US", city: "Oklahoma City" },
  { country: "US", city: "Portland" }, { country: "US", city: "Las Vegas" }, { country: "US", city: "Memphis" },
  { country: "US", city: "Louisville" }, { country: "US", city: "Baltimore" }, { country: "US", city: "Milwaukee" },
  { country: "US", city: "Albuquerque" }, { country: "US", city: "Tucson" }, { country: "US", city: "Fresno" },
  { country: "US", city: "Sacramento" }, { country: "US", city: "Mesa" }, { country: "US", city: "Kansas City" },
  { country: "US", city: "Atlanta" }, { country: "US", city: "Miami" }, { country: "US", city: "Raleigh" },
  { country: "US", city: "Omaha" }, { country: "US", city: "Colorado Springs" }, { country: "US", city: "Virginia Beach" },
  { country: "CA", city: "Toronto" }, { country: "CA", city: "Montreal" }, { country: "CA", city: "Vancouver" },
  { country: "CA", city: "Calgary" }, { country: "CA", city: "Edmonton" }, { country: "CA", city: "Ottawa" },
  { country: "CA", city: "Winnipeg" }, { country: "CA", city: "Quebec City" }, { country: "CA", city: "Hamilton" },
  { country: "GB", city: "London" }, { country: "GB", city: "Birmingham" }, { country: "GB", city: "Manchester" },
  { country: "GB", city: "Glasgow" }, { country: "GB", city: "Liverpool" }, { country: "GB", city: "Leeds" },
  { country: "GB", city: "Edinburgh" }, { country: "GB", city: "Bristol" }, { country: "GB", city: "Sheffield" },
  { country: "DE", city: "Berlin" }, { country: "DE", city: "Hamburg" }, { country: "DE", city: "Munich" },
  { country: "DE", city: "Cologne" }, { country: "DE", city: "Frankfurt" }, { country: "DE", city: "Stuttgart" },
  { country: "DE", city: "Dusseldorf" }, { country: "DE", city: "Leipzig" }, { country: "DE", city: "Dortmund" },
  { country: "FR", city: "Paris" }, { country: "FR", city: "Marseille" }, { country: "FR", city: "Lyon" },
  { country: "FR", city: "Toulouse" }, { country: "FR", city: "Nice" }, { country: "FR", city: "Nantes" },
  { country: "IT", city: "Rome" }, { country: "IT", city: "Milan" }, { country: "IT", city: "Naples" },
  { country: "IT", city: "Turin" }, { country: "IT", city: "Palermo" }, { country: "IT", city: "Genoa" },
  { country: "ES", city: "Madrid" }, { country: "ES", city: "Barcelona" }, { country: "ES", city: "Valencia" },
  { country: "ES", city: "Seville" }, { country: "ES", city: "Zaragoza" }, { country: "ES", city: "Malaga" },
  { country: "PL", city: "Warsaw" }, { country: "PL", city: "Krakow" }, { country: "PL", city: "Lodz" },
  { country: "PL", city: "Wroclaw" }, { country: "PL", city: "Poznan" }, { country: "PL", city: "Gdansk" },
  { country: "RU", city: "Moscow" }, { country: "RU", city: "Saint Petersburg" }, { country: "RU", city: "Novosibirsk" },
  { country: "RU", city: "Yekaterinburg" }, { country: "RU", city: "Kazan" }, { country: "UA", city: "Kyiv" },
  { country: "UA", city: "Kharkiv" }, { country: "UA", city: "Odesa" }, { country: "TR", city: "Istanbul" },
  { country: "TR", city: "Ankara" }, { country: "TR", city: "Izmir" }, { country: "TR", city: "Bursa" },
  { country: "AU", city: "Sydney" }, { country: "AU", city: "Melbourne" }, { country: "AU", city: "Brisbane" },
  { country: "AU", city: "Perth" }, { country: "AU", city: "Adelaide" }, { country: "NZ", city: "Auckland" },
  { country: "NZ", city: "Wellington" }, { country: "NZ", city: "Christchurch" },
];

function slug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
}

export function buildRadioExpansionBatch12Queries(): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];

  for (const { country, city } of CITIES) {
    queries.push({
      key: `radio_browser:name:${country.toLowerCase()}:${slug(city)}:wave5`,
      kind: "name",
      value: city,
      categorySlug: "local",
      priority: 1,
    });
    queries.push({
      key: `radio_browser:state:${country.toLowerCase()}:${slug(city)}:wave5`,
      kind: "state",
      value: `${country}|${city}`,
      categorySlug: "local",
      priority: 2,
    });
  }

  for (const kind of ["lastcheck_asc", "votes_asc", "clicks_asc", "lastchange_asc", "name_order"] as const) {
    queries.push({
      key: `radio_browser:${kind}:wave5`,
      kind,
      value: kind,
      categorySlug: "global",
      priority: 1,
    });
  }

  return queries;
}
