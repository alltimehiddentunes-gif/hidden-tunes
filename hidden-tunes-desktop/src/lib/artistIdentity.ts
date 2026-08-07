export type CanonicalArtistIdentity = {
  id?: string | null
  name: string
  normalizedName: string
  aliases?: string[]
}

export function normalizeArtistIdentityName(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(featuring|feat\.?|ft\.?)\b/g, ',')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function createCanonicalArtistIdentity(input: {
  id?: string | null
  name: string
  aliases?: string[]
}): CanonicalArtistIdentity {
  return {
    id: input.id ? String(input.id) : null,
    name: input.name.trim(),
    normalizedName: normalizeArtistIdentityName(input.name),
    aliases: input.aliases?.map(normalizeArtistIdentityName).filter(Boolean),
  }
}

export function artistCreditMembers(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/\b(featuring|feat\.?|ft\.?)\b/gi, ',')
    .split(/\s*(?:,|&|\+|\bx\b)\s*/i)
    .map(normalizeArtistIdentityName)
    .filter(Boolean)
}

export function artistIdentityMatches(
  target: CanonicalArtistIdentity,
  candidate: { id?: string | null; name?: string | null },
) {
  const candidateId = candidate.id ? String(candidate.id) : null
  if (target.id && candidateId && target.id === candidateId) return true

  const normalizedCandidate = normalizeArtistIdentityName(candidate.name)
  if (!normalizedCandidate || !target.normalizedName) return false
  if (normalizedCandidate === target.normalizedName) return true
  if (target.aliases?.includes(normalizedCandidate)) return true
  return artistCreditMembers(candidate.name).includes(target.normalizedName)
}
