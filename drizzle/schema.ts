import { pgTable, text, serial, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
};

export const copyLibrary = pgTable("copy_library", {
  id: serial("id").primaryKey(),
  copySlug: text("copy_slug").notNull().unique(),
  headline: text("headline").notNull(),
  bodyCopy: text("body_copy").notNull(),
  product: text("product").notNull().default("OIO"),
  status: text("status").notNull().default("active"),
  ...timestamps,
});

export const angleBank = pgTable("angle_bank", {
  id: serial("id").primaryKey(),
  angleSlug: text("angle_slug").notNull().unique(),
  description: text("description").notNull(),
  example: text("example").notNull(),
  product: text("product").notNull().default("OIO"),
  funnelStage: text("funnel_stage").notNull().default("ALL"),
  sourceTypeFit: text("source_type_fit"),
  status: text("status").notNull().default("active"),
  ...timestamps,
});

export const uploadQueue = pgTable("upload_queue", {
  id: serial("id").primaryKey(),
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
  status: text("status").notNull().default("draft"),
  metaAdId: text("meta_ad_id"),
  metaCreativeId: text("meta_creative_id"),
  errorMessage: text("error_message"),
  uploadedAt: text("uploaded_at"),
  uploadedBy: integer("uploaded_by"),
  conceptKey: text("concept_key"),
  handle: text("handle"),
  cta: text("cta"),
  displayUrl: text("display_url"),
  agency: text("agency"),
  pageId: text("page_id"),
  instagramAccountId: text("instagram_account_id"),
  ...timestamps,
}, (table) => [
  index("idx_upload_queue_status").on(table.status),
  index("idx_upload_queue_concept_key").on(table.conceptKey),
  index("idx_upload_queue_handle").on(table.handle),
]);

export const metaSettings = pgTable("meta_settings", {
  id: serial("id").primaryKey(),
  appId: text("app_id"),
  appSecret: text("app_secret"),
  accessToken: text("access_token"),
  adAccountId: text("ad_account_id"),
  pageId: text("page_id"),
  instagramUserId: text("instagram_user_id"),
  instagramHandle: text("instagram_handle"),
  defaultDestinationUrl: text("default_destination_url"),
  defaultDisplayUrl: text("default_display_url"),
  defaultCta: text("default_cta"),
  utmTemplate: text("utm_template"),
  tokenExpiresAt: timestamp("token_expires_at"),
  ...timestamps,
});

export const handleBank = pgTable("handle_bank", {
  id: serial("id").primaryKey(),
  handle: text("handle").notNull().unique(),
  label: text("label"),
  fbPageId: text("fb_page_id").notNull().default(""),
  igAccountId: text("ig_account_id").notNull().default(""),
  isDefault: boolean("is_default").notNull().default(false),
  ...timestamps,
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(), // e.g., "upload_to_meta", "status_change", "bulk_delete", "clone"
  entityType: text("entity_type").notNull(), // e.g., "ad", "copy", "angle", "settings"
  entityId: text("entity_id"), // ID of the affected entity
  details: text("details"), // JSON string with additional context
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_audit_log_action").on(table.action),
  index("idx_audit_log_created_at").on(table.createdAt),
]);

export const scheduledUploads = pgTable("scheduled_uploads", {
  id: serial("id").primaryKey(),
  adIds: text("ad_ids").notNull(), // JSON array of ad IDs
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: text("status").notNull().default("pending"), // pending, running, completed, failed
  result: text("result"), // JSON result after execution
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const fieldOptions = pgTable("field_options", {
  id: serial("id").primaryKey(),
  field: text("field").notNull(),
  value: text("value").notNull(),
  label: text("label"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (table) => [
  index("idx_field_options_field").on(table.field),
]);
