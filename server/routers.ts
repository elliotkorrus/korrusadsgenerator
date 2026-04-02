import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { eq, desc, sql } from "drizzle-orm";
import { db, schema } from "./db.js";
import { generateAdName } from "../shared/naming.js";

const t = initTRPC.create();
const publicProcedure = t.procedure;

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
      if (existing) {
        const rows = await db
          .update(schema.metaSettings)
          .set({ ...input, updatedAt: sql`now()` })
          .where(eq(schema.metaSettings.id, existing.id))
          .returning();
        return rows[0];
      }
      const rows = await db.insert(schema.metaSettings).values(input).returning();
      return rows[0];
    }),

  getAdSets: publicProcedure.query(async () => {
    const settingsRows = await db.select().from(schema.metaSettings);
    const settings = settingsRows[0];
    if (!settings?.accessToken || !settings?.adAccountId) return [];
    try {
      const url = `https://graph.facebook.com/v21.0/${settings.adAccountId}/adsets?fields=id,name,status,campaign{id,name}&filtering=[{"field":"status","operator":"IN","value":["ACTIVE","PAUSED"]}]&access_token=${settings.accessToken}&limit=100`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        campaignId: s.campaign?.id,
        campaignName: s.campaign?.name,
      }));
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
