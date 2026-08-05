import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import songsRouter from "./routes/songs.js";
import artistsRouter from "./routes/artists.js";
import albumsRouter from "./routes/albums.js";
import adminUploadRouter from "./routes/adminUpload.js";
import adminUploadCompatibilityRouter from "./routes/adminUploadCompatibility.js";
import lyricsRouter from "./routes/lyrics.js";
import podcastsRouter from "./routes/podcasts.js";
import audioVersionHealthRouter from "./routes/audioVersionHealth.js";
import audioVersionWorkerRouter from "./routes/audioVersionWorker.js";
import {
  adminCors,
  adminRateLimit,
  attachAdminRequestId,
  requireAdminCatalogRole,
  requireAdminCatalogUploadEnabled,
  requireLegacyMultipartUploadEnabled,
} from "./services/adminCatalogSecurity.js";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 4000;

// Exact compatibility contracts used by the existing Next.js BulkUploadPanel.
// This must precede the legacy /api/admin multipart router so these paths cannot
// fall through a second middleware chain.
app.use(adminUploadCompatibilityRouter);

// Security controls must run before any body or multipart parser.
app.use(
  "/api/admin",
  adminCors,
  attachAdminRequestId,
  requireAdminCatalogRole,
  adminRateLimit,
  requireAdminCatalogUploadEnabled,
  requireLegacyMultipartUploadEnabled,
  adminUploadRouter
);


// Public and secret-protected worker routes retain their existing body handling.
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Hidden Tunes backend is running",
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
  });
});

app.use("/health", audioVersionHealthRouter);

app.use("/internal/audio-versions", audioVersionWorkerRouter);

app.use("/api/songs", songsRouter);
app.use("/api/artists", artistsRouter);
app.use("/api/albums", albumsRouter);
app.use("/api/lyrics", lyricsRouter);
app.use("/api/podcasts", podcastsRouter);

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
  });
});

app.listen(PORT, () => {
  console.log(`Hidden Tunes backend running on port ${PORT}`);
});
