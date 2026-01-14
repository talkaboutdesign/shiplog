import { z } from "zod";

// Digest schema - matches database schema directly
export const DigestSchema = z.object({
  title: z.string().describe("Brief action-oriented title"),
  summary: z.string().describe("2-3 sentence plain English explanation"),
  category: z.enum(["feature", "bugfix", "refactor", "docs", "chore", "security"]).describe("Category of the change"),
  whyThisMatters: z.string().describe("1-2 sentence explanation of business/user impact"),
  perspectives: z.array(
    z.object({
      perspective: z.enum(["bugfix", "ui", "feature", "security", "performance", "refactor", "docs"]).describe("Valid values: bugfix, ui, feature, security, performance, refactor, docs. DO NOT use category values like 'chore' - map those to valid perspectives."),
      title: z.string(),
      summary: z.string(),
      confidence: z.number().min(0).max(100),
    })
  ).max(2).optional().describe("1-2 key perspectives on this change. Valid perspective values: bugfix, ui, feature, security, performance, refactor, docs"),
});

// Perspective schema
export const PerspectiveSchema = z.object({
  perspective: z.enum(["bugfix", "ui", "feature", "security", "performance", "refactor", "docs"]).describe("Valid perspective types: bugfix, ui, feature, security, performance, refactor, docs. Use exactly one of these values."),
  title: z.string(),
  summary: z.string(),
  confidence: z.number().min(0).max(100),
});

// Change intent schema (for impact analysis)
export const ChangeIntentSchema = z.object({
  primaryIntent: z.enum(["bugfix", "feature", "refactor", "security", "performance", "chore", "docs"]),
  claimedImprovements: z.array(z.string()).describe("What the commit claims to fix or improve"),
  expectedBehaviorChanges: z.array(z.string()).describe("Expected changes in system behavior"),
  riskAreas: z.array(z.string()).describe("Areas that could be affected by this change"),
});

// Impact analysis schema - matches database schema directly
export const ImpactAnalysisSchema = z.object({
  affectedFiles: z.array(
    z.object({
      filePath: z.string().describe("The file path from the diff"),
      riskLevel: z.enum(["low", "medium", "high"]),
      briefReason: z.string().describe("One-line explanation of NEW risk introduced"),
      confidence: z.number().min(0).max(100),
      isImprovement: z.boolean().describe("True if this change improves the code (adds safety, fixes bugs)"),
    })
  ).max(10),
  overallRisk: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(100),
  overallExplanation: z.string().describe("2-3 sentence senior engineer summary in markdown. Use **bold** for critical issues, `code` for function names. Focus on NEW risks, acknowledge improvements."),
  intentValidation: z.object({
    claimsVerified: z.boolean().describe("Whether the commit achieves what it claims. Set to true if no commit context provided."),
    explanation: z.string().describe("Brief explanation of whether intent was achieved. Use 'No commit context provided' if unavailable."),
  }),
});

// Summary schema - matches database schema directly (no transformations needed)
export const SummarySchema = z.object({
  headline: z.string().describe("Compelling headline summarizing the period's key achievement"),
  accomplishments: z.string().describe("2-3 paragraphs describing what was accomplished, written for stakeholders"),
  keyFeatures: z.array(z.string()).describe("List of key features/changes shipped (5-10 items)"),
  workBreakdown: z.object({
    bugfix: z.optional(z.object({ percentage: z.number(), count: z.number() })),
    feature: z.optional(z.object({ percentage: z.number(), count: z.number() })),
    refactor: z.optional(z.object({ percentage: z.number(), count: z.number() })),
    docs: z.optional(z.object({ percentage: z.number(), count: z.number() })),
    chore: z.optional(z.object({ percentage: z.number(), count: z.number() })),
    security: z.optional(z.object({ percentage: z.number(), count: z.number() })),
  }).describe("Work breakdown by category. Only include categories that have items (count > 0)."),
  totalItems: z.number().describe("Total number of items/digests included in this summary"),
});
