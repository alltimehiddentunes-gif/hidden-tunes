export type RadioBrowserStationRaw = {
  stationuuid?: string;
  name?: string;
  url?: string;
  url_resolved?: string;
  favicon?: string;
  country?: string;
  countrycode?: string;
  language?: string;
  tags?: string;
  bitrate?: number;
  codec?: string;
  votes?: number;
  clickcount?: number;
};

export type HiddenTunesStation = {
  id: string;
  name: string;
  streamUrl: string;
  favicon?: string;
  country?: string;
  language?: string;
  tags: string[];
  bitrate?: number;
  codec?: string;
  categoryId: string;
  cachedAt: number;
};

export type RadioStation = {
  id: string;
  title: string;
  streamUrl: string;
  artworkUrl?: string;
  country?: string;
  tags?: string[];
  genre?: string;
  source: "radio";
};
