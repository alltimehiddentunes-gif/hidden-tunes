import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildSongAudioVersionStatusPayload,
  generateSongAudioVersions as generateSongAudioVersionsService,
  getSongAudioVersionStatus as getSongAudioVersionStatusService,
  loadSongForAudioVersionGeneration,
} from "../../services/generateSongAudioVersions.js";

export {
  buildSongAudioVersionStatusPayload,
  loadSongForAudioVersionGeneration,
};

export type SongAudioVersionServiceResult = {
  success: boolean;
  httpStatus?: number;
  audio_version_status?: string | null;
  error?: string;
};

export async function generateSongAudioVersions(options: {
  supabase: SupabaseClient;
  songId: string;
  force?: boolean;
  uploadToR2?: (args: {
    key: string;
    body: Buffer;
    contentType: string;
  }) => Promise<string>;
  log?: Console;
}): Promise<SongAudioVersionServiceResult> {
  return generateSongAudioVersionsService(
    options as Parameters<typeof generateSongAudioVersionsService>[0]
  );
}

export async function getSongAudioVersionStatus(options: {
  supabase: SupabaseClient;
  songId: string;
  log?: Console;
}): Promise<SongAudioVersionServiceResult> {
  return getSongAudioVersionStatusService(
    options as Parameters<typeof getSongAudioVersionStatusService>[0]
  );
}
