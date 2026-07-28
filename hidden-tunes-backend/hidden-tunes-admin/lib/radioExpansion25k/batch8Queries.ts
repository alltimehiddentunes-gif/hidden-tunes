import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";

/**
 * Wave 1 — Coverage repair: underrepresented countries + capital/major/secondary cities
 * queried via Radio Browser name/state/tag search. City assignment remains null unless
 * source state/name metadata confidently supports it (no fabricated geography).
 */

type CityQuery = {
  country: string;
  city: string;
  /** Optional Radio Browser state string when known. */
  state?: string;
};

const UNDERREPRESENTED_COUNTRY_CODES = [
  "AF", "AO", "BJ", "BF", "BI", "KH", "CM", "CI", "ET", "GA", "GH", "GN", "HT", "KE", "MG",
  "ML", "MZ", "MM", "NG", "RW", "SN", "TG", "TZ", "UG", "ZM", "ZW", "BD", "LK", "NP", "LA",
  "MN", "KZ", "UZ", "GE", "AM", "AZ", "BY", "MD", "BA", "MK", "AL", "ME", "IS", "LU", "MT",
  "CY", "EE", "LV", "LT", "SK", "SI", "HR", "BG", "RO", "RS", "BO", "PY", "UY", "EC", "GT",
  "HN", "NI", "SV", "CR", "PA", "DO", "JM", "TT", "BB", "BZ", "GY", "FJ", "PG", "BN", "MO",
  "NA", "BW", "LS", "SZ", "MW", "SO", "DJ", "ER", "SS", "TD", "NE", "MR", "GM", "SL", "LR",
  "CG", "CD", "CF", "GQ", "ST", "CV", "KM", "SC", "MU", "YT", "RE", "GF", "SR", "FK",
] as const;

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming", "District of Columbia", "Puerto Rico", "Guam",
  "American Samoa", "U.S. Virgin Islands", "Northern Mariana Islands",
] as const;

const BR_STATES = [
  "São Paulo", "Rio de Janeiro", "Minas Gerais", "Bahia", "Paraná", "Rio Grande do Sul",
  "Pernambuco", "Ceará", "Pará", "Santa Catarina", "Goiás", "Maranhão", "Paraíba",
  "Espírito Santo", "Amazonas", "Mato Grosso", "Mato Grosso do Sul", "Piauí", "Alagoas",
  "Rio Grande do Norte", "Distrito Federal", "Sergipe", "Rondônia", "Tocantins", "Acre",
  "Amapá", "Roraima",
] as const;

const IN_STATES = [
  "Maharashtra", "Uttar Pradesh", "Karnataka", "Tamil Nadu", "West Bengal", "Gujarat",
  "Rajasthan", "Kerala", "Telangana", "Andhra Pradesh", "Madhya Pradesh", "Punjab",
  "Haryana", "Bihar", "Odisha", "Assam", "Jharkhand", "Chhattisgarh", "Delhi",
  "Himachal Pradesh", "Uttarakhand", "Goa", "Jammu and Kashmir", "Tripura", "Meghalaya",
  "Manipur", "Nagaland", "Mizoram", "Arunachal Pradesh", "Sikkim", "Puducherry",
] as const;

const NG_STATES = [
  "Lagos", "Kano", "Rivers", "Oyo", "Kaduna", "Abuja", "Federal Capital Territory",
  "Anambra", "Enugu", "Delta", "Edo", "Imo", "Ogun", "Ondo", "Osoun", "Osun", "Kwara",
  "Plateau", "Benue", "Cross River", "Akwa Ibom", "Borno", "Sokoto", "Katsina",
] as const;

const ZA_PROVINCES = [
  "Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape", "Limpopo", "Mpumalanga",
  "North West", "Free State", "Northern Cape",
] as const;

const PH_REGIONS = [
  "Metro Manila", "National Capital Region", "Cebu", "Davao", "Iloilo", "Pampanga",
  "Batangas", "Laguna", "Cavite", "Bulacan", "Negros Occidental", "Pangasinan",
  "Rizal", "Quezon", "Zamboanga", "Baguio", "Iligan", "Cagayan de Oro",
] as const;

const ID_PROVINCES = [
  "Jakarta", "West Java", "East Java", "Central Java", "Bali", "North Sumatra",
  "South Sulawesi", "Riau", "Banten", "Yogyakarta", "West Sumatra", "Lampung",
  "South Sumatra", "East Kalimantan", "West Kalimantan", "Aceh", "Papua",
] as const;

const WORLD_CITIES: CityQuery[] = [
  // Africa
  { country: "NG", city: "Lagos" }, { country: "NG", city: "Abuja" }, { country: "NG", city: "Ibadan" },
  { country: "NG", city: "Kano" }, { country: "NG", city: "Port Harcourt" }, { country: "NG", city: "Benin City" },
  { country: "NG", city: "Enugu" }, { country: "NG", city: "Abeokuta" }, { country: "NG", city: "Jos" },
  { country: "KE", city: "Nairobi" }, { country: "KE", city: "Mombasa" }, { country: "KE", city: "Kisumu" },
  { country: "KE", city: "Nakuru" }, { country: "KE", city: "Eldoret" },
  { country: "GH", city: "Accra" }, { country: "GH", city: "Kumasi" }, { country: "GH", city: "Tamale" },
  { country: "GH", city: "Takoradi" }, { country: "GH", city: "Cape Coast" },
  { country: "ZA", city: "Johannesburg" }, { country: "ZA", city: "Cape Town" }, { country: "ZA", city: "Durban" },
  { country: "ZA", city: "Pretoria" }, { country: "ZA", city: "Port Elizabeth" }, { country: "ZA", city: "Bloemfontein" },
  { country: "ZA", city: "Soweto" }, { country: "ZA", city: "Pietermaritzburg" },
  { country: "TZ", city: "Dar es Salaam" }, { country: "TZ", city: "Dodoma" }, { country: "TZ", city: "Arusha" },
  { country: "TZ", city: "Mwanza" }, { country: "UG", city: "Kampala" }, { country: "UG", city: "Gulu" },
  { country: "UG", city: "Mbarara" }, { country: "RW", city: "Kigali" }, { country: "ET", city: "Addis Ababa" },
  { country: "ET", city: "Dire Dawa" }, { country: "ET", city: "Mekelle" }, { country: "SN", city: "Dakar" },
  { country: "SN", city: "Thiès" }, { country: "CI", city: "Abidjan" }, { country: "CI", city: "Yamoussoukro" },
  { country: "CI", city: "Bouaké" }, { country: "CM", city: "Douala" }, { country: "CM", city: "Yaoundé" },
  { country: "EG", city: "Cairo" }, { country: "EG", city: "Alexandria" }, { country: "EG", city: "Giza" },
  { country: "MA", city: "Casablanca" }, { country: "MA", city: "Rabat" }, { country: "MA", city: "Marrakesh" },
  { country: "MA", city: "Fes" }, { country: "TN", city: "Tunis" }, { country: "TN", city: "Sfax" },
  { country: "DZ", city: "Algiers" }, { country: "DZ", city: "Oran" }, { country: "DZ", city: "Constantine" },
  { country: "AO", city: "Luanda" }, { country: "MZ", city: "Maputo" }, { country: "ZM", city: "Lusaka" },
  { country: "ZW", city: "Harare" }, { country: "ZW", city: "Bulawayo" }, { country: "BW", city: "Gaborone" },
  { country: "NA", city: "Windhoek" }, { country: "MW", city: "Lilongwe" }, { country: "MG", city: "Antananarivo" },
  { country: "MU", city: "Port Louis" }, { country: "CD", city: "Kinshasa" }, { country: "CD", city: "Lubumbashi" },
  { country: "CG", city: "Brazzaville" }, { country: "GA", city: "Libreville" }, { country: "BJ", city: "Cotonou" },
  { country: "BF", city: "Ouagadougou" }, { country: "ML", city: "Bamako" }, { country: "NE", city: "Niamey" },
  { country: "TG", city: "Lomé" }, { country: "GN", city: "Conakry" }, { country: "SL", city: "Freetown" },
  { country: "LR", city: "Monrovia" }, { country: "GM", city: "Banjul" }, { country: "SO", city: "Mogadishu" },
  { country: "SD", city: "Khartoum" }, { country: "SS", city: "Juba" }, { country: "LY", city: "Tripoli" },
  { country: "LY", city: "Benghazi" },
  // Americas
  { country: "BR", city: "São Paulo" }, { country: "BR", city: "Rio de Janeiro" }, { country: "BR", city: "Brasília" },
  { country: "BR", city: "Salvador" }, { country: "BR", city: "Fortaleza" }, { country: "BR", city: "Belo Horizonte" },
  { country: "BR", city: "Manaus" }, { country: "BR", city: "Curitiba" }, { country: "BR", city: "Recife" },
  { country: "BR", city: "Porto Alegre" }, { country: "BR", city: "Belém" }, { country: "BR", city: "Goiânia" },
  { country: "MX", city: "Mexico City" }, { country: "MX", city: "Guadalajara" }, { country: "MX", city: "Monterrey" },
  { country: "MX", city: "Puebla" }, { country: "MX", city: "Tijuana" }, { country: "MX", city: "León" },
  { country: "MX", city: "Cancún" }, { country: "MX", city: "Mérida" }, { country: "MX", city: "Querétaro" },
  { country: "AR", city: "Buenos Aires" }, { country: "AR", city: "Córdoba" }, { country: "AR", city: "Rosario" },
  { country: "AR", city: "Mendoza" }, { country: "AR", city: "La Plata" }, { country: "CO", city: "Bogotá" },
  { country: "CO", city: "Medellín" }, { country: "CO", city: "Cali" }, { country: "CO", city: "Barranquilla" },
  { country: "CO", city: "Cartagena" }, { country: "PE", city: "Lima" }, { country: "PE", city: "Arequipa" },
  { country: "PE", city: "Cusco" }, { country: "CL", city: "Santiago" }, { country: "CL", city: "Valparaíso" },
  { country: "CL", city: "Concepción" }, { country: "EC", city: "Quito" }, { country: "EC", city: "Guayaquil" },
  { country: "BO", city: "La Paz" }, { country: "BO", city: "Santa Cruz" }, { country: "BO", city: "Cochabamba" },
  { country: "PY", city: "Asunción" }, { country: "UY", city: "Montevideo" }, { country: "VE", city: "Caracas" },
  { country: "VE", city: "Maracaibo" }, { country: "VE", city: "Valencia" }, { country: "GT", city: "Guatemala City" },
  { country: "HN", city: "Tegucigalpa" }, { country: "HN", city: "San Pedro Sula" }, { country: "SV", city: "San Salvador" },
  { country: "NI", city: "Managua" }, { country: "CR", city: "San José" }, { country: "PA", city: "Panama City" },
  { country: "DO", city: "Santo Domingo" }, { country: "DO", city: "Santiago" }, { country: "JM", city: "Kingston" },
  { country: "JM", city: "Montego Bay" }, { country: "TT", city: "Port of Spain" }, { country: "BB", city: "Bridgetown" },
  { country: "HT", city: "Port-au-Prince" }, { country: "CU", city: "Havana" }, { country: "CU", city: "Santiago de Cuba" },
  { country: "PR", city: "San Juan" }, { country: "GY", city: "Georgetown" }, { country: "SR", city: "Paramaribo" },
  { country: "CA", city: "Toronto" }, { country: "CA", city: "Montreal" }, { country: "CA", city: "Vancouver" },
  { country: "CA", city: "Calgary" }, { country: "CA", city: "Edmonton" }, { country: "CA", city: "Ottawa" },
  { country: "CA", city: "Winnipeg" }, { country: "CA", city: "Quebec City" }, { country: "CA", city: "Halifax" },
  { country: "CA", city: "Victoria" }, { country: "CA", city: "Saskatoon" }, { country: "CA", city: "Regina" },
  { country: "US", city: "New York" }, { country: "US", city: "Los Angeles" }, { country: "US", city: "Chicago" },
  { country: "US", city: "Houston" }, { country: "US", city: "Phoenix" }, { country: "US", city: "Philadelphia" },
  { country: "US", city: "San Antonio" }, { country: "US", city: "San Diego" }, { country: "US", city: "Dallas" },
  { country: "US", city: "San Jose" }, { country: "US", city: "Austin" }, { country: "US", city: "Jacksonville" },
  { country: "US", city: "Fort Worth" }, { country: "US", city: "Columbus" }, { country: "US", city: "Charlotte" },
  { country: "US", city: "Indianapolis" }, { country: "US", city: "San Francisco" }, { country: "US", city: "Seattle" },
  { country: "US", city: "Denver" }, { country: "US", city: "Washington" }, { country: "US", city: "Boston" },
  { country: "US", city: "Nashville" }, { country: "US", city: "Detroit" }, { country: "US", city: "Portland" },
  { country: "US", city: "Las Vegas" }, { country: "US", city: "Memphis" }, { country: "US", city: "Louisville" },
  { country: "US", city: "Baltimore" }, { country: "US", city: "Milwaukee" }, { country: "US", city: "Albuquerque" },
  { country: "US", city: "Tucson" }, { country: "US", city: "Fresno" }, { country: "US", city: "Sacramento" },
  { country: "US", city: "Atlanta" }, { country: "US", city: "Miami" }, { country: "US", city: "New Orleans" },
  { country: "US", city: "Minneapolis" }, { country: "US", city: "Cleveland" }, { country: "US", city: "Pittsburgh" },
  { country: "US", city: "Cincinnati" }, { country: "US", city: "Kansas City" }, { country: "US", city: "St. Louis" },
  { country: "US", city: "Tampa" }, { country: "US", city: "Orlando" }, { country: "US", city: "Raleigh" },
  { country: "US", city: "Honolulu" }, { country: "US", city: "Anchorage" },
  // Europe
  { country: "GB", city: "London" }, { country: "GB", city: "Manchester" }, { country: "GB", city: "Birmingham" },
  { country: "GB", city: "Glasgow" }, { country: "GB", city: "Liverpool" }, { country: "GB", city: "Leeds" },
  { country: "GB", city: "Edinburgh" }, { country: "GB", city: "Bristol" }, { country: "GB", city: "Cardiff" },
  { country: "GB", city: "Belfast" }, { country: "GB", city: "Sheffield" }, { country: "GB", city: "Newcastle" },
  { country: "FR", city: "Paris" }, { country: "FR", city: "Lyon" }, { country: "FR", city: "Marseille" },
  { country: "FR", city: "Toulouse" }, { country: "FR", city: "Nice" }, { country: "FR", city: "Nantes" },
  { country: "FR", city: "Strasbourg" }, { country: "FR", city: "Bordeaux" }, { country: "FR", city: "Lille" },
  { country: "DE", city: "Berlin" }, { country: "DE", city: "Munich" }, { country: "DE", city: "Hamburg" },
  { country: "DE", city: "Cologne" }, { country: "DE", city: "Frankfurt" }, { country: "DE", city: "Stuttgart" },
  { country: "DE", city: "Düsseldorf" }, { country: "DE", city: "Leipzig" }, { country: "DE", city: "Dortmund" },
  { country: "DE", city: "Dresden" }, { country: "DE", city: "Hannover" }, { country: "DE", city: "Nuremberg" },
  { country: "IT", city: "Rome" }, { country: "IT", city: "Milan" }, { country: "IT", city: "Naples" },
  { country: "IT", city: "Turin" }, { country: "IT", city: "Florence" }, { country: "IT", city: "Bologna" },
  { country: "IT", city: "Palermo" }, { country: "IT", city: "Genoa" }, { country: "IT", city: "Venice" },
  { country: "ES", city: "Madrid" }, { country: "ES", city: "Barcelona" }, { country: "ES", city: "Valencia" },
  { country: "ES", city: "Seville" }, { country: "ES", city: "Zaragoza" }, { country: "ES", city: "Málaga" },
  { country: "ES", city: "Bilbao" }, { country: "ES", city: "Murcia" }, { country: "ES", city: "Palma" },
  { country: "PT", city: "Lisbon" }, { country: "PT", city: "Porto" }, { country: "PT", city: "Braga" },
  { country: "NL", city: "Amsterdam" }, { country: "NL", city: "Rotterdam" }, { country: "NL", city: "The Hague" },
  { country: "NL", city: "Utrecht" }, { country: "BE", city: "Brussels" }, { country: "BE", city: "Antwerp" },
  { country: "BE", city: "Ghent" }, { country: "CH", city: "Zurich" }, { country: "CH", city: "Geneva" },
  { country: "CH", city: "Basel" }, { country: "CH", city: "Bern" }, { country: "AT", city: "Vienna" },
  { country: "AT", city: "Graz" }, { country: "AT", city: "Linz" }, { country: "AT", city: "Salzburg" },
  { country: "PL", city: "Warsaw" }, { country: "PL", city: "Kraków" }, { country: "PL", city: "Wrocław" },
  { country: "PL", city: "Gdańsk" }, { country: "PL", city: "Poznań" }, { country: "PL", city: "Łódź" },
  { country: "CZ", city: "Prague" }, { country: "CZ", city: "Brno" }, { country: "CZ", city: "Ostrava" },
  { country: "HU", city: "Budapest" }, { country: "HU", city: "Debrecen" }, { country: "RO", city: "Bucharest" },
  { country: "RO", city: "Cluj-Napoca" }, { country: "RO", city: "Timișoara" }, { country: "RO", city: "Iași" },
  { country: "BG", city: "Sofia" }, { country: "BG", city: "Plovdiv" }, { country: "BG", city: "Varna" },
  { country: "GR", city: "Athens" }, { country: "GR", city: "Thessaloniki" }, { country: "GR", city: "Patras" },
  { country: "TR", city: "Istanbul" }, { country: "TR", city: "Ankara" }, { country: "TR", city: "Izmir" },
  { country: "TR", city: "Bursa" }, { country: "TR", city: "Antalya" }, { country: "TR", city: "Adana" },
  { country: "UA", city: "Kyiv" }, { country: "UA", city: "Kharkiv" }, { country: "UA", city: "Odesa" },
  { country: "UA", city: "Lviv" }, { country: "UA", city: "Dnipro" }, { country: "BY", city: "Minsk" },
  { country: "MD", city: "Chișinău" }, { country: "RS", city: "Belgrade" }, { country: "RS", city: "Novi Sad" },
  { country: "HR", city: "Zagreb" }, { country: "HR", city: "Split" }, { country: "HR", city: "Rijeka" },
  { country: "BA", city: "Sarajevo" }, { country: "BA", city: "Banja Luka" }, { country: "SI", city: "Ljubljana" },
  { country: "SK", city: "Bratislava" }, { country: "SK", city: "Košice" }, { country: "AL", city: "Tirana" },
  { country: "MK", city: "Skopje" }, { country: "ME", city: "Podgorica" }, { country: "XK", city: "Pristina" },
  { country: "IE", city: "Dublin" }, { country: "IE", city: "Cork" }, { country: "IE", city: "Galway" },
  { country: "IS", city: "Reykjavik" }, { country: "NO", city: "Oslo" }, { country: "NO", city: "Bergen" },
  { country: "NO", city: "Trondheim" }, { country: "SE", city: "Stockholm" }, { country: "SE", city: "Gothenburg" },
  { country: "SE", city: "Malmö" }, { country: "DK", city: "Copenhagen" }, { country: "DK", city: "Aarhus" },
  { country: "FI", city: "Helsinki" }, { country: "FI", city: "Tampere" }, { country: "FI", city: "Turku" },
  { country: "EE", city: "Tallinn" }, { country: "LV", city: "Riga" }, { country: "LT", city: "Vilnius" },
  { country: "LT", city: "Kaunas" }, { country: "LU", city: "Luxembourg" }, { country: "MT", city: "Valletta" },
  { country: "CY", city: "Nicosia" }, { country: "CY", city: "Limassol" },
  // Asia & Oceania
  { country: "IN", city: "Mumbai" }, { country: "IN", city: "Delhi" }, { country: "IN", city: "Bangalore" },
  { country: "IN", city: "Bengaluru" }, { country: "IN", city: "Hyderabad" }, { country: "IN", city: "Chennai" },
  { country: "IN", city: "Kolkata" }, { country: "IN", city: "Pune" }, { country: "IN", city: "Ahmedabad" },
  { country: "IN", city: "Jaipur" }, { country: "IN", city: "Lucknow" }, { country: "IN", city: "Kanpur" },
  { country: "IN", city: "Nagpur" }, { country: "IN", city: "Indore" }, { country: "IN", city: "Bhopal" },
  { country: "IN", city: "Patna" }, { country: "IN", city: "Chandigarh" }, { country: "IN", city: "Kochi" },
  { country: "IN", city: "Thiruvananthapuram" }, { country: "IN", city: "Guwahati" }, { country: "IN", city: "Amritsar" },
  { country: "PK", city: "Karachi" }, { country: "PK", city: "Lahore" }, { country: "PK", city: "Islamabad" },
  { country: "PK", city: "Rawalpindi" }, { country: "PK", city: "Faisalabad" }, { country: "PK", city: "Peshawar" },
  { country: "PK", city: "Multan" }, { country: "BD", city: "Dhaka" }, { country: "BD", city: "Chittagong" },
  { country: "BD", city: "Khulna" }, { country: "BD", city: "Rajshahi" }, { country: "LK", city: "Colombo" },
  { country: "LK", city: "Kandy" }, { country: "NP", city: "Kathmandu" }, { country: "NP", city: "Pokhara" },
  { country: "AF", city: "Kabul" }, { country: "AF", city: "Herat" }, { country: "AF", city: "Mazar-i-Sharif" },
  { country: "ID", city: "Jakarta" }, { country: "ID", city: "Surabaya" }, { country: "ID", city: "Bandung" },
  { country: "ID", city: "Medan" }, { country: "ID", city: "Semarang" }, { country: "ID", city: "Makassar" },
  { country: "ID", city: "Denpasar" }, { country: "ID", city: "Palembang" }, { country: "ID", city: "Yogyakarta" },
  { country: "MY", city: "Kuala Lumpur" }, { country: "MY", city: "George Town" }, { country: "MY", city: "Johor Bahru" },
  { country: "MY", city: "Ipoh" }, { country: "MY", city: "Kota Kinabalu" }, { country: "MY", city: "Kuching" },
  { country: "PH", city: "Manila" }, { country: "PH", city: "Quezon City" }, { country: "PH", city: "Cebu" },
  { country: "PH", city: "Davao" }, { country: "PH", city: "Makati" }, { country: "PH", city: "Iloilo" },
  { country: "PH", city: "Baguio" }, { country: "PH", city: "Cagayan de Oro" }, { country: "TH", city: "Bangkok" },
  { country: "TH", city: "Chiang Mai" }, { country: "TH", city: "Phuket" }, { country: "TH", city: "Pattaya" },
  { country: "VN", city: "Ho Chi Minh City" }, { country: "VN", city: "Hanoi" }, { country: "VN", city: "Da Nang" },
  { country: "VN", city: "Hai Phong" }, { country: "VN", city: "Can Tho" }, { country: "KH", city: "Phnom Penh" },
  { country: "KH", city: "Siem Reap" }, { country: "LA", city: "Vientiane" }, { country: "MM", city: "Yangon" },
  { country: "MM", city: "Mandalay" }, { country: "MM", city: "Naypyidaw" }, { country: "SG", city: "Singapore" },
  { country: "BN", city: "Bandar Seri Begawan" }, { country: "JP", city: "Tokyo" }, { country: "JP", city: "Osaka" },
  { country: "JP", city: "Kyoto" }, { country: "JP", city: "Yokohama" }, { country: "JP", city: "Nagoya" },
  { country: "JP", city: "Sapporo" }, { country: "JP", city: "Fukuoka" }, { country: "JP", city: "Kobe" },
  { country: "KR", city: "Seoul" }, { country: "KR", city: "Busan" }, { country: "KR", city: "Incheon" },
  { country: "KR", city: "Daegu" }, { country: "KR", city: "Daejeon" }, { country: "CN", city: "Beijing" },
  { country: "CN", city: "Shanghai" }, { country: "CN", city: "Guangzhou" }, { country: "CN", city: "Shenzhen" },
  { country: "CN", city: "Chengdu" }, { country: "CN", city: "Chongqing" }, { country: "CN", city: "Wuhan" },
  { country: "CN", city: "Xi'an" }, { country: "CN", city: "Hangzhou" }, { country: "CN", city: "Nanjing" },
  { country: "TW", city: "Taipei" }, { country: "TW", city: "Kaohsiung" }, { country: "TW", city: "Taichung" },
  { country: "HK", city: "Hong Kong" }, { country: "MO", city: "Macau" }, { country: "MN", city: "Ulaanbaatar" },
  { country: "KZ", city: "Almaty" }, { country: "KZ", city: "Astana" }, { country: "UZ", city: "Tashkent" },
  { country: "UZ", city: "Samarkand" }, { country: "GE", city: "Tbilisi" }, { country: "AM", city: "Yerevan" },
  { country: "AZ", city: "Baku" }, { country: "SA", city: "Riyadh" }, { country: "SA", city: "Jeddah" },
  { country: "SA", city: "Mecca" }, { country: "SA", city: "Medina" }, { country: "SA", city: "Dammam" },
  { country: "AE", city: "Dubai" }, { country: "AE", city: "Abu Dhabi" }, { country: "AE", city: "Sharjah" },
  { country: "QA", city: "Doha" }, { country: "KW", city: "Kuwait City" }, { country: "BH", city: "Manama" },
  { country: "OM", city: "Muscat" }, { country: "JO", city: "Amman" }, { country: "LB", city: "Beirut" },
  { country: "IQ", city: "Baghdad" }, { country: "IQ", city: "Basra" }, { country: "IQ", city: "Erbil" },
  { country: "IR", city: "Tehran" }, { country: "IR", city: "Isfahan" }, { country: "IR", city: "Mashhad" },
  { country: "IR", city: "Shiraz" }, { country: "IL", city: "Tel Aviv" }, { country: "IL", city: "Jerusalem" },
  { country: "IL", city: "Haifa" }, { country: "PS", city: "Ramallah" }, { country: "PS", city: "Gaza" },
  { country: "YE", city: "Sanaa" }, { country: "YE", city: "Aden" }, { country: "SY", city: "Damascus" },
  { country: "SY", city: "Aleppo" },
  { country: "AU", city: "Sydney" }, { country: "AU", city: "Melbourne" }, { country: "AU", city: "Brisbane" },
  { country: "AU", city: "Perth" }, { country: "AU", city: "Adelaide" }, { country: "AU", city: "Canberra" },
  { country: "AU", city: "Hobart" }, { country: "AU", city: "Darwin" }, { country: "AU", city: "Gold Coast" },
  { country: "AU", city: "Newcastle" }, { country: "NZ", city: "Auckland" }, { country: "NZ", city: "Wellington" },
  { country: "NZ", city: "Christchurch" }, { country: "NZ", city: "Hamilton" }, { country: "NZ", city: "Dunedin" },
  { country: "FJ", city: "Suva" }, { country: "PG", city: "Port Moresby" }, { country: "NC", city: "Nouméa" },
  { country: "PF", city: "Papeete" },
];

const LOCAL_BROADCASTER_TERMS = [
  "community radio", "university radio", "campus radio", "public radio", "local radio",
  "municipal radio", "college radio", "student radio", "independent radio", "regional radio",
  "FM radio", "AM radio", "internet radio", "web radio", "online radio",
] as const;

function slug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
}

function pushStateQueries(
  queries: RadioExpansionQuery[],
  country: string,
  states: readonly string[],
  priority = 1
) {
  for (const state of states) {
    queries.push({
      key: `radio_browser:state:${country}:${slug(state)}`,
      kind: "state",
      value: `${country}|${state}`,
      categorySlug: "global",
      priority,
    });
  }
}

export function buildRadioExpansionBatch8Queries(): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];

  for (const code of UNDERREPRESENTED_COUNTRY_CODES) {
    queries.push({
      key: `radio_browser:country:${code}:wave1`,
      kind: "country",
      value: code,
      categorySlug: "global",
      priority: 1,
    });
  }

  pushStateQueries(queries, "US", US_STATES, 1);
  pushStateQueries(queries, "BR", BR_STATES, 1);
  pushStateQueries(queries, "IN", IN_STATES, 1);
  pushStateQueries(queries, "NG", NG_STATES, 1);
  pushStateQueries(queries, "ZA", ZA_PROVINCES, 1);
  pushStateQueries(queries, "PH", PH_REGIONS, 1);
  pushStateQueries(queries, "ID", ID_PROVINCES, 1);

  for (const entry of WORLD_CITIES) {
    // Name search catches stations branded with the city even when RB has no city field.
    queries.push({
      key: `radio_browser:name:${entry.country}:${slug(entry.city)}`,
      kind: "name",
      value: entry.city,
      categorySlug: "local",
      priority: 1,
    });
    // Country+tag city term for secondary recall.
    queries.push({
      key: `radio_browser:combo:${entry.country}:city-${slug(entry.city)}`,
      kind: "combo",
      value: `${entry.country}|${entry.city}`,
      categorySlug: "local",
      priority: 2,
    });
    if (entry.state) {
      queries.push({
        key: `radio_browser:state:${entry.country}:${slug(entry.state)}`,
        kind: "state",
        value: `${entry.country}|${entry.state}`,
        categorySlug: "global",
        priority: 1,
      });
    }
  }

  for (const term of LOCAL_BROADCASTER_TERMS) {
    queries.push({
      key: `radio_browser:tag:${slug(term)}`,
      kind: "tag",
      value: term,
      categorySlug: slug(term).slice(0, 80),
      priority: 2,
    });
    queries.push({
      key: `radio_browser:name:term-${slug(term)}`,
      kind: "name",
      value: term,
      categorySlug: "community",
      priority: 3,
    });
  }

  // Long-tail ordering to surface stations previous popular-order crawls missed.
  queries.push(
    {
      key: "radio_browser:global:name-order-wave1",
      kind: "name_order",
      value: "name",
      categorySlug: "global",
      priority: 4,
    },
    {
      key: "radio_browser:global:clicks-asc-wave1",
      kind: "clicks_asc",
      value: "clickcount",
      categorySlug: "global",
      priority: 4,
    },
    {
      key: "radio_browser:global:lastchange-asc-wave1",
      kind: "lastchange_asc",
      value: "lastchange",
      categorySlug: "global",
      priority: 4,
    },
    {
      key: "radio_browser:global:lastcheck-asc-wave1",
      kind: "lastcheck_asc",
      value: "lastchecktime",
      categorySlug: "global",
      priority: 4,
    }
  );

  // Deduplicate by key while preserving first priority.
  const seen = new Set<string>();
  const unique: RadioExpansionQuery[] = [];
  for (const query of queries.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key))) {
    if (seen.has(query.key)) continue;
    seen.add(query.key);
    unique.push(query);
  }
  return unique;
}
