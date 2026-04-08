/**
 * Shared types between client and server.
 * Inferred from the Drizzle schema for type safety.
 */

// Re-export schema types for use in client code
// These match the Drizzle table definitions exactly
export interface QueueItem {
  id: number;
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
  generatedAdName: string;
  adSetId: string | null;
  adSetName: string | null;
  destinationUrl: string | null;
  headline: string | null;
  bodyCopy: string | null;
  fileUrl: string | null;
  fileKey: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  status: string;
  metaAdId: string | null;
  metaCreativeId: string | null;
  errorMessage: string | null;
  uploadedAt: string | null;
  uploadedBy: number | null;
  conceptKey: string | null;
  handle: string | null;
  cta: string | null;
  displayUrl: string | null;
  agency: string | null;
  pageId: string | null;
  instagramAccountId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CopyEntry {
  id: number;
  copySlug: string;
  headline: string;
  bodyCopy: string;
  product: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AngleEntry {
  id: number;
  angleSlug: string;
  description: string;
  example: string;
  product: string;
  funnelStage: string;
  sourceTypeFit: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface HandleEntry {
  id: number;
  handle: string;
  label: string | null;
  fbPageId: string;
  igAccountId: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FieldOption {
  id: number;
  field: string;
  value: string;
  label: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MetaSettings {
  id: number;
  appId: string | null;
  appSecret: string | null;
  accessToken: string | null;
  adAccountId: string | null;
  pageId: string | null;
  instagramUserId: string | null;
  instagramHandle: string | null;
  defaultDestinationUrl: string | null;
  defaultDisplayUrl: string | null;
  defaultCta: string | null;
  utmTemplate: string | null;
  tokenExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Meta ad set from the API */
export interface AdSet {
  id: string;
  name: string;
  status: string;
  campaignId?: string;
  campaignName?: string;
}
