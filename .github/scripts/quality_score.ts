/**
 * quality_score.ts – AI Quality Gate scoring engine
 *
 * Inputs (via environment variables / file paths):
 *   CHANGED_FILES    – newline-separated list of changed file paths
 *   DIFF_FILE        – path to the unified diff file
 *   LINT_OUTPUT       – path to the lint results JSON
 *   TEST_RESULTS_DIR  – directory containing test result JSONs
 *   COVERAGE_DIR      – directory containing coverage-summary.json files
 *   RUBRIC_FILE       – path to quality-rubric.yml (default: .github/quality-rubric.yml)
 *   SCORE_THRESHOLD   – override rubric threshold (optional)
 *
 * Outputs (written to CWD):
 *   quality-score.json   – machine-readable scoring report
 *   quality-summary.md   – human-readable markdown for PR comment
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve paths relative to the repo root (two levels up from .github/scripts/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..", "..");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RubricCategory {
  name: string;
  key: string;
  weight: number;
  description: string;
  signals: string[];
}

interface Rubric {
  threshold: number;
  categories: RubricCategory[];
}

interface CategoryResult {
  key: string;
  name: string;
  weight: number;
  score: number;
  weightedScore: number;
  rationale: string;
  deductions: string[];
}

interface QualityReport {
  totalScore: number;
  threshold: number;
  passFail: "pass" | "fail";
  requiredHumanReview: boolean;
  generatedAt: string;
  categoryScores: CategoryResult[];
  summary: string;
}

interface TestToolResult {
  tool: string;
  testsGenerated: number;
  testsPassed: number;
  testsFailed: number;
  coverageDelta: number | null;
}

interface LintResult {
  errors: number;
  warnings: number;
  files: { path: string; messages: string[] }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (val === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

function readJsonSafe<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    console.warn(`Warning: could not parse JSON from ${path}`);
    return fallback;
  }
}

function parseYamlSimple(content: string): Rubric {
  // Minimal YAML parser for our rubric format – avoids external dependency.
  // Handles the flat structure of quality-rubric.yml only.
  const lines = content.split("\n");
  let threshold = 70;
  const categories: RubricCategory[] = [];
  let current: Partial<RubricCategory> | null = null;
  let inSignals = false;

  for (const raw of lines) {
    const line = raw.trimEnd();

    const thresholdMatch = line.match(/^threshold:\s*(\d+)/);
    if (thresholdMatch) {
      threshold = parseInt(thresholdMatch[1], 10);
      continue;
    }

    if (line.match(/^\s{2}- name:\s*(.+)/)) {
      if (current?.key) {
        categories.push(current as RubricCategory);
      }
      current = {
        name: line.match(/^\s{2}- name:\s*(.+)/)![1].trim(),
        signals: [],
      };
      inSignals = false;
      continue;
    }

    if (current) {
      const keyMatch = line.match(/^\s{4}key:\s*(.+)/);
      if (keyMatch) {
        current.key = keyMatch[1].trim();
        continue;
      }
      const weightMatch = line.match(/^\s{4}weight:\s*(\d+)/);
      if (weightMatch) {
        current.weight = parseInt(weightMatch[1], 10);
        continue;
      }
      const descMatch = line.match(/^\s{4}description:\s*>?\s*(.*)/);
      if (descMatch) {
        current.description = descMatch[1].trim();
        continue;
      }
      if (line.match(/^\s{4}signals:/)) {
        inSignals = true;
        continue;
      }
      if (inSignals) {
        const sigMatch = line.match(/^\s{6}-\s*"(.+)"/);
        if (sigMatch) {
          current.signals!.push(sigMatch[1]);
        } else if (!line.match(/^\s{6}/)) {
          inSignals = false;
        }
      }
    }
  }
  if (current?.key) {
    categories.push(current as RubricCategory);
  }
  return { threshold, categories };
}

// ---------------------------------------------------------------------------
// Scoring heuristics
// ---------------------------------------------------------------------------

function classifyFiles(files: string[]): {
  apiRoutes: string[];
  repositories: string[];
  components: string[];
  other: string[];
} {
  const apiRoutes: string[] = [];
  const repositories: string[] = [];
  const components: string[] = [];
  const other: string[] = [];

  for (const f of files) {
    if (f.includes("routes/") && extname(f) === ".ts") {
      apiRoutes.push(f);
    } else if (f.includes("repositories/") && extname(f) === ".ts") {
      repositories.push(f);
    } else if (
      f.includes("frontend/src/") &&
      (extname(f) === ".tsx" || extname(f) === ".ts")
    ) {
      components.push(f);
    } else {
      other.push(f);
    }
  }
  return { apiRoutes, repositories, components, other };
}

function scoreDiff(
  diff: string,
  _classified: ReturnType<typeof classifyFiles>,
): Map<string, { score: number; deductions: string[] }> {
  const results = new Map<string, { score: number; deductions: string[] }>();

  // Correctness checks
  const correctnessDeductions: string[] = [];
  let correctnessScore = 90;

  // Check for missing error handling
  const catchPattern = /\+.*catch\s*\(/g;
  const throwPattern = /\+.*throw\s/g;
  const asyncPattern = /\+.*async\s/g;
  const awaitPattern = /\+.*await\s/g;

  const asyncCount = (diff.match(asyncPattern) || []).length;
  const catchCount = (diff.match(catchPattern) || []).length;
  const throwCount = (diff.match(throwPattern) || []).length;
  const awaitCount = (diff.match(awaitPattern) || []).length;

  if (asyncCount > 0 && catchCount === 0 && throwCount === 0) {
    correctnessScore -= 10;
    correctnessDeductions.push(
      "Async functions added without visible error handling (try/catch or throw)",
    );
  }

  if (awaitCount > asyncCount * 2 && catchCount < awaitCount / 3) {
    correctnessScore -= 5;
    correctnessDeductions.push(
      "Multiple await expressions with limited error handling coverage",
    );
  }

  results.set("correctness", {
    score: Math.max(0, correctnessScore),
    deductions: correctnessDeductions,
  });

  // Security checks
  const securityDeductions: string[] = [];
  let securityScore = 95;

  // Hard-coded secrets patterns
  const secretPatterns = [
    /\+.*(?:password|secret|token|api[_-]?key)\s*[:=]\s*["'][^"']{8,}/gi,
    /\+.*(?:AKIA|AGPA|AIDA|AROA|AIPA)[A-Z0-9]{16}/g,
  ];
  for (const pat of secretPatterns) {
    if (pat.test(diff)) {
      securityScore -= 25;
      securityDeductions.push("Potential hard-coded secret detected in diff");
      break;
    }
  }

  // Raw SQL string concatenation
  if (/\+.*\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE|WHERE)/i.test(diff)) {
    securityScore -= 15;
    securityDeductions.push(
      "Possible SQL injection: template literal used in SQL query",
    );
  }

  // dangerouslySetInnerHTML
  if (/\+.*dangerouslySetInnerHTML/i.test(diff)) {
    securityScore -= 10;
    securityDeductions.push(
      "dangerouslySetInnerHTML used – ensure input is sanitized",
    );
  }

  results.set("security", {
    score: Math.max(0, securityScore),
    deductions: securityDeductions,
  });

  // Performance checks
  const performanceDeductions: string[] = [];
  let performanceScore = 90;

  // N+1 pattern: loop with await inside
  if (/\+.*for\s*\([\s\S]{0,100}await\s/m.test(diff)) {
    performanceScore -= 10;
    performanceDeductions.push(
      "Await inside a loop detected – potential N+1 pattern",
    );
  }

  results.set("performance", {
    score: Math.max(0, performanceScore),
    deductions: performanceDeductions,
  });

  // Maintainability
  const maintainabilityDeductions: string[] = [];
  let maintainabilityScore = 85;

  const addedLines = diff.split("\n").filter((l) => l.startsWith("+")).length;
  if (addedLines > 500) {
    maintainabilityScore -= 10;
    maintainabilityDeductions.push(
      `Large diff (${addedLines} added lines) – consider splitting`,
    );
  }

  results.set("maintainability", {
    score: Math.max(0, maintainabilityScore),
    deductions: maintainabilityDeductions,
  });

  return results;
}

function scoreTestResults(
  toolResults: TestToolResult[],
): { score: number; deductions: string[] } {
  const deductions: string[] = [];
  let score = 85;

  const totalGenerated = toolResults.reduce(
    (s, t) => s + t.testsGenerated,
    0,
  );
  const totalFailed = toolResults.reduce((s, t) => s + t.testsFailed, 0);

  if (totalGenerated === 0) {
    score -= 30;
    deductions.push("No tests were generated by any tool");
  }

  if (totalFailed > 0) {
    const failRate = totalFailed / Math.max(totalGenerated, 1);
    if (failRate > 0.2) {
      score -= 20;
      deductions.push(
        `High test failure rate: ${(failRate * 100).toFixed(1)}%`,
      );
    } else {
      score -= 5;
      deductions.push(`${totalFailed} generated test(s) failing`);
    }
  }

  return { score: Math.max(0, score), deductions };
}

function scoreLintResults(lint: LintResult): {
  score: number;
  deductions: string[];
} {
  const deductions: string[] = [];
  let score = 95;

  if (lint.errors > 0) {
    score -= Math.min(30, lint.errors * 5);
    deductions.push(`${lint.errors} lint error(s) in changed files`);
  }
  if (lint.warnings > 5) {
    score -= Math.min(10, lint.warnings);
    deductions.push(`${lint.warnings} lint warning(s) in changed files`);
  }

  return { score: Math.max(0, score), deductions };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  // Read inputs
  const changedFilesRaw = env("CHANGED_FILES", "");
  const changedFiles = changedFilesRaw
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);

  const diffPath = env("DIFF_FILE", "pr.diff");
  const diff = existsSync(diffPath) ? readFileSync(diffPath, "utf-8") : "";

  const rubricPath = env("RUBRIC_FILE", ".github/quality-rubric.yml");
  const resolvedRubricPath = resolve(REPO_ROOT, rubricPath);
  if (!resolvedRubricPath.startsWith(REPO_ROOT)) {
    throw new Error(`Rubric file path escapes repository root: ${rubricPath}`);
  }
  const rubricContent = readFileSync(resolvedRubricPath, "utf-8");
  const rubric = parseYamlSimple(rubricContent);

  const thresholdOverride = process.env["SCORE_THRESHOLD"];
  const threshold = thresholdOverride
    ? Math.max(0, Math.min(100, parseInt(thresholdOverride, 10) || 70))
    : rubric.threshold;

  // Test results
  const testResultsDir = env("TEST_RESULTS_DIR", "__generated_tests__");
  const toolResults: TestToolResult[] = [];
  for (const tool of ["copilot", "claudecode"]) {
    const manifestPath = resolve(testResultsDir, tool, "manifest.json");
    const manifest = readJsonSafe<{
      tests?: { testCount?: number }[];
    }>(manifestPath, { tests: [] });
    const testCount = (manifest.tests || []).reduce(
      (s, t) => s + (t.testCount || 0),
      0,
    );

    const resultPath = resolve(testResultsDir, tool, "test-results.json");
    const results = readJsonSafe<{
      passed?: number;
      failed?: number;
    }>(resultPath, {});

    toolResults.push({
      tool,
      testsGenerated: testCount,
      testsPassed: results.passed ?? testCount,
      testsFailed: results.failed ?? 0,
      coverageDelta: null,
    });
  }

  // Lint results
  const lintPath = env("LINT_OUTPUT", "lint-results.json");
  const lintResult = readJsonSafe<LintResult>(lintPath, {
    errors: 0,
    warnings: 0,
    files: [],
  });

  // Classify changed files
  const classified = classifyFiles(changedFiles);

  // Score each category
  const diffScores = scoreDiff(diff, classified);
  const testScore = scoreTestResults(toolResults);
  const lintScore = scoreLintResults(lintResult);

  const categoryResults: CategoryResult[] = rubric.categories.map((cat) => {
    let score: number;
    let deductions: string[] = [];

    switch (cat.key) {
      case "correctness": {
        const ds = diffScores.get("correctness") || {
          score: 85,
          deductions: [],
        };
        score = ds.score;
        deductions = ds.deductions;
        break;
      }
      case "test_adequacy": {
        score = testScore.score;
        deductions = testScore.deductions;
        break;
      }
      case "maintainability": {
        const ds = diffScores.get("maintainability") || {
          score: 85,
          deductions: [],
        };
        // Incorporate lint results
        score = Math.round((ds.score + lintScore.score) / 2);
        deductions = [...ds.deductions, ...lintScore.deductions];
        break;
      }
      case "security": {
        const ds = diffScores.get("security") || {
          score: 90,
          deductions: [],
        };
        score = ds.score;
        deductions = ds.deductions;
        break;
      }
      case "performance": {
        const ds = diffScores.get("performance") || {
          score: 90,
          deductions: [],
        };
        score = ds.score;
        deductions = ds.deductions;
        break;
      }
      case "contract": {
        // Check if swagger was updated when routes changed
        score = 85;
        if (
          classified.apiRoutes.length > 0 &&
          !changedFiles.some((f) => f.includes("swagger"))
        ) {
          score -= 10;
          deductions.push(
            "API routes changed but Swagger spec may not be updated",
          );
        }
        break;
      }
      case "documentation": {
        score = 80; // Neutral if no doc signal
        const hasDocChanges = changedFiles.some(
          (f) => f.endsWith(".md") || f.includes("docs/"),
        );
        if (classified.apiRoutes.length > 0 && !hasDocChanges) {
          score -= 5;
          deductions.push(
            "API changes without corresponding documentation updates",
          );
        }
        break;
      }
      default:
        score = 80;
    }

    const weightedScore = Math.round((score * cat.weight) / 100 * 10) / 10;

    return {
      key: cat.key,
      name: cat.name,
      weight: cat.weight,
      score,
      weightedScore,
      rationale:
        deductions.length === 0
          ? `No issues detected for ${cat.name}`
          : deductions.join("; "),
      deductions,
    };
  });

  const totalScore = Math.round(
    categoryResults.reduce((s, c) => s + c.weightedScore, 0) * 10,
  ) / 10;

  const passFail = totalScore >= threshold ? "pass" : "fail";
  const requiredHumanReview = totalScore < threshold;

  const report: QualityReport = {
    totalScore,
    threshold,
    passFail,
    requiredHumanReview,
    generatedAt: new Date().toISOString(),
    categoryScores: categoryResults,
    summary:
      passFail === "pass"
        ? `Quality gate passed (${totalScore}/${threshold}).`
        : `Quality gate failed (${totalScore}/${threshold}). Human review required.`,
  };

  // Write JSON report
  writeFileSync("quality-score.json", JSON.stringify(report, null, 2));
  console.log(`Quality score: ${totalScore} (threshold: ${threshold}) → ${passFail}`);

  // Write summary markdown
  const statusIcon = passFail === "pass" ? "✅" : "❌";
  const statusText = passFail === "pass" ? "PASSED" : "FAILED";

  let md = `## 🤖 AI Quality Gate Report\n\n`;
  md += `**Status:** ${statusIcon} ${statusText} (score: ${totalScore}/100, threshold: ${threshold})\n\n`;

  if (requiredHumanReview) {
    md += `> ⚠️ **Human review required** — score is below the threshold.\n\n`;
  }

  // Test generation summary
  md += `### Test Generation Summary\n\n`;
  md += `| Tool | Tests Generated | Tests Passed | Tests Failed | Coverage Δ |\n`;
  md += `|------|----------------|--------------|--------------|------------|\n`;
  for (const tr of toolResults) {
    const covStr =
      tr.coverageDelta !== null ? `${tr.coverageDelta > 0 ? "+" : ""}${tr.coverageDelta}%` : "N/A";
    md += `| ${tr.tool} | ${tr.testsGenerated} | ${tr.testsPassed} | ${tr.testsFailed} | ${covStr} |\n`;
  }

  // Quality scores table
  md += `\n### Quality Scores\n\n`;
  md += `| Category | Score | Weight | Weighted |\n`;
  md += `|----------|-------|--------|----------|\n`;
  for (const cs of categoryResults) {
    md += `| ${cs.name} | ${cs.score} | ${cs.weight}% | ${cs.weightedScore} |\n`;
  }
  md += `| **Total** | | | **${totalScore}** |\n`;

  // Detailed findings
  const allDeductions = categoryResults.flatMap((c) =>
    c.deductions.map((d) => `- **${c.name}:** ${d}`),
  );
  if (allDeductions.length > 0) {
    md += `\n<details>\n<summary>📋 Detailed Findings</summary>\n\n`;
    md += allDeductions.join("\n") + "\n";
    md += `\n</details>\n`;
  }

  // Changed files classification
  md += `\n<details>\n<summary>📁 Changed Files Classification</summary>\n\n`;
  md += `- **API Routes:** ${classified.apiRoutes.length} files\n`;
  md += `- **Repositories:** ${classified.repositories.length} files\n`;
  md += `- **React Components:** ${classified.components.length} files\n`;
  md += `- **Other:** ${classified.other.length} files\n`;
  md += `\n</details>\n`;

  writeFileSync("quality-summary.md", md);
  console.log("Wrote quality-score.json and quality-summary.md");

  // Exit with appropriate code for CI
  if (passFail === "fail") {
    process.exitCode = 1;
  }
}

main();
