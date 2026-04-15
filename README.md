# AI Quality Gate

Automated unit test generation and code quality scoring for pull requests, powered by **Copilot Coding Agent** and **Claude Code**.

## Overview

This project implements a CI/CD quality gate that:

1. **Generates unit tests** for changed files using two AI tools in parallel (Copilot and Claude Code)
2. **Scores code quality** against a weighted rubric with 7 categories
3. **Auto-approves or flags** PRs based on the quality score threshold
4. **Posts a summary comment** on the PR with test results and scores

### What Gets Tested

| Category | Tool Stack |
|---|---|
| Server actions / API routes | Vitest + Supertest |
| Standalone services | Vitest |
| React components | Vitest + React Testing Library |

---

## Project Structure

```
ai-quality-gate/
├── api/                          # Express API (TypeScript)
│   └── src/routes/hello.ts       # Sample API route with tests
├── frontend/                     # React frontend (TypeScript)
│   └── src/components/           # Greeting, UserCard components with tests
├── .github/
│   ├── agents/                   # AI agent definitions
│   │   ├── test-generator-copilot.agent.md
│   │   ├── test-generator-claudecode.agent.md
│   │   ├── quality-scorer.agent.md
│   │   └── pr-commenter.agent.md
│   ├── quality-rubric.yml         # 7-category scoring rubric
│   ├── scripts/
│   │   └── quality_score.ts      # Scoring engine
│   └── workflows/
│       └── ai-unit-tests-and-quality.yml
└── package.json                  # Monorepo workspace root
```

---

## Prerequisites

- **Node.js 24+** and npm
- A GitHub repository with **GitHub Actions** enabled
- **Repository secrets** configured (see [Setup](#setup))

---

## Setup

### 1. Install dependencies

```bash
npm install          # installs root workspace
cd api && npm install
cd ../frontend && npm install
```

### 2. Configure repository secrets

In your GitHub repo, go to **Settings → Secrets and variables → Actions** and add:

| Secret | Purpose |
|---|---|
| `GITHUB_TOKEN` | Provided automatically by GitHub Actions |
| `ANTHROPIC_API_KEY` | Required for Claude Code test generation |

### 3. Enable Copilot Coding Agent

Ensure **GitHub Copilot** is enabled for your repository. The workflow uses `github/copilot-coding-agent@v1` to invoke the Copilot agent in CI.

---

## Running Tests Locally

### API tests

```bash
cd api
npx vitest run              # run all tests
npx vitest run --coverage   # run with coverage report
```

### Frontend tests

```bash
cd frontend
npx vitest run              # run all tests
npx vitest run --coverage   # run with coverage report
```

---

## Running the Workflow

### Automatic (on pull request)

The workflow triggers automatically when a PR is **opened** or **updated** (`synchronize`). It will:

1. Detect which files changed and classify them (API routes, services, React components)
2. Run **Copilot** and **Claude Code** agents in parallel to generate tests
3. Execute all tests (existing + generated) and collect coverage
4. Compute comparative metrics between the two tools
5. Score the PR against the quality rubric
6. Post a summary comment on the PR
7. Set a `ai/quality-gate` commit status (pass/fail)

### Manual (workflow_dispatch)

Go to **Actions → AI Quality Gate → Run workflow** and configure:

| Input | Default | Description |
|---|---|---|
| `score_threshold` | `70` | Minimum quality score to pass (0–100) |
| `skip_copilot` | `false` | Skip Copilot test generation |
| `skip_claudecode` | `false` | Skip Claude Code test generation |

---

## Quality Scoring Rubric

The scoring engine evaluates PRs across 7 weighted categories (defined in [quality-rubric.yml](quality-rubric.yml)):

| Category | Weight | Key Signals |
|---|---|---|
| Correctness & Safety Checks | 20% | Error handling, null checks, proper HTTP status codes |
| Test Adequacy & Edge Cases | 20% | Happy + error paths, boundary values, mocked I/O |
| Maintainability & Readability | 15% | Functions < 150 LOC, no duplication, consistent naming |
| Security & Secrets Hygiene | 15% | No hardcoded secrets, parameterized SQL, input sanitization |
| Performance Considerations | 10% | No N+1 queries, pagination limits, efficient data structures |
| API/UX Contract Adherence | 10% | Swagger annotations, consistent response shapes |
| Documentation & Comments | 10% | Complex logic explained, JSDoc for public APIs |

### Pass/Fail Logic

| Score | Result |
|---|---|
| **≥ 70** | ✅ PASS — auto-approve |
| **< 70** | ❌ FAIL — human review required |
| **< 50** | 🚨 URGENT — immediate attention needed |

The threshold is configurable via the `score_threshold` workflow input or the `threshold` field in `quality-rubric.yml`.

---

## Workflow Jobs

The CI pipeline runs 7 jobs:

```
detect-changes ──┬── generate-tests-copilot ──┬── run-tests ── compute-metrics ── quality-scoring ── pr-comment
                 └── generate-tests-claudecode ─┘                                                  └── quality-gate
```

| Job | Purpose |
|---|---|
| **detect-changes** | Classifies changed files as API routes, services, or components |
| **generate-tests-copilot** | Invokes Copilot Coding Agent to generate tests |
| **generate-tests-claudecode** | Invokes Claude Code to generate tests |
| **run-tests** | Runs all tests (existing + generated) with Vitest |
| **compute-metrics** | Aggregates test counts, pass rates, and coverage deltas |
| **quality-scoring** | Runs ESLint + quality rubric scoring engine |
| **pr-comment** | Posts/updates the quality gate summary on the PR |
| **quality-gate** | Sets the `ai/quality-gate` commit status |

---

## Comparing Copilot vs Claude Code

Both agents generate tests into separate directories:

- `__generated_tests__/copilot/` — tests from Copilot Coding Agent
- `__generated_tests__/claudecode/` — tests from Claude Code

The `compute-metrics` job produces a comparison including:
- Number of tests generated by each tool
- Pass/fail rates
- Coverage delta contribution

This data appears in the PR comment under **Test Generation Summary**.

---

## Customization

### Adjust the rubric

Edit [quality-rubric.yml](quality-rubric.yml) to change category weights, signals, or the pass/fail threshold.

### Modify agent behavior

Edit the agent definition files in `.github/agents/` to change test generation patterns, coding conventions, or output formats.

### Add new file categories

Update the `classify` step in the workflow to recognize additional file patterns (e.g., `middleware/`, `hooks/`).
