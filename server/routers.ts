import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { db, schema } from "./db.js";
import { generateAdName, parseAdName } from "../shared/naming.js";

const t = initTRPC.create();
const publicProcedure = t.procedure;

// In-memory cache for Meta ad sets (5 min TTL)
// Cache filtered to ACTIVE campaigns + ACTIVE ad sets only
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

  listPaginated: publicProcedure
    .input(z.object({
      status: z.string().optional(),
      limit: z.number().min(1).max(500).default(200),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const limit = input?.limit ?? 200;
      const offset = input?.offset ?? 0;

      // Count total
      let countResult;
      if (input?.status && input.status !== "all") {
        countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(schema.uploadQueue)
          .where(eq(schema.uploadQueue.status, input.status));
      } else {
        countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(schema.uploadQueue);
      }
      const total = Number(countResult[0].count);

      // Fetch page
      let items;
      if (input?.status && input.status !== "all") {
        items = await db.select().from(schema.uploadQueue)
          .where(eq(schema.uploadQueue.status, input.status))
          .orderBy(desc(schema.uploadQueue.createdAt))
          .limit(limit)
          .offset(offset);
      } else {
        items = await db.select().from(schema.uploadQueue)
          .orderBy(desc(schema.uploadQueue.createdAt))
          .limit(limit)
          .offset(offset);
      }

      return { items, total, limit, offset };
    }),

  counts: publicProcedure.query(async () => {
    const rows = await db
      .select({
        status: schema.uploadQueue.status,
        count: sql<number>`count(*)`,
      })
      .from(schema.uploadQueue)
      .groupBy(schema.uploadQueue.status);

    const counts: Record<string, number> = { all: 0, draft: 0, ready: 0, uploading: 0, uploaded: 0, error: 0 };
    for (const row of rows) {
      counts[row.status] = Number(row.count);
      counts.all += Number(row.count);
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
      const matchingRows = await db.select().from(schema.uploadQueue)
        .where(eq(schema.uploadQueue.conceptKey, input.conceptKey))
        .limit(1);
      const existing = matchingRows[0];
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
      if (input.ids.length > 0) {
        await db.delete(schema.uploadQueue)
          .where(inArray(schema.uploadQueue.id, input.ids));
        logAudit("bulk_delete", "ad", undefined, { ids: input.ids, count: input.ids.length });
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
      // When marking "ready", validate essential fields first
      const warnings: string[] = [];
      if (input.status === "ready") {
        const ads = await db.select().from(schema.uploadQueue)
          .where(inArray(schema.uploadQueue.id, input.ids));
        const metaRows = await db.select().from(schema.metaSettings);
        const metaSettings = metaRows[0];
        const allCopy = await db.select().from(schema.copyLibrary);
        const copyBySlug = new Map(allCopy.map((c) => [c.copySlug, c]));

        for (const ad of ads) {
          const issues: string[] = [];
          if (!ad.fileUrl) issues.push("no creative file");
          if (!ad.adSetId) issues.push("no ad set");
          // Check headline via copy slug
          let hasHeadline = !!ad.headline;
          let hasBody = !!ad.bodyCopy;
          if (ad.copySlug) {
            const copy = copyBySlug.get(ad.copySlug);
            if (!copy) {
              issues.push(`copy slug "${ad.copySlug}" not found`);
            } else {
              if (!hasHeadline && copy.headline) hasHeadline = true;
              if (!hasBody && copy.bodyCopy) hasBody = true;
            }
          }
          if (!hasHeadline) issues.push("no headline");
          if (!hasBody) issues.push("no body copy");
          if (!ad.destinationUrl && !metaSettings?.defaultDestinationUrl) issues.push("no destination URL");
          if (issues.length > 0) warnings.push(`${ad.generatedAdName || `Ad #${ad.id}`}: ${issues.join(", ")}`);
        }
      }

      if (input.ids.length > 0) {
        await db.update(schema.uploadQueue)
          .set({ status: input.status, updatedAt: sql`now()` })
          .where(inArray(schema.uploadQueue.id, input.ids));
        logAudit("status_change", "ad", undefined, { ids: input.ids, status: input.status, count: input.ids.length });
      }
      return { success: true, warnings };
    }),

  // Clone/duplicate a concept group — creates new draft rows with same metadata
  cloneConcept: publicProcedure
    .input(z.object({ conceptKey: z.string() }))
    .mutation(async ({ input }) => {
      const rows = await db.select().from(schema.uploadQueue)
        .where(eq(schema.uploadQueue.conceptKey, input.conceptKey));
      if (rows.length === 0) throw new Error("Concept not found");

      // Generate new variation suffix
      const primary = rows[0];
      const existingVariations = await db.select({ variation: schema.uploadQueue.variation })
        .from(schema.uploadQueue)
        .where(eq(schema.uploadQueue.initiative, primary.initiative));
      const usedVariations = new Set(existingVariations.map((r) => r.variation));
      let newVariation = primary.variation;
      // Increment variation: V1 → V2, 1A → 1B, etc.
      const match = newVariation.match(/^(.*)(\d+)([A-Z]?)$/);
      if (match) {
        let num = parseInt(match[2], 10);
        let letter = match[3];
        for (let i = 0; i < 100; i++) {
          if (letter) {
            letter = String.fromCharCode(letter.charCodeAt(0) + 1);
            if (letter > "Z") { num++; letter = "A"; }
          } else {
            num++;
          }
          const candidate = `${match[1]}${num}${letter}`;
          if (!usedVariations.has(candidate)) { newVariation = candidate; break; }
        }
      } else {
        newVariation = newVariation + "-copy";
      }

      const created: any[] = [];
      for (const row of rows) {
        const newConceptKey = [
          row.brand, row.initiative, newVariation, row.angle,
          row.source, row.product, row.contentType, row.creativeType,
          row.copySlug, row.date,
        ].join("__");

        const newAdName = generateAdName({
          handle: row.handle || "korruscircadian",
          brand: row.brand, initiative: row.initiative, variation: newVariation,
          angle: row.angle, source: row.source, product: row.product,
          contentType: row.contentType, creativeType: row.creativeType,
          dimensions: row.dimensions, copySlug: row.copySlug,
          filename: row.filename, date: row.date,
        });

        const [cloned] = await db.insert(schema.uploadQueue).values({
          brand: row.brand, initiative: row.initiative, variation: newVariation,
          angle: row.angle, source: row.source, product: row.product,
          contentType: row.contentType, creativeType: row.creativeType,
          dimensions: row.dimensions, copySlug: row.copySlug,
          filename: row.filename, date: row.date,
          adSetId: row.adSetId, adSetName: row.adSetName,
          destinationUrl: row.destinationUrl, headline: row.headline,
          bodyCopy: row.bodyCopy, handle: row.handle, cta: row.cta,
          displayUrl: row.displayUrl, agency: row.agency,
          pageId: row.pageId, instagramAccountId: row.instagramAccountId,
          conceptKey: newConceptKey, generatedAdName: newAdName,
          status: "draft", fileUrl: row.fileUrl, fileKey: row.fileKey,
          fileMimeType: row.fileMimeType, fileSize: row.fileSize,
        }).returning();
        created.push(cloned);
      }
      logAudit("clone_concept", "ad", input.conceptKey, { newVariation, clonedCount: created.length });
      return { success: true, cloned: created.length, newVariation };
    }),

  // Reset stuck "uploading" rows back to "ready" (recovery from server crashes)
  resetStuck: publicProcedure
    .mutation(async () => {
      const result = await db.update(schema.uploadQueue)
        .set({ status: "ready", errorMessage: null, updatedAt: sql`now()` })
        .where(eq(schema.uploadQueue.status, "uploading"))
        .returning({ id: schema.uploadQueue.id });
      return { reset: result.length };
    }),

  // Retry failed uploads — reset error → ready
  retryFailed: publicProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      await db.update(schema.uploadQueue)
        .set({ status: "ready", errorMessage: null, updatedAt: sql`now()` })
        .where(inArray(schema.uploadQueue.id, input.ids));
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
      // Fetch all primary rows and track which dimensions already exist
      const primaryRows = await db
        .select()
        .from(schema.uploadQueue)
        .where(eq(schema.uploadQueue.conceptKey, input.primaryConceptKey));
      const primary = primaryRows[0];
      if (!primary) throw new Error("Primary concept not found");

      const primaryDims = new Set(primaryRows.map((r) => r.dimensions));
      let merged = 0;
      let skipped = 0;

      for (const sourceKey of input.secondaryConceptKeys) {
        const sourceRows = await db
          .select()
          .from(schema.uploadQueue)
          .where(eq(schema.uploadQueue.conceptKey, sourceKey));

        for (const row of sourceRows) {
          // If primary already has this dimension, delete the duplicate
          if (primaryDims.has(row.dimensions)) {
            await db.delete(schema.uploadQueue)
              .where(eq(schema.uploadQueue.id, row.id));
            skipped++;
            continue;
          }

          // Otherwise, merge it in with the primary's naming fields
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

          // Track the newly added dimension so subsequent groups don't duplicate it
          primaryDims.add(row.dimensions);
          merged++;
        }
      }
      return { success: true, merged, skipped };
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

  generateCopy: publicProcedure
    .input(z.object({
      angle: z.string().optional(),
      product: z.string().optional(),
      tone: z.string().optional(),
      count: z.number().min(1).max(5).default(3),
    }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured. Add it in Railway environment variables.");

      // Load existing copy for context
      const existingCopy = await db.select().from(schema.copyLibrary).limit(10);
      const existingExamples = existingCopy.map(c =>
        `Slug: ${c.copySlug}\nHeadline: ${c.headline}\nBody: ${c.bodyCopy}`
      ).join("\n\n");

      // Load angles for context
      const angles = await db.select().from(schema.angleBank);
      const angleContext = input.angle
        ? angles.find(a => a.angleSlug === input.angle)
        : null;

      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey });

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: `You are a direct-response copywriter for Korrus, a circadian lighting brand that makes the OIO bulb — the only LED that fully eliminates blue light at night (not just shifts color temperature).

Brand voice: "The Outlaw Sage" — erudite, fearless, meticulous, earnest, assured. Think Reddit-style authentic, not corporate.

Target audience: wellness-oriented professionals, 25-45, $100K-$300K income.

${angleContext ? `Angle: ${angleContext.angleSlug} — ${angleContext.description}\nExample: ${angleContext.example}` : ""}
${input.product ? `Product: ${input.product}` : "Product: OIO Bulb"}
${input.tone ? `Tone: ${input.tone}` : ""}

Here are existing copy examples for reference (match this style):
${existingExamples}

Generate ${input.count} NEW ad copy variations. Each must have:
1. A copySlug (format: C-ShortName, PascalCase)
2. A headline (short, punchy, conversational — think Reddit post title)
3. Body copy (2-4 sentences, authentic voice, specific claims about blue light elimination)

Return ONLY valid JSON array:
[{"copySlug": "C-Example", "headline": "...", "bodyCopy": "..."}]`
        }],
      });

      // Parse the response
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("Failed to parse AI response");

      const suggestions = JSON.parse(jsonMatch[0]) as Array<{
        copySlug: string;
        headline: string;
        bodyCopy: string;
      }>;

      return suggestions;
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
      const allAdSets: any[] = [];
      let url: string | null = `https://graph.facebook.com/v21.0/${settings.adAccountId}/adsets?${new URLSearchParams({
        fields: "id,name,status,campaign{id,name,status}",
        access_token: settings.accessToken,
        limit: "200",
      }).toString()}`;

      // Paginate through all ad sets
      while (url) {
        const res: Response = await fetch(url);
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.error("Meta getAdSets failed:", res.status, errText);
          break;
        }
        const data: any = await res.json();
        const items = (data.data || [])
          .filter((s: any) => s.status === "ACTIVE" && s.campaign?.status === "ACTIVE")
          .map((s: any) => ({
            id: s.id,
            name: s.name,
            status: s.status,
            campaignId: s.campaign?.id,
            campaignName: s.campaign?.name,
          }));
        allAdSets.push(...items);
        url = data.paging?.next || null;
      }

      adSetsCache.data = allAdSets;
      adSetsCache.fetchedAt = now;
      return allAdSets;
    } catch (err: any) {
      console.error("Meta getAdSets error:", err?.message || err);
      throw new Error(`Failed to load ad sets from Meta: ${err?.message || "Unknown error"}`);
    }
  }),

  getAdInsights: publicProcedure
    .input(z.object({
      dateRange: z.enum(["today", "last_7d", "last_14d", "last_30d"]).default("last_7d"),
      adIds: z.array(z.string()).optional(),
    }).optional())
    .query(async ({ input }) => {
      const settingsRows = await db.select().from(schema.metaSettings);
      const settings = settingsRows[0];
      if (!settings?.accessToken || !settings?.adAccountId) return [];

      const datePresets: Record<string, string> = {
        today: "today",
        last_7d: "last_7d",
        last_14d: "last_14d",
        last_30d: "last_30d",
      };

      try {
        const params = new URLSearchParams({
          fields: "ad_id,ad_name,impressions,clicks,ctr,spend,cpc,cpm,actions,cost_per_action_type",
          date_preset: datePresets[input?.dateRange || "last_7d"],
          access_token: settings.accessToken,
          limit: "200",
          level: "ad",
        });

        // If specific ad IDs requested, filter
        if (input?.adIds && input.adIds.length > 0) {
          params.set("filtering", JSON.stringify([{
            field: "ad.id",
            operator: "IN",
            value: input.adIds,
          }]));
        }

        const url = `https://graph.facebook.com/v21.0/${settings.adAccountId}/insights?${params.toString()}`;
        const res = await fetch(url);
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.error("Meta insights failed:", res.status, errText);
          return [];
        }
        const data = await res.json();

        // Load all uploaded queue items to join with insights by metaAdId or adName
        const queueRows = await db.select().from(schema.uploadQueue)
          .where(eq(schema.uploadQueue.status, "uploaded"));
        const queueByMetaAdId = new Map<string, typeof queueRows[number]>();
        const queueByAdName = new Map<string, typeof queueRows[number]>();
        for (const q of queueRows) {
          if (q.metaAdId) queueByMetaAdId.set(q.metaAdId, q);
          if (q.generatedAdName) queueByAdName.set(q.generatedAdName, q);
        }

        // Parse rows and enrich with queue fields
        const rawRows = (data.data || []).map((row: any) => {
          const purchases = (row.actions || []).find((a: any) => a.action_type === "purchase");
          const purchaseCost = (row.cost_per_action_type || []).find((a: any) => a.action_type === "purchase");
          const impressions = Number(row.impressions || 0);
          const clicks = Number(row.clicks || 0);
          const spend = parseFloat(row.spend || "0");
          const purchaseCount = purchases ? Number(purchases.value) : 0;

          // Try to find matching queue row for field data
          const queueRow = queueByMetaAdId.get(row.ad_id) || queueByAdName.get(row.ad_name);

          // Extract fields from queue row or fallback to parsing the ad name
          let fields: Record<string, string>;
          if (queueRow) {
            fields = {
              handle: queueRow.handle || "",
              initiative: queueRow.initiative || "",
              variation: queueRow.variation || "",
              angle: queueRow.angle || "",
              creativeType: queueRow.creativeType || "",
              source: queueRow.source || "",
              contentType: queueRow.contentType || "",
              dimensions: queueRow.dimensions || "",
              copySlug: queueRow.copySlug || "",
              product: queueRow.product || "",
              date: queueRow.date || "",
              filename: queueRow.filename || "",
            };
          } else {
            const parsed = parseAdName(row.ad_name || "");
            fields = {
              handle: parsed.handle || "",
              initiative: parsed.initiative || "",
              variation: parsed.variation || "",
              angle: parsed.angle || "",
              creativeType: parsed.creativeType || "",
              source: parsed.source || "",
              contentType: parsed.contentType || "",
              dimensions: "",
              copySlug: parsed.copySlug || "",
              product: parsed.product || "",
              date: parsed.date || "",
              filename: "",
            };
          }

          return {
            adId: row.ad_id as string,
            adName: row.ad_name as string,
            impressions,
            clicks,
            spend,
            ctr: impressions > 0 ? clicks / impressions * 100 : 0,
            cpc: clicks > 0 ? spend / clicks : 0,
            cpm: impressions > 0 ? spend / impressions * 1000 : 0,
            purchases: purchaseCount,
            costPerPurchase: purchaseCost ? parseFloat(purchaseCost.value) : 0,
            roas: purchaseCount > 0 && spend > 0
              ? Number((purchaseCount * 50 / spend).toFixed(2))
              : 0,
            fileUrl: queueRow?.fileUrl || "",
            fileMimeType: queueRow?.fileMimeType || "",
            // All naming fields for pivot
            ...fields,
          };
        });

        // Deduplicate: merge rows with identical adName by summing metrics
        const mergedMap = new Map<string, typeof rawRows[number]>();
        for (const row of rawRows) {
          const existing = mergedMap.get(row.adName);
          if (existing) {
            existing.impressions += row.impressions;
            existing.clicks += row.clicks;
            existing.spend += row.spend;
            existing.purchases += row.purchases;
            // Recalculate derived metrics
            existing.ctr = existing.impressions > 0 ? existing.clicks / existing.impressions * 100 : 0;
            existing.cpc = existing.clicks > 0 ? existing.spend / existing.clicks : 0;
            existing.cpm = existing.impressions > 0 ? existing.spend / existing.impressions * 1000 : 0;
            existing.costPerPurchase = existing.purchases > 0 ? existing.spend / existing.purchases : 0;
            existing.roas = existing.purchases > 0 && existing.spend > 0
              ? Number((existing.purchases * 50 / existing.spend).toFixed(2))
              : 0;
          } else {
            mergedMap.set(row.adName, { ...row });
          }
        }

        return Array.from(mergedMap.values());
      } catch (err: any) {
        console.error("Meta insights error:", err?.message || err);
        throw new Error(`Failed to load insights: ${err?.message || "Unknown error"}`);
      }
    }),
});

// ─── Audit Log ─────────────────────────────────────────────────
async function logAudit(action: string, entityType: string, entityId?: string, details?: Record<string, any>) {
  try {
    await db.insert(schema.auditLog).values({
      action,
      entityType,
      entityId: entityId || null,
      details: details ? JSON.stringify(details) : null,
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
  }
}

const auditRouter = t.router({
  list: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(500).default(100),
      offset: z.number().min(0).default(0),
      action: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const limit = input?.limit ?? 100;
      const offset = input?.offset ?? 0;
      if (input?.action) {
        return db.select().from(schema.auditLog)
          .where(eq(schema.auditLog.action, input.action))
          .orderBy(desc(schema.auditLog.createdAt))
          .limit(limit)
          .offset(offset);
      }
      return db.select().from(schema.auditLog)
        .orderBy(desc(schema.auditLog.createdAt))
        .limit(limit)
        .offset(offset);
    }),
});

// ─── Scheduled Uploads ─────────────────────────────────────────
const scheduledUploadsRouter = t.router({
  list: publicProcedure.query(async () => {
    return db.select().from(schema.scheduledUploads)
      .orderBy(desc(schema.scheduledUploads.scheduledAt));
  }),

  create: publicProcedure
    .input(z.object({
      adIds: z.array(z.number()),
      scheduledAt: z.string(), // ISO date string
    }))
    .mutation(async ({ input }) => {
      const [row] = await db.insert(schema.scheduledUploads).values({
        adIds: JSON.stringify(input.adIds),
        scheduledAt: new Date(input.scheduledAt),
      }).returning();
      return row;
    }),

  cancel: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(schema.scheduledUploads)
        .where(eq(schema.scheduledUploads.id, input.id));
      return { success: true };
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
  audit: auditRouter,
  scheduled: scheduledUploadsRouter,
});

export type AppRouter = typeof appRouter;
