const loadedImages = new Set<string>();

function canUseBrowserImage() {
  return typeof window !== "undefined" && typeof window.Image !== "undefined";
}

export async function preloadImages(images: Array<string | undefined | null>) {
  try {
    const validImages = images
      .filter(Boolean)
      .map((img) => String(img))
      .filter((img) => img.startsWith("http"))
      .filter((img) => !loadedImages.has(img));

    if (!validImages.length) return;

    // Server/build safe: do nothing during Next.js build or SSR.
    if (!canUseBrowserImage()) return;

    await Promise.all(
      validImages.map(
        (img) =>
          new Promise<void>((resolve) => {
            const image = new window.Image();

            image.onload = () => {
              loadedImages.add(img);
              resolve();
            };

            image.onerror = () => {
              resolve();
            };

            image.src = img;
          })
      )
    );
  } catch {}
}

export function clearImagePreloadCache() {
  loadedImages.clear();
}