// Completeness scoring for upload queue items

export interface CompletenessResult {
  score: number;          // 0.0 to 1.0
  filledCount: number;
  totalCount: number;
  level: "red" | "yellow" | "green";
  missingCritical: string[];
  missingOptional: string[];
}

const CRITICAL_FIELDS = ["angle", "source", "contentType", "dimensions", "date"] as const;
const IMPORTANT_FIELDS = ["handle", "initiative", "variation", "product", "creativeType", "copySlug", "filename"] as const;

export function computeCompleteness(item: Record<string, any>): CompletenessResult {
  let totalWeight = 0;
  let filledWeight = 0;
  const missingCritical: string[] = [];
  const missingOptional: string[] = [];

  // Critical fields (weight 2 each)
  for (const f of CRITICAL_FIELDS) {
    totalWeight += 2;
    if (item[f]?.toString().trim()) {
      filledWeight += 2;
    } else {
      missingCritical.push(f);
    }
  }

  // Important fields (weight 1 each)
  for (const f of IMPORTANT_FIELDS) {
    totalWeight += 1;
    if (item[f]?.toString().trim()) {
      filledWeight += 1;
    } else {
      missingOptional.push(f);
    }
  }

  // File attachment (weight 2)
  totalWeight += 2;
  if (item.fileUrl) {
    filledWeight += 2;
  } else {
    missingCritical.push("file");
  }

  const score = totalWeight > 0 ? filledWeight / totalWeight : 0;
  const level = missingCritical.length > 0 ? "red" : score >= 0.85 ? "green" : "yellow";

  return { score, filledCount: filledWeight, totalCount: totalWeight, level, missingCritical, missingOptional };
}
