import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 43197;
const child = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "production",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    R2_ACCOUNT_ID: "test",
    R2_ACCESS_KEY_ID: "test",
    R2_SECRET_ACCESS_KEY: "test",
    R2_BUCKET_NAME: "test",
    R2_PUBLIC_URL: "https://example.invalid",
    ADMIN_CATALOG_UPLOAD_ENABLED: "false",
    ADMIN_ALLOWED_ORIGINS: "https://admin.hiddentunes.com",
    AUDIO_WORKER_SECRET: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start: ${output}`);
}

try {
  await waitForServer();

  const anonymous = await fetch(`http://127.0.0.1:${port}/api/admin/song`, {
    method: "POST",
    headers: {
      origin: "https://admin.hiddentunes.com",
      "content-type": "multipart/form-data; boundary=never-parsed",
    },
    body: "--never-parsed\r\ninvalid multipart",
  });
  const anonymousBody = await anonymous.json();
  assert.equal(anonymous.status, 401);
  assert.equal(anonymousBody.error, "Authentication required.");
  assert.equal(JSON.stringify(anonymousBody).includes("MP3 song file"), false);

  for (const path of ["/api/upload-url", "/api/complete-song", "/api/admin/upload-file", "/api/admin/upload-track"]) {
    const denied = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { origin: "https://admin.hiddentunes.com", "content-type": "application/json" },
      body: "{}",
    });
    const body = await denied.json();
    assert.equal(denied.status, 401, `${path}: anonymous denied`);
    assert.ok(body.requestId, `${path}: correlation ID returned`);
  }

  const badOrigin = await fetch(`http://127.0.0.1:${port}/api/admin/song`, {
    method: "OPTIONS",
    headers: { origin: "https://evil.example" },
  });
  assert.equal(badOrigin.status, 403);
  assert.equal(badOrigin.headers.get("access-control-allow-origin"), null);

  const worker = await fetch(
    `http://127.0.0.1:${port}/internal/audio-versions/songs/00000000-0000-0000-0000-000000000000/generate`,
    { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }
  );
  assert.equal(worker.status, 503);

  const publicHealth = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(publicHealth.status, 200);

  assert.equal(output.includes("Admin upload error"), false);
  assert.equal(output.includes("upload_completed"), false);
  console.log("admin-server-integration: PASS");
} finally {
  child.kill();
}
