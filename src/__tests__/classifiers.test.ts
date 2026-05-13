import { classifyPaths, buildImpactSummary } from "../classifiers";

describe("classifyPaths", () => {
  it("classifies frontend files", () => {
    const areas = classifyPaths(["app/pages/index.vue", "app/components/Nav.vue"]);
    expect(areas).toContain("frontend");
  });

  it("classifies backend API files", () => {
    const areas = classifyPaths(["server/api/users.ts"]);
    expect(areas).toContain("nuxt-backend-api");
  });

  it("classifies cartos runtime files", () => {
    const areas = classifyPaths(["api_chatbot/index.ts"]);
    expect(areas).toContain("cartos-runtime");
  });

  it("classifies crawler files", () => {
    const areas = classifyPaths(["api_crawler/scraper.ts"]);
    expect(areas).toContain("crawler-runtime");
  });

  it("classifies infrastructure files", () => {
    const areas = classifyPaths(["infra/azure/main.tf"]);
    expect(areas).toContain("infrastructure");
  });

  it("classifies database files", () => {
    const areas = classifyPaths(["supabase/migrations/001.sql"]);
    expect(areas).toContain("database-or-edge-runtime");
  });

  it("classifies deployment pipeline files", () => {
    const areas = classifyPaths([".github/workflows/deploy.yml"]);
    expect(areas).toContain("deployment-pipeline");
  });

  it("classifies docs files", () => {
    const areas = classifyPaths(["docs/README.md"]);
    expect(areas).toContain("docs-only");
  });

  it("returns empty array for unmatched files", () => {
    const areas = classifyPaths(["random/file.txt"]);
    expect(areas).toHaveLength(0);
  });

  it("handles multiple areas", () => {
    const areas = classifyPaths([
      "app/pages/index.vue",
      "server/api/users.ts",
      "supabase/migrations/001.sql",
    ]);
    expect(areas).toContain("frontend");
    expect(areas).toContain("nuxt-backend-api");
    expect(areas).toContain("database-or-edge-runtime");
  });
});

describe("buildImpactSummary", () => {
  it("correctly identifies frontend change", () => {
    const summary = buildImpactSummary(["app/pages/checkout.vue"]);
    expect(summary.frontendChanged).toBe(true);
    expect(summary.backendChanged).toBe(false);
    expect(summary.databaseChanged).toBe(false);
    expect(summary.likelyCustomerFacingAreas).toContain("frontend UI");
    expect(summary.likelyDeploymentRisks).toContain("customer-facing UI changed");
  });

  it("correctly identifies backend change", () => {
    const summary = buildImpactSummary(["server/api/checkout.ts"]);
    expect(summary.backendChanged).toBe(true);
    expect(summary.frontendChanged).toBe(false);
    expect(summary.likelyDeploymentRisks).toContain("backend API changed");
  });

  it("marks docsOnly when only docs changed", () => {
    const summary = buildImpactSummary(["docs/architecture.md"]);
    expect(summary.docsOnly).toBe(true);
    expect(summary.frontendChanged).toBe(false);
  });

  it("does not mark docsOnly when mixed changes", () => {
    const summary = buildImpactSummary(["docs/README.md", "app/pages/home.vue"]);
    expect(summary.docsOnly).toBe(false);
    expect(summary.frontendChanged).toBe(true);
  });

  it("returns empty risks for no changed files", () => {
    const summary = buildImpactSummary([]);
    expect(summary.likelyDeploymentRisks).toHaveLength(0);
    expect(summary.likelyCustomerFacingAreas).toHaveLength(0);
  });

  it("identifies infra change", () => {
    const summary = buildImpactSummary(["infra/azure/storage.tf"]);
    expect(summary.infraChanged).toBe(true);
    expect(summary.likelyDeploymentRisks).toContain("infrastructure changed");
  });
});
