const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "../lib/motivationSources/archiveSource.ts");
let source = fs.readFileSync(filePath, "utf8");

const start = source.indexOf("async function fetchArchiveDiscoveryCandidate");
const end = source.indexOf("export function discoveryCandidateToGrowthCandidate");
if (start < 0 || end < 0) {
  console.error("markers not found", { start, end });
  process.exit(1);
}

const replacement = `async function fetchArchiveDiscoveryCandidates(doc: ArchiveSearchDoc) {
  const identifier = normalizeText(doc.identifier);
  if (!identifier) return [] as MotivationDiscoveryCandidate[];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(\`\${ARCHIVE_METADATA_URL}/\${encodeURIComponent(identifier)}\`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) return [];

      const payload = (await response.json()) as {
        files?: ArchiveFile[];
        metadata?: {
          title?: string;
          description?: string;
          creator?: string | string[];
          language?: string | string[];
          runtime?: string | number;
          length?: string | number;
          licenseurl?: string;
          rights?: string;
          "possible-copyright-status"?: string;
        };
      };

      const collection = collectCollection(doc) || "";
      const expandChapters = /librivox/i.test(collection) || /librivox/i.test(identifier);
      const mediaFiles = listPlayableArchiveFiles(payload.files || [], expandChapters);
      if (mediaFiles.length === 0) return [];

      const normalized = normalizeMotivationMetadata({
        title: payload.metadata?.title || doc.title,
        description: payload.metadata?.description || doc.description,
        creator: Array.isArray(payload.metadata?.creator)
          ? payload.metadata?.creator[0]
          : payload.metadata?.creator,
        language: Array.isArray(payload.metadata?.language)
          ? payload.metadata?.language[0]
          : payload.metadata?.language,
        subjects: collectSubjects(doc),
        fileNames: mediaFiles.map((file) => file.name),
      });

      if (!normalized.title || normalized.weakTitle) return [];

      const subjects = normalized.subjects.length ? normalized.subjects : collectSubjects(doc);
      const subcategory = inferSubcategory(normalized.title, subjects);
      const licenseUrl =
        normalizeText(payload.metadata?.licenseurl) || normalizeText(doc.licenseurl) || undefined;

      return mediaFiles.map((picked) => {
        const parentId = identifier;
        const sourceId =
          expandChapters && mediaFiles.length > 1 ? \`\${identifier}::\${picked.name}\` : identifier;
        const sourceUrl = \`https://archive.org/download/\${encodeURIComponent(parentId)}/\${encodeURIComponent(picked.name)}\`;
        const mediaType = picked.isVideo ? "video" : "audio";
        const title =
          expandChapters && mediaFiles.length > 1
            ? chapterTitle(normalized.title, picked.name)
            : normalized.title;

        return {
          sourceKey: \`archive:\${sourceId}\`,
          sourceType: "archive_video",
          sourceId,
          canonicalSourceUrl: sourceUrl,
          title,
          description: normalized.description || undefined,
          creator: normalized.creator || undefined,
          channel: normalized.creator || (expandChapters ? "LibriVox" : "Internet Archive"),
          tags: [subcategory, ...subjects.slice(0, 5)].filter(Boolean),
          subjects,
          language: normalized.language || "en",
          country: "US",
          durationSeconds:
            picked.length || extractArchiveDurationSeconds(payload.files || [], payload.metadata),
          artworkUrl: \`https://archive.org/services/img/\${encodeURIComponent(parentId)}\`,
          collection: collection || undefined,
          provider: "internet_archive",
          category: "Motivation",
          subcategory,
          mediaCandidates: [
            {
              url: sourceUrl,
              mediaType,
              fileName: picked.name,
              durationSeconds: picked.length || null,
              isPrimary: true,
            },
          ],
          license: licenseUrl,
          rightsEvidence: {
            licenseurl: licenseUrl,
            rights: payload.metadata?.rights || null,
            "possible-copyright-status":
              payload.metadata?.["possible-copyright-status"] || null,
          },
          rawMetadata: {
            doc,
            metadata: payload.metadata,
            parent_identifier: parentId,
          },
        } satisfies MotivationDiscoveryCandidate;
      });
    } catch {
      if (attempt >= 2) return [];
      await sleep(400);
    }
  }

  return [];
}

`;

source = source.slice(0, start) + replacement + source.slice(end);

source = source.replace(
  /const resolved = await Promise\.all\(slice\.map\(\(doc\) => fetchArchiveDiscoveryCandidate\(doc\)\)\);\s*for \(const entry of resolved\) \{\s*if \(!entry \|\| seen\.has\(entry\.sourceKey\)\) continue;\s*seen\.add\(entry\.sourceKey\);\s*candidates\.push\(entry\);\s*if \(candidates\.length >= target\) break;\s*\}/,
  `const resolved = await Promise.all(slice.map((doc) => fetchArchiveDiscoveryCandidates(doc)));
      for (const group of resolved) {
        for (const entry of group) {
          if (!entry || seen.has(entry.sourceKey)) continue;
          seen.add(entry.sourceKey);
          candidates.push(entry);
          if (candidates.length >= target) break;
        }
        if (candidates.length >= target) break;
      }`
);

source = source.replace(
  "embed_url: `https://archive.org/embed/${encodeURIComponent(candidate.sourceId)}`,",
  'embed_url: `https://archive.org/embed/${encodeURIComponent(String(candidate.sourceId).split("::")[0])}`,'
);

// Update high-yield families to mid-ground queries
source = source.replace(
  /"licensed-audio-selfdev": \[[\s\S]*?\],\s*"licensed-movies-selfdev": \[[\s\S]*?\],/,
  `"licensed-audio-selfdev": [
    \`mediatype:audio AND \${ARCHIVE_RIGHTS_FILTER} AND (subject:motivation OR subject:motivational OR subject:inspirational OR subject:inspiration OR subject:"self help" OR subject:"self-help" OR subject:"personal development" OR subject:"personal growth" OR subject:mindset OR subject:discipline OR subject:leadership OR subject:entrepreneurship OR subject:confidence OR subject:productivity OR subject:"goal setting" OR subject:resilience OR subject:encouragement OR subject:empowerment OR subject:"life coaching" OR subject:"life lessons" OR subject:"positive thinking" OR subject:affirmations OR subject:"commencement speech" OR subject:"keynote speech")\`,
  ],
  "licensed-movies-selfdev": [
    \`mediatype:movies AND \${ARCHIVE_RIGHTS_FILTER} AND (subject:motivation OR subject:motivational OR subject:inspirational OR subject:inspiration OR subject:"self help" OR subject:"personal development" OR subject:mindset OR subject:discipline OR subject:leadership OR subject:"commencement speech" OR subject:"keynote speech" OR subject:"motivational speaking" OR subject:encouragement OR subject:empowerment OR subject:"life lessons") -course -lecture -tutorial -playlist\`,
  ],
  "title-audio-motivation": [
    \`mediatype:audio AND \${ARCHIVE_RIGHTS_FILTER} AND (title:motivation OR title:motivational OR title:inspirational OR title:"self help" OR title:mindset OR title:discipline OR title:"personal development" OR title:leadership OR title:confidence OR title:resilience OR title:productivity OR title:affirmations)\`,
  ],
`
);

source = source.replace(
  '"librivox-philosophy": [\n    \'collection:librivoxaudio AND (subject:Philosophy OR subject:Religion OR subject:Education OR subject:Business OR subject:Biography)\',\n  ],',
  `"librivox-philosophy": [
    'collection:librivoxaudio AND (subject:Philosophy OR subject:Religion OR subject:Education OR subject:Business OR subject:Biography OR subject:Success OR subject:Inspiration)',
  ],`
);

fs.writeFileSync(filePath, source);
console.log("patched", filePath);
