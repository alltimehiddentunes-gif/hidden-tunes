/**
 * PM2 config for VPS Express songs/catalog API.
 * Public host: api.hiddentunes.com → nginx → 127.0.0.1:3100
 * Deploy path: /var/www/hidden-tunes-api
 */
module.exports = {
  apps: [
    {
      name: "hidden-tunes-api",
      cwd: "/var/www/hidden-tunes-api",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 4000,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 3100,
      },
    },
  ],
};
