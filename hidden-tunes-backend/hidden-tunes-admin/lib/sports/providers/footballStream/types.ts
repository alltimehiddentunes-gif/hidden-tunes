export type FootballStreamServer = { name?: string; url?: string; type?: string; header?: Record<string, string> | string | null };
export type FootballStreamMatch = { match_time: number; match_status: string; home_team_name: string; away_team_name: string; homeTeamScore?: string; awayTeamScore?: string; league_name?: string; servers?: FootballStreamServer[] };
export type FootballStreamPagination = { page?: number; totalPages?: number; hasNext?: boolean };
export type FootballStreamPage = { data?: FootballStreamMatch[]; matches?: FootballStreamMatch[]; page?: number; totalPages?: number; hasNext?: boolean; pagination?: FootballStreamPagination };
export type StreamKind = "direct_hls" | "direct_dash" | "direct_other" | "referer_dependent" | "embed_web" | "drm" | "unsupported";
