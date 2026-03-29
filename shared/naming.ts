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

/** Build the 12-field ad name separated by double underscores */
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
    fields.filename,
    fields.date,
  ].join("__");
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
  // filename will be set at end, after dimension token is stripped

  // Content type from extension
  if (ext) {
    const e = ext[1].toLowerCase();
    if (["mp4", "mov", "avi", "webm"].includes(e)) result.contentType = "VID";
    else if (["jpg", "jpeg", "png", "webp"].includes(e))
      result.contentType = "IMG";
    else if (e === "gif") result.contentType = "GIF";
  }

  // Creative type keywords (scanned against full original filename, before splitting)
  const lower = cleanName.toLowerCase();
  const creativeTypeMap: Record<string, string> = {
    ugc: "UGC",
    meme: "MEME",
    gfx: "GFX",
    motion: "GFX",
    mashup: "MASHUP",
    screen: "SCREEN",
    testi: "TESTI",
    "ai-gen": "AI",
    catalog: "CATALOG",
  };
  for (const [keyword, type] of Object.entries(creativeTypeMap)) {
    if (lower.includes(keyword)) {
      result.creativeType = type;
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

  // Known dimension values after conversion
  const VALID_DIMS = new Set(["9:16", "4:5", "1:1", "16:9"]);

  // Split the clean name into tokens by underscore
  const tokens = cleanName.split("_");

  // Track which token indices have been claimed
  const claimed = new Set<number>();

  // --- Token 0: Brand ---
  // Filename prefix "korrus" or "krs" identifies the company; ad brand is always "OIO"
  if (tokens.length > 0) {
    const t0 = tokens[0].toUpperCase();
    if (t0 === "KORRUS" || t0 === "KRS" || t0 === "OIO") {
      result.brand = "OIO";
      claimed.add(0);
    }
  }
  // Default product
  result.product = "OIO";

  // --- Last token matching /^\d+x\d+$/i: Dimensions ---
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

  // --- Token matching /^\d{4}-\d{2}$/: Date (YYYY-MM) ---
  for (let i = 0; i < tokens.length; i++) {
    if (/^\d{4}-\d{2}$/.test(tokens[i])) {
      result.date = tokens[i];
      claimed.add(i);
      break;
    }
  }

  // --- Token matching known sources (case-insensitive) ---
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    const tl = tokens[i].toLowerCase();
    if (tl in SOURCE_MAP) {
      result.source = SOURCE_MAP[tl];
      claimed.add(i);
      break;
    }
  }

  // --- Initiative: token "s" (or similar) followed by numeric token ---
  // Pattern: token[i] is a short alpha label AND token[i+1] is purely numeric
  for (let i = 0; i < tokens.length - 1; i++) {
    if (claimed.has(i) || claimed.has(i + 1)) continue;
    if (/^[a-zA-Z]{1,3}$/.test(tokens[i]) && /^\d+$/.test(tokens[i + 1])) {
      result.initiative = `${tokens[i]}_${tokens[i + 1]}`;
      claimed.add(i);
      claimed.add(i + 1);
      break;
    }
  }

  // --- Variation: single digit token after initiative ---
  // Find the last claimed initiative index and look one ahead
  for (let i = 0; i < tokens.length; i++) {
    if (claimed.has(i)) continue;
    if (/^\d$/.test(tokens[i])) {
      result.variation = `v${tokens[i]}`;
      claimed.add(i);
      break;
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
    result.angle = angleTokens.join("_");
  }

  // --- creativeType default ---
  if (!result.creativeType) result.creativeType = "ESTATIC";

  // --- Filename: cleanName minus the dimension token ---
  // Strip the dimension token so that 9x16 and 1x1 variants share the same filename
  // (and therefore the same conceptKey), enabling proper grouping.
  if (result.dimensions) {
    const dimToken = result.dimensions.replace(":", "x"); // e.g. "9x16"
    const filenameTokens = tokens.filter(
      (t) => t.toLowerCase() !== dimToken.toLowerCase()
    );
    result.filename = filenameTokens.join("_");
  } else {
    result.filename = cleanName;
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
