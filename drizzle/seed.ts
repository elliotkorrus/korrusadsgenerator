import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "./schema.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

const db = drizzle(pool, { schema });

async function seed() {
  // ── Angle Bank ──────────────────────────────────────────────
  const angles = [
    { angleSlug: "before-after", description: "Show transformation/comparison", example: "My sleep score before vs. after switching to OIO", product: "OIO", funnelStage: "MOF", status: "active" },
    { angleSlug: "curiosity", description: "Tease or intrigue to drive clicks", example: "The one thing in your bedroom sabotaging your sleep", product: "OIO", funnelStage: "TOF", status: "active" },
    { angleSlug: "education", description: "Teach something new about light/health", example: "Did you know your bulbs emit 10x more blue light than sunlight?", product: "OIO", funnelStage: "TOF", status: "active" },
    { angleSlug: "features-benefits", description: "Highlight unique product features and benefits", example: "One bulb. Zero blue light. Better sleep.", product: "OIO", funnelStage: "MOF", status: "active" },
    { angleSlug: "founder", description: "Founder story, behind-the-scenes, brand origin", example: "Why I spent 3 years engineering the perfect lightbulb", product: "OIO", funnelStage: "TOF", status: "active" },
    { angleSlug: "lifestyle", description: "Aspirational imagery, identity-based messaging", example: "The morning routine that changed everything", product: "OIO", funnelStage: "TOF", status: "active" },
    { angleSlug: "media-press", description: "Press mentions, media coverage, editorial features", example: "As seen in Wired, GQ, and The Guardian", product: "OIO", funnelStage: "MOF", status: "active" },
    { angleSlug: "myth-busting", description: "Debunk misconceptions about light and sleep", example: "Warm light doesn't mean blue-light free", product: "OIO", funnelStage: "TOF", status: "active" },
    { angleSlug: "problem-solution", description: "Identify a pain point, present OIO as the fix", example: "Tired of blue light ruining your sleep?", product: "OIO", funnelStage: "TOF", status: "active" },
    { angleSlug: "promotion", description: "Promote deals, bundles, limited-time pricing", example: "Save 20% this week — starter kit from $29", product: "OIO", funnelStage: "BOF", status: "active" },
    { angleSlug: "social-proof", description: "Leverage reviews, testimonials, user stories", example: "Join 10,000+ who switched to OIO", product: "OIO", funnelStage: "ALL", status: "active" },
    { angleSlug: "unboxing", description: "Unboxing experience, first impressions", example: "What's inside the OIO starter kit", product: "OIO", funnelStage: "MOF", status: "active" },
    { angleSlug: "us-vs-them", description: "Compare OIO against competitors or alternatives", example: "Regular LED vs OIO — see the difference", product: "OIO", funnelStage: "MOF", status: "active" },
  ];

  // Clear existing angles and re-seed
  await db.delete(schema.angleBank);
  for (const a of angles) {
    await db.insert(schema.angleBank).values(a);
  }
  console.log(`Seeded ${angles.length} angles (cleared old)`);

  // ── Field Options ───────────────────────────────────────────
  const fieldOptionsSeed: { field: string; value: string; label: string; sortOrder: number }[] = [
    // Themes (field: "angle") — 13 themes matching naming convention
    { field: "angle", value: "BeforeAfter", label: "Before & After", sortOrder: 1 },
    { field: "angle", value: "Curiosity", label: "Curiosity", sortOrder: 2 },
    { field: "angle", value: "Education", label: "Education", sortOrder: 3 },
    { field: "angle", value: "FeaturesBenefits", label: "Features & Benefits", sortOrder: 4 },
    { field: "angle", value: "Founder", label: "Founder", sortOrder: 5 },
    { field: "angle", value: "Lifestyle", label: "Lifestyle", sortOrder: 6 },
    { field: "angle", value: "MediaPress", label: "Media / Press", sortOrder: 7 },
    { field: "angle", value: "MythBusting", label: "Myth Busting", sortOrder: 8 },
    { field: "angle", value: "ProblemSolution", label: "Problem / Solution", sortOrder: 9 },
    { field: "angle", value: "Promotion", label: "Promotion", sortOrder: 10 },
    { field: "angle", value: "SocialProof", label: "Social Proof", sortOrder: 11 },
    { field: "angle", value: "Unboxing", label: "Unboxing", sortOrder: 12 },
    { field: "angle", value: "UsVsThem", label: "Us vs Them", sortOrder: 13 },

    // Ad Formats (field: "contentType") — 3 formats
    { field: "contentType", value: "IMG", label: "IMG (Image)", sortOrder: 1 },
    { field: "contentType", value: "VID", label: "VID (Video)", sortOrder: 2 },
    { field: "contentType", value: "CAR", label: "CAR (Carousel)", sortOrder: 3 },

    // Creative Styles (field: "creativeType") — 10 styles
    { field: "creativeType", value: "UGC", label: "UGC", sortOrder: 1 },
    { field: "creativeType", value: "HIFI", label: "HIFI (High Fidelity)", sortOrder: 2 },
    { field: "creativeType", value: "LOFI", label: "LOFI (Low Fidelity)", sortOrder: 3 },
    { field: "creativeType", value: "GFX", label: "GFX (Motion Graphics)", sortOrder: 4 },
    { field: "creativeType", value: "MASHUP", label: "MASHUP", sortOrder: 5 },
    { field: "creativeType", value: "MEME", label: "MEME", sortOrder: 6 },
    { field: "creativeType", value: "SCREEN", label: "SCREEN (Screenshot)", sortOrder: 7 },
    { field: "creativeType", value: "PHOTO", label: "PHOTO", sortOrder: 8 },
    { field: "creativeType", value: "AI", label: "AI (AI-Generated)", sortOrder: 9 },
    { field: "creativeType", value: "DEMO", label: "DEMO", sortOrder: 10 },

    // Products — 2 products
    { field: "product", value: "BULB", label: "OIO Bulb", sortOrder: 1 },
    { field: "product", value: "SPHERE", label: "OIO Sphere", sortOrder: 2 },

    // Producers (field: "source") — 6 producers
    { field: "source", value: "NG", label: "No Growth", sortOrder: 1 },
    { field: "source", value: "SCL", label: "Scalable Media", sortOrder: 2 },
    { field: "source", value: "RED", label: "Real Eyes Media", sortOrder: 3 },
    { field: "source", value: "IHO", label: "In-House Organic", sortOrder: 4 },
    { field: "source", value: "IHP", label: "In-House Paid", sortOrder: 5 },
    { field: "source", value: "WL", label: "Whitelisting", sortOrder: 6 },

    // Dimensions
    { field: "dimensions", value: "9:16", label: "9:16 (Story/Reel)", sortOrder: 1 },
    { field: "dimensions", value: "4:5", label: "4:5 (Portrait Feed)", sortOrder: 2 },
    { field: "dimensions", value: "1:1", label: "1:1 (Square)", sortOrder: 3 },
    { field: "dimensions", value: "16:9", label: "16:9 (Landscape)", sortOrder: 4 },

    // Handle
    { field: "handle", value: "korruscircadian", label: "korruscircadian", sortOrder: 1 },
  ];

  // Clear existing field options and re-seed
  await db.delete(schema.fieldOptions);
  for (const o of fieldOptionsSeed) {
    await db.insert(schema.fieldOptions).values(o);
  }
  console.log(`Seeded ${fieldOptionsSeed.length} field options (cleared old)`);

  // ── Copy Library ────────────────────────────────────────────
  const copySeed = [
    {
      copySlug: "C-BlueLight",
      headline: "Has anyone actually figured out blue light at night?",
      bodyCopy: `Most LED bulbs (even the "warm" ones) still emit blue light. They just shift the color temperature so it looks warmer, but your brain still picks up the blue wavelengths. Korrus is the only one I've found that actually eliminates blue light at night, not just masks it. Fall asleep faster, wake up less groggy, feel tired at a normal hour.`,
      product: "OIO",
      status: "active",
    },
    {
      copySlug: "C-TriedEveryBulb",
      headline: "Tried every circadian bulb and nothing worked?",
      bodyCopy: `Dude same. Even when your lights look warm and dim, they're still pumping out blue light, so your brain still thinks it's daytime and melatonin never kicks in. Someone put me onto Korrus like 4 months ago — it's the first thing that's actually made a difference. I fall asleep faster, stay asleep, and I haven't had an afternoon crash since.`,
      product: "OIO",
      status: "active",
    },
    {
      copySlug: "C-CircadianDisorder",
      headline: "Think you have a circadian rhythm disorder?",
      bodyCopy: `I had the same thing — totally unpredictable sleep, felt like my body had no idea what time it was. What actually helped was switching to Korrus bulbs. Most "warm" LEDs still have blue light in the spectrum so your brain still reads it as daytime. Korrus fully removes it at night. Sleep timing is way more consistent now.`,
      product: "OIO",
      status: "active",
    },
    {
      copySlug: "C-ReliableSetup",
      headline: "Most reliable circadian lighting setup?",
      bodyCopy: `The problem with most "circadian" bulbs is they're still standard LEDs underneath — they shift color temperature but can't actually eliminate blue light at night. Switched to Korrus a few months ago. They engineered it differently so it actually removes blue light instead of just masking it. HRV improved within the first few weeks.`,
      product: "OIO",
      status: "active",
    },
    {
      copySlug: "C-SleepStruggles",
      headline: "Nothing works for sleep?",
      bodyCopy: `Yeah so most "circadian friendly" bulbs still emit blue light even when they look warm — your brain never gets the signal that it's nighttime, so melatonin doesn't kick in properly. Korrus is the only one I've found that fully eliminates blue light at night. Been using it 3 months. I fall asleep faster, stay asleep, and I don't hit that 2pm wall anymore.`,
      product: "OIO",
      status: "active",
    },
  ];

  // Clear existing copy and re-seed with C- prefix slugs
  await db.delete(schema.copyLibrary);
  for (const c of copySeed) {
    await db.insert(schema.copyLibrary).values(c);
  }
  console.log(`Seeded ${copySeed.length} copy entries (cleared old)`);

  // ── Meta Settings ───────────────────────────────────────────
  const existingMeta = await db.select().from(schema.metaSettings);
  if (existingMeta.length === 0) {
    await db.insert(schema.metaSettings).values({
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
    });
    console.log("Seeded meta settings");
  } else {
    console.log("Meta settings already exists");
  }

  console.log("Seed complete.");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
