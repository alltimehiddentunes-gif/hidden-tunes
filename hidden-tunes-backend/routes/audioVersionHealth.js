import express from "express";

import { detectTranscodeCapabilities } from "../services/audioVersionGeneration.js";

const router = express.Router();

router.get("/audio-versions", async (_req, res) => {
  try {
    const capabilities = await detectTranscodeCapabilities();
    const success =
      capabilities.ffmpegAvailable && capabilities.ffprobeAvailable;

    return res.status(success ? 200 : 503).json({
      success,
      ffmpegAvailable: capabilities.ffmpegAvailable,
      ffprobeAvailable: capabilities.ffprobeAvailable,
    });
  } catch (error) {
    console.error("GET /health/audio-versions failed:", error);

    return res.status(500).json({
      success: false,
      ffmpegAvailable: false,
      ffprobeAvailable: false,
      error: error instanceof Error ? error.message : "Capability check failed.",
    });
  }
});

export default router;
