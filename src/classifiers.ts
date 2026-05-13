export interface ImpactSummary {
  frontendChanged: boolean;
  backendChanged: boolean;
  databaseChanged: boolean;
  infraChanged: boolean;
  cartosRuntimeChanged: boolean;
  crawlerChanged: boolean;
  deploymentPipelineChanged: boolean;
  docsOnly: boolean;
  likelyCustomerFacingAreas: string[];
  likelyDeploymentRisks: string[];
}

interface PathRule {
  pattern: RegExp;
  area: string;
}

const PATH_RULES: PathRule[] = [
  { pattern: /^app\//i, area: "frontend" },
  { pattern: /^server\/api\//i, area: "nuxt-backend-api" },
  { pattern: /^server\/utils\//i, area: "shared-server-runtime" },
  { pattern: /^api_chatbot\//i, area: "cartos-runtime" },
  { pattern: /^api_crawler\//i, area: "crawler-runtime" },
  { pattern: /^shared\//i, area: "cross-surface-shared-logic" },
  { pattern: /^packages\//i, area: "internal-package-change" },
  { pattern: /^infra\/azure\//i, area: "infrastructure" },
  { pattern: /^supabase\//i, area: "database-or-edge-runtime" },
  { pattern: /^\.github\/workflows\//i, area: "deployment-pipeline" },
  { pattern: /^docs\//i, area: "docs-only" },
];

export function classifyPaths(filenames: string[]): string[] {
  const areas = new Set<string>();
  for (const filename of filenames) {
    for (const rule of PATH_RULES) {
      if (rule.pattern.test(filename)) {
        areas.add(rule.area);
        break;
      }
    }
  }
  return Array.from(areas);
}

export function buildImpactSummary(filenames: string[]): ImpactSummary {
  const areas = classifyPaths(filenames);
  const areaSet = new Set(areas);

  const frontendChanged = areaSet.has("frontend");
  const backendChanged =
    areaSet.has("nuxt-backend-api") || areaSet.has("shared-server-runtime");
  const databaseChanged = areaSet.has("database-or-edge-runtime");
  const infraChanged = areaSet.has("infrastructure");
  const cartosRuntimeChanged = areaSet.has("cartos-runtime");
  const crawlerChanged = areaSet.has("crawler-runtime");
  const deploymentPipelineChanged = areaSet.has("deployment-pipeline");

  const nonDocAreas = areas.filter((a) => a !== "docs-only");
  const docsOnly = areas.length > 0 && nonDocAreas.length === 0;

  const likelyCustomerFacingAreas: string[] = [];
  if (frontendChanged) likelyCustomerFacingAreas.push("frontend UI");
  if (backendChanged) likelyCustomerFacingAreas.push("API / server");
  if (cartosRuntimeChanged) likelyCustomerFacingAreas.push("Cartos AI assistant");

  const likelyDeploymentRisks: string[] = [];
  if (frontendChanged) likelyDeploymentRisks.push("customer-facing UI changed");
  if (backendChanged) likelyDeploymentRisks.push("backend API changed");
  if (databaseChanged) likelyDeploymentRisks.push("database / edge runtime changed");
  if (infraChanged) likelyDeploymentRisks.push("infrastructure changed");
  if (cartosRuntimeChanged) likelyDeploymentRisks.push("Cartos runtime changed");
  if (crawlerChanged) likelyDeploymentRisks.push("crawler runtime changed");
  if (deploymentPipelineChanged) likelyDeploymentRisks.push("deployment pipeline changed");

  return {
    frontendChanged,
    backendChanged,
    databaseChanged,
    infraChanged,
    cartosRuntimeChanged,
    crawlerChanged,
    deploymentPipelineChanged,
    docsOnly,
    likelyCustomerFacingAreas,
    likelyDeploymentRisks,
  };
}
