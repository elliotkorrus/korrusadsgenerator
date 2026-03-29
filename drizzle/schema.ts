import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: text("created_at")
    .default(sql`(datetime('now'))`)
    .notNull(),
  updatedAt: text("updated_at")
    .default(sql`(datetime('now'))`)
    .notNull(),
};

export const copyLibrary = sqliteTable("copy_library", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  copySlug: text("copy_slug").notNull().unique(),
  headline: text("headline").notNull(),
  bodyCopy: text("body_copy").notNull(),
  product: text("product").notNull().default("OIO"),
  status: text("status", { enum: ["active", "draft", "retired"] })
    .notNull()
    .default("active"),
  ...timestamps,
});

export const angleBank = sqliteTable("angle_bank", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  angleSlug: text("angle_slug").notNull().unique(),
  description: text("description").notNull(),
  example: text("example").notNull(),
  product: text("product").notNull().default("OIO"),
  funnelStage: text("funnel_stage", { enum: ["TOF", "MOF", "BOF", "ALL"] })
    .notNull()
    .default("ALL"),
  sourceTypeFit: text("source_type_fit"),
  status: text("status", { enum: ["active", "testing", "retired"] })
    .notNull()
    .default("active"),
  ...timestamps,
});

export const uploadQueue = sqliteTable("upload_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  brand: text("brand").notNull().default("OIO"),
  initiative: text("initiative").notNull().default(""),
  variation: text("variation").notNull().default("V1"),
  angle: text("angle").notNull().default(""),
  source: text("source").notNull().default("Studio"),
  product: text("product").notNull().default("OIO"),
  contentType: text("content_type").notNull().default("IMG"),
  creativeType: text("creative_type").notNull().default("ESTATIC"),
  dimensions: text("dimensions").notNull().default("1:1"),
  copySlug: text("copy_slug").notNull().default(""),
  filename: text("filename").notNull().default(""),
  date: text("date").notNull().default(""),
  generatedAdName: text("generated_ad_name").notNull().default(""),
  adSetId: text("ad_set_id"),
  adSetName: text("ad_set_name"),
  destinationUrl: text("destination_url"),
  headline: text("headline"),
  bodyCopy: text("body_copy"),
  fileUrl: text("file_url"),
  fileKey: text("file_key"),
  fileMimeType: text("file_mime_type"),
  fileSize: integer("file_size"),
  status: text("status", {
    enum: ["draft", "ready", "uploading", "uploaded", "error"],
  })
    .notNull()
    .default("draft"),
  metaAdId: text("meta_ad_id"),
  metaCreativeId: text("meta_creative_id"),
  errorMessage: text("error_message"),
  uploadedAt: text("uploaded_at"),
  uploadedBy: integer("uploaded_by"),
  conceptKey: text("concept_key"),
  handle: text("handle"), // Which FB/IG handle to run through (e.g. whitelisted creator handle). Does not affect ad name.
  ...timestamps,
});

export const metaSettings = sqliteTable("meta_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  appId: text("app_id"),
  appSecret: text("app_secret"),
  accessToken: text("access_token"),
  adAccountId: text("ad_account_id"),
  pageId: text("page_id"),
  ...timestamps,
});

export const fieldOptions = sqliteTable("field_options", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  field: text("field").notNull(),
  value: text("value").notNull(),
  label: text("label"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});
