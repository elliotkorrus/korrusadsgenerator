// Core business logic: ad naming convention
// Structure: Handle__Initiative__Variation__Theme__CreativeStyle__Producer__AdFormat__Copy__Product__Date

export interface AdNameFields {
  handle: string;
  initiative: string;
  variation: string;
  angle: string;       // "Theme" in UI
  creativeType: string; // "Creative Style" in UI
  source: string;       // "Producer" in UI
  contentType: string;  // "Ad Format" in UI
  dimensions: string;
  copySlug: string;
  product: string;
  date: string;
  // Legacy fields kept for compatibility
  brand: string;
  filename: string;
}

/** Build the ad name: Handle__Initiative__Variation__Theme__CreativeStyle__Producer__AdFormat__Copy__Product__Date */
export function generateAdName(fields: AdNameFields): string {
  return [
    fields.handle,
    fields.initiative,
    fields.variation,
    fields.angle,         // Theme
    fields.creativeType,  // Creative Style
    fields.source,        // Producer
    fields.contentType,   // Ad Format
    fields.copySlug,
    fields.product,
    fields.date,
  ].filter(Boolean).join("__");
}

/** Split camelCase / PascalCase into sub-words for keyword matching */
function splitCamelCase(token: string): string[] {
  // "DayToNightStills" → ["Day","To","Night","Stills"]
  return token.replace(/([a-z])([A-Z])/g, "$1_$2").split("_").filter(Boolean);
}

/** Parse a filename or URL to guess ad fields.
 *  Philosophy: only set fields we're CONFIDENT about from the filename.
 *  Anything ambiguous goes to `filename` — session defaults handle the rest. */
export function parseFilenameToFields(
  input: string
): Partial<AdNameFields> & { fileUrl?: string } {
  const result: Partial<AdNameFields> & { fileUrl?: string } = {};

  let filename = input;

  // If it's a URL, extract filename and store URL
  try {
    const url = new URL(input);
    result.fileUrl = input;
    const parts = url.pathname.split("/");
    filename = decodeURIComponent(parts[parts.length - 1] || input);
  } catch {
    // not a URL
  }

  // Strip extension
  const ext = filename.match(/\.(mp4|mov|avi|jpg|jpeg|png|webp|gif|webm)$/i);
  const cleanName = filename.replace(
    /\.(mp4|mov|avi|jpg|jpeg|png|webp|gif|webm)$/i,
    ""
  );

  // Ad Format from extension
  if (ext) {
    const e = ext[1].toLowerCase();
    if (["mp4", "mov", "avi", "webm"].includes(e)) result.contentType = "VID";
    else if (["jpg", "jpeg", "png", "webp"].includes(e)) result.contentType = "IMG";
    else if (e === "gif") result.contentType = "IMG";
  }

  // Normalize: replace spaces, hyphens, and dots with underscores for uniform tokenisation
  const normalized = cleanName.replace(/[\s\-\.]+/g, "_");

  // Creative Style keywords (exact token match only)
  const CREATIVE_STYLE_MAP: Record<string, string> = {
    ugc: "UGC",
    hifi: "HIFI",
    lofi: "LOFI",
    gfx: "GFX",
    motion: "GFX",
    mashup: "MASHUP",
    meme: "MEME",
    screen: "SCREEN",
    photo: "PHOTO",
    ai: "AI",
    demo: "DEMO",
    static: "HIFI",
    stills: "HIFI",
    still: "HIFI",
  };

  // Known Producer tokens
  const PRODUCER_MAP: Record<string, string> = {
    ng: "NG",
    scl: "SCL",
    scalable: "SCL",
    red: "RED",
    realeyes: "RED",
    iho: "IHO",
    ihp: "IHP",
    wl: "WL",
    whitelisting: "WL",
  };

  // Theme keywords
  const THEME_MAP: Record<string, string> = {
    beforeafter: "BeforeAfter",
    curiosity: "Curiosity",
    education: "Education",
    featuresbenefits: "FeaturesBenefits",
    features: "FeaturesBenefits",
    benefits: "FeaturesBenefits",
    founder: "Founder",
    lifestyle: "Lifestyle",
    mediapress: "MediaPress",
    press: "MediaPress",
    mythbusting: "MythBusting",
    myth: "MythBusting",
    problemsolution: "ProblemSolution",
    problem: "ProblemSolution",
    promotion: "Promotion",
    promo: "Promotion",
    socialproof: "SocialProof",
    unboxing: "Unboxing",
    unbox: "Unboxing",
    usvsthem: "UsVsThem",
  };

  // Initiative keywords
  const INITIATIVE_MAP: Record<string, string> = {
    evergreen: "e_001",
    evg: "e_001",
    spring: "s_001",
    summer: "s_002",
    fall: "s_003",
    autumn: "s_003",
    winter: "s_004",
    launch: "s_001",
    bfcm: "s_001",
    holiday: "s_001",
    q1: "q_001",
    q2: "q_002",
    q3: "q_003",
    q4: "q_004",
  };

  // Known dimension values
  const VALID_DIMS = new Set(["9:16", "4:5", "1:1", "16:9"]);

  // Split the normalized name into tokens by underscore
  const tokens = normalized.split("_").filter(Boolean);
  const claimed = new Set<number>();

  // Build a flat list of sub-words for keyword matching (handles camelCase tokens)
  // Each sub-word maps back to its parent token index
  const subWords: { word: string; tokenIdx: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const subs = splitCamelCase(tokens[i]);
    for (const s of subs) {
      subWords.push({ word: s.toLowerCase(), tokenIdx: i });
    }
  }

  // --- Handle: korruscircadian or similar ---
  if (tokens.length > 0) {
    const t0 = tokens[0].toLowerCase();
    if (t0 === "korruscircadian" || t0 === "korrus" || t0 === "krs") {
      result.handle = "korruscircadian";
      claimed.add(0);
    }
  }

  // --- Dimension tokens: NxN pattern ---
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (/^\d+x\d+$/i.test(tokens[i])) {
      const parts = tokens[i].toLowerCase().split("x");
      const candidate = `${parts[0]}:${parts[1]}`;
      if (VALID_DIMS.has(candidate)) {
        result.dimensions = candidate;
        claimed.add(i);
      }
      break;
    }
  }

  // --- Dimension from keywords ---
  if (!result.dimensions) {
    for (const sw of subWords) {
      if (claimed.has(sw.tokenIdx)) continue;
      const w = sw.word;
      if (["story", "stories", "reel", "vertical"].includes(w)) { result.dimensions = "9:16"; break; }
      if (["square"].includes(w)) { result.dimensions = "1:1"; break; }
      if (["landscape", "horizontal", "wide"].includes(w)) { result.dimensions = "16:9"; break; }
    }
    // Also check raw patterns like "9x16" embedded in tokens
    if (!result.dimensions) {
      const norm = normalized.toLowerCase();
      if (/9.?16/.test(norm)) result.dimensions = "9:16";
      else if (/4.?5/.test(norm)) result.dimensions = "4:5";
      else if (/16.?9/.test(norm)) result.dimensions = "16:9";
    }
  }

  // --- Producer: exact token match ---
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    const tl = tokens[i].toLowerCase();
    if (tl in PRODUCER_MAP) {
      result.source = PRODUCER_MAP[tl];
      claimed.add(i);
      break;
    }
  }

  // --- Creative Style: exact token match OR camelCase sub-word match ---
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    const tl = tokens[i].toLowerCase();
    if (tl in CREATIVE_STYLE_MAP) {
      result.creativeType = CREATIVE_STYLE_MAP[tl];
      claimed.add(i);
      break;
    }
  }
  // If not found as exact token, check camelCase sub-words
  if (!result.creativeType) {
    for (const sw of subWords) {
      if (claimed.has(sw.tokenIdx)) continue;
      if (sw.word in CREATIVE_STYLE_MAP) {
        result.creativeType = CREATIVE_STYLE_MAP[sw.word];
        claimed.add(sw.tokenIdx);
        break;
      }
    }
  }

  // --- Theme: exact token match, then multi-token join, then sub-word ---
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    const tl = tokens[i].toLowerCase();
    if (tl in THEME_MAP) {
      result.angle = THEME_MAP[tl];
      claimed.add(i);
      // Also claim adjacent tokens that form the same theme (e.g. "features" + "benefits")
      if (i + 1 < tokens.length && !claimed.has(i + 1)) {
        const combined = tl + tokens[i + 1].toLowerCase();
        if (combined in THEME_MAP) claimed.add(i + 1);
      }
      break;
    }
  }
  // Multi-token theme: join consecutive unclaimed tokens and check
  if (!result.angle) {
    for (let i = 0; i < tokens.length - 1; i++) {
      if (claimed.has(i) || claimed.has(i + 1)) continue;
      const combined = (tokens[i] + tokens[i + 1]).toLowerCase();
      if (combined in THEME_MAP) {
        result.angle = THEME_MAP[combined];
        claimed.add(i);
        claimed.add(i + 1);
        break;
      }
    }
  }
  // Sub-word theme check (e.g. "DayToNight" won't match, but "Unboxing" inside a compound will)
  if (!result.angle) {
    for (const sw of subWords) {
      if (claimed.has(sw.tokenIdx)) continue;
      if (sw.word in THEME_MAP) {
        result.angle = THEME_MAP[sw.word];
        claimed.add(sw.tokenIdx);
        break;
      }
    }
  }

  // --- Date: MMDD or MMDDYY pattern (only valid dates) ---
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    if (/^\d{4}$/.test(tokens[i])) {
      const mm = parseInt(tokens[i].slice(0, 2));
      const dd = parseInt(tokens[i].slice(2, 4));
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        result.date = tokens[i];
        claimed.add(i);
        break;
      }
    }
    if (/^\d{6}$/.test(tokens[i]) && !claimed.has(i)) {
      const mm = parseInt(tokens[i].slice(0, 2));
      const dd = parseInt(tokens[i].slice(2, 4));
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        result.date = tokens[i].slice(0, 4);
        claimed.add(i);
        break;
      }
    }
  }

  // --- Initiative from keywords ---
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    const tl = tokens[i].toLowerCase();
    if (tl in INITIATIVE_MAP) {
      result.initiative = INITIATIVE_MAP[tl];
      claimed.add(i);
      break;
    }
  }

  // --- Initiative: letter_number pattern (e.g. "s_004", "e_001") ---
  if (!result.initiative) {
    for (let i = 0; i < tokens.length - 1; i++) {
      if (claimed.has(i) || claimed.has(i + 1)) continue;
      if (/^[a-zA-Z]{1,3}$/.test(tokens[i]) && /^\d+$/.test(tokens[i + 1])) {
        result.initiative = `${tokens[i].toLowerCase()}_${tokens[i + 1]}`;
        claimed.add(i);
        claimed.add(i + 1);
        break;
      }
    }
  }

  // --- Variation: "v1", "v2" or alphanumeric like "1a", "4B", "3B" ---
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    // Standard "v1", "v2" format
    if (/^v\d+$/i.test(tokens[i])) {
      result.variation = tokens[i].toLowerCase();
      claimed.add(i);
      break;
    }
    // Short alphanumeric variation codes: "1a", "4B", "3B", "2c"
    // Must be 2-3 chars, digit+letter or letter+digit
    if (/^(\d[a-zA-Z]|[a-zA-Z]\d)[a-zA-Z0-9]?$/.test(tokens[i]) && tokens[i].length <= 3) {
      result.variation = tokens[i].toUpperCase();
      claimed.add(i);
      break;
    }
  }

  // --- Product: BULB or SPHERE ---
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    const tl = tokens[i].toLowerCase();
    if (tl === "bulb") { result.product = "BULB"; claimed.add(i); break; }
    if (tl === "sphere") { result.product = "SPHERE"; claimed.add(i); break; }
  }

  // --- Copy slug: C-prefixed tokens (rejoin "C" + next token if split) ---
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    // Already joined: "C-BlueLight" survived as one token
    if (/^C-.+/i.test(tokens[i])) {
      result.copySlug = tokens[i];
      claimed.add(i);
      break;
    }
    // Split case: token is just "C" and next token is the slug name
    if (tokens[i] === "C" && i + 1 < tokens.length && !claimed.has(i + 1)) {
      result.copySlug = `C-${tokens[i + 1]}`;
      claimed.add(i);
      claimed.add(i + 1);
      break;
    }
  }

  // --- Claim remaining style/dimension keyword tokens (don't let them leak) ---
  const CREATIVE_WORDS = new Set(["ugc", "hifi", "lofi", "gfx", "motion", "mashup", "meme", "screen", "photo", "ai", "demo", "static", "stills", "still"]);
  const DIM_WORDS = new Set(["story", "stories", "reel", "vertical", "landscape", "horizontal", "wide", "square", "feed"]);
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    const tl = tokens[i].toLowerCase();
    if (CREATIVE_WORDS.has(tl) || DIM_WORDS.has(tl)) claimed.add(i);
  }

  // --- Filename: always the clean original filename (no guessing) ---
  result.filename = cleanName;

  // --- DO NOT dump unclaimed tokens into theme ---
  // Unclaimed tokens stay in the filename. Session defaults handle theme.

  // --- Minimal defaults: only set what we're sure about ---
  if (!result.handle) result.handle = "korruscircadian";
  result.brand = "OIO"; // legacy

  return result;
}

export interface UploadRow {
  handle: string;
  initiative: string;
  variation: string;
  angle: string;
  source: string;
  product: string;
  contentType: string;
  creativeType: string;
  dimensions: string;
  copySlug: string;
  filename: string;
  date: string;
  brand: string;
  adSetId?: string | null;
  fileUrl?: string | null;
  destinationUrl?: string | null;
}

/** Validate an upload row before marking ready or uploading */
export function validateUploadRow(
  row: UploadRow,
  forUpload = false
): string[] {
  const errors: string[] = [];

  // Required fields for a complete ad name
  const required: (keyof UploadRow)[] = [
    "handle", "initiative", "variation", "angle", "source",
    "product", "contentType", "creativeType", "dimensions",
    "copySlug", "date",
  ];
  for (const f of required) {
    if (!row[f]?.toString().trim()) errors.push(`${f} is required`);
  }

  const validContentTypes = ["VID", "IMG", "CAR"];
  if (row.contentType && !validContentTypes.includes(row.contentType)) {
    errors.push(`Invalid ad format: ${row.contentType}`);
  }

  const validDims = ["9:16", "4:5", "1:1", "16:9"];
  if (row.dimensions && !validDims.includes(row.dimensions)) {
    errors.push(`Invalid dimensions: ${row.dimensions}`);
  }

  if (forUpload) {
    if (!row.adSetId?.trim()) errors.push("Ad Set ID is required for upload");
    if (!row.fileUrl?.trim()) errors.push("File URL is required for upload");
  }

  return errors;
}

/** Build the full UTM-tagged destination URL */
export function buildUtmUrl(): string {
  return `https://korrus.com/collections/store?utm_source=facebook&utm_medium=paidsocial&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&hsa_acc=138973865900020&hsa_cam={{campaign.id}}&hsa_grp={{adset.id}}&hsa_ad={{ad.id}}&hsa_src=[SITE_SOURCE_NAME]&hsa_net=facebook&hsa_ver=3`;
}
