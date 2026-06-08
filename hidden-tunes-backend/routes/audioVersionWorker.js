import express from "express";

import { requireAudioWorkerSecret } from "../services/audioWorkerAuth.js";
import {
  generateSongAudioVersions,
  getSongAudioVersionStatus,
} from "../services/generateSongAudioVersions.js";
import { supabase } from "../services/supabase.js";

const router = express.Router();

function getErrorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

function formatWorkerResponse(result) {
  const payload = {
    success: result.success,
    status: result.audio_version_status ?? null,
    ...result,
  };

  delete payload.httpStatus;

  return payload;
}

router.use(requireAudioWorkerSecret);

router.get("/songs/:id/status", async (req, res) => {
  try {
    const result = await getSongAudioVersionStatus({
      supabase,
      songId: req.params.id,
    });

    return res
      .status(result.httpStatus || (result.success ? 200 : 500))
      .json(formatWorkerResponse(result));
  } catch (error) {
    console.error("GET /internal/audio-versions/songs/:id/status failed:", error);

    return res.status(500).json({
      success: false,
      status: null,
      error: getErrorMessage(error, "Could not load audio version status."),
    });
  }
});

router.post("/songs/:id/generate", async (req, res) => {
  try {
    const result = await generateSongAudioVersions({
      supabase,
      songId: req.params.id,
      force: Boolean(req.body?.force),
    });

    return res
      .status(result.httpStatus || (result.success ? 200 : 500))
      .json(formatWorkerResponse(result));
  } catch (error) {
    console.error("POST /internal/audio-versions/songs/:id/generate failed:", error);

    return res.status(500).json({
      success: false,
      status: "failed",
      error: getErrorMessage(error, "Audio version generation failed."),
    });
  }
});

export default router;
