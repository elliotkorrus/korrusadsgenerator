import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

const sqlite = new Database("data.db");
const db = drizzle(sqlite, { schema });

// Seed angle bank
const angles = [
  { angleSlug: "social-proof", description: "Leverage reviews, testimonials, user stories", example: "Join 10,000+ who switched to OIO", funnelStage: "ALL" as const, status: "active" as const },
  { angleSlug: "problem-solution", description: "Identify a pain point, present OIO as the fix", example: "Tired of blue light ruining your sleep?", funnelStage: "TOF" as const, status: "active" as const },
  { angleSlug: "education", description: "Teach something new about light/health", example: "Did you know your bulbs emit 10x more blue light than sunlight?", funnelStage: "TOF" as const, status: "active" as const },
  { angleSlug: "before-after", description: "Show transformation/comparison", example: "My sleep score before vs. after switching to OIO", funnelStage: "MOF" as const, status: "active" as const },
  { angleSlug: "value-prop", description: "Highlight unique product benefits", example: "One bulb. Zero blue light. Better sleep.", funnelStage: "MOF" as const, status: "active" as const },
  { angleSlug: "offer", description: "Promote deals, bundles, limited-time pricing", example: "Save 20% this week — starter kit from $29", funnelStage: "BOF" as const, status: "active" as const },
  { angleSlug: "curiosity", description: "Tease or intrigue to drive clicks", example: "The one thing in your bedroom sabotaging your sleep", funnelStage: "TOF" as const, status: "active" as const },
  { angleSlug: "authority", description: "Expert endorsements, press, credentials", example: "Recommended by Dr. Huberman's sleep protocol", funnelStage: "MOF" as const, status: "active" as const },
  { angleSlug: "lifestyle", description: "Aspirational imagery, identity-based messaging", example: "The morning routine that changed everything", funnelStage: "TOF" as const, status: "active" as const },
];

for (const a of angles) {
  db.insert(schema.angleBank).values(a).onConflictDoNothing().run();
}

// Seed field options
const fieldOptionsSeed: { field: string; value: string; label: string; sortOrder: number }[] = [
  // contentType
  { field: "contentType", value: "VID", label: "Video", sortOrder: 0 },
  { field: "contentType", value: "IMG", label: "Image", sortOrder: 1 },
  { field: "contentType", value: "CAR", label: "Carousel", sortOrder: 2 },
  { field: "contentType", value: "GIF", label: "GIF", sortOrder: 3 },
  // creativeType
  { field: "creativeType", value: "UGC", label: "User-Generated Content", sortOrder: 0 },
  { field: "creativeType", value: "AI", label: "AI-Generated", sortOrder: 1 },
  { field: "creativeType", value: "ESTATIC", label: "Elevated Static", sortOrder: 2 },
  { field: "creativeType", value: "EVIDEO", label: "Elevated Video", sortOrder: 3 },
  { field: "creativeType", value: "MEME", label: "Meme / Lo-Fi", sortOrder: 4 },
  { field: "creativeType", value: "GFX", label: "Motion Graphics", sortOrder: 5 },
  { field: "creativeType", value: "MASHUP", label: "Mashup / Remix", sortOrder: 6 },
  { field: "creativeType", value: "CATALOG", label: "Catalog / DPA", sortOrder: 7 },
  { field: "creativeType", value: "SCREEN", label: "Screen Capture", sortOrder: 8 },
  { field: "creativeType", value: "TESTI", label: "Testimonial Card", sortOrder: 9 },
  // dimensions
  { field: "dimensions", value: "9:16", label: "9:16 (Story/Reels)", sortOrder: 0 },
  { field: "dimensions", value: "4:5", label: "4:5 (Feed)", sortOrder: 1 },
  { field: "dimensions", value: "1:1", label: "1:1 (Square)", sortOrder: 2 },
  { field: "dimensions", value: "16:9", label: "16:9 (Landscape)", sortOrder: 3 },
  // product
  { field: "product", value: "OIO", label: "OIO", sortOrder: 0 },
  { field: "product", value: "SERUM", label: "SERUM", sortOrder: 1 },
  // source
  { field: "source", value: "UGC", label: "UGC", sortOrder: 0 },
  { field: "source", value: "Studio", label: "Studio", sortOrder: 1 },
  { field: "source", value: "AI", label: "AI", sortOrder: 2 },
  { field: "source", value: "Stock", label: "Stock", sortOrder: 3 },
];

for (const o of fieldOptionsSeed) {
  db.insert(schema.fieldOptions).values(o).onConflictDoNothing().run();
}

// Ensure meta_settings has one row
const existing = db.select().from(schema.metaSettings).all();
if (existing.length === 0) {
  db.insert(schema.metaSettings).values({}).run();
}

console.log("Seed complete: 9 angles, 24 field options, 1 meta_settings row");
sqlite.close();
