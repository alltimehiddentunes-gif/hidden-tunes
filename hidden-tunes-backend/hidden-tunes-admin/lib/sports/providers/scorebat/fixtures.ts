/**
 * Sanitized ScoreBat fixture payloads for dry-run / offline tests.
 * No API tokens. Embeds use only allowed ScoreBat hosts.
 */

import type { ScoreBatMatch } from "./types";

function embedFor(videoId: string): string {
  return `<iframe src="https://www.scorebat.com/embed/v/${videoId}/?autoplay=0" frameborder="0" allowfullscreen></iframe>`;
}

export const SCOREBAT_FIXTURE_MATCHES: ScoreBatMatch[] = [
  {
    title: "Arsenal - Chelsea",
    competition: "ENGLAND: Premier League",
    date: new Date(Date.now() + 10 * 60_000).toISOString().replace(/\.\d{3}Z$/, "+0000"),
    thumbnail: "https://www.scorebat.com/static/thumb-fixture-a.jpg",
    homeTeam: { name: "Arsenal", slug: "arsenal", id: 1 },
    awayTeam: { name: "Chelsea", slug: "chelsea", id: 2 },
    videos: [
      {
        id: "live-arsenal-chelsea",
        title: "Live Stream",
        embed: embedFor("live-arsenal-chelsea"),
      },
    ],
  },
  {
    title: "Barcelona - Real Madrid",
    competition: "SPAIN: La Liga",
    date: new Date(Date.now() + 90 * 60_000).toISOString().replace(/\.\d{3}Z$/, "+0000"),
    thumbnail: "https://www.scorebat.com/static/thumb-fixture-b.jpg",
    homeTeam: { name: "Barcelona", slug: "barcelona", id: 3 },
    awayTeam: { name: "Real Madrid", slug: "real-madrid", id: 4 },
    videos: [
      {
        id: "soon-barca-madrid",
        title: "Preview",
        embed: embedFor("soon-barca-madrid"),
      },
    ],
  },
  {
    title: "Bayern Munich - Dortmund",
    competition: "GERMANY: Bundesliga",
    date: new Date(Date.now() - 3 * 60 * 60_000)
      .toISOString()
      .replace(/\.\d{3}Z$/, "+0000"),
    thumbnail: "https://www.scorebat.com/static/thumb-fixture-c.jpg",
    homeTeam: { name: "FC Bayern München", slug: "bayern-munich", id: 5 },
    awayTeam: { name: "Borussia Dortmund", slug: "borussia-dortmund", id: 6 },
    videos: [
      {
        id: "hl-bayern-dortmund",
        title: "Highlights",
        embed: embedFor("hl-bayern-dortmund"),
      },
    ],
  },
  {
    title: "Liverpool - Manchester United FC",
    competition: "ENGLAND: Premier League",
    date: new Date(Date.now() - 26 * 60 * 60_000)
      .toISOString()
      .replace(/\.\d{3}Z$/, "+0000"),
    thumbnail: "https://www.scorebat.com/static/thumb-fixture-d.jpg",
    homeTeam: { name: "Liverpool", slug: "liverpool", id: 7 },
    awayTeam: {
      name: "Manchester United FC",
      slug: "manchester-united",
      id: 8,
    },
    videos: [
      {
        id: "rp-liverpool-united",
        title: "Full Match Replay",
        embed: embedFor("rp-liverpool-united"),
      },
    ],
  },
  {
    title: "Evil Match",
    competition: "TEST: Rejected",
    date: new Date().toISOString().replace(/\.\d{3}Z$/, "+0000"),
    homeTeam: { name: "A", slug: "a", id: 9 },
    awayTeam: { name: "B", slug: "b", id: 10 },
    videos: [
      {
        id: "bad",
        title: "Highlights",
        embed: `<iframe src="https://evil.example/player" onload="alert(1)"></iframe>`,
      },
    ],
  },
].map((m) => ({ ...m, __fixture: true } as ScoreBatMatch & { __fixture: boolean }));
