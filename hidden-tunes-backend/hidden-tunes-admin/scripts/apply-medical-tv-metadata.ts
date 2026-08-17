import fs from "node:fs";
import path from "node:path";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const patches: Record<string, Record<string, unknown>> = {
  "548625af-200a-4aa2-b3c3-d8c4ce7ff11a": {
    language: "bg",
    category: "Medical & Health",
    genre: "Public Health",
    description:
      "Bulgarian 24-hour specialist health television focused on prevention, medicine, mental health and healthy living.",
    thumbnail_url: "https://i.imgur.com/NXBMzGV.png",
    tags: [
      "Medical & Health",
      "Public Health",
      "Bulgarian",
      "official:https://codehealth.bg/",
    ],
  },
  "74e2384f-43dd-4a53-8b3a-fe3914ab8b6a": {
    language: "fa",
    category: "Medical & Health",
    genre: "Medical Education",
    description:
      "Persian-language medical documentaries, scientific programming, health education and wellness information.",
    tags: [
      "Medical & Health",
      "Medical Education",
      "Persian",
      "official:https://www.persianagroup.tv/",
    ],
  },
  "9cbba769-295c-4126-8990-697fdf9c5137": {
    language: "en",
    category: "Medical & Health",
    genre: "Fitness & Clinical Wellness",
    description:
      "Health-focused educational programming from Better Life Television.",
    thumbnail_url: "https://i.imgur.com/qnwJiji.png",
    tags: [
      "Medical & Health",
      "Fitness & Clinical Wellness",
      "English",
      "official:https://betterlifetv.tv/",
    ],
  },
  "550cdf1b-80a8-4fa1-8f0e-a668e2f2df79": {
    language: "te",
    category: "Medical & Health",
    genre: "Medical Education",
    description:
      "Telugu-language health education, medical information and public-health programming.",
    thumbnail_url: "https://i.imgur.com/bCyW32I.png",
    tags: [
      "Medical & Health",
      "Medical Education",
      "Telugu",
      "official:http://www.cvrinfo.com/health.html",
    ],
  },
  "1844bef9-8e9b-4d03-be2c-8ae7cc954ee9": {
    language: "ru",
    category: "Medical & Health",
    genre: "Surgery & Diagnosis",
    description:
      "Russian-language medical education, diagnosis, treatment and public-health television.",
    thumbnail_url: "https://i.imgur.com/VNirxxn.png",
    tags: [
      "Medical & Health",
      "Surgery & Diagnosis",
      "Russian",
      "official:https://doc-tv.ru/",
    ],
  },
  "bacc6b74-3211-4cf2-9636-9f940f13d4ec": {
    language: "en",
    category: "Medical & Health",
    genre: "Medical Documentaries",
    description:
      "Forensic medical documentary series following investigations by medical examiner Dr. Jan Garavaglia.",
    tags: [
      "Medical & Health",
      "Medical Documentaries",
      "Forensic Medicine",
      "English",
      "official:https://www.rakuten.tv/pl/live_channels/filmrise-dr-g-medical-examiner",
    ],
  },
};
const apply = process.argv.includes("--apply");
const fields =
  "id,title,language,category,genre,description,thumbnail_url,tags,source_url,status,is_active,playback_status";
async function main() {
  const { data, error } = await supabaseAdmin
    .from("tv_videos")
    .select(fields)
    .in("id", Object.keys(patches));
  if (error) throw new Error(error.message);
  const before = data || [];
  const changes = before.map((row: any) => ({
    id: row.id,
    title: row.title,
    before: row,
    after: { ...row, ...patches[row.id] },
  }));
  const out = path.resolve(__dirname, "../data/medical-tv-deep");
  fs.writeFileSync(
    path.join(out, "metadata-patch-plan.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        apply: false,
        rollback:
          "Restore exactly the before fields for each ID; do not delete rows or alter stream/playback fields.",
        changes,
      },
      null,
      2,
    ) + "\n",
  );
  if (!apply) {
    console.log(
      JSON.stringify(
        { planned: changes.length, ids: changes.map((c) => c.id) },
        null,
        2,
      ),
    );
    return;
  }
  const results = [];
  for (const change of changes) {
    const { error: updateError } = await supabaseAdmin
      .from("tv_videos")
      .update(patches[change.id])
      .eq("id", change.id);
    results.push({
      id: change.id,
      ok: !updateError,
      error: updateError?.message || null,
    });
  }
  fs.writeFileSync(
    path.join(out, "metadata-patch-result.json"),
    JSON.stringify({ appliedAt: new Date().toISOString(), results }, null, 2) +
      "\n",
  );
  console.log(
    JSON.stringify(
      { applied: results.filter((r) => r.ok).length, results },
      null,
      2,
    ),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
