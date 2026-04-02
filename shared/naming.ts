// Core business logic: ad naming convention
// Structure: Handle__Initiative__Variation__Theme__CreativeStyle__Producer__AdFormat__Dims__Copy__Product__Date

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

/** Build the ad name: Handle__Initiative__Variation__Theme__CreativeStyle__Producer__AdFormat__Dims__Copy__Product__Date */
export function generateAdName(fields: AdNameFields): string {
  const dims = fields.dimensions.replace(":", "x"); // 9:16 → 9x16
  return [
    fields.handle,
    fields.initiative,
    fields.variation,
    fields.angle,         // Theme
    fields.creativeType,  // Creative Style
    fields.source,        // Producer
    fields.contentType,   // Ad Format
    dims,
    fields.copySlug,
    fields.product,
    fields.date,
  ].filter(Boolean).join("__");
}

/** Parse a filename or URL to guess ad fields */
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
    else if (e === "gif") result.contentType = "IMG"; // GIF treated as IMG
  }

  // Normalize: replace spaces, hyphens, and dots with underscores for uniform tokenisation
  const normalized = cleanName.replace(/[\s\-\.]+/g, "_");
  const lower = normalized.toLowerCase();

  // Creative Style keywords
  const creativeStyleMap: Record<string, string> = {
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
  for (const [keyword, type] of Object.entries(creativeStyleMap)) {
    if (lower.includes(keyword)) {
      result.creativeType = type;
      break;
    }
  }

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
    social: "SocialProof",
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

  // Always default product
  result.product = "BULB";
  result.brand = "OIO"; // legacy

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
    if (/story|stories|reel|9.?16|9x16|vertical/i.test(lower)) result.dimensions = "9:16";
    else if (/4.?5|4x5/i.test(lower)) result.dimensions = "4:5";
    else if (/1.?1|1x1|square/i.test(lower)) result.dimensions = "1:1";
    else if (/16.?9|16x9|landscape|horizontal|wide/i.test(lower)) result.dimensions = "16:9";
  }

  // --- Date: MMDD or MMDDYY pattern ---
  for (let i = 0; i < tokens.length; i++) {
    if (/^\d{4}$/.test(tokens[i]) && !claimed.has(i)) {
      // Could be MMDD
      const mm = parseInt(tokens[i].slice(0, 2));
      const dd = parseInt(tokens[i].slice(2, 4));
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        result.date = tokens[i];
        claimed.add(i);
        break;
      }
    }
    if (/^\d{6}$/.test(tokens[i]) && !claimed.has(i)) {
      // MMDDYY
      result.date = tokens[i].slice(0, 4); // keep MMDD
      claimed.add(i);
      break;
    }
  }
  // Default date to current MMDD
  if (!result.date) {
    const d = new Date();
    result.date = `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  }

  // --- Producer tokens ---
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    const tl = tokens[i].toLowerCase();
    if (tl in PRODUCER_MAP) {
      result.source = PRODUCER_MAP[tl];
      claimed.add(i);
      break;
    }
  }

  // --- Theme tokens ---
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    const tl = tokens[i].toLowerCase();
    if (tl in THEME_MAP) {
      result.angle = THEME_MAP[tl];
      claimed.add(i);
      break;
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

  // --- Initiative: short alpha + numeric pattern (e.g. s_004) ---
  if (!result.initiative) {
    for (let i = 0; i < tokens.length - 1; i++) {
      if (claimed.has(i) || claimed.has(i + 1)) continue;
      if (/^[a-zA-Z]{1,3}$/.test(tokens[i]) && /^\d+$/.test(tokens[i + 1])) {
        result.initiative = `${tokens[i]}_${tokens[i + 1]}`;
        claimed.add(i);
        claimed.add(i + 1);
        break;
      }
    }
  }

  // --- Variation: "v1", "v2", etc. ---
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    if (/^v\d+$/i.test(tokens[i])) {
      result.variation = tokens[i].toLowerCase();
      claimed.add(i);
      break;
    }
  }
  if (!result.variation) result.variation = "v1";

  // --- Product: BULB or SPHERE ---
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    const tl = tokens[i].toLowerCase();
    if (tl === "bulb") { result.product = "BULB"; claimed.add(i); break; }
    if (tl === "sphere") { result.product = "SPHERE"; claimed.add(i); break; }
  }

  // --- Copy slug: C-prefixed tokens ---
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    if (/^C-/i.test(tokens[i])) {
      result.copySlug = tokens[i];
      claimed.add(i);
      break;
    }
  }

  // --- Claim creative style keywords ---
  const CREATIVE_WORDS = new Set(["ugc", "hifi", "lofi", "gfx", "motion", "mashup", "meme", "screen", "photo", "ai", "demo", "static", "stills", "still"]);
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    if (CREATIVE_WORDS.has(tokens[i].toLowerCase())) claimed.add(i);
  }

  // --- Claim dimension keyword tokens ---
  const DIM_WORDS = new Set(["story", "stories", "reel", "vertical", "landscape", "horizontal", "wide", "square", "feed"]);
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    if (DIM_WORDS.has(tokens[i].toLowerCase())) claimed.add(i);
  }

  // --- Remaining unclaimed tokens → could be theme ---
  if (!result.angle) {
    const remainingTokens: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      if (!claimed.has(i)) remainingTokens.push(tokens[i]);
    }
    if (remainingTokens.length > 0) {
      result.angle = remainingTokens
        .map(t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
        .join("");
    }
  }

  // --- Default creative style ---
  if (!result.creativeType) result.creativeType = "UGC";

  // --- Default handle ---
  if (!result.handle) result.handle = "korruscircadian";

  // --- Filename: cleanName minus the dimension token ---
  if (result.dimensions) {
    const dimToken = result.dimensions.replace(":", "x");
    const filenameTokens = tokens.filter(
      (t) => t.toLowerCase() !== dimToken.toLowerCase()
    );
    result.filename = filenameTokens.join("_");
  } else {
    result.filename = normalized;
  }

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
