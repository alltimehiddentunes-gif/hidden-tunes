/**
 * Batch 2 worldwide source wave — hundreds of official discovery handles/URLs.
 * Channel IDs are optional; resolved later via page HTML / RSS / API (never invented).
 */

import type { ConcertMediaProviderId } from "../candidate";
import type { ConcertSourceSeed } from "../types";
import { withConcertImportFlags } from "../import/sourceEligibility";
import { CONCERT_BATCH2_WAVE_B_SEEDS } from "./batch2SourceWaveB";

export type ConcertWaveSeed = {
  stableKey: string;
  name: string;
  provider: ConcertMediaProviderId;
  providerType:
    | "official_festival"
    | "official_venue"
    | "orchestra"
    | "opera_house"
    | "public_broadcaster"
    | "university"
    | "conservatory"
    | "cultural_institution"
    | "government_cultural"
    | "official_artist"
    | "authorized_platform";
  countryCode: string;
  languageCodes: string[];
  officialUrl: string;
  mediaChannelUrl: string;
  providerChannelId?: string | null;
  category: string;
  sourceOwner: string;
};

const REVIEWED = "2026-07-18";

/** Compact YouTube handle wave — breadth over depth for RSS (~15/channel). */
const YT = (
  key: string,
  name: string,
  handle: string,
  country: string,
  langs: string[],
  type: ConcertWaveSeed["providerType"],
  category: string,
  officialUrl: string,
  owner?: string
): ConcertWaveSeed => ({
  stableKey: key,
  name,
  provider: "youtube",
  providerType: type,
  countryCode: country,
  languageCodes: langs,
  officialUrl,
  mediaChannelUrl: `https://www.youtube.com/@${handle.replace(/^@/, "")}`,
  providerChannelId: null,
  category,
  sourceOwner: owner || name,
});

export const CONCERT_BATCH2_WAVE_SEEDS: ConcertWaveSeed[] = [
  // --- Remaining unresolved (retry with alternate handles) ---
  YT("metropolitan-opera-b2", "Metropolitan Opera", "MetOpera", "US", ["en"], "opera_house", "opera", "https://www.metopera.org/"),
  YT("wiener-philharmoniker-b2", "Wiener Philharmoniker", "wienerphil", "AT", ["de", "en"], "orchestra", "orchestra", "https://www.wienerphilharmoniker.at/"),
  YT("kennedy-center-b2", "Kennedy Center", "KennedyCenter", "US", ["en"], "cultural_institution", "cultural", "https://www.kennedy-center.org/"),
  YT("library-of-congress-b2", "Library of Congress", "loc", "US", ["en"], "government_cultural", "government", "https://www.loc.gov/"),
  YT("royal-college-of-music-b2", "Royal College of Music", "RCMLondon", "GB", ["en"], "conservatory", "conservatory", "https://www.rcm.ac.uk/"),
  YT("montreux-jazz-b2", "Montreux Jazz Festival", "MontreuxJazz", "CH", ["en", "fr"], "official_festival", "festival", "https://www.montreuxjazzfestival.com/"),
  YT("montreal-jazz-b2", "Montreal Jazz Festival", "FIJM", "CA", ["fr", "en"], "official_festival", "jazz", "https://www.montrealjazzfest.com/"),
  YT("dutch-national-opera-b2", "Dutch National Opera", "DutchNationalOpera", "NL", ["nl", "en"], "opera_house", "opera", "https://www.operaballet.nl/"),
  YT("oxford-music-b2", "Oxford Faculty of Music", "OxfordUniversity", "GB", ["en"], "university", "university", "https://www.music.ox.ac.uk/"),
  YT("loc-concerts-b2", "Library of Congress Concerts", "loc", "US", ["en"], "government_cultural", "government", "https://www.loc.gov/concerts/"),
  YT("kennedy-center-alt", "The Kennedy Center", "kennedycenter", "US", ["en"], "cultural_institution", "cultural", "https://www.kennedy-center.org/"),
  YT("nationale-opera-ballet", "Nationale Opera & Ballet", "operaballetnl", "NL", ["nl", "en"], "opera_house", "opera", "https://www.operaballet.nl/"),
  YT("oxford-music-faculty-alt", "University of Oxford Music", "UniofOxford", "GB", ["en"], "university", "university", "https://www.ox.ac.uk/"),

  // --- US orchestras / venues ---
  YT("nyphil", "New York Philharmonic", "nyphilharmonic", "US", ["en"], "orchestra", "orchestra", "https://nyphil.org/"),
  YT("cleveland-orchestra", "The Cleveland Orchestra", "ClevelandOrchestra", "US", ["en"], "orchestra", "orchestra", "https://www.clevelandorchestra.com/"),
  YT("philadelphia-orchestra", "The Philadelphia Orchestra", "Philorch", "US", ["en"], "orchestra", "orchestra", "https://www.philorch.org/"),
  YT("national-symphony", "National Symphony Orchestra", "NSOdcmusic", "US", ["en"], "orchestra", "orchestra", "https://www.kennedy-center.org/nso/"),
  YT("minnesota-orchestra", "Minnesota Orchestra", "MinnesotaOrch", "US", ["en"], "orchestra", "orchestra", "https://www.minnesotaorchestra.org/"),
  YT("detroit-symphony", "Detroit Symphony Orchestra", "DetroitSymphony", "US", ["en"], "orchestra", "orchestra", "https://www.dso.org/"),
  YT("houston-symphony", "Houston Symphony", "HoustonSymphony", "US", ["en"], "orchestra", "orchestra", "https://www.houstonsymphony.org/"),
  YT("dallas-symphony", "Dallas Symphony Orchestra", "DallasSymphony", "US", ["en"], "orchestra", "orchestra", "https://www.dallassymphony.org/"),
  YT("seattle-symphony", "Seattle Symphony", "SeattleSymphony", "US", ["en"], "orchestra", "orchestra", "https://www.seattlesymphony.org/"),
  YT("stlouis-symphony", "St. Louis Symphony Orchestra", "SLSO", "US", ["en"], "orchestra", "orchestra", "https://www.slso.org/"),
  YT("pittsburgh-symphony", "Pittsburgh Symphony Orchestra", "PittsburghSymphony", "US", ["en"], "orchestra", "orchestra", "https://www.pittsburghsymphony.org/"),
  YT("hollywood-bowl", "Hollywood Bowl", "HollywoodBowl", "US", ["en"], "official_venue", "venue", "https://www.hollywoodbowl.com/"),
  YT("red-rocks", "Red Rocks Amphitheatre", "RedRocksCO", "US", ["en"], "official_venue", "venue", "https://www.redrocksonline.com/"),
  YT("msg-official", "Madison Square Garden", "TheGarden", "US", ["en"], "official_venue", "venue", "https://www.msg.com/"),
  YT("fillmore", "The Fillmore", "Fillmore", "US", ["en"], "official_venue", "venue", "https://www.livenation.com/"),
  YT("apollo-theater", "Apollo Theater", "ApolloTheater", "US", ["en"], "official_venue", "venue", "https://www.apollotheater.org/"),
  YT("blue-note-nyc", "Blue Note Jazz Club", "BlueNoteJazz", "US", ["en"], "official_venue", "jazz", "https://www.bluenotejazz.com/"),
  YT("jazz-at-lincoln", "Jazz at Lincoln Center", "JazzatLincolnCenter", "US", ["en"], "cultural_institution", "jazz", "https://www.jazz.org/"),
  YT("sfjazz", "SFJAZZ", "SFJAZZ", "US", ["en"], "cultural_institution", "jazz", "https://www.sfjazz.org/"),
  YT("new-orleans-jazz-fest", "New Orleans Jazz & Heritage Festival", "JazzFest", "US", ["en"], "official_festival", "festival", "https://www.nojazzfest.com/"),
  YT("newport-jazz", "Newport Jazz Festival", "NewportJazzFest", "US", ["en"], "official_festival", "jazz", "https://www.newportjazz.org/"),
  YT("bonnaroo", "Bonnaroo", "Bonnaroo", "US", ["en"], "official_festival", "festival", "https://www.bonnaroo.com/"),
  YT("lollapalooza", "Lollapalooza", "Lollapalooza", "US", ["en"], "official_festival", "festival", "https://www.lollapalooza.com/"),
  YT("austin-city-limits", "Austin City Limits", "acltv", "US", ["en"], "public_broadcaster", "festival", "https://acltv.com/"),
  YT("austin-city-limits-fest", "ACL Festival", "aclfestival", "US", ["en"], "official_festival", "festival", "https://www.aclfestival.com/"),
  YT("sxsw", "SXSW", "SXSW", "US", ["en"], "official_festival", "festival", "https://www.sxsw.com/"),
  YT("essencemusicfest", "ESSENCE Festival", "ESSENCE", "US", ["en"], "official_festival", "festival", "https://www.essence.com/"),
  YT("gospel-music-assoc", "Gospel Music Association", "GospelMusic", "US", ["en"], "cultural_institution", "gospel", "https://www.gospelmusic.org/"),
  YT("bet-gospel", "BET Gospel", "BET", "US", ["en"], "public_broadcaster", "gospel", "https://www.bet.com/"),
  YT("npr-tiny-desk", "NPR Tiny Desk", "nprmusic", "US", ["en"], "public_broadcaster", "artist", "https://www.npr.org/series/tiny-desk-concerts/"),
  YT("colors-studios", "COLORS", "COLORS", "DE", ["en"], "official_artist", "artist", "https://www.colorsxstudios.com/"),
  YT("vevo", "Vevo", "Vevo", "US", ["en"], "authorized_platform", "artist", "https://www.vevo.com/"),
  YT("live-from-here", "Live From Here", "LiveFromHere", "US", ["en"], "public_broadcaster", "artist", "https://www.livefromhere.org/"),
  YT("pbs-music", "PBS Music", "PBS", "US", ["en"], "public_broadcaster", "broadcaster", "https://www.pbs.org/"),
  YT("great-performances", "Great Performances", "GreatPerformancesPBS", "US", ["en"], "public_broadcaster", "broadcaster", "https://www.pbs.org/wnet/gperf/"),

  // --- Canada / LatAm ---
  YT("nac-canada", "National Arts Centre", "NACcanada", "CA", ["en", "fr"], "cultural_institution", "cultural", "https://nac-cna.ca/"),
  YT("tso", "Toronto Symphony Orchestra", "TorontoSymphony", "CA", ["en"], "orchestra", "orchestra", "https://www.tso.ca/"),
  YT("osm-montreal", "Orchestre symphonique de Montréal", "OSMontreal", "CA", ["fr", "en"], "orchestra", "orchestra", "https://www.osm.ca/"),
  YT("cirque-du-soleil", "Cirque du Soleil", "CirqueDuSoleil", "CA", ["en", "fr"], "official_artist", "other", "https://www.cirquedusoleil.com/"),
  YT("lollapalooza-brasil", "Lollapalooza Brasil", "LollapaloozaBR", "BR", ["pt", "en"], "official_festival", "festival", "https://www.lollapaloozabr.com/"),
  YT("rock-in-rio", "Rock in Rio", "RockinRio", "BR", ["pt", "en"], "official_festival", "festival", "https://rockinrio.com/"),
  YT("teatro-colon", "Teatro Colón", "TeatroColonOficial", "AR", ["es"], "opera_house", "opera", "https://teatrocolon.org.ar/"),
  YT("bellas-artes-mx", "Palacio de Bellas Artes", "BellasArtesMX", "MX", ["es"], "cultural_institution", "cultural", "https://www.gob.mx/cultura"),
  YT("unam-musica", "UNAM Música", "UNAM", "MX", ["es"], "university", "university", "https://www.unam.mx/"),

  // --- UK / Ireland ---
  YT("bbc-radio1", "BBC Radio 1", "BBCRadio1", "GB", ["en"], "public_broadcaster", "broadcaster", "https://www.bbc.co.uk/radio1"),
  YT("bbc-radio2", "BBC Radio 2", "BBCRadio2", "GB", ["en"], "public_broadcaster", "broadcaster", "https://www.bbc.co.uk/radio2"),
  YT("bbc-radio3", "BBC Radio 3", "BBCRadio3", "GB", ["en"], "public_broadcaster", "broadcaster", "https://www.bbc.co.uk/radio3"),
  YT("bbc-music", "BBC Music", "BBCMusic", "GB", ["en"], "public_broadcaster", "broadcaster", "https://www.bbc.co.uk/music"),
  YT("bbc-proms-yt", "BBC Proms", "bbcproms", "GB", ["en"], "official_festival", "festival", "https://www.bbc.co.uk/proms"),
  YT("wigmore-hall", "Wigmore Hall", "WigmoreHall", "GB", ["en"], "official_venue", "venue", "https://wigmore-hall.org.uk/"),
  YT("barbican-centre", "Barbican Centre", "BarbicanCentre", "GB", ["en"], "official_venue", "venue", "https://www.barbican.org.uk/"),
  YT("royal-albert-hall", "Royal Albert Hall", "RoyalAlbertHall", "GB", ["en"], "official_venue", "venue", "https://www.royalalberthall.com/"),
  YT("english-national-opera", "English National Opera", "ENOpera", "GB", ["en"], "opera_house", "opera", "https://www.eno.org/"),
  YT("welsh-national-opera", "Welsh National Opera", "WelshNationalOpera", "GB", ["en"], "opera_house", "opera", "https://wno.org.uk/"),
  YT("scottish-opera", "Scottish Opera", "ScottishOpera", "GB", ["en"], "opera_house", "opera", "https://www.scottishopera.org.uk/"),
  YT("lso", "London Symphony Orchestra", "lso", "GB", ["en"], "orchestra", "orchestra", "https://www.lso.co.uk/"),
  YT("lpo", "London Philharmonic Orchestra", "LondonPhilharmonic", "GB", ["en"], "orchestra", "orchestra", "https://www.lpo.org.uk/"),
  YT("philharmonia", "Philharmonia Orchestra", "PhilharmoniaOrchestra", "GB", ["en"], "orchestra", "orchestra", "https://philharmonia.co.uk/"),
  YT("cbso", "City of Birmingham Symphony", "TheCBSO", "GB", ["en"], "orchestra", "orchestra", "https://cbso.co.uk/"),
  YT("halle-orchestra", "The Hallé", "halleorchestra", "GB", ["en"], "orchestra", "orchestra", "https://www.halle.co.uk/"),
  YT("glastonbury", "Glastonbury Festival", "glastonbury", "GB", ["en"], "official_festival", "festival", "https://www.glastonburyfestivals.co.uk/"),
  YT("reading-leeds", "Reading & Leeds", "ReadingLeeds", "GB", ["en"], "official_festival", "festival", "https://www.readingandleedsfestival.com/"),
  YT("download-festival", "Download Festival", "DownloadFest", "GB", ["en"], "official_festival", "festival", "https://downloadfestival.co.uk/"),
  YT("wireless-festival", "Wireless Festival", "WirelessFest", "GB", ["en"], "official_festival", "festival", "https://www.wirelessfestival.co.uk/"),
  YT("nme", "NME", "NME", "GB", ["en"], "authorized_platform", "artist", "https://www.nme.com/"),
  YT("rte-ireland", "RTÉ", "rte", "IE", ["en"], "public_broadcaster", "broadcaster", "https://www.rte.ie/"),
  YT("national-concert-hall", "National Concert Hall Dublin", "NCHDublin", "IE", ["en"], "official_venue", "venue", "https://www.nch.ie/"),

  // --- Europe ---
  YT("sueddeutsche", "SZ Magazin Kultur", "SZmagazin", "DE", ["de"], "public_broadcaster", "cultural", "https://sz-magazin.sueddeutsche.de/"),
  YT("dw-culture", "DW Culture", "DeutscheWelle", "DE", ["en", "de"], "public_broadcaster", "broadcaster", "https://www.dw.com/"),
  YT("br-klassik", "BR-Klassik", "BRKlassik", "DE", ["de"], "public_broadcaster", "broadcaster", "https://www.br-klassik.de/"),
  YT("ndr", "NDR", "NDR", "DE", ["de"], "public_broadcaster", "broadcaster", "https://www.ndr.de/"),
  YT("wdr", "WDR", "WDR", "DE", ["de"], "public_broadcaster", "broadcaster", "https://www1.wdr.de/"),
  YT("zdf", "ZDF", "ZDF", "DE", ["de"], "public_broadcaster", "broadcaster", "https://www.zdf.de/"),
  YT("staatsoper-berlin", "Staatsoper Berlin", "StaatsoperBerlin", "DE", ["de", "en"], "opera_house", "opera", "https://www.staatsoper-berlin.de/"),
  YT("bayerische-staatsoper", "Bayerische Staatsoper", "BayerischeStaatsoper", "DE", ["de", "en"], "opera_house", "opera", "https://www.staatsoper.de/"),
  YT("gewandhaus", "Gewandhausorchester", "Gewandhausorchester", "DE", ["de"], "orchestra", "orchestra", "https://www.gewandhausorchester.de/"),
  YT("concertgebouworkest", "Concertgebouworkest", "Concertgebouworkest", "NL", ["nl", "en"], "orchestra", "orchestra", "https://www.concertgebouworkest.nl/"),
  YT("lowlands", "Lowlands", "LowlandsFest", "NL", ["nl", "en"], "official_festival", "festival", "https://lowlands.nl/"),
  YT("pinkpop", "Pinkpop", "PinkpopFestival", "NL", ["nl", "en"], "official_festival", "festival", "https://www.pinkpop.nl/"),
  YT("rock-werchter", "Rock Werchter", "RockWerchter", "BE", ["nl", "en", "fr"], "official_festival", "festival", "https://www.rockwerchter.be/"),
  YT("pukkelpop", "Pukkelpop", "Pukkelpop", "BE", ["nl", "en"], "official_festival", "festival", "https://www.pukkelpop.be/"),
  YT("sziget", "Sziget Festival", "SzigetOfficial", "HU", ["en", "hu"], "official_festival", "festival", "https://szigetfestival.com/"),
  YT("exit-festival", "EXIT Festival", "ExitFestival", "RS", ["en"], "official_festival", "festival", "https://www.exitfest.org/"),
  YT("primavera-sound", "Primavera Sound", "Primavera_Sound", "ES", ["es", "en"], "official_festival", "festival", "https://www.primaverasound.com/"),
  YT("sonar-barcelona", "Sónar", "SonarFestival", "ES", ["es", "en"], "official_festival", "dj", "https://sonar.es/"),
  YT("madcool", "Mad Cool Festival", "MadCoolFestival", "ES", ["es", "en"], "official_festival", "festival", "https://www.madcoolfestival.es/"),
  YT("teatro-real", "Teatro Real", "TeatroReal", "ES", ["es"], "opera_house", "opera", "https://www.teatroreal.es/"),
  YT("liceu", "Gran Teatre del Liceu", "LiceuBarcelona", "ES", ["ca", "es"], "opera_house", "opera", "https://www.liceubarcelona.cat/"),
  YT("orquesta-nacional-es", "Orquesta Nacional de España", "OCNE", "ES", ["es"], "orchestra", "orchestra", "https://www.ocne.es/"),
  YT("france-musique", "France Musique", "Francemusique", "FR", ["fr"], "public_broadcaster", "broadcaster", "https://www.radiofrance.fr/francemusique"),
  YT("radio-france", "Radio France", "radiofrance", "FR", ["fr"], "public_broadcaster", "broadcaster", "https://www.radiofrance.fr/"),
  YT("philharmonie-paris", "Philharmonie de Paris", "PhilharmoniedeParis", "FR", ["fr", "en"], "official_venue", "venue", "https://philharmoniedeparis.fr/"),
  YT("festival-aix", "Festival d'Aix-en-Provence", "FestivalAix", "FR", ["fr"], "official_festival", "festival", "https://festivalaix.com/"),
  YT("solidays", "Solidays", "Solidays", "FR", ["fr"], "official_festival", "festival", "https://www.solidays.org/"),
  YT("hellfest", "Hellfest", "HellfestOpenAir", "FR", ["fr", "en"], "official_festival", "festival", "https://www.hellfest.fr/"),
  YT("rai-cultura", "Rai Cultura", "Rai", "IT", ["it"], "public_broadcaster", "broadcaster", "https://www.rai.it/"),
  YT("teatro-regio-torino", "Teatro Regio Torino", "TeatroRegioTorino", "IT", ["it"], "opera_house", "opera", "https://www.teatroregio.torino.it/"),
  YT("arena-di-verona", "Arena di Verona", "ArenaDiVerona", "IT", ["it", "en"], "opera_house", "opera", "https://www.arena.it/"),
  YT("santa-cecilia", "Accademia Nazionale di Santa Cecilia", "SantaCecilia", "IT", ["it"], "orchestra", "orchestra", "https://www.santacecilia.it/"),
  YT("umbria-jazz", "Umbria Jazz", "UmbriaJazz", "IT", ["it", "en"], "official_festival", "jazz", "https://www.umbriajazz.com/"),
  YT("swiss-jazz", "SRF 3 / Swiss Music", "srf", "CH", ["de", "fr"], "public_broadcaster", "broadcaster", "https://www.srf.ch/"),
  YT("lucerne-festival", "Lucerne Festival", "LucerneFestival", "CH", ["de", "en"], "official_festival", "festival", "https://www.lucernefestival.ch/"),
  YT("verbier-festival", "Verbier Festival", "VerbierFestival", "CH", ["en", "fr"], "official_festival", "festival", "https://www.verbierfestival.com/"),
  YT("salzburg-festival", "Salzburg Festival", "SalzburgerFestspiele", "AT", ["de", "en"], "official_festival", "festival", "https://www.salzburgfestival.at/"),
  YT("wiener-staatsoper", "Wiener Staatsoper", "WienerStaatsoper", "AT", ["de", "en"], "opera_house", "opera", "https://www.wiener-staatsoper.at/"),
  YT("musikverein", "Musikverein", "Musikverein", "AT", ["de"], "official_venue", "venue", "https://www.musikverein.at/"),
  YT("poland-nospr", "NOSPR Katowice", "NOSPR", "PL", ["pl", "en"], "official_venue", "venue", "https://nospr.org.pl/"),
  YT("chopin-institute", "Fryderyk Chopin Institute", "NIFCchopin", "PL", ["pl", "en"], "cultural_institution", "cultural", "https://nifc.pl/"),
  YT("czechia-prague-spring", "Prague Spring", "PragueSpring", "CZ", ["cs", "en"], "official_festival", "festival", "https://www.festival.cz/"),
  YT("sweden-berwaldhallen", "Berwaldhallen", "Berwaldhallen", "SE", ["sv", "en"], "official_venue", "venue", "https://www.berwaldhallen.se/"),
  YT("norway-oslo-phil", "Oslo Philharmonic", "OsloPhilharmonic", "NO", ["no", "en"], "orchestra", "orchestra", "https://ofo.no/"),
  YT("denmark-dr", "DR", "DRdk", "DK", ["da"], "public_broadcaster", "broadcaster", "https://www.dr.dk/"),
  YT("finland-helsinki-phil", "Helsinki Philharmonic", "HelsinkiPhil", "FI", ["fi", "en"], "orchestra", "orchestra", "https://helsinkiphilharmonicorchestra.fi/"),
  YT("portugal-gulbenkian", "Fundação Gulbenkian", "Gulbenkian", "PT", ["pt", "en"], "cultural_institution", "cultural", "https://gulbenkian.pt/"),
  YT("greece-megaron", "Megaron Athens", "MegaronAthens", "GR", ["el", "en"], "official_venue", "venue", "https://www.megaron.gr/"),

  // --- Africa / Middle East ---
  YT("cape-town-phil", "Cape Town Philharmonic", "CapeTownPhil", "ZA", ["en"], "orchestra", "orchestra", "https://www.cpo.org.za/"),
  YT("joburg-theatre", "Joburg Theatre", "JoburgTheatre", "ZA", ["en"], "official_venue", "venue", "https://www.joburgtheatre.com/"),
  YT("afropunk", "AFROPUNK", "AFROPUNK", "US", ["en"], "official_festival", "festival", "https://afropunk.com/"),
  YT("cairo-opera", "Cairo Opera House", "CairoOperaHouse", "EG", ["ar", "en"], "opera_house", "opera", "https://www.cairoopera.org/"),
  YT("dubai-opera", "Dubai Opera", "DubaiOpera", "AE", ["en", "ar"], "opera_house", "opera", "https://www.dubaiopera.com/"),
  YT("israel-philharmonic", "Israel Philharmonic", "IsraelPhilharmonic", "IL", ["he", "en"], "orchestra", "orchestra", "https://www.ipo.co.il/"),

  // --- Asia-Pacific ---
  YT("nhk-symphony", "NHK Symphony Orchestra", "NHKSymphony", "JP", ["ja", "en"], "orchestra", "orchestra", "https://www.nhkso.or.jp/"),
  YT("suntory-hall", "Suntory Hall", "SuntoryHall", "JP", ["ja", "en"], "official_venue", "venue", "https://www.suntory.com/culture-sports/suntoryhall/"),
  YT("tokyo-phil", "Tokyo Philharmonic", "TokyoPhilharmonic", "JP", ["ja", "en"], "orchestra", "orchestra", "https://www.tpo.or.jp/"),
  YT("fuji-rock", "Fuji Rock Festival", "FujiRockFestival", "JP", ["ja", "en"], "official_festival", "festival", "https://www.fujirockfestival.com/"),
  YT("summer-sonic", "Summer Sonic", "SummerSonic", "JP", ["ja", "en"], "official_festival", "festival", "https://www.summersonic.com/"),
  YT("kbs-classic", "KBS Classic", "KBSClassic", "KR", ["ko", "en"], "public_broadcaster", "broadcaster", "https://www.kbs.co.kr/"),
  YT("seoul-phil", "Seoul Philharmonic", "SeoulPhilharmonic", "KR", ["ko", "en"], "orchestra", "orchestra", "https://www.seoulphil.or.kr/"),
  YT("hong-kong-phil", "Hong Kong Philharmonic", "HKPhil", "HK", ["en", "zh"], "orchestra", "orchestra", "https://www.hkphil.org/"),
  YT("singapore-symphony", "Singapore Symphony Orchestra", "SSOmusic", "SG", ["en"], "orchestra", "orchestra", "https://www.sso.org.sg/"),
  YT("esplanade-sg", "Esplanade Singapore", "EsplanadeSG", "SG", ["en"], "official_venue", "venue", "https://www.esplanade.com/"),
  YT("melbourne-symphony", "Melbourne Symphony Orchestra", "MelbourneSymphony", "AU", ["en"], "orchestra", "orchestra", "https://www.mso.com.au/"),
  YT("sydney-symphony", "Sydney Symphony Orchestra", "SydneySymphony", "AU", ["en"], "orchestra", "orchestra", "https://www.sydneysymphony.com/"),
  YT("australian-opera", "Opera Australia", "OperaAustralia", "AU", ["en"], "opera_house", "opera", "https://opera.org.au/"),
  YT("splendour", "Splendour in the Grass", "SplendourLand", "AU", ["en"], "official_festival", "festival", "https://splendourinthegrass.com/"),
  YT("nzso", "New Zealand Symphony Orchestra", "NZSO", "NZ", ["en"], "orchestra", "orchestra", "https://www.nzso.co.nz/"),
  YT("india-ncp", "NCPA Mumbai", "NCPAMumbai", "IN", ["en", "hi"], "cultural_institution", "cultural", "https://www.ncpamumbai.com/"),
  YT("china-ncp", "National Centre for the Performing Arts", "NCPAchina", "CN", ["zh", "en"], "cultural_institution", "cultural", "https://www.chncpa.org/"),

  // --- Conservatories / universities ---
  YT("eastman-school", "Eastman School of Music", "EastmanSchool", "US", ["en"], "conservatory", "conservatory", "https://www.esm.rochester.edu/"),
  YT("berklee", "Berklee College of Music", "BerkleeCollege", "US", ["en"], "conservatory", "conservatory", "https://www.berklee.edu/"),
  YT("new-england-conservatory", "New England Conservatory", "NECMUSIC", "US", ["en"], "conservatory", "conservatory", "https://necmusic.edu/"),
  YT("manhattan-school", "Manhattan School of Music", "MSMnyc", "US", ["en"], "conservatory", "conservatory", "https://www.msmnyc.edu/"),
  YT("yale-music", "Yale School of Music", "YaleSchoolofMusic", "US", ["en"], "university", "university", "https://music.yale.edu/"),
  YT("indiana-jacobs", "IU Jacobs School of Music", "IUJacobsMusic", "US", ["en"], "university", "university", "https://music.indiana.edu/"),
  YT("sibelius-academy", "Sibelius Academy", "SibeliusAcademy", "FI", ["fi", "en"], "conservatory", "conservatory", "https://www.uniarts.fi/en/sibelius-academy/"),
  YT("guildhall", "Guildhall School", "GuildhallSchool", "GB", ["en"], "conservatory", "conservatory", "https://www.gsmd.ac.uk/"),
  YT("trinity-laban", "Trinity Laban", "TrinityLaban", "GB", ["en"], "conservatory", "conservatory", "https://www.trinitylaban.ac.uk/"),
  YT("rncm", "Royal Northern College of Music", "RNCM", "GB", ["en"], "conservatory", "conservatory", "https://www.rncm.ac.uk/"),

  // --- DJ / electronic festivals ---
  YT("ultra-music", "Ultra Music Festival", "Ultra", "US", ["en"], "official_festival", "dj", "https://ultramusicfestival.com/"),
  YT("edc-las-vegas", "EDC Las Vegas", "ElectricDaisyCarnival", "US", ["en"], "official_festival", "dj", "https://lasvegas.electricdaisycarnival.com/"),
  YT("awakenings", "Awakenings", "Awakenings", "NL", ["en"], "official_festival", "dj", "https://www.awakenings.com/"),
  YT("mysteryland", "Mysteryland", "Mysteryland", "NL", ["en"], "official_festival", "dj", "https://www.mysteryland.nl/"),
  YT("defqon", "Defqon.1", "Defqon1", "NL", ["en"], "official_festival", "dj", "https://defqon1.com/"),
  YT("creamfields", "Creamfields", "Creamfields", "GB", ["en"], "official_festival", "dj", "https://www.creamfields.com/"),
  YT("amsterdam-dance-event", "Amsterdam Dance Event", "ADE_NL", "NL", ["en"], "official_festival", "dj", "https://www.amsterdam-dance-event.nl/"),
  YT("boiler-room", "Boiler Room", "boilerroom", "GB", ["en"], "official_artist", "dj", "https://boilerroom.tv/"),
  YT("cercle", "Cercle", "Cercle", "FR", ["en", "fr"], "official_artist", "dj", "https://www.cercle.io/"),
  YT("mixmag", "Mixmag", "Mixmag", "GB", ["en"], "authorized_platform", "dj", "https://mixmag.net/"),
  YT("djmag", "DJ Mag", "DJMag", "GB", ["en"], "authorized_platform", "dj", "https://djmag.com/"),

  // --- Non-YouTube starters (feeds/players) ---
  {
    stableKey: "vimeo-arte-concert",
    name: "ARTE Concert on Vimeo",
    provider: "vimeo",
    providerType: "public_broadcaster",
    countryCode: "FR",
    languageCodes: ["fr", "de", "en"],
    officialUrl: "https://www.arte.tv/en/arte-concert/",
    mediaChannelUrl: "https://vimeo.com/arteconcert",
    category: "broadcaster",
    sourceOwner: "ARTE Concert",
  },
  {
    stableKey: "vimeo-montreux",
    name: "Montreux Jazz on Vimeo",
    provider: "vimeo",
    providerType: "official_festival",
    countryCode: "CH",
    languageCodes: ["en", "fr"],
    officialUrl: "https://www.montreuxjazzfestival.com/",
    mediaChannelUrl: "https://vimeo.com/montreuxjazzfestival",
    category: "festival",
    sourceOwner: "Montreux Jazz Festival",
  },
  {
    stableKey: "twitch-monstercat",
    name: "Monstercat Twitch",
    provider: "twitch",
    providerType: "official_artist",
    countryCode: "CA",
    languageCodes: ["en"],
    officialUrl: "https://www.monstercat.com/",
    mediaChannelUrl: "https://www.twitch.tv/monstercat",
    category: "dj",
    sourceOwner: "Monstercat",
  },
  {
    stableKey: "twitch-fender",
    name: "Fender Twitch",
    provider: "twitch",
    providerType: "official_artist",
    countryCode: "US",
    languageCodes: ["en"],
    officialUrl: "https://www.fender.com/",
    mediaChannelUrl: "https://www.twitch.tv/fender",
    category: "artist",
    sourceOwner: "Fender",
  },
  {
    stableKey: "dailymotion-arte",
    name: "ARTE on Dailymotion",
    provider: "dailymotion",
    providerType: "public_broadcaster",
    countryCode: "FR",
    languageCodes: ["fr", "de"],
    officialUrl: "https://www.arte.tv/",
    mediaChannelUrl: "https://www.dailymotion.com/ARTEfr",
    category: "broadcaster",
    sourceOwner: "ARTE",
  },
];

export function waveSeedToConcertSourceSeed(wave: ConcertWaveSeed): ConcertSourceSeed {
  return withConcertImportFlags({
    // Keep displayable name unique vs curated (name+official_url unique index).
    stableKey: wave.stableKey,
    name: `${wave.name} [${wave.provider}/${wave.stableKey}]`,
    providerType: wave.providerType,
    provider: wave.provider === "youtube" || wave.provider === "vimeo" || wave.provider === "dailymotion" || wave.provider === "twitch"
      ? (wave.provider as ConcertSourceSeed["provider"])
      : wave.provider === "hls" || wave.provider === "dash" || wave.provider === "iframe"
        ? "official_website"
        : (wave.provider as ConcertSourceSeed["provider"]),
    officialUrl: `${wave.officialUrl.replace(/\/$/, "")}#ht-source=${encodeURIComponent(wave.stableKey)}`,
    mediaChannelUrl: wave.mediaChannelUrl,
    providerChannelId: wave.providerChannelId || null,
    countryCode: wave.countryCode,
    region: null,
    languageCodes: wave.languageCodes,
    sourceOwner: wave.sourceOwner,
    ownershipEvidenceUrl: wave.officialUrl,
    authorizationBasis: "institutional_official",
    termsUrl: null,
    embedPolicy:
      wave.provider === "youtube" ||
      wave.provider === "vimeo" ||
      wave.provider === "dailymotion" ||
      wave.provider === "twitch"
        ? "provider_player_required"
        : "official_embed_allowed",
    contentScope: `Official ${wave.category} concert / live performance content from ${wave.name}.`,
    expectedConcertFormats: ["full_concert", "festival_set", "livestream", "orchestra_performance"],
    supportedCountries: [wave.countryCode],
    geoRestrictions: {},
    matureContentPossible: false,
    enabled: true,
    importEnabled: false,
    validationMethod: "official_site+app_playback_validation",
    reliabilityScore: 75,
    lastReviewedAt: REVIEWED,
    reviewNotes: `Batch 2 worldwide wave — ${wave.category}. Identity resolved when possible; never invented.`,
  });
}

export function listBatch2WaveSourceSeeds(): ConcertSourceSeed[] {
  return [...CONCERT_BATCH2_WAVE_SEEDS, ...CONCERT_BATCH2_WAVE_B_SEEDS].map(
    waveSeedToConcertSourceSeed
  );
}
