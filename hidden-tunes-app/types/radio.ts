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
