export const FOOTBALL_STREAM_PROVIDER = "football_stream_api";
export const FOOTBALL_STREAM_CADENCE_SECONDS = 180;
export const FOOTBALL_STREAM_MAX_PAGES = 10;
export const FOOTBALL_STREAM_PLAYBACK_TTL_SECONDS = 120;
export function getFootballStreamConfig() {
  const apiKey = process.env.FOOTBALL_STREAM_API_KEY?.trim();
  const host = (process.env.FOOTBALL_STREAM_API_HOST || "football-live-streaming-api.p.rapidapi.com").trim();
  const baseUrl = (process.env.FOOTBALL_STREAM_API_BASE_URL || `https://${host}`).replace(/\/$/, "");
  if (!apiKey) throw new Error("FOOTBALL_STREAM_API_KEY is missing");
  if (new URL(baseUrl).protocol !== "https:") throw new Error("Football stream API must use HTTPS");
  return { apiKey, host, baseUrl };
}
export function requestBudget(pages = 4, validationsPerCycle = 10, resolverCallsPerDay = 1000) {
  const cyclesPerDay = 86_400 / FOOTBALL_STREAM_CADENCE_SECONDS;
  const catalog = pages * cyclesPerDay;
  const validation = validationsPerCycle * cyclesPerDay;
  const expected = catalog + validation + resolverCallsPerDay;
  const worstCase = catalog * 2 + validation + resolverCallsPerDay;
  return { cyclesPerDay, catalog, validation, resolverCallsPerDay, expected, worstCase, quota: 55_000, margin: 55_000 - worstCase };
}
