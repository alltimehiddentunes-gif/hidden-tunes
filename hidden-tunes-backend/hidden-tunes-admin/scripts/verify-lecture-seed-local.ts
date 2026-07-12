import { resolveLectureSeeds } from "@/lib/lectureSeedIngest";

async function main() {
  const seeds = await resolveLectureSeeds();
  const summary = {
    programs: seeds.length,
    total_lessons: seeds.reduce((sum, seed) => sum + seed.media.length, 0),
    audio_programs: seeds.filter((seed) => seed.media.some((file) => file.audio_url)).length,
    video_programs: seeds.filter((seed) => seed.media.some((file) => file.video_url)).length,
    categories: [...new Set(seeds.map((seed) => seed.category_slug))],
    programs_over_40_lessons: seeds
      .filter((seed) => seed.media.length > 40)
      .map((seed) => ({ title: seed.title, lessons: seed.media.length })),
    rows: seeds.map((seed) => ({
      title: seed.title,
      category: seed.category_slug,
      lessons: seed.media.length,
      rights: seed.rights,
      first_lesson_url: seed.media[0]?.audio_url || seed.media[0]?.video_url || null,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
