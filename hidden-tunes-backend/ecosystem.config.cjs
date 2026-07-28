/**
 * PM2 config for VPS Express catalog API (Render replacement).
 *
 * Suggested host: api.hiddentunes.com → proxy_pass http://127.0.0.1:4000
 * Deploy path example: /var/www/hidden-tunes/hidden-tunes-backend
 *
 * Env: copy from .env.production (SUPABASE_*, R2_*, PORT=4000).
 * Optional ffmpeg worker: run a second PM2 app with Dockerfile image or
 * install ffmpeg on VPS and keep a single process (admin can generate inline).
 */
module.exports = {
  apps: [
    {
      name: "hidden-tunes-api",
      cwd: __dirname,
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 4000,
      },
    },
  ],
};
