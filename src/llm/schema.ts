export interface LlmAnalysis {
  summary: string;
  userFacingChanges: string[];
  analyticsImplications: string[];
  deploymentImplications: string[];
  likelySurfaces: string[];
  riskFlags: string[];
  confidence: "high" | "medium" | "low";
  evidence: Array<{ file: string; reason: string }>;
}

export function isLlmAnalysis(obj: unknown): obj is LlmAnalysis {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  if (typeof o.summary !== "string") return false;
  if (!Array.isArray(o.userFacingChanges)) return false;
  if (!Array.isArray(o.analyticsImplications)) return false;
  if (!Array.isArray(o.deploymentImplications)) return false;
  if (!Array.isArray(o.likelySurfaces)) return false;
  if (!Array.isArray(o.riskFlags)) return false;
  if (!["high", "medium", "low"].includes(o.confidence as string)) return false;
  if (!Array.isArray(o.evidence)) return false;
  return true;
}
