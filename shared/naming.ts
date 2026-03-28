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
    filename = parts[parts.length - 1] || input;
  } catch {
    // not a URL
  }

  // Strip extension for the filename field
  const ext = filename.match(/\.(mp4|mov|avi|jpg|jpeg|png|webp|gif|webm)$/i);
  const cleanName = filename.replace(
    /\.(mp4|mov|avi|jpg|jpeg|png|webp|gif|webm)$/i,
    ""
  );
  result.filename = cleanName;

  // Content type from extension
  if (ext) {
    const e = ext[1].toLowerCase();
    if (["mp4", "mov", "avi", "webm"].includes(e)) result.contentType = "VID";
    else if (["jpg", "jpeg", "png", "webp"].includes(e))
      result.contentType = "IMG";
    else if (e === "gif") result.contentType = "GIF";
  }

  const upper = filename.toUpperCase();
  const lower = filename.toLowerCase();

  // Brand
  if (upper.includes("KORRUS") || upper.includes("KRS"))
    result.brand = "KORRUS";

  // Product
  if (upper.includes("SERUM")) result.product = "SERUM";
  else if (upper.includes("OIO")) result.product = "OIO";

  // Dimensions
  const dimMatch = filename.match(/(\d+)\s*x\s*(\d+)/i);
  if (dimMatch) {
    const d = `${dimMatch[1]}:${dimMatch[2]}`;
    if (["9:16", "4:5", "1:1", "16:9"].includes(d)) result.dimensions = d;
  }
  if (!result.dimensions) {
    if (/story|reel/i.test(lower)) result.dimensions = "9:16";
    else if (/feed/i.test(lower)) result.dimensions = "4:5";
    else if (/square/i.test(lower)) result.dimensions = "1:1";
    else if (/landscape/i.test(lower)) result.dimensions = "16:9";
  }

  // Variation
  const varMatch = filename.match(/\b(V\d+[A-Z]?)\b/i);
  if (varMatch) result.variation = varMatch[1].toUpperCase();

  // Creative type
  const typeMap: Record<string, string> = {
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
  for (const [keyword, type] of Object.entries(typeMap)) {
    if (lower.includes(keyword)) {
      result.creativeType = type;
      break;
    }
  }

  // Source
  if (/\bugc\b/i.test(lower)) result.source = "UGC";
  else if (/\bstudio\b/i.test(lower)) result.source = "Studio";
  else if (/\bstock\b/i.test(lower)) result.source = "Stock";
  else if (/\bai\b/i.test(lower)) result.source = "AI";

  // Date (6-digit MMDDYY)
  const dateMatch = filename.match(/\b(\d{6})\b/);
  if (dateMatch) result.date = dateMatch[1];

  // Initiative from KRS-NNNN-Name pattern
  const initMatch = filename.match(/KRS-\d{4}-([A-Za-z0-9_-]+)/i);
  if (initMatch) result.initiative = initMatch[1];

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
