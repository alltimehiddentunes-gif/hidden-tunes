export type MaturePodcastSeed = {
  id: string;
  title: string;
  publisher: string;
  description: string;
  feedUrl?: string;
  artworkUrl?: string;
  isExplicit: true;
  matureLevel: "explicit" | "adult";
  categories: string[];
  keywords: string[];
  featured?: boolean;
  trending?: boolean;
  isNew?: boolean;
};

export { MATURE_PODCAST_SEEDS } from "./maturePodcastSeedCatalog";
