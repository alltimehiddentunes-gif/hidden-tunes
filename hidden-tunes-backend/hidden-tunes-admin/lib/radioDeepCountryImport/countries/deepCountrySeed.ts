export type DeepCountrySeed = {
  name: string;
  native_name?: string;
  stream_url: string;
  homepage_url?: string;
  source_page?: string;
  city?: string;
  region?: string;
  language?: string;
  languages?: string[];
  genres?: string[];
  network?: string;
  broadcaster?: string;
  source_tier: 1 | 2 | 3;
  attribution: string;
  mature?: boolean;
  notes?: string;
};
