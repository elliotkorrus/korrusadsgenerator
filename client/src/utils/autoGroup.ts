// Auto-grouping: strip dimension tokens from filenames to detect same-concept files

export function computeBaseName(filename: string): string {
  // Strip extension
  let base = filename.replace(/\.(mp4|mov|avi|jpg|jpeg|png|webp|gif|webm)$/i, "");

  // Remove known dimension tokens
  base = base.replace(/[-_\s]*(9x16|4x5|1x1|16x9|9\.16|4\.5|1\.1|16\.9)[-_\s]*/gi, "_");
  base = base.replace(/[-_\s]*(vertical|horizontal|landscape|square|story|stories|reel|feed|wide)[-_\s]*/gi, "_");

  // Remove trailing pixel dimensions like 1080x1920
  base = base.replace(/[-_\s]*\d{3,4}x\d{3,4}[-_\s]*/gi, "_");

  // Normalize separators and lowercase
  base = base.replace(/[-_.\s]+/g, "_").toLowerCase().trim();
  base = base.replace(/^_+|_+$/g, "");

  // If stripping dimensions left an empty string, use the original filename (minus extension)
  if (!base) {
    base = filename.replace(/\.(mp4|mov|avi|jpg|jpeg|png|webp|gif|webm)$/i, "")
      .replace(/[-_.\s]+/g, "_").toLowerCase().trim();
  }

  return base || filename;
}

/** Group files by their base name (same concept, different sizes) */
export function groupFilesByBaseName(files: File[]): Map<string, File[]> {
  const groups = new Map<string, File[]>();

  for (const file of files) {
    const baseName = computeBaseName(file.name);
    if (!groups.has(baseName)) groups.set(baseName, []);
    groups.get(baseName)!.push(file);
  }

  return groups;
}
