/** YouTube Data API discovery is intentionally unavailable in the mobile client. */
export const YOUTUBE_DATA_API_ENABLED = false;

export const YOUTUBE_CONFIG = {
  // Never place a Google API key in the mobile bundle.
  API_KEY: undefined as string | undefined,

  // Your YouTube channel ID
  CHANNEL_ID: "UCr_GiZYfGzmzwdidgKPRWsg",

  // Number of videos to load
  MAX_RESULTS: 12,
};
