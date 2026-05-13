import { isLlmAnalysis } from "../llm/schema";

describe("isLlmAnalysis", () => {
  const valid = {
    summary: "Short summary.",
    userFacingChanges: ["Checkout flow changed"],
    analyticsImplications: ["Track checkout"],
    deploymentImplications: ["No infra change"],
    likelySurfaces: ["checkout"],
    riskFlags: ["customer-facing UI"],
    confidence: "medium",
    evidence: [{ file: "app/checkout.vue", reason: "UI changed" }],
  };

  it("accepts a valid object", () => {
    expect(isLlmAnalysis(valid)).toBe(true);
  });

  it("rejects null", () => {
    expect(isLlmAnalysis(null)).toBe(false);
  });

  it("rejects missing summary", () => {
    const { summary: _, ...rest } = valid;
    expect(isLlmAnalysis(rest)).toBe(false);
  });

  it("rejects invalid confidence", () => {
    expect(isLlmAnalysis({ ...valid, confidence: "very-high" })).toBe(false);
  });

  it("rejects non-array userFacingChanges", () => {
    expect(isLlmAnalysis({ ...valid, userFacingChanges: "string" })).toBe(false);
  });
});
