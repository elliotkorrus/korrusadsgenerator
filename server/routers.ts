import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, schema } from "./db.js";
import { generateAdName } from "../shared/naming.js";

const t = initTRPC.create();
const publicProcedure = t.procedure;

// ─── Upload Queue ───────────────────────────────────────────────
const uploadQueueRouter = t.router({
  list: publicProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(({ input }) => {
      if (input?.status && input.status !== "all") {
        return db
          .select()
          .from(schema.uploadQueue)
          .where(eq(schema.uploadQueue.status, input.status as any))
          .orderBy(desc(schema.uploadQueue.createdAt))
          .all();
      }
      return db
        .select()
        .from(schema.uploadQueue)
        .orderBy(desc(schema.uploadQueue.createdAt))
        .all();
    }),

  counts: publicProcedure.query(() => {
    const all = db
      .select({ count: sql<number>`count(*)` })
      .from(schema.uploadQueue)
      .get();
    const statuses = ["draft", "ready", "uploading", "uploaded", "error"] as const;
    const counts: Record<string, number> = { all: all?.count ?? 0 };
    for (const s of statuses) {
      const r = db
        .select({ count: sql<number>`count(*)` })
        .from(schema.uploadQueue)
        .where(eq(schema.uploadQueue.status, s))
        .get();
      counts[s] = r?.count ?? 0;
    }
    return counts;
  }),

  create: publicProcedure
    .input(
      z.object({
        brand: z.string().default("KORRUS"),
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
      })
    )
    .mutation(({ input }) => {
      const generatedAdName = generateAdName({
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
        input.copySlug, input.filename, input.date
      ].join('__');
      return db
        .insert(schema.uploadQueue)
        .values({ ...input, generatedAdName, conceptKey })
        .returning()
        .get();
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
        status: z
          .enum(["draft", "ready", "uploading", "uploaded", "error"])
          .optional(),
        metaAdId: z.string().optional().nullable(),
        metaCreativeId: z.string().optional().nullable(),
        errorMessage: z.string().optional().nullable(),
        conceptKey: z.string().optional().nullable(),
      })
    )
    .mutation(({ input }) => {
      const { id, ...updates } = input;
      // Fetch current row to merge for name regeneration
      const current = db
        .select()
        .from(schema.uploadQueue)
        .where(eq(schema.uploadQueue.id, id))
        .get();
      if (!current) throw new Error("Row not found");

      const merged = { ...current, ...updates };
      const generatedAdName = generateAdName({
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

      return db
        .update(schema.uploadQueue)
        .set({
          ...updates,
          generatedAdName,
          updatedAt: sql`datetime('now')`,
        })
        .where(eq(schema.uploadQueue.id, id))
        .returning()
        .get();
    }),

  addSize: publicProcedure
    .input(z.object({
      conceptKey: z.string(),
      dimensions: z.string(),
    }))
    .mutation(({ input }) => {
      const existing = db.select().from(schema.uploadQueue).all()
        .find((r: any) => r.conceptKey === input.conceptKey);
      if (!existing) throw new Error("Concept not found");
      const generatedAdName = generateAdName({
        brand: existing.brand, initiative: existing.initiative,
        variation: existing.variation, angle: existing.angle,
        source: existing.source, product: existing.product,
        contentType: existing.contentType, creativeType: existing.creativeType,
        dimensions: input.dimensions, copySlug: existing.copySlug,
        filename: existing.filename, date: existing.date,
      });
      return db.insert(schema.uploadQueue).values({
        brand: existing.brand, initiative: existing.initiative,
        variation: existing.variation, angle: existing.angle,
        source: existing.source, product: existing.product,
        contentType: existing.contentType, creativeType: existing.creativeType,
        dimensions: input.dimensions, copySlug: existing.copySlug,
        filename: existing.filename, date: existing.date,
        adSetId: existing.adSetId, adSetName: existing.adSetName,
        destinationUrl: existing.destinationUrl, headline: existing.headline,
        bodyCopy: existing.bodyCopy,
        conceptKey: input.conceptKey, generatedAdName,
        status: "draft", metaAdId: null, metaCreativeId: null,
        errorMessage: null, uploadedAt: null, fileUrl: null,
        fileKey: null, fileMimeType: null, fileSize: null,
      }).returning().get();
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => {
      db.delete(schema.uploadQueue)
        .where(eq(schema.uploadQueue.id, input.id))
        .run();
      return { success: true };
    }),

  bulkDelete: publicProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(({ input }) => {
      for (const id of input.ids) {
        db.delete(schema.uploadQueue)
          .where(eq(schema.uploadQueue.id, id))
          .run();
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
    .mutation(({ input }) => {
      for (const id of input.ids) {
        db.update(schema.uploadQueue)
          .set({ status: input.status, updatedAt: sql`datetime('now')` })
          .where(eq(schema.uploadQueue.id, id))
          .run();
      }
      return { success: true };
    }),
});

// ─── Copy Library ───────────────────────────────────────────────
const copyLibraryRouter = t.router({
  list: publicProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(({ input }) => {
      if (input?.status) {
        return db
          .select()
          .from(schema.copyLibrary)
          .where(eq(schema.copyLibrary.status, input.status as any))
          .orderBy(desc(schema.copyLibrary.createdAt))
          .all();
      }
      return db
        .select()
        .from(schema.copyLibrary)
        .orderBy(desc(schema.copyLibrary.createdAt))
        .all();
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
    .mutation(({ input }) => {
      return db.insert(schema.copyLibrary).values(input).returning().get();
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
    .mutation(({ input }) => {
      const { id, ...updates } = input;
      return db
        .update(schema.copyLibrary)
        .set({ ...updates, updatedAt: sql`datetime('now')` })
        .where(eq(schema.copyLibrary.id, id))
        .returning()
        .get();
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => {
      db.delete(schema.copyLibrary)
        .where(eq(schema.copyLibrary.id, input.id))
        .run();
      return { success: true };
    }),
});

// ─── Angle Bank ─────────────────────────────────────────────────
const angleBankRouter = t.router({
  list: publicProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(({ input }) => {
      if (input?.status) {
        return db
          .select()
          .from(schema.angleBank)
          .where(eq(schema.angleBank.status, input.status as any))
          .orderBy(desc(schema.angleBank.createdAt))
          .all();
      }
      return db
        .select()
        .from(schema.angleBank)
        .orderBy(desc(schema.angleBank.createdAt))
        .all();
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
    .mutation(({ input }) => {
      return db.insert(schema.angleBank).values(input).returning().get();
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
    .mutation(({ input }) => {
      const { id, ...updates } = input;
      return db
        .update(schema.angleBank)
        .set({ ...updates, updatedAt: sql`datetime('now')` })
        .where(eq(schema.angleBank.id, id))
        .returning()
        .get();
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => {
      db.delete(schema.angleBank)
        .where(eq(schema.angleBank.id, input.id))
        .run();
      return { success: true };
    }),
});

// ─── Field Options ──────────────────────────────────────────────
const fieldOptionsRouter = t.router({
  list: publicProcedure.query(() => {
    return db
      .select()
      .from(schema.fieldOptions)
      .orderBy(schema.fieldOptions.field, schema.fieldOptions.sortOrder)
      .all();
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
    .mutation(({ input }) => {
      return db.insert(schema.fieldOptions).values(input).returning().get();
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
    .mutation(({ input }) => {
      const { id, ...updates } = input;
      return db
        .update(schema.fieldOptions)
        .set({ ...updates, updatedAt: sql`datetime('now')` })
        .where(eq(schema.fieldOptions.id, id))
        .returning()
        .get();
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => {
      db.delete(schema.fieldOptions)
        .where(eq(schema.fieldOptions.id, input.id))
        .run();
      return { success: true };
    }),
});

// ─── Meta Settings ──────────────────────────────────────────────
const metaSettingsRouter = t.router({
  get: publicProcedure.query(() => {
    return db.select().from(schema.metaSettings).get();
  }),

  update: publicProcedure
    .input(
      z.object({
        appId: z.string().optional().nullable(),
        appSecret: z.string().optional().nullable(),
        accessToken: z.string().optional().nullable(),
        adAccountId: z.string().optional().nullable(),
        pageId: z.string().optional().nullable(),
      })
    )
    .mutation(({ input }) => {
      const existing = db.select().from(schema.metaSettings).get();
      if (existing) {
        return db
          .update(schema.metaSettings)
          .set({ ...input, updatedAt: sql`datetime('now')` })
          .where(eq(schema.metaSettings.id, existing.id))
          .returning()
          .get();
      }
      return db.insert(schema.metaSettings).values(input).returning().get();
    }),

  // TODO: validateToken — call Meta Graph API GET /me
  // TODO: getAccountInfo — call Meta Graph API GET /{adAccountId}
});

// ─── Root Router ────────────────────────────────────────────────
export const appRouter = t.router({
  queue: uploadQueueRouter,
  copy: copyLibraryRouter,
  angles: angleBankRouter,
  fieldOptions: fieldOptionsRouter,
  meta: metaSettingsRouter,
});

export type AppRouter = typeof appRouter;
