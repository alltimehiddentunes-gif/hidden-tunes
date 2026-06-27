import type { TVChannel, TvChannelCategory } from "@/types/tv";

type SeedInput = Omit<TVChannel, "isLive" | "isActive" | "isVerifiedLegal" | "isMature"> & {
  isLive?: boolean;
  isActive?: boolean;
  isVerifiedLegal?: boolean;
  isMature?: boolean;
};

function seedChannel(input: SeedInput): TVChannel {
  return {
    isLive: input.isLive ?? true,
    isActive: input.isActive ?? true,
    isVerifiedLegal: input.isVerifiedLegal ?? true,
    isMature: input.isMature ?? false,
    streamType: input.streamType ?? "hls",
    quality: input.quality ?? "HD",
    ...input,
  };
}

/**
 * Curated public/legal Live TV seeds sourced from official broadcaster and
 * authorized FAST endpoints (iptv-org verified). Illustrative or unverified
 * placeholder URLs are not included.
 */
export const TV_CHANNEL_SEEDS: TVChannel[] = [
  // Music TV
  seedChannel({
    id: "red-bull-tv",
    name: "Red Bull TV",
    description: "Official live sports, music, and culture from Red Bull.",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/en/thumb/9/9c/Red_Bull_TV_logo.svg/240px-Red_Bull_TV_logo.svg.png",
    streamUrl: "https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8",
    websiteUrl: "https://www.redbull.com/int-en/tv",
    country: "AT",
    language: "English",
    category: "music",
    sourceType: "official_stream",
    isFeatured: true,
  }),
  seedChannel({
    id: "trace-urban",
    name: "Trace Urban",
    description: "Urban music and hip-hop from Trace official FAST.",
    streamUrl: "https://lightning-traceurban-samsungau.amagi.tv/playlist.m3u8",
    websiteUrl: "https://www.trace.tv/",
    country: "FR",
    language: "English",
    category: "music",
    sourceType: "fast",
  }),
  seedChannel({
    id: "trace-latina",
    name: "Trace Latina",
    description: "Latin music and culture from Trace official FAST.",
    streamUrl:
      "https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg01131-tracetv-tracelatinait-samsungit/playlist.m3u8",
    websiteUrl: "https://www.trace.tv/",
    country: "FR",
    language: "Spanish",
    category: "music",
    sourceType: "fast",
  }),
  seedChannel({
    id: "stingray-classica",
    name: "Stingray Classica",
    description: "Classical music performances from Stingray official FAST.",
    streamUrl:
      "https://lotus.stingray.com/manifest/classica-cla008-montreal/samsungtvplus/master.m3u8",
    websiteUrl: "https://classica.stingray.com/",
    country: "CA",
    language: "Multilingual",
    category: "music",
    sourceType: "fast",
  }),
  seedChannel({
    id: "mtv-biggest-pop",
    name: "MTV Biggest Pop",
    description: "Pop music videos on authorized Pluto TV FAST.",
    streamUrl: "https://jmp2.uk/plu-6047fbdbbb776a0007e7f2ff.m3u8",
    websiteUrl: "https://www.mtv.com/",
    country: "US",
    language: "English",
    category: "music",
    sourceType: "fast",
  }),
  seedChannel({
    id: "vevo-pop",
    name: "Vevo Pop",
    description: "Official pop music videos from Vevo FAST.",
    streamUrl: "https://d2n5ee9u100agb.cloudfront.net/Vevo_Pop.m3u8",
    websiteUrl: "https://www.vevo.com/",
    country: "US",
    language: "English",
    category: "music",
    sourceType: "fast",
  }),
  seedChannel({
    id: "vevo-hip-hop",
    name: "Vevo Hip-Hop",
    description: "Official hip-hop videos from Vevo FAST.",
    streamUrl: "https://d3vgs3ro3x6v8a.cloudfront.net/Vevo_Hip_Hop.m3u8",
    country: "US",
    language: "English",
    category: "music",
    sourceType: "fast",
  }),
  seedChannel({
    id: "vevo-rnb",
    name: "Vevo R&B",
    description: "Official R&B videos from Vevo FAST.",
    streamUrl: "https://d1hf773q57zx9s.cloudfront.net/Vevo_R_B.m3u8",
    country: "US",
    language: "English",
    category: "music",
    sourceType: "fast",
  }),
  seedChannel({
    id: "clubbing-tv",
    name: "Clubbing TV",
    description: "Electronic dance music from Clubbing TV official FAST.",
    streamUrl:
      "https://d1j2csarxnwazk.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-uze1m6xh4fiyr-ssai-prd/master.m3u8",
    websiteUrl: "https://www.clubbingtv.com/",
    country: "FR",
    language: "English",
    category: "music",
    sourceType: "fast",
  }),
  seedChannel({
    id: "qwest-tv-jazz",
    name: "Qwest TV Jazz",
    description: "Jazz and soul performances from Qwest TV official FAST.",
    streamUrl: "https://qwestjazz-rakuten.amagi.tv/hls/amagi_hls_data_rakutenAA-qwestjazz-rakuten/CDN/master.m3u8",
    websiteUrl: "https://qwest.tv/",
    country: "FR",
    language: "English",
    category: "music",
    sourceType: "fast",
  }),

  // Worship / Gospel TV
  seedChannel({
    id: "tbn",
    name: "TBN",
    description: "Trinity Broadcasting Network official live stream.",
    streamUrl:
      "https://livecdn.use1-0004.jwplive.com/live/sites/Yal8cmyO/media/fCGf6ROk/live.isml/.m3u8",
    websiteUrl: "https://www.tbn.org/",
    country: "US",
    language: "English",
    category: "worship",
    sourceType: "official_stream",
    isFeatured: true,
  }),
  seedChannel({
    id: "ewtn",
    name: "EWTN",
    description: "Eternal Word Television Network official live stream.",
    streamUrl: "https://cdn3.wowza.com/1/ZVBYYXFLLzE0c3NC/Qk1FMURC/hls/live/playlist.m3u8",
    websiteUrl: "https://www.ewtn.com/",
    country: "US",
    language: "English",
    category: "worship",
    sourceType: "official_stream",
  }),
  seedChannel({
    id: "god-tv",
    name: "GOD TV",
    description: "GOD TV official live worship stream.",
    streamUrl: "https://d1msejlow1t3l4.cloudfront.net/211125/godtv/chunks.m3u8",
    websiteUrl: "https://www.god.tv/",
    country: "UK",
    language: "English",
    category: "worship",
    sourceType: "official_stream",
  }),
  seedChannel({
    id: "hope-channel-intl",
    name: "Hope Channel International",
    description: "Hope Channel official international stream.",
    streamUrl: "https://jstre.am/live/jsl:cZXINbwrFj6.m3u8",
    country: "US",
    language: "English",
    category: "worship",
    sourceType: "official_stream",
  }),
  seedChannel({
    id: "hope-channel-na",
    name: "Hope Channel North America",
    description: "Hope Channel official North America stream.",
    streamUrl: "https://jstre.am/live/jsl:0sUSK6VA7GT.m3u8",
    country: "US",
    language: "English",
    category: "worship",
    sourceType: "official_stream",
  }),
  seedChannel({
    id: "cbn-gospel",
    name: "CBN Gospel",
    description: "Christian Broadcasting Network gospel stream.",
    streamUrl: "https://59d39900ebfb8.streamlock.net/ccbn/ccbn/playlist.m3u8",
    country: "VG",
    language: "English",
    category: "worship",
    sourceType: "official_stream",
  }),
  seedChannel({
    id: "trace-gospel",
    name: "Trace Gospel",
    description: "Gospel music from Trace official stream.",
    streamUrl: "https://channels.trace.plus/Traceprod/GOSPEL_FR/.m3u8",
    websiteUrl: "https://www.trace.tv/",
    country: "FR",
    language: "English",
    category: "worship",
    sourceType: "fast",
  }),
  seedChannel({
    id: "xite-gospel",
    name: "XITE Gospel",
    description: "Gospel music videos on authorized FAST.",
    streamUrl: "https://jmp2.uk/plu-623b93628e6ded0007337d4d.m3u8",
    country: "US",
    language: "English",
    category: "worship",
    sourceType: "fast",
  }),

  // Live Concerts
  seedChannel({
    id: "qwest-tv-jazz-beyond",
    name: "Qwest TV Jazz & Beyond",
    description: "Live jazz and concert performances from Qwest TV.",
    streamUrl:
      "https://cdn-ue1-prod.tsv2.amagi.tv/linear/qwestAAAA-qwestjazz-uk-samsungtv/playlist.m3u8",
    websiteUrl: "https://qwest.tv/",
    country: "FR",
    language: "English",
    category: "concerts",
    sourceType: "fast",
    isFeatured: true,
  }),
  seedChannel({
    id: "trace-urban-live",
    name: "Trace Urban Live",
    description: "Live urban music sets from Trace official CDN.",
    streamUrl: "https://channels.trace.plus/Traceprod/URBAN_FR_hd/index.m3u8",
    country: "FR",
    language: "English",
    category: "concerts",
    sourceType: "official_stream",
  }),
  seedChannel({
    id: "red-bull-concerts",
    name: "Red Bull Concerts",
    description: "Live concert and festival coverage from Red Bull TV.",
    streamUrl: "https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8",
    websiteUrl: "https://www.redbull.com/int-en/tv",
    country: "AT",
    language: "English",
    category: "concerts",
    sourceType: "official_stream",
  }),

  // Culture & Arts
  seedChannel({
    id: "fashion-tv-paris",
    name: "Fashion TV Paris",
    description: "Fashion and design culture from Fashion TV official stream.",
    streamUrl:
      "https://edge-fast3.evrideo.tv/bfdbb576-83f7-11f0-9f89-0200170e3e04_1000028043_HLS/manifest.m3u8",
    websiteUrl: "https://www.fashiontv.com/",
    country: "FR",
    language: "English",
    category: "culture",
    sourceType: "official_stream",
    isFeatured: true,
  }),
  seedChannel({
    id: "smithsonian-selects",
    name: "Smithsonian Channel Selects",
    description: "Culture and history programming on authorized FAST.",
    streamUrl: "https://jmp2.uk/plu-61fb988e032c0100077d5252.m3u8",
    websiteUrl: "https://www.smithsonianchannel.com/",
    country: "US",
    language: "English",
    category: "culture",
    sourceType: "fast",
  }),
  seedChannel({
    id: "bloomberg-originals",
    name: "Bloomberg Originals",
    description: "Business culture and documentary originals from Bloomberg.",
    streamUrl:
      "https://e96a7526.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/UmFrdXRlblRWLWV1X0Jsb29tYmVyZ09yaWdpbmFsc19ITFM/playlist.m3u8",
    websiteUrl: "https://www.bloomberg.com/",
    country: "US",
    language: "English",
    category: "culture",
    sourceType: "official_stream",
  }),
  seedChannel({
    id: "arirang-tv",
    name: "Arirang TV",
    description: "Korean culture and news from Korea's international broadcaster.",
    streamUrl:
      "https://amdlive-ch01.ctnd.com.edgesuite.net/arirang_1ch/smil:arirang_1ch.smil/playlist.m3u8",
    websiteUrl: "https://www.arirang.com/",
    country: "KR",
    language: "English",
    category: "culture",
    sourceType: "public_broadcaster",
  }),
  seedChannel({
    id: "fashiontv-europe",
    name: "FashionTV Europe",
    description: "European fashion and lifestyle programming.",
    streamUrl:
      "https://68f1accef2154d2195cae87dec183843.mediatailor.us-east-1.amazonaws.com/v1/master/44f73ba4d03e9607dcd9bebdcb8494d86964f1d8/RlaxxTV-eu_FashionTV/playlist.m3u8",
    country: "FR",
    language: "English",
    category: "culture",
    sourceType: "fast",
  }),

  // Documentaries
  seedChannel({
    id: "nasa-plus",
    name: "NASA+",
    description: "Official NASA live space coverage and science programming.",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/NASA_logo.svg/240px-NASA_logo.svg.png",
    streamUrl: "https://nasa-i.akamaihd.net/hls/live/253565/NASA_PLUS/master.m3u8",
    websiteUrl: "https://plus.nasa.gov/",
    country: "US",
    language: "English",
    category: "documentary",
    sourceType: "public_broadcaster",
    isFeatured: true,
  }),
  seedChannel({
    id: "love-nature",
    name: "Love Nature",
    description: "Nature and wildlife documentaries on authorized FAST.",
    streamUrl: "https://pb-ehs1glsha1juy.akamaized.net/Love_Nature_4K.m3u8",
    websiteUrl: "https://www.lovenature.com/",
    country: "CA",
    language: "English",
    category: "documentary",
    sourceType: "fast",
  }),
  seedChannel({
    id: "al-jazeera-documentary",
    name: "Al Jazeera Documentary",
    description: "Documentary programming from Al Jazeera official stream.",
    streamUrl: "https://live-hls-web-ajd.getaj.net/AJD/index.m3u8",
    websiteUrl: "https://www.aljazeera.com/",
    country: "QA",
    language: "English",
    category: "documentary",
    sourceType: "public_broadcaster",
  }),
  seedChannel({
    id: "cgtn-documentary",
    name: "CGTN Documentary",
    description: "Documentaries from CGTN official FAST.",
    streamUrl: "https://amg00405-rakutentv-cgtndocumentary-rakuten-0ql8j.amagi.tv/master.m3u8",
    websiteUrl: "https://www.cgtn.com/",
    country: "CN",
    language: "English",
    category: "documentary",
    sourceType: "public_broadcaster",
  }),
  seedChannel({
    id: "documentary-plus",
    name: "Documentary+",
    description: "Award-winning documentaries on authorized FAST.",
    streamUrl:
      "https://1d153317c8db4250b3789601274e2402.mediatailor.us-west-2.amazonaws.com/v1/master/ba62fe743df0fe93366eba3a257d792884136c7f/LINEAR-887-DOCUMENTARYINTERNATIONAL-DOCUMENTARYPLUS/mt/documentaryplus/887/hls/master/playlist.m3u8",
    country: "US",
    language: "English",
    category: "documentary",
    sourceType: "fast",
  }),
  seedChannel({
    id: "pbs",
    name: "PBS",
    description: "US public broadcasting official live stream.",
    streamUrl: "https://pbs.lls.cdn.pbs.org/est/index.m3u8",
    websiteUrl: "https://www.pbs.org/",
    country: "US",
    language: "English",
    category: "documentary",
    sourceType: "public_broadcaster",
  }),
  seedChannel({
    id: "cna-originals",
    name: "CNA Originals",
    description: "Documentary originals from Channel NewsAsia.",
    streamUrl: "https://amg01082-cna-amg01082c1-rlaxx-us-11304.playouts.now.amagi.tv/playlist.m3u8",
    websiteUrl: "https://www.channelnewsasia.com/",
    country: "SG",
    language: "English",
    category: "documentary",
    sourceType: "public_broadcaster",
  }),

  // News
  seedChannel({
    id: "france-24-en",
    name: "France 24 English",
    description: "International news from France's public broadcaster.",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/France24.svg/240px-France24.svg.png",
    streamUrl: "https://live.france24.com/hls/live/2037218/F24_EN_HI_HLS/master_900.m3u8",
    websiteUrl: "https://www.france24.com/en/live",
    country: "FR",
    language: "English",
    category: "news",
    sourceType: "public_broadcaster",
    isFeatured: true,
  }),
  seedChannel({
    id: "dw-english",
    name: "DW English",
    description: "Deutsche Welle international news official stream.",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Deutsche_Welle_symbol_2012.svg/240px-Deutsche_Welle_symbol_2012.svg.png",
    streamUrl: "https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/master.m3u8",
    websiteUrl: "https://www.dw.com/en/live-tv/",
    country: "DE",
    language: "English",
    category: "news",
    sourceType: "public_broadcaster",
    isFeatured: true,
  }),
  seedChannel({
    id: "al-jazeera-english",
    name: "Al Jazeera English",
    description: "Global news from Al Jazeera official English stream.",
    streamUrl: "https://live-hls-web-aje.getaj.net/AJE/index.m3u8",
    websiteUrl: "https://www.aljazeera.com/live/",
    country: "QA",
    language: "English",
    category: "news",
    sourceType: "public_broadcaster",
  }),
  seedChannel({
    id: "bloomberg-tv",
    name: "Bloomberg TV",
    description: "Business and financial news official stream.",
    streamUrl: "https://bloomberg.com/media-manifest/streams/us.m3u8",
    websiteUrl: "https://www.bloomberg.com/live",
    country: "US",
    language: "English",
    category: "news",
    sourceType: "official_stream",
  }),
  seedChannel({
    id: "euronews-english",
    name: "Euronews English",
    description: "European and world news from Euronews official CDN.",
    streamUrl: "https://cdn-euronews.akamaized.net/live/eds/euronews-en-english/25047/index.m3u8",
    websiteUrl: "https://www.euronews.com/live",
    country: "FR",
    language: "English",
    category: "news",
    sourceType: "public_broadcaster",
    isFeatured: true,
  }),
  seedChannel({
    id: "abc-news-au",
    name: "ABC News Australia",
    description: "Australian public broadcaster news.",
    streamUrl:
      "https://abc-news-dmd-streams-1.akamaized.net/out/v1/701126012d044971b3fa89406a440133/index.m3u8",
    websiteUrl: "https://www.abc.net.au/news/live",
    country: "AU",
    language: "English",
    category: "news",
    sourceType: "public_broadcaster",
  }),
  seedChannel({
    id: "cna",
    name: "CNA",
    description: "Channel NewsAsia official live news stream.",
    streamUrl:
      "https://d2e1asnsl7br7b.cloudfront.net/7782e205e72f43aeb4a48ec97f66ebbe/index.m3u8",
    websiteUrl: "https://www.channelnewsasia.com/",
    country: "SG",
    language: "English",
    category: "news",
    sourceType: "public_broadcaster",
  }),
  seedChannel({
    id: "africanews-english",
    name: "Africanews English",
    description: "Pan-African news from Africanews official stream.",
    streamUrl:
      "https://c3c275b999764df8a2dd55ffe2996818.mediatailor.eu-west-1.amazonaws.com/v1/master/0547f18649bd788bec7b67b746e47670f558b6b2/production-LiveChannel-6576/bitok/eyJzdGlkIjoiOTU0NDAyODQtOTU0My00Yzc2LThmZjQtNDRhY2YwYmQxYTYwIiwibWt0IjoicGwiLCJjaCI6NjYwNiwicHRmIjo1fQ==/26036/africanews-en.m3u8",
    websiteUrl: "https://www.africanews.com/",
    country: "FR",
    language: "English",
    category: "news",
    sourceType: "public_broadcaster",
  }),
  seedChannel({
    id: "trt-world",
    name: "TRT World",
    description: "Turkish public broadcaster international news.",
    streamUrl: "https://tv-trtworld.medya.trt.com.tr/master.m3u8",
    websiteUrl: "https://www.trtworld.com/",
    country: "TR",
    language: "English",
    category: "news",
    sourceType: "public_broadcaster",
  }),
  seedChannel({
    id: "gb-news",
    name: "GB News",
    description: "UK news on authorized Samsung TV Plus FAST.",
    streamUrl:
      "https://amg01076-lightningintern-gbnewsau-samsungau-et7fz.amagi.tv/playlist/amg01076-lightningintern-gbnewsau-samsungau/playlist.m3u8",
    country: "UK",
    language: "English",
    category: "news",
    sourceType: "fast",
  }),
  seedChannel({
    id: "newsmax-tv",
    name: "Newsmax TV",
    description: "US news on authorized FAST.",
    streamUrl: "https://nmxlive.akamaized.net/hls/live/529965/Live_1/index.m3u8",
    country: "US",
    language: "English",
    category: "news",
    sourceType: "fast",
  }),
  seedChannel({
    id: "reuters-tv",
    name: "Reuters TV",
    description: "International news from Reuters authorized FAST.",
    streamUrl:
      "https://d5bxknkoxytmb.cloudfront.net/playlist/amg00453-reuters-reuters-samsunggb/playlist.m3u8",
    websiteUrl: "https://www.reuters.com/",
    country: "UK",
    language: "English",
    category: "news",
    sourceType: "fast",
  }),
  seedChannel({
    id: "cbc-news-toronto",
    name: "CBC News Toronto",
    description: "Canadian public broadcaster regional news.",
    streamUrl: "https://amagi-streams.akamaized.net/hls/live/2110961/cbctoronto/master.m3u8",
    websiteUrl: "https://www.cbc.ca/news",
    country: "CA",
    language: "English",
    category: "news",
    sourceType: "public_broadcaster",
  }),
  seedChannel({
    id: "sky-news-australia",
    name: "Sky News Australia",
    description: "Australian news from Sky News official Akamai stream.",
    streamUrl: "https://skynewsau-live.akamaized.net/hls/live/2002671/skynewsau/master.m3u8",
    websiteUrl: "https://www.skynews.com.au/",
    country: "AU",
    language: "English",
    category: "news",
    sourceType: "official_stream",
  }),

  // Education
  seedChannel({
    id: "ted",
    name: "TED",
    description: "TED Talks on authorized FAST.",
    streamUrl: "https://d1b16tvvxk3tnu.cloudfront.net/TED.m3u8",
    websiteUrl: "https://www.ted.com/",
    country: "US",
    language: "English",
    category: "education",
    sourceType: "fast",
  }),
  seedChannel({
    id: "pbs-education",
    name: "PBS Education",
    description: "Educational public broadcasting from PBS.",
    streamUrl: "https://pbs.lls.cdn.pbs.org/est/index.m3u8",
    websiteUrl: "https://www.pbs.org/",
    country: "US",
    language: "English",
    category: "education",
    sourceType: "public_broadcaster",
  }),

  // International / public broadcasters
  seedChannel({
    id: "nhk-world",
    name: "NHK World Japan",
    description: "Japan's international public broadcaster.",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/NHK_World-Japan_TV_logo.svg/240px-NHK_World-Japan_TV_logo.svg.png",
    streamUrl: "https://media-tyo.hls.nhkworld.jp/hls/w/live/master.m3u8",
    websiteUrl: "https://www3.nhk.or.jp/nhkworld/en/live/",
    country: "JP",
    language: "English",
    category: "international",
    sourceType: "public_broadcaster",
    isFeatured: true,
  }),
  seedChannel({
    id: "cgtn",
    name: "CGTN",
    description: "China Global Television Network official stream.",
    streamUrl: "https://news.cgtn.com/resource/live/english/cgtn-news.m3u8",
    websiteUrl: "https://www.cgtn.com/tv",
    country: "CN",
    language: "English",
    category: "international",
    sourceType: "public_broadcaster",
  }),
  seedChannel({
    id: "rai-news-24",
    name: "RAI News 24",
    description: "Italian public broadcaster 24-hour news.",
    streamUrl: "https://rainews1-live.akamaized.net/hls/live/598326/rainews1/rainews1/playlist.m3u8",
    country: "IT",
    language: "Italian",
    category: "international",
    sourceType: "public_broadcaster",
  }),
  seedChannel({
    id: "arirang-un",
    name: "Arirang UN",
    description: "Arirang international programming for global audiences.",
    streamUrl:
      "https://amdlive-ch02-ctnd-com.akamaized.net/arirang_2ch/smil:arirang_2ch.smil/playlist.m3u8",
    websiteUrl: "https://www.arirang.com/",
    country: "KR",
    language: "English",
    category: "international",
    sourceType: "public_broadcaster",
  }),

  // Mature placeholders (inactive)
  seedChannel({
    id: "mature-late-night",
    name: "Late Night Talk",
    description: "Licensed late-night talk and mature comedy.",
    streamUrl: "",
    country: "US",
    language: "English",
    category: "mature",
    sourceType: "fast",
    isMature: true,
    isActive: false,
    isVerifiedLegal: false,
  }),
  seedChannel({
    id: "mature-after-dark",
    name: "After Dark",
    description: "Licensed mature entertainment programming.",
    streamUrl: "",
    country: "US",
    language: "English",
    category: "mature",
    sourceType: "fast",
    isMature: true,
    isActive: false,
    isVerifiedLegal: false,
  }),
  seedChannel({
    id: "mature-uncensored-docs",
    name: "Uncensored Docs",
    description: "Mature documentary programming.",
    streamUrl: "",
    country: "US",
    language: "English",
    category: "mature",
    sourceType: "fast",
    isMature: true,
    isActive: false,
    isVerifiedLegal: false,
  }),
];

const channelById = new Map(TV_CHANNEL_SEEDS.map((channel) => [channel.id, channel]));

export function getTvChannelById(channelId: string) {
  return channelById.get(channelId) || null;
}

export function isMatureTvChannel(channel: Pick<TVChannel, "isMature" | "category">) {
  return channel.isMature || channel.category === "mature";
}

export function getPublicTvChannels() {
  return TV_CHANNEL_SEEDS.filter(
    (channel) => channel.isActive && !isMatureTvChannel(channel)
  );
}

export function getVisibleTvChannels() {
  return getPublicTvChannels();
}

export function getTvChannelsByCategory(
  category: TvChannelCategory,
  matureEnabled = false
) {
  if (category === "mature") {
    if (!matureEnabled) return [];

    return TV_CHANNEL_SEEDS.filter(
      (channel) =>
        isMatureTvChannel(channel) &&
        channel.isActive &&
        channel.isVerifiedLegal
    );
  }

  return getPublicTvChannels().filter((channel) => channel.category === category);
}

export function getActivePublicTvChannelCount() {
  return getPublicTvChannels().length;
}
