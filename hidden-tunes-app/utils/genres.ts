import { CANONICAL_GENRES } from "./catalogResolver";

export type HiddenTunesGenre = {
  id: string;
  title: string;
  query: string;
  emoji: string;
  aliases?: string[];
};

export const HIDDEN_TUNES_GENRES: HiddenTunesGenre[] = CANONICAL_GENRES.map(
  (genre) => ({
    id: genre.id,
    title: genre.title,
    query: genre.query,
    emoji: genre.emoji,
    aliases: genre.aliases,
  })
);
