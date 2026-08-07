export type EmotionalWorldStatus = "active" | "beta" | "draft" | "curation_required" | "disabled";
export type EmotionalWorldFamily = "peace-healing" | "relaxed-atmosphere" | "joy-celebration" | "love-relationships" | "deep-feelings" | "strength-growth" | "energy-movement" | "reflection-life" | "moments-connection";

export type EmotionalWorldProfile = {
  id: string; slug: string; name: string; description: string; family: EmotionalWorldFamily;
  status: EmotionalWorldStatus; priority: number; primarySignals: string[]; secondarySignals: string[];
  weakSignals: string[]; exclusions: string[]; contradictionRules: string[]; minimumScore: number;
  highConfidenceScore: number; broadenedScore: number; adjacentWorldIds: string[]; maximumOverlapPercent: number;
  artworkKey: string; profileVersion: string;
};

export const EMOTIONAL_INTELLIGENCE_VERSION = "emotional-worlds-2026.08.1";

const profile = (id: string, name: string, family: EmotionalWorldFamily, status: EmotionalWorldStatus, priority: number, primary: string[], secondary: string[], exclusions: string[] = [], adjacent: string[] = []): EmotionalWorldProfile => ({
  id, slug: id, name, description: `${name} — ${primary.slice(0, 3).join(", ")}.`, family, status, priority,
  primarySignals: primary, secondarySignals: secondary, weakSignals: [], exclusions,
  contradictionRules: exclusions, minimumScore: 8, highConfidenceScore: 18, broadenedScore: 5,
  adjacentWorldIds: adjacent, maximumOverlapPercent: 35, artworkKey: `emotional-world-${id}`,
  profileVersion: EMOTIONAL_INTELLIGENCE_VERSION,
});

const A = "active" as const, D = "draft" as const, C = "curation_required" as const;

export const EMOTIONAL_WORLD_REGISTRY: EmotionalWorldProfile[] = [
  profile("calm", "Calm", "peace-healing", A, 10, ["calm","peace","serene","soothing","gentle"], ["soft","healing","relaxation","ambient"], ["hype","aggressive","party","workout"], ["chill","healing"]),
  profile("deep-rest", "Deep Rest", "peace-healing", D, 20, ["sleep","rest","lullaby","deep relaxation"], ["nighttime","gentle instrumental","breathing"], ["high energy","hard percussion"]),
  profile("healing", "Healing", "peace-healing", D, 30, ["healing","recovery","acceptance","renewal"], ["hope","self forgiveness"], ["revenge","rage","party"]),
  profile("spiritual-peace", "Spiritual Peace", "peace-healing", C, 40, ["worship","faith","prayer","gratitude","spiritual"], ["gospel","surrender","divine"], ["party","aggression"]),
  profile("mindful-moments", "Mindful Moments", "peace-healing", D, 50, ["mindfulness","meditation","presence","breath"], ["instrumental","ambient","minimal","nature"], ["dance","high energy"]),
  profile("chill", "Chill", "relaxed-atmosphere", A, 60, ["chill","laid back","lounge","smooth","lofi"], ["vibey","mellow","cool"], ["aggressive","workout"], ["calm","late-night"]),
  profile("late-night", "Late Night", "relaxed-atmosphere", D, 70, ["late night","midnight","nocturnal","after hours"], ["slow r&b","moody soul","city night"], ["bright daytime","workout"]),
  profile("sunday-mood", "Sunday Mood", "relaxed-atmosphere", D, 80, ["sunday","easy morning","home","warm soul"], ["acoustic","soft jazz","relaxed gospel"], ["club","aggressive"]),
  profile("sunset-vibes", "Sunset Vibes", "relaxed-atmosphere", D, 90, ["sunset","golden hour","summer evening","coastal"], ["tropical","soft afrobeats","chill dance"]),
  profile("cozy", "Cozy", "relaxed-atmosphere", D, 100, ["cozy","comfort","warm","home","rainy day"], ["fireplace","soft acoustic","intimate"]),
  profile("happy", "Happy", "joy-celebration", A, 110, ["happy","joy","joyful","feel good","cheerful"], ["bright","positive","fun"], ["sad","heartbreak","lonely"], ["energetic","celebration"]),
  profile("celebration", "Celebration", "joy-celebration", D, 120, ["celebration","victory","birthday","achievement","festive"], ["wedding party","congratulations"], ["grief","heartbreak"]),
  profile("good-energy", "Good Energy", "joy-celebration", D, 130, ["good vibes","uplifting","positive energy","fresh"], ["bright groove","confidence","light dance"]),
  profile("carefree", "Carefree", "joy-celebration", D, 140, ["carefree","freedom","no worries","playful"], ["summer","road","adventure","lighthearted"]),
  profile("laugh-and-smile", "Laugh and Smile", "joy-celebration", C, 150, ["funny","playful","comedy","humorous"], ["cheeky","novelty","smile"]),
  profile("romantic", "Romantic", "love-relationships", A, 160, ["romantic","romance","love","tender","affection"], ["intimacy","devotion","lovers"], ["betrayal","breakup","loneliness","revenge"], ["chill","date-night"]),
  profile("date-night", "Date Night", "love-relationships", D, 170, ["date night","sensual","slow jam","candlelight"], ["intimate r&b","smooth soul","seductive"], ["heartbreak","family love"]),
  profile("wedding-love", "Wedding Love", "love-relationships", D, 180, ["wedding","forever","vows","marriage"], ["commitment","first dance","eternal love"]),
  profile("missing-you", "Missing You", "love-relationships", D, 190, ["missing you","longing","distance","yearning"], ["waiting","memories","absence"]),
  profile("self-love", "Self-Love", "love-relationships", D, 200, ["self love","self worth","boundaries","empowerment"], ["confidence","independence","choosing myself"], ["romantic dependence","revenge"]),
  profile("melancholy", "Melancholy", "deep-feelings", A, 210, ["melancholy","sad","lonely","sorrow"], ["emotional","reflective","tears"], ["hype","party","workout"], ["calm","heartbreak"]),
  profile("heartbreak", "Heartbreak", "deep-feelings", D, 220, ["heartbreak","breakup","betrayal","broken heart"], ["cheating","goodbye","abandoned"], ["healthy romance","wedding","celebration"]),
  profile("grief-and-loss", "Grief and Loss", "deep-feelings", C, 230, ["grief","mourning","bereavement","loss"], ["remembrance","funeral","gone"]),
  profile("lonely-nights", "Lonely Nights", "deep-feelings", D, 240, ["loneliness","alone","empty","isolated"], ["sleepless","cold night","nobody"]),
  profile("deep-feelings", "Deep Feelings", "deep-feelings", D, 250, ["soul baring","vulnerable","raw","confessional"], ["emotional","deep","introspective"]),
  profile("cry-it-out", "Cry It Out", "deep-feelings", C, 260, ["crying","tears","catharsis","breakdown"], ["pain","emotional release","wounded"]),
  profile("motivational", "Motivational", "strength-growth", A, 270, ["motivation","motivational","resilience","courage","determination"], ["strength","success","rise"], ["despair","sleep"], ["energetic","confidence"]),
  profile("confidence", "Confidence", "strength-growth", D, 280, ["confidence","fearless","powerful","self assured"], ["boss","winning","strong"], ["despair","sleep"]),
  profile("comeback", "Comeback", "strength-growth", D, 290, ["comeback","rise again","bounce back","survived"], ["stronger","restart","return"]),
  profile("focus", "Focus", "strength-growth", D, 300, ["focus","study","concentration","deep work"], ["productivity","instrumental","minimal"], ["party","aggressive vocals"]),
  profile("dream-big", "Dream Big", "strength-growth", D, 310, ["dreams","ambition","future","vision"], ["goals","destiny","purpose","believe"]),
  profile("morning-motivation", "Morning Motivation", "strength-growth", D, 320, ["morning","wake up","fresh start","new day"], ["motivation","gratitude","bright energy"]),
  profile("energetic", "Energetic", "energy-movement", A, 330, ["energetic","energy","hype","adrenaline","intense"], ["fast","movement","power"], ["sleep","calm","sad"], ["happy","motivational"]),
  profile("workout", "Workout", "energy-movement", D, 340, ["workout","gym","training","running"], ["pump","fitness","power","hard beat"]),
  profile("party", "Party", "energy-movement", D, 350, ["party","club","dancefloor","turn up"], ["nightlife","dj","rave","celebration"]),
  profile("dance", "Dance", "energy-movement", D, 360, ["dance","groove","choreography","movement"], ["dancehall","amapiano","edm","house"]),
  profile("road-trip", "Road Trip", "energy-movement", D, 370, ["road trip","driving","highway","travel"], ["journey","adventure","open road"]),
  profile("sports-energy", "Sports Energy", "energy-movement", C, 380, ["sports","stadium","competition","champion"], ["team","victory","adrenaline","anthem"]),
  profile("reflection", "Reflection", "reflection-life", D, 390, ["reflection","life","choices","introspective"], ["memories","wisdom","meaning","looking back"]),
  profile("life-lessons", "Life Lessons", "reflection-life", D, 400, ["wisdom","life lesson","truth","experience"], ["mistakes","consequences","maturity","advice"]),
  profile("nostalgia", "Nostalgia", "reflection-life", D, 410, ["nostalgia","memories","childhood","old days"], ["throwback","remember","past","vintage"]),
  profile("hidden-gems", "Hidden Gems", "reflection-life", C, 420, ["editorial hidden gem","low exposure"], ["strong completion","unique sound"]),
  profile("storytelling", "Storytelling", "reflection-life", C, 430, ["storytelling","narrative","character","confession"], ["story","journey","life event"]),
  profile("real-life", "Real Life", "reflection-life", D, 440, ["real life","struggle","family","survival"], ["poverty","work","society","truth"]),
  profile("family-and-home", "Family and Home", "moments-connection", D, 450, ["family","mother","father","child","home"], ["roots","belonging","parents"]),
  profile("friendship", "Friendship", "moments-connection", D, 460, ["friendship","friends","loyalty","together"], ["brotherhood","sisterhood","crew"]),
  profile("gratitude", "Gratitude", "moments-connection", D, 470, ["gratitude","thankful","blessed","grateful"], ["appreciation","grace"]),
  profile("african-pride", "African Pride", "moments-connection", C, 480, ["african pride","africa","heritage","homeland"], ["culture","roots","unity","diaspora"]),
];

export const PUBLIC_EMOTIONAL_WORLDS = EMOTIONAL_WORLD_REGISTRY.filter((world) => world.status === "active" || world.status === "beta");
export function getEmotionalWorld(id: string) { return EMOTIONAL_WORLD_REGISTRY.find((world) => world.id === id) ?? null; }
