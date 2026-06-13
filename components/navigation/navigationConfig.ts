import { Ionicons } from "@expo/vector-icons";

export type NavigationIconName = keyof typeof Ionicons.glyphMap;

export type NavigationSection =
  | "primary"
  | "library"
  | "media"
  | "account"
  | "creator"
  | "admin";

export type NavigationRoute =
  | "/music-feed"
  | "/worlds"
  | "/search"
  | "/player"
  | "/queue"
  | "/lyrics"
  | "/radio"
  | "/favorites"
  | "/playlists"
  | "/recently-played"
  | "/cloud-playlists"
  | "/downloads"
  | "/youtube-feed"
  | "/profile"
  | "/auth"
  | "/admin/upload"
  | "/admin-dashboard"
  | "/artist-submissions"
  | "/uploader-dashboard";

export type AppNavigationItem = {
  id: string;
  label: string;
  route: NavigationRoute;
  icon: NavigationIconName;
  activeIcon: NavigationIconName;
  section: NavigationSection;
  mobileVisible: boolean;
  desktopVisible: boolean;
  matches: string[];
};

export const NAVIGATION_ITEMS: AppNavigationItem[] = [
  {
    id: "home",
    label: "Home",
    route: "/music-feed",
    icon: "home-outline",
    activeIcon: "home",
    section: "primary",
    mobileVisible: true,
    desktopVisible: true,
    matches: ["/music-feed"],
  },
  {
    id: "search",
    label: "Search",
    route: "/search",
    icon: "search-outline",
    activeIcon: "search",
    section: "primary",
    mobileVisible: false,
    desktopVisible: true,
    matches: ["/search"],
  },
  {
    id: "explore",
    label: "Explore",
    route: "/worlds",
    icon: "sparkles-outline",
    activeIcon: "sparkles",
    section: "primary",
    mobileVisible: true,
    desktopVisible: true,
    matches: ["/worlds"],
  },
  {
    id: "player",
    label: "Player",
    route: "/player",
    icon: "play-circle-outline",
    activeIcon: "play-circle",
    section: "primary",
    mobileVisible: true,
    desktopVisible: true,
    matches: ["/player", "/queue", "/lyrics", "/radio"],
  },
  {
    id: "library",
    label: "Library",
    route: "/favorites",
    icon: "library-outline",
    activeIcon: "library",
    section: "library",
    mobileVisible: true,
    desktopVisible: true,
    matches: ["/favorites", "/playlists", "/playlist", "/recently-played", "/cloud-playlists"],
  },
  {
    id: "tv",
    label: "TV",
    route: "/youtube-feed",
    icon: "tv-outline",
    activeIcon: "tv",
    section: "media",
    mobileVisible: true,
    desktopVisible: true,
    matches: ["/youtube-feed", "/youtube-player"],
  },
  {
    id: "profile",
    label: "Profile",
    route: "/profile",
    icon: "person-circle-outline",
    activeIcon: "person-circle",
    section: "account",
    mobileVisible: true,
    desktopVisible: true,
    matches: ["/profile"],
  },
  {
    id: "queue",
    label: "Queue",
    route: "/queue",
    icon: "list-outline",
    activeIcon: "list",
    section: "primary",
    mobileVisible: false,
    desktopVisible: true,
    matches: ["/queue"],
  },
  {
    id: "lyrics",
    label: "Lyrics",
    route: "/lyrics",
    icon: "mic-outline",
    activeIcon: "mic",
    section: "primary",
    mobileVisible: false,
    desktopVisible: true,
    matches: ["/lyrics"],
  },
  {
    id: "radio",
    label: "Radio",
    route: "/radio",
    icon: "radio-outline",
    activeIcon: "radio",
    section: "media",
    mobileVisible: false,
    desktopVisible: true,
    matches: ["/radio"],
  },
  {
    id: "playlists",
    label: "Playlists",
    route: "/playlists",
    icon: "albums-outline",
    activeIcon: "albums",
    section: "library",
    mobileVisible: false,
    desktopVisible: true,
    matches: ["/playlists", "/playlist"],
  },
  {
    id: "downloads",
    label: "Downloads",
    route: "/downloads",
    icon: "download-outline",
    activeIcon: "download",
    section: "library",
    mobileVisible: false,
    desktopVisible: true,
    matches: ["/downloads"],
  },
  {
    id: "recently-played",
    label: "Recently Played",
    route: "/recently-played",
    icon: "time-outline",
    activeIcon: "time",
    section: "library",
    mobileVisible: false,
    desktopVisible: true,
    matches: ["/recently-played"],
  },
  {
    id: "cloud-playlists",
    label: "Cloud Playlists",
    route: "/cloud-playlists",
    icon: "cloud-outline",
    activeIcon: "cloud",
    section: "library",
    mobileVisible: false,
    desktopVisible: true,
    matches: ["/cloud-playlists"],
  },
  {
    id: "creator-upload",
    label: "Creator Upload",
    route: "/artist-submissions",
    icon: "cloud-upload-outline",
    activeIcon: "cloud-upload",
    section: "creator",
    mobileVisible: false,
    desktopVisible: true,
    matches: ["/artist-submissions"],
  },
  {
    id: "uploader-dashboard",
    label: "Uploader Dashboard",
    route: "/uploader-dashboard",
    icon: "construct-outline",
    activeIcon: "construct",
    section: "creator",
    mobileVisible: false,
    desktopVisible: true,
    matches: ["/uploader-dashboard"],
  },
  {
    id: "admin-upload",
    label: "Admin Upload",
    route: "/admin/upload",
    icon: "shield-checkmark-outline",
    activeIcon: "shield-checkmark",
    section: "admin",
    mobileVisible: false,
    desktopVisible: true,
    matches: ["/admin/upload"],
  },
  {
    id: "admin-dashboard",
    label: "Admin Dashboard",
    route: "/admin-dashboard",
    icon: "analytics-outline",
    activeIcon: "analytics",
    section: "admin",
    mobileVisible: false,
    desktopVisible: true,
    matches: ["/admin-dashboard"],
  },
];

export const MOBILE_BOTTOM_NAV_ITEMS = NAVIGATION_ITEMS.filter(
  (item) => item.mobileVisible
);

export const DESKTOP_SIDEBAR_NAV_ITEMS = NAVIGATION_ITEMS.filter(
  (item) => item.desktopVisible
);

export const NAVIGATION_SECTION_LABELS: Record<NavigationSection, string> = {
  primary: "Discover",
  library: "Library",
  media: "Media",
  account: "Account",
  creator: "Creator",
  admin: "Admin",
};

export const NAVIGATION_SECTION_ORDER: NavigationSection[] = [
  "primary",
  "library",
  "media",
  "creator",
  "admin",
  "account",
];
