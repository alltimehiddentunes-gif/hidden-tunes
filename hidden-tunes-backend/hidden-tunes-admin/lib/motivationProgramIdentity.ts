import { cleanText } from "@/lib/tvCatalog";

export type MotivationProgramIdentityInput = {
  itemId?: string | null;
  seriesId?: string | null;
  collectionId?: string | null;
  sourceType?: string | null;
  externalCollectionId?: string | null;
  sourceCollectionId?: string | null;
  title?: string | null;
  creator?: string | null;
  source?: string | null;
};

export function deriveMotivationProgramIdentity(
  input: MotivationProgramIdentityInput
): string {
  const itemId = cleanText(input.itemId, 120);
  const seriesId = cleanText(input.seriesId, 160);
  const collectionId = cleanText(input.collectionId, 160);
  const sourceType = cleanText(input.sourceType, 80);
  const externalCollectionId = cleanText(input.externalCollectionId, 160);
  const sourceCollectionId = cleanText(input.sourceCollectionId, 160);
  const title = cleanText(input.title, 200);
  const creator = cleanText(input.creator, 160);
  const source = cleanText(input.source, 80);

  if (itemId) return `program:${itemId}`;
  if (seriesId) return `series:${seriesId}`;
  if (collectionId) return `collection:${collectionId}`;
  if (sourceType && externalCollectionId) {
    return `source:${sourceType}:${externalCollectionId}`;
  }
  if (sourceType && sourceCollectionId) {
    return `source:${sourceType}:${sourceCollectionId}`;
  }
  if (source && externalCollectionId) {
    return `source:${source}:${externalCollectionId}`;
  }
  if (title && creator && source) {
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const normalizedCreator = creator.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `meta:${source}:${normalizedCreator}:${normalizedTitle}`;
  }
  if (itemId) return `standalone:${itemId}`;
  return `standalone:unknown`;
}

export function standaloneMotivationProgramIdentity(itemId: string) {
  return `standalone:${cleanText(itemId, 120)}`;
}
