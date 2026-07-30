import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import songsRouter from "./routes/songs.js";
import artistsRouter from "./routes/artists.js";
import albumsRouter from "./routes/albums.js";
import adminUploadRouter from "./routes/adminUpload.js";
import lyricsRouter from "./routes/lyrics.js";
import podcastsRouter from "./routes/podcasts.js";
import audioVersionHealthRouter from "./routes/audioVersionHealth.js";
import audioVersionWorkerRouter from "./routes/audioVersionWorker.js";
import { supabase } from "./services/supabase.js";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Hidden Tunes backend is running",
  });
});

/** Process-alive probe — must stay free of catalogue/Supabase work for Render health checks. */
app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
  });
});

/** Dependency readiness — lightweight Supabase probe, not a full catalogue load. */
app.get("/ready", async (req, res) => {
  const startedAt = Date.now();
  try {
    const { error } = await supabase.from("songs").select("id").limit(1);
    if (error) {
      return res.status(503).json({
        error: "service_unavailable",
        message: "Music search is temporarily unavailable",
        retryable: true,
        dependency: "supabase",
        details: error.message,
        durationMs: Date.now() - startedAt,
      });
    }

    return res.json({
      success: true,
      status: "ready",
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    return res.status(503).json({
      error: "service_unavailable",
      message: "Music search is temporarily unavailable",
      retryable: true,
      dependency: "supabase",
      details: error?.message || "unknown_error",
      durationMs: Date.now() - startedAt,
    });
  }
});

app.use("/health", audioVersionHealthRouter);

app.use("/internal/audio-versions", audioVersionWorkerRouter);

app.use("/api/songs", songsRouter);
app.use("/api/artists", artistsRouter);
app.use("/api/albums", albumsRouter);
app.use("/api/lyrics", lyricsRouter);
app.use("/api/podcasts", podcastsRouter);
app.use("/api/admin", adminUploadRouter);

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Hidden Tunes backend running on port ${PORT}`);
});
