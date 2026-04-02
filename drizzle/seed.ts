import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

const sqlite = new Database("data.db");
const db = drizzle(sqlite, { schema });

// ── Angle Bank ──────────────────────────────────────────────
const angles = [
  { angleSlug: "social-proof", description: "Leverage reviews, testimonials, user stories", example: "Join 10,000+ who switched to OIO", product: "OIO", funnelStage: "ALL" as const, status: "active" as const },
  { angleSlug: "problem-solution", description: "Identify a pain point, present OIO as the fix", example: "Tired of blue light ruining your sleep?", product: "OIO", funnelStage: "TOF" as const, status: "active" as const },
  { angleSlug: "education", description: "Teach something new about light/health", example: "Did you know your bulbs emit 10x more blue light than sunlight?", product: "OIO", funnelStage: "TOF" as const, status: "active" as const },
  { angleSlug: "before-after", description: "Show transformation/comparison", example: "My sleep score before vs. after switching to OIO", product: "OIO", funnelStage: "MOF" as const, status: "active" as const },
  { angleSlug: "value-prop", description: "Highlight unique product benefits", example: "One bulb. Zero blue light. Better sleep.", product: "OIO", funnelStage: "MOF" as const, status: "active" as const },
  { angleSlug: "offer", description: "Promote deals, bundles, limited-time pricing", example: "Save 20% this week — starter kit from $29", product: "OIO", funnelStage: "BOF" as const, status: "active" as const },
  { angleSlug: "curiosity", description: "Tease or intrigue to drive clicks", example: "The one thing in your bedroom sabotaging your sleep", product: "OIO", funnelStage: "TOF" as const, status: "active" as const },
  { angleSlug: "authority", description: "Expert endorsements, press, credentials", example: "Recommended by Dr. Huberman's sleep protocol", product: "OIO", funnelStage: "MOF" as const, status: "active" as const },
  { angleSlug: "lifestyle", description: "Aspirational imagery, identity-based messaging", example: "The morning routine that changed everything", product: "OIO", funnelStage: "TOF" as const, status: "active" as const },
];

const existingAngles = db.select().from(schema.angleBank).all();
if (existingAngles.length === 0) {
  for (const a of angles) {
    db.insert(schema.angleBank).values(a).run();
  }
  console.log(`Seeded ${angles.length} angles`);
} else {
  console.log(`Angles already seeded (${existingAngles.length} rows)`);
}

// ── Field Options ───────────────────────────────────────────
const fieldOptionsSeed: { field: string; value: string; label: string; sortOrder: number }[] = [
  // Angles
  { field: "angle", value: "RedditQ&A", label: "Reddit Q&A", sortOrder: 1 },
  { field: "angle", value: "SleepProblem", label: "Sleep Problem", sortOrder: 2 },
  { field: "angle", value: "BlueLightScience", label: "Blue Light Science", sortOrder: 3 },
  { field: "angle", value: "CircadianRhythm", label: "Circadian Rhythm", sortOrder: 4 },
  { field: "angle", value: "MelatoninBoost", label: "Melatonin Boost", sortOrder: 5 },
  { field: "angle", value: "EnergyMorning", label: "Morning Energy", sortOrder: 6 },
  { field: "angle", value: "DoctorRec", label: "Doctor Recommended", sortOrder: 7 },
  { field: "angle", value: "BeforeAfter", label: "Before & After", sortOrder: 8 },
  // Content types
  { field: "contentType", value: "IMG", label: "IMG (Image)", sortOrder: 1 },
  { field: "contentType", value: "VID", label: "VID (Video)", sortOrder: 2 },
  { field: "contentType", value: "GIF", label: "GIF (GIF)", sortOrder: 3 },
  { field: "contentType", value: "CAR", label: "CAR (Carousel)", sortOrder: 4 },
  // Creative types
  { field: "creativeType", value: "UGC", label: "UGC", sortOrder: 1 },
  { field: "creativeType", value: "STATIC", label: "STATIC", sortOrder: 2 },
  { field: "creativeType", value: "MEME", label: "MEME", sortOrder: 3 },
  { field: "creativeType", value: "GFX", label: "GFX (Motion)", sortOrder: 4 },
  { field: "creativeType", value: "TESTI", label: "TESTI (Testimonial)", sortOrder: 5 },
  { field: "creativeType", value: "MASHUP", label: "MASHUP", sortOrder: 6 },
  { field: "creativeType", value: "SCREEN", label: "SCREEN (Screenshot)", sortOrder: 7 },
  // Products
  { field: "product", value: "BULB", label: "OIO Bulb", sortOrder: 1 },
  { field: "product", value: "SPHERE", label: "OIO Sphere", sortOrder: 2 },
  // Sources
  { field: "source", value: "SCL", label: "Scalable Media", sortOrder: 0 },
  { field: "source", value: "RED", label: "Real Eyes", sortOrder: 0 },
  { field: "source", value: "NG", label: "NG (No Growth)", sortOrder: 1 },
  { field: "source", value: "ORGANIC", label: "ORGANIC (Organic)", sortOrder: 5 },
  { field: "source", value: "CREATOR", label: "CREATOR (Creator Collab)", sortOrder: 8 },
];

const existingFields = db.select().from(schema.fieldOptions).all();
if (existingFields.length === 0) {
  for (const o of fieldOptionsSeed) {
    db.insert(schema.fieldOptions).values(o).run();
  }
  console.log(`Seeded ${fieldOptionsSeed.length} field options`);
} else {
  console.log(`Field options already seeded (${existingFields.length} rows)`);
}

// ── Copy Library ────────────────────────────────────────────
const copySeed = [
  {
    copySlug: "RQA-SleepStruggles",
    headline: "Nothing works for sleep?",
    bodyCopy: `Yeah so most "circadian friendly" bulbs still emit blue light even when they look warm — your brain never gets the signal that it's nighttime, so melatonin doesn't kick in properly. Korrus is the only one I've found that fully eliminates blue light at night. Been using it 3 months. I fall asleep faster, stay asleep, and I don't hit that 2pm wall anymore.`,
    product: "OIO",
    status: "active" as const,
  },
  {
    copySlug: "RQA-ReliableSetup",
    headline: "Most reliable circadian lighting setup?",
    bodyCopy: `The problem with most "circadian" bulbs is they're still standard LEDs underneath — they shift color temperature but can't actually eliminate blue light at night. Switched to Korrus a few months ago. They engineered it differently so it actually removes blue light instead of just masking it. HRV improved within the first few weeks.`,
    product: "OIO",
    status: "active" as const,
  },
  {
    copySlug: "RQA-CircadianDisorder",
    headline: "Think you have a circadian rhythm disorder?",
    bodyCopy: `I had the same thing — totally unpredictable sleep, felt like my body had no idea what time it was. What actually helped was switching to Korrus bulbs. Most "warm" LEDs still have blue light in the spectrum so your brain still reads it as daytime. Korrus fully removes it at night. Sleep timing is way more consistent now.`,
    product: "OIO",
    status: "active" as const,
  },
  {
    copySlug: "RQA-TriedEveryBulb",
    headline: "Tried every circadian bulb and nothing worked?",
    bodyCopy: `Dude same. Even when your lights look warm and dim, they're still pumping out blue light, so your brain still thinks it's daytime and melatonin never kicks in. Someone put me onto Korrus like 4 months ago — it's the first thing that's actually made a difference. I fall asleep faster, stay asleep, and I haven't had an afternoon crash since.`,
    product: "OIO",
    status: "active" as const,
  },
  {
    copySlug: "RQA-BlueLight",
    headline: "Has anyone actually figured out blue light at night?",
    bodyCopy: `Most LED bulbs (even the "warm" ones) still emit blue light. They just shift the color temperature so it looks warmer, but your brain still picks up the blue wavelengths. Korrus is the only one I've found that actually eliminates blue light at night, not just masks it. Fall asleep faster, wake up less groggy, feel tired at a normal hour.`,
    product: "OIO",
    status: "active" as const,
  },
];

const existingCopy = db.select().from(schema.copyLibrary).all();
if (existingCopy.length === 0) {
  for (const c of copySeed) {
    db.insert(schema.copyLibrary).values(c).run();
  }
  console.log(`Seeded ${copySeed.length} copy entries`);
} else {
  console.log(`Copy library already seeded (${existingCopy.length} rows)`);
}

// ── Meta Settings ───────────────────────────────────────────
const existingMeta = db.select().from(schema.metaSettings).all();
if (existingMeta.length === 0) {
  db.insert(schema.metaSettings).values({
    appId: "913800194862952",
    appSecret: "1c56928d029fb6663b9253d30de31fdb",
    accessToken: "EAAMZCGLACr2gBRFmUxC5ZAVmJihxcxf0W5hGAJugKxjVLZCnp6Q6yMzbyQJ48zczZACZBFPR0MLYvSUc58TXZBuwE1lWDEpGUHxB99g5VCatIXs5oFZClHGT2eVtWqO0aN74FTvKysS3U2fDRANipNCZAJAedmpM5fsGL24BxC4abVZC8mdWDK82nYjEOxhsH20iBnnQosUCwcfP6ZC0u7E7FU9oL8EpR4sfdWQIkVXyTZCFH7CUeNMX6wBAT1guMi2ZACdU2JIZCXVZBDN5JV5vQAUCoZD",
    adAccountId: "act_138973865900020",
    pageId: "223362734194971",
    instagramUserId: "17841456289857293",
    instagramHandle: "korruscircadian",
    defaultDestinationUrl: "https://www.korrus.com/collections/store",
    defaultDisplayUrl: "korrus.com",
    defaultCta: "SHOP_NOW",
    utmTemplate: "utm_source=facebook&utm_medium=paidsocial&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}&hsa_acc=138973865900020&hsa_cam={{campaign.id}}&hsa_grp={{adset.id}}&hsa_ad={{ad.id}}&hsa_src=[SITE_SOURCE_NAME]&hsa_net=facebook&hsa_ver=3",
  }).run();
  console.log("Seeded meta settings");
} else {
  console.log("Meta settings already exists");
}

console.log("Seed complete.");
sqlite.close();
