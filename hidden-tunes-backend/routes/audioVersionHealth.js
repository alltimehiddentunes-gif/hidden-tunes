import express from "express";

import { getAudioVersionCapabilityReport } from "../services/audioVersionCapabilityReport.js";

const router = express.Router();

router.get("/audio-versions", async (_req, res) => {
  try {
    const report = await getAudioVersionCapabilityReport();

    return res.status(report.success ? 200 : 503).json(report);
  } catch (error) {
    console.error("GET /health/audio-versions failed:", error);

    return res.status(500).json({
      success: false,
      mode: "manual-only",
      error: error instanceof Error ? error.message : "Capability check failed.",
    });
  }
});

export default router;
