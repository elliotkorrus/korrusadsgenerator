import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { db, schema } from "./db.js";
import { generateAdName } from "../shared/naming.js";

const t = initTRPC.create();
const publicProcedure = t.procedure;

// In-memory cache for Meta ad sets (5 min TTL)
const adSetsCache: { data: any[] | null; fetchedAt: number } = { data: null, fetchedAt: 0 };

// ─── Upload Queue ───────────────────────────────────────────────
const uploadQueueRouter = t.router({
  list: publicProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      if (input?.status && input.status !== "all") {
        return db
          .select()
          .from(schema.uploadQueue)
          .where(eq(schema.uploadQueue.status, input.status))
          .orderBy(desc(schema.uploadQueue.createdAt));
      }
      return db
        .select()
        .from(schema.uploadQueue)
        .orderBy(desc(schema.uploadQueue.createdAt));
    }),

  counts: publicProcedure.query(async () => {
    const allRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.uploadQueue);
    const statuses = ["draft", "ready", "uploading", "uploaded", "error"] as const;
    const counts: Record<string, number> = { all: Number(allRows[0]?.count ?? 0) };
    for (const s of statuses) {
      const r = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.uploadQueue)
        .where(eq(schema.uploadQueue.status, s));
      counts[s] = Number(r[0]?.count ?? 0);
    }
    return counts;
  }),

  create: publicProcedure
    .input(
      z.object({
        brand: z.string().default("OIO"),
        initiative: z.string().default(""),
        variation: z.string().default("V1"),
        angle: z.string().default(""),
        source: z.string().default("Studio"),
        product: z.string().default("OIO"),
        contentType: z.string().default("IMG"),
        creativeType: z.string().default("ESTATIC"),
        dimensions: z.string().default("1:1"),
        copySlug: z.string().default(""),
        filename: z.string().default(""),
        date: z.string().default(""),
        adSetId: z.string().optional(),
        adSetName: z.string().optional(),
        destinationUrl: z.string().optional(),
        headline: z.string().optional(),
        bodyCopy: z.string().optional(),
        fileUrl: z.string().optional(),
        conceptKey: z.string().optional(),
        handle: z.string().optional().nullable(),
        cta: z.string().optional().nullable(),
        displayUrl: z.string().optional().nullable(),
        agency: z.string().optional().nullable(),
        pageId: z.string().optional().nullable(),
        instagramAccountId: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const generatedAdName = generateAdName({
        handle: input.handle || "korruscircadian",
        brand: input.brand,
        initiative: input.initiative,
        variation: input.variation,
        angle: input.angle,
        source: input.source,
        product: input.product,
        contentType: input.contentType,
        creativeType: input.creativeType,
        dimensions: input.dimensions,
        copySlug: input.copySlug,
        filename: input.filename,
        date: input.date,
      });
      const conceptKey = input.conceptKey || [
        input.brand, input.initiative, input.variation, input.angle,
        input.source, input.product, input.contentType, input.creativeType,
        input.copySlug, input.date
      ].join('__');
      const rows = await db
        .insert(schema.uploadQueue)
        .values({ ...input, generatedAdName, conceptKey })
        .returning();
      return rows[0];
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        brand: z.string().optional(),
        initiative: z.string().optional(),
        variation: z.string().optional(),
        angle: z.string().optional(),
        source: z.string().optional(),
        product: z.string().optional(),
        contentType: z.string().optional(),
        creativeType: z.string().optional(),
        dimensions: z.string().optional(),
        copySlug: z.string().optional(),
        filename: z.string().optional(),
        date: z.string().optional(),
        adSetId: z.string().optional().nullable(),
        adSetName: z.string().optional().nullable(),
        destinationUrl: z.string().optional().nullable(),
        headline: z.string().optional().nullable(),
        bodyCopy: z.string().optional().nullable(),
        fileUrl: z.string().optional().nullable(),
        handle: z.string().optional().nullable(),
        cta: z.string().optional().nullable(),
        displayUrl: z.string().optional().nullable(),
        agency: z.string().optional().nullable(),
        pageId: z.string().optional().nullable(),
        instagramAccountId: z.string().optional().nullable(),
        status: z
          .enum(["draft", "ready", "uploading", "uploaded", "error"])
          .optional(),
        metaAdId: z.string().optional().nullable(),
        metaCreativeId: z.string().optional().nullable(),
        errorMessage: z.string().optional().nullable(),
        conceptKey: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      const currentRows = await db
        .select()
        .from(schema.uploadQueue)
        .where(eq(schema.uploadQueue.id, id));
      const current = currentRows[0];
      if (!current) throw new Error("Row not found");

      const merged = { ...current, ...updates };
      const generatedAdName = generateAdName({
        handle: merged.handle || "korruscircadian",
        brand: merged.brand,
        initiative: merged.initiative,
        variation: merged.variation,
        angle: merged.angle,
        source: merged.source,
        product: merged.product,
        contentType: merged.contentType,
        creativeType: merged.creativeType,
        dimensions: merged.dimensions,
        copySlug: merged.copySlug,
        filename: merged.filename,
        date: merged.date,
      });

      const newConceptKey = [
        merged.brand, merged.initiative, merged.variation, merged.angle,
        merged.source, merged.product, merged.contentType, merged.creativeType,
        merged.copySlug, merged.date,
      ].join("__");

      const rows = await db
        .update(schema.uploadQueue)
        .set({
          ...updates,
          generatedAdName,
          conceptKey: newConceptKey,
          updatedAt: sql`now()`,
        })
        .where(eq(schema.uploadQueue.id, id))
        .returning();
      return rows[0];
    }),

  addSize: publicProcedure
    .input(z.object({
      conceptKey: z.string(),
      dimensions: z.string(),
    }))
    .mutation(async ({ input }) => {
      const allRows = await db.select().from(schema.uploadQueue);
      const existing = allRows.find((r: any) => r.conceptKey === input.conceptKey);
      if (!existing) throw new Error("Concept not found");
      const generatedAdName = generateAdName({
        handle: existing.handle || "korruscircadian",
        brand: existing.brand, initiative: existing.initiative,
        variation: existing.variation, angle: existing.angle,
        source: existing.source, product: existing.product,
        contentType: existing.contentType, creativeType: existing.creativeType,
        dimensions: input.dimensions, copySlug: existing.copySlug,
        filename: existing.filename, date: existing.date,
      });
      const rows = await db.insert(schema.uploadQueue).values({
        brand: existing.brand, initiative: existing.initiative,
        variation: existing.variation, angle: existing.angle,
        source: existing.source, product: existing.product,
        contentType: existing.contentType, creativeType: existing.creativeType,
        dimensions: input.dimensions, copySlug: existing.copySlug,
        filename: existing.filename, date: existing.date,
        adSetId: existing.adSetId, adSetName: existing.adSetName,
        destinationUrl: existing.destinationUrl, headline: existing.headline,
        bodyCopy: existing.bodyCopy,
        agency: existing.agency,
        handle: existing.handle,
        cta: existing.cta,
        displayUrl: existing.displayUrl,
        pageId: existing.pageId,
        instagramAccountId: existing.instagramAccountId,
        conceptKey: input.conceptKey, generatedAdName,
        status: "draft", metaAdId: null, metaCreativeId: null,
        errorMessage: null, uploadedAt: null, fileUrl: null,
        fileKey: null, fileMimeType: null, fileSize: null,
      }).returning();
      return rows[0];
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(schema.uploadQueue)
        .where(eq(schema.uploadQueue.id, input.id));
      return { success: true };
    }),

  bulkDelete: publicProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      for (const id of input.ids) {
        await db.delete(schema.uploadQueue)
          .where(eq(schema.uploadQueue.id, id));
      }
      return { success: true };
    }),

  bulkUpdateStatus: publicProcedure
    .input(
      z.object({
        ids: z.array(z.number()),
        status: z.enum(["draft", "ready", "uploading", "uploaded", "error"]),
      })
    )
    .mutation(async ({ input }) => {
      for (const id of input.ids) {
        await db.update(schema.uploadQueue)
          .set({ status: input.status, updatedAt: sql`now()` })
          .where(eq(schema.uploadQueue.id, id));
      }
      return { success: true };
    }),

  merge: publicProcedure
    .input(
      z.object({
        primaryConceptKey: z.string(),
        secondaryConceptKeys: z.array(z.string()),
      })
    )
    .mutation(async ({ input }) => {
      const primaryRows = await db
        .select()
        .from(schema.uploadQueue)
        .where(eq(schema.uploadQueue.conceptKey, input.primaryConceptKey));
      const primary = primaryRows[0];
      if (!primary) throw new Error("Primary concept not found");

      for (const sourceKey of input.secondaryConceptKeys) {
        const sourceRows = await db
          .select()
          .from(schema.uploadQueue)
          .where(eq(schema.uploadQueue.conceptKey, sourceKey));

        for (const row of sourceRows) {
          const newAdName = generateAdName({
            handle: primary.handle || "korruscircadian",
            brand: primary.brand,
            initiative: primary.initiative,
            variation: primary.variation,
            angle: primary.angle,
            source: primary.source,
            product: primary.product,
            contentType: primary.contentType,
            creativeType: primary.creativeType,
            dimensions: row.dimensions,
            copySlug: primary.copySlug,
            filename: primary.filename,
            date: primary.date,
          });

          await db.update(schema.uploadQueue)
            .set({
              brand: primary.brand,
              initiative: primary.initiative,
              variation: primary.variation,
              angle: primary.angle,
              source: primary.source,
              product: primary.product,
              contentType: primary.contentType,
              creativeType: primary.creativeType,
              copySlug: primary.copySlug,
              filename: primary.filename,
              date: primary.date,
              conceptKey: input.primaryConceptKey,
              generatedAdName: newAdName,
              updatedAt: sql`now()`,
            })
            .where(eq(schema.uploadQueue.id, row.id));
        }
      }
      return { success: true };
    }),
});

// ─── Copy Library ───────────────────────────────────────────────
const copyLibraryRouter = t.router({
  list: publicProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      if (input?.status) {
        return db
          .select()
          .from(schema.copyLibrary)
          .where(eq(schema.copyLibrary.status, input.status))
          .orderBy(desc(schema.copyLibrary.createdAt));
      }
      return db
        .select()
        .from(schema.copyLibrary)
        .orderBy(desc(schema.copyLibrary.createdAt));
    }),

  create: publicProcedure
    .input(
      z.object({
        copySlug: z.string().min(1),
        headline: z.string().min(1),
        bodyCopy: z.string().min(1),
        product: z.string().default("OIO"),
        status: z.enum(["active", "draft", "retired"]).default("active"),
      })
    )
    .mutation(async ({ input }) => {
      const rows = await db.insert(schema.copyLibrary).values(input).returning();
      return rows[0];
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        copySlug: z.string().optional(),
        headline: z.string().optional(),
        bodyCopy: z.string().optional(),
        product: z.string().optional(),
        status: z.enum(["active", "draft", "retired"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      const rows = await db
        .update(schema.copyLibrary)
        .set({ ...updates, updatedAt: sql`now()` })
        .where(eq(schema.copyLibrary.id, id))
        .returning();
      return rows[0];
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(schema.copyLibrary)
        .where(eq(schema.copyLibrary.id, input.id));
      return { success: true };
    }),
});

// ─── Angle Bank ─────────────────────────────────────────────────
const angleBankRouter = t.router({
  list: publicProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      if (input?.status) {
        return db
          .select()
          .from(schema.angleBank)
          .where(eq(schema.angleBank.status, input.status))
          .orderBy(desc(schema.angleBank.createdAt));
      }
      return db
        .select()
        .from(schema.angleBank)
        .orderBy(desc(schema.angleBank.createdAt));
    }),

  create: publicProcedure
    .input(
      z.object({
        angleSlug: z.string().min(1),
        description: z.string().min(1),
        example: z.string().min(1),
        product: z.string().default("OIO"),
        funnelStage: z.enum(["TOF", "MOF", "BOF", "ALL"]).default("ALL"),
        sourceTypeFit: z.string().optional(),
        status: z.enum(["active", "testing", "retired"]).default("active"),
      })
    )
    .mutation(async ({ input }) => {
      const rows = await db.insert(schema.angleBank).values(input).returning();
      return rows[0];
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        angleSlug: z.string().optional(),
        description: z.string().optional(),
        example: z.string().optional(),
        product: z.string().optional(),
        funnelStage: z.enum(["TOF", "MOF", "BOF", "ALL"]).optional(),
        sourceTypeFit: z.string().optional().nullable(),
        status: z.enum(["active", "testing", "retired"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      const rows = await db
        .update(schema.angleBank)
        .set({ ...updates, updatedAt: sql`now()` })
        .where(eq(schema.angleBank.id, id))
        .returning();
      return rows[0];
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(schema.angleBank)
        .where(eq(schema.angleBank.id, input.id));
      return { success: true };
    }),
});

// ─── Field Options ──────────────────────────────────────────────
const fieldOptionsRouter = t.router({
  list: publicProcedure.query(async () => {
    return db
      .select()
      .from(schema.fieldOptions)
      .orderBy(schema.fieldOptions.field, schema.fieldOptions.sortOrder);
  }),

  create: publicProcedure
    .input(
      z.object({
        field: z.string().min(1),
        value: z.string().min(1),
        label: z.string().optional(),
        sortOrder: z.number().default(0),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const rows = await db.insert(schema.fieldOptions).values(input).returning();
      return rows[0];
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        value: z.string().optional(),
        label: z.string().optional().nullable(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      const rows = await db
        .update(schema.fieldOptions)
        .set({ ...updates, updatedAt: sql`now()` })
        .where(eq(schema.fieldOptions.id, id))
        .returning();
      return rows[0];
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(schema.fieldOptions)
        .where(eq(schema.fieldOptions.id, input.id));
      return { success: true };
    }),
});

// ─── Handle Bank ───────────────────────────────────────────────
const handleBankRouter = t.router({
  list: publicProcedure.query(async () => {
    return db
      .select()
      .from(schema.handleBank)
      .orderBy(desc(schema.handleBank.createdAt));
  }),

  create: publicProcedure
    .input(
      z.object({
        handle: z.string().min(1),
        label: z.string().optional().nullable(),
        fbPageId: z.string().default(""),
        igAccountId: z.string().default(""),
        isDefault: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const rows = await db.insert(schema.handleBank).values(input).returning();
      return rows[0];
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        handle: z.string().optional(),
        label: z.string().optional().nullable(),
        fbPageId: z.string().optional(),
        igAccountId: z.string().optional(),
        isDefault: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      const rows = await db
        .update(schema.handleBank)
        .set({ ...updates, updatedAt: sql`now()` })
        .where(eq(schema.handleBank.id, id))
        .returning();
      return rows[0];
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(schema.handleBank)
        .where(eq(schema.handleBank.id, input.id));
      return { success: true };
    }),
});

// ─── Meta Settings ──────────────────────────────────────────────
const metaSettingsRouter = t.router({
  get: publicProcedure.query(async () => {
    const rows = await db.select().from(schema.metaSettings);
    return rows[0] ?? null;
  }),

  tokenStatus: publicProcedure.query(async () => {
    const rows = await db.select().from(schema.metaSettings);
    const settings = rows[0];
    if (!settings?.tokenExpiresAt) {
      return { expiresAt: null, daysRemaining: null, isExpired: false, isExpiringSoon: false };
    }
    const now = new Date();
    const expiresAt = new Date(settings.tokenExpiresAt);
    const msRemaining = expiresAt.getTime() - now.getTime();
    const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
    const isExpired = msRemaining <= 0;
    const isExpiringSoon = !isExpired && daysRemaining < 7;
    return {
      expiresAt: expiresAt.toISOString(),
      daysRemaining: isExpired ? 0 : daysRemaining,
      isExpired,
      isExpiringSoon,
    };
  }),

  update: publicProcedure
    .input(
      z.object({
        appId: z.string().optional().nullable(),
        appSecret: z.string().optional().nullable(),
        accessToken: z.string().optional().nullable(),
        adAccountId: z.string().optional().nullable(),
        pageId: z.string().optional().nullable(),
        instagramUserId: z.string().optional().nullable(),
        instagramHandle: z.string().optional().nullable(),
        defaultDestinationUrl: z.string().optional().nullable(),
        defaultDisplayUrl: z.string().optional().nullable(),
        defaultCta: z.string().optional().nullable(),
        utmTemplate: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const existingRows = await db.select().from(schema.metaSettings);
      const existing = existingRows[0];

      // If access token is being updated, fetch its expiry from Meta's debug_token endpoint
      let tokenExpiresAt: Date | null = null;
      if (input.accessToken) {
        const appId = input.appId ?? existing?.appId;
        const appSecret = input.appSecret ?? existing?.appSecret;
        if (appId && appSecret) {
          try {
            const debugUrl = `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(input.accessToken)}&access_token=${encodeURIComponent(appId)}|${encodeURIComponent(appSecret)}`;
            const res = await fetch(debugUrl);
            if (res.ok) {
              const data = await res.json();
              const expiresAtUnix = data?.data?.expires_at;
              if (expiresAtUnix && expiresAtUnix > 0) {
                tokenExpiresAt = new Date(expiresAtUnix * 1000);
              }
            }
          } catch (e) {
            console.error("Failed to fetch token expiry from Meta:", e);
          }
        }
      }

      if (existing) {
        const rows = await db
          .update(schema.metaSettings)
          .set({ ...input, ...(tokenExpiresAt ? { tokenExpiresAt } : {}), updatedAt: sql`now()` })
          .where(eq(schema.metaSettings.id, existing.id))
          .returning();
        return rows[0];
      }
      const rows = await db.insert(schema.metaSettings).values({ ...input, ...(tokenExpiresAt ? { tokenExpiresAt } : {}) }).returning();
      return rows[0];
    }),

  validateForUpload: publicProcedure
    .input(z.object({ adIds: z.array(z.number()).default([]) }))
    .mutation(async ({ input }) => {
      // Load ads: if adIds provided, load those; otherwise load all "ready" ads
      let ads;
      if (input.adIds.length > 0) {
        ads = await db
          .select()
          .from(schema.uploadQueue)
          .where(inArray(schema.uploadQueue.id, input.adIds));
      } else {
        ads = await db
          .select()
          .from(schema.uploadQueue)
          .where(eq(schema.uploadQueue.status, "ready"));
      }

      // Load meta_settings for defaults
      const metaRows = await db.select().from(schema.metaSettings);
      const metaSettings = metaRows[0];

      // Load all copy library entries for slug lookups
      const allCopy = await db.select().from(schema.copyLibrary);
      const copyBySlug = new Map(allCopy.map((c) => [c.copySlug, c]));

      const errors: Array<{ conceptKey: string; adName: string; missingFields: string[] }> = [];

      // Group ads by conceptKey
      const groups = new Map<string, typeof ads>();
      for (const ad of ads) {
        const key = ad.conceptKey || `solo_${ad.id}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(ad);
      }

      for (const [conceptKey, rows] of groups) {
        const primary = rows[0];
        if (!primary) continue;

        const missingFields: string[] = [];

        // adSetId — must be set on the ad
        if (!primary.adSetId) missingFields.push("adSetId");

        // headline — check ad, then copy_library via copySlug
        let headline = primary.headline || "";
        if (!headline && primary.copySlug) {
          const copyRow = copyBySlug.get(primary.copySlug);
          if (copyRow) headline = copyRow.headline;
        }
        if (!headline) missingFields.push("headline");

        // bodyCopy — check ad, then copy_library via copySlug
        let bodyCopy = primary.bodyCopy || "";
        if (!bodyCopy && primary.copySlug) {
          const copyRow = copyBySlug.get(primary.copySlug);
          if (copyRow) bodyCopy = copyRow.bodyCopy;
        }
        if (!bodyCopy) missingFields.push("bodyCopy");

        // destinationUrl — check ad, then meta_settings default
        const destinationUrl = primary.destinationUrl || metaSettings?.defaultDestinationUrl || "";
        if (!destinationUrl) missingFields.push("destinationUrl");

        // fileUrl — must exist on every row in the concept group
        const rowsMissingFiles = rows.filter((r) => !r.fileUrl);
        if (rowsMissingFiles.length > 0) missingFields.push("fileUrl");

        // pageId — check ad, then meta_settings
        const pageId = primary.pageId || metaSettings?.pageId || "";
        if (!pageId) missingFields.push("pageId");

        // instagramAccountId — check ad, then meta_settings
        const instagramAccountId = primary.instagramAccountId || metaSettings?.instagramUserId || "";
        if (!instagramAccountId) missingFields.push("instagramAccountId");

        if (missingFields.length > 0) {
          errors.push({
            conceptKey,
            adName: primary.generatedAdName || conceptKey,
            missingFields,
          });
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    }),

  getAdSets: publicProcedure.query(async () => {
    // Return cached data if fresh (5 min TTL)
    const now = Date.now();
    if (adSetsCache.data && now - adSetsCache.fetchedAt < 5 * 60 * 1000) {
      return adSetsCache.data;
    }

    const settingsRows = await db.select().from(schema.metaSettings);
    const settings = settingsRows[0];
    if (!settings?.accessToken || !settings?.adAccountId) return [];
    try {
      const url = `https://graph.facebook.com/v21.0/${settings.adAccountId}/adsets?fields=id,name,status,campaign{id,name}&filtering=[{"field":"status","operator":"IN","value":["ACTIVE","PAUSED"]}]&access_token=${settings.accessToken}&limit=200`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      const result = (data.data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        campaignId: s.campaign?.id,
        campaignName: s.campaign?.name,
      }));
      adSetsCache.data = result;
      adSetsCache.fetchedAt = now;
      return result;
    } catch {
      return [];
    }
  }),
});

// ─── Root Router ────────────────────────────────────────────────
export const appRouter = t.router({
  queue: uploadQueueRouter,
  copy: copyLibraryRouter,
  angles: angleBankRouter,
  fieldOptions: fieldOptionsRouter,
  meta: metaSettingsRouter,
  handles: handleBankRouter,
});

export type AppRouter = typeof appRouter;
