// Core business logic: ad naming convention

export interface AdNameFields {
  brand: string;
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
}

/** Build the 11-field ad name separated by double underscores (filename stored but excluded) */
export function generateAdName(fields: AdNameFields): string {
  const dims = fields.dimensions.replace(":", "x"); // 9:16 → 9x16
  return [
    fields.brand,
    fields.initiative,
    fields.variation,
    fields.angle,
    fields.source,
    fields.product,
    fields.contentType,
    fields.creativeType,
    dims,
    fields.copySlug,
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

  // Content type from extension
  if (ext) {
    const e = ext[1].toLowerCase();
    if (["mp4", "mov", "avi", "webm"].includes(e)) result.contentType = "VID";
    else if (["jpg", "jpeg", "png", "webp"].includes(e))
      result.contentType = "IMG";
    else if (e === "gif") result.contentType = "GIF";
  }

  // Normalize: replace spaces, hyphens, and dots with underscores for uniform tokenisation
  const normalized = cleanName.replace(/[\s\-\.]+/g, "_");
  const lower = normalized.toLowerCase();

  // Creative type keywords (scanned against full filename)
  const creativeTypeMap: Record<string, string> = {
    ugc: "UGC",
    meme: "MEME",
    gfx: "GFX",
    motion: "GFX",
    mashup: "MASHUP",
    screen: "SCREEN",
    testi: "TESTI",
    "ai_gen": "AI",
    catalog: "CATALOG",
    stills: "ESTATIC",
    still: "ESTATIC",
    static: "ESTATIC",
    carousel: "CAR",
  };
  for (const [keyword, type] of Object.entries(creativeTypeMap)) {
    if (lower.includes(keyword)) {
      result.creativeType = type;
      // "stills" also confirms contentType = IMG
      if (keyword === "stills" || keyword === "still" || keyword === "static") {
        if (!result.contentType) result.contentType = "IMG";
      }
      break;
    }
  }

  // Known source tokens (case-insensitive exact-token match)
  const SOURCE_MAP: Record<string, string> = {
    ng: "NG",
    paid: "PAID",
    ugc: "UGC",
    organic: "ORG",
    org: "ORG",
    studio: "STUDIO",
    stock: "STOCK",
    ai: "AI",
    creator: "CREATOR",
  };

  // Initiative keywords — common campaign naming patterns
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

  // Known dimension values after conversion
  const VALID_DIMS = new Set(["9:16", "4:5", "1:1", "16:9"]);

  // Split the normalized name into tokens by underscore
  const tokens = normalized.split("_").filter(Boolean);

  // Track which token indices have been claimed
  const claimed = new Set<number>();

  // Always default brand and product
  result.brand = "OIO";
  result.product = "OIO";

  // --- Token 0: Brand ---
  if (tokens.length > 0) {
    const t0 = tokens[0].toUpperCase();
    if (t0 === "KORRUS" || t0 === "KRS" || t0 === "OIO") {
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

  // --- Dimension from keywords in filename ---
  if (!result.dimensions) {
    if (/story|stories|reel|9.?16|9x16|vertical/i.test(lower)) result.dimensions = "9:16";
    else if (/4.?5|4x5/i.test(lower)) result.dimensions = "4:5";
    else if (/1.?1|1x1|square/i.test(lower)) result.dimensions = "1:1";
    else if (/16.?9|16x9|landscape|horizontal|wide/i.test(lower)) result.dimensions = "16:9";
  }

  // --- Date: YYYY-MM pattern ---
  for (let i = 0; i < tokens.length; i++) {
    if (/^\d{4}-?\d{2}$/.test(tokens[i]) && tokens[i].length <= 7) {
      const t = tokens[i];
      result.date = t.includes("-") ? t : `${t.slice(0, 4)}-${t.slice(4)}`;
      claimed.add(i);
      break;
    }
  }
  // Default date to current month if not found
  if (!result.date) {
    const d = new Date();
    result.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  // --- Source tokens ---
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    const tl = tokens[i].toLowerCase();
    if (tl in SOURCE_MAP) {
      result.source = SOURCE_MAP[tl];
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

  // --- Variation: "v1", "v2", "V1", or standalone single digit ---
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    if (/^v\d+$/i.test(tokens[i])) {
      result.variation = tokens[i].toUpperCase();
      claimed.add(i);
      break;
    }
  }
  if (!result.variation) {
    for (let i = 0; i < tokens.length; i++) {
      if (claimed.has(i)) continue;
      if (/^\d$/.test(tokens[i])) {
        result.variation = `V${tokens[i]}`;
        claimed.add(i);
        break;
      }
    }
  }

  // --- Claim creative type keywords so they don't end up in the angle ---
  const CREATIVE_TYPE_WORDS = new Set(["stills", "still", "static", "ugc", "meme", "gfx", "motion", "mashup", "screen", "testi", "ai_gen", "catalog", "carousel"]);
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    if (CREATIVE_TYPE_WORDS.has(tokens[i].toLowerCase())) {
      claimed.add(i);
    }
  }

  // --- Claim dimension keyword tokens ---
  const DIM_WORDS = new Set(["story", "stories", "reel", "vertical", "landscape", "horizontal", "wide", "square", "feed"]);
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    if (DIM_WORDS.has(tokens[i].toLowerCase())) {
      claimed.add(i);
    }
  }

  // --- Remaining unclaimed tokens = angle ---
  const angleTokens: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!claimed.has(i)) {
      angleTokens.push(tokens[i]);
    }
  }
  if (angleTokens.length > 0) {
    // Join with hyphens for readability, capitalise first letter of each word
    result.angle = angleTokens
      .map(t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
      .join("-");
  }

  // --- creativeType default ---
  if (!result.creativeType) result.creativeType = "ESTATIC";

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
  brand: string;
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

  const namingFields: (keyof AdNameFields)[] = [
    "brand",
    "initiative",
    "variation",
    "angle",
    "source",
    "product",
    "contentType",
    "creativeType",
    "dimensions",
    "copySlug",
    "filename",
    "date",
  ];
  for (const f of namingFields) {
    if (!row[f]?.trim()) errors.push(`${f} is required`);
  }

  const validContentTypes = ["VID", "IMG", "CAR", "GIF"];
  if (row.contentType && !validContentTypes.includes(row.contentType)) {
    errors.push(`Invalid content type: ${row.contentType}`);
  }

  const validDims = ["9:16", "4:5", "1:1", "16:9"];
  if (row.dimensions && !validDims.includes(row.dimensions)) {
    errors.push(`Invalid dimensions: ${row.dimensions}`);
  }

  if (forUpload) {
    if (!row.adSetId?.trim()) errors.push("Ad Set ID is required for upload");
    if (!row.fileUrl?.trim()) errors.push("File URL is required for upload");
  }

  if (row.destinationUrl && !row.destinationUrl.includes("korrus.com")) {
    errors.push("Destination URL must contain korrus.com");
  }

  return errors;
}

/** Build the full UTM-tagged destination URL */
export function buildUtmUrl(): string {
  return `https://korrus.com/collections/store?utm_source=facebook&utm_medium=paidsocial&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&hsa_acc=138973865900020&hsa_cam={{campaign.id}}&hsa_grp={{adset.id}}&hsa_ad={{ad.id}}&hsa_src=[SITE_SOURCE_NAME]&hsa_net=facebook&hsa_ver=3`;
}
