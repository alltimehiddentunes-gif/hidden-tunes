import { Image } from "expo-image";

const loadedImages = new Set<string>();
const PRELOAD_BATCH_SIZE = 1;
const PRELOAD_MAX_IMAGES = 4;

export async function preloadImages(
  images: Array<string | undefined | null>
) {
  try {
    const validImages = Array.from(
      new Set(
        images
          .filter(Boolean)
          .map((img) => String(img))
          .filter((img) => img.startsWith("http"))
          .filter((img) => !loadedImages.has(img))
      )
    ).slice(0, PRELOAD_MAX_IMAGES);

    if (!validImages.length) return;

    for (let index = 0; index < validImages.length; index += PRELOAD_BATCH_SIZE) {
      const batch = validImages.slice(index, index + PRELOAD_BATCH_SIZE);

      await Promise.all(
        batch.map(async (img) => {
          try {
            await Image.prefetch(img);
            loadedImages.add(img);
          } catch {}
        })
      );
    }
  } catch {}
}

export function clearImagePreloadCache() {
  loadedImages.clear();
}