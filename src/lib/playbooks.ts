// The Heirloom playbook catalog.
//
// A playbook is a class of inherited codebase with a tuned agent loop: what a
// boot failure looks like, which fixes are on the table, when to stop
// honestly. Four shapes run end-to-end today; the rest are on the roadmap and
// surface as waitlist actions in the composer.

export type Playbook = {
  key: string;
  name: string;
  category: "Web app" | "API service" | "Static frontend" | "Hostile tree";
  shape: string; // matches a scenario key for playable entries, else ""
  icon: string; // lucide icon name for the catalog UI
  status: "playable" | "waitlist";
  summary: string;
  highlights: string[];
  tags: string[];
  risk: "Low" | "Moderate" | "High";
};

export const PLAYBOOKS: Playbook[] = [
  {
    key: "mern",
    name: "Inherited MERN application",
    category: "Web app",
    shape: "mern",
    icon: "layers",
    status: "playable",
    summary:
      "Mongo, Express, React and Node with a lockfile that no longer matches the manifest. Heirloom traces the environment variables, provisions a Mongo container, authors the missing test suite and hands over a running stack.",
    highlights: [
      "11 environment variables reconstructed, 4 flagged for the operator",
      "23 tests generated where none existed, with a real timezone bug caught",
      "Multi-stage image at 187 MB, running non-root",
    ],
    tags: ["MongoDB", "Express", "React", "Node 20", "Docker", "JWT"],
    risk: "Moderate",
  },
  {
    key: "express",
    name: "Orphaned Express API",
    category: "API service",
    shape: "express",
    icon: "server",
    status: "playable",
    summary:
      "A single-service Node API with two competing entry points and a private dependency nobody can fetch. Heirloom picks the live entry point, stubs the private package, and puts a schema clamp on the input validation hole.",
    highlights: [
      "Dead entry point excluded after zero-import verification",
      "Private @atlas/ui-kit stubbed so builds run without registry tokens",
      "Negative-weight acceptance bug found by a generated test and fixed",
    ],
    tags: ["Express", "REST", "pm2", "Supertest", "Security"],
    risk: "Low",
  },
  {
    key: "vite",
    name: "Stale Vite SPA",
    category: "Static frontend",
    shape: "vite",
    icon: "rocket",
    status: "playable",
    summary:
      "A frontend pinned to Vite 2 and Node 14, deploying to an S3 bucket that was deleted months ago. Heirloom performs the upgrade to Vite 5, rebuilds the pipeline and verifies every hashed asset it serves.",
    highlights: [
      "Vite 2 → 5 upgrade executed in-sandbox with a clean lockfile regen",
      "Deleted deploy target flagged as unverified rather than guessed at",
      "All five hashed assets probed for MIME type and integrity",
    ],
    tags: ["Vite", "React 17", "Static hosting", "CI/CD", "Upgrades"],
    risk: "Moderate",
  },
  {
    key: "chaos",
    name: "Broken chaos repository",
    category: "Hostile tree",
    shape: "chaos",
    icon: "bomb",
    status: "playable",
    summary:
      "A deliberately hostile tree: missing session module, two manifest files disagreeing on the entry point, and an undeclared PORT dependency. Heirloom stops after four fix cycles and ships the risk register instead of a guess.",
    highlights: [
      "Missing module confirmed unrecoverable from any git branch",
      "Failed reconstruction kept on the record as contradicted evidence",
      "Honest-stop summary with a next-action list for a human engineer",
    ],
    tags: ["Fastify", "TypeScript", "Forensics", "Honest stop"],
    risk: "High",
  },
  {
    key: "monorepo",
    name: "Undocumented monorepo",
    category: "Web app",
    shape: "",
    icon: "network",
    status: "waitlist",
    summary:
      "Six workspaces, three package managers and a Turborepo pipeline nobody remembers configuring. The planned loop maps workspace dependencies, bootstraps the right package manager and verifies the shared build graph.",
    highlights: [
      "Planned: workspace dependency graph drawn from lockfile forensics",
      "Planned: task pipeline reconstruction with cached build verification",
    ],
    tags: ["Turborepo", "pnpm", "Workspaces", "Monorepo"],
    risk: "High",
  },
  {
    key: "nextjs",
    name: "Abandoned Next.js app",
    category: "Web app",
    shape: "",
    icon: "triangle",
    status: "waitlist",
    summary:
      "Pages router mixed with app router, middleware that silently swallows errors, and a vercel.json pointing at a deleted project. The planned loop separates the routers, pins the runtime and verifies both render paths.",
    highlights: [
      "Planned: hybrid router separation with per-route render verification",
      "Planned: environment parity report between preview and production",
    ],
    tags: ["Next.js", "SSR", "Vercel", "React Server Components"],
    risk: "Moderate",
  },
  {
    key: "django",
    name: "Django service with drift",
    category: "API service",
    shape: "",
    icon: "database",
    status: "waitlist",
    summary:
      "A Python 3.8 service running Django 3.2 LTS past its EOL date, with migrations that were edited by hand. The planned loop builds the dependency tree, replays migrations against a fresh database and reports the drift.",
    highlights: [
      "Planned: migration replay with drift diffing against a clean database",
      "Planned: Python and Django upgrade path with compatibility gates",
    ],
    tags: ["Django", "Python", "PostgreSQL", "Migrations"],
    risk: "High",
  },
  {
    key: "cli",
    name: "CLI tool with no tests",
    category: "Static frontend",
    shape: "",
    icon: "terminal",
    status: "waitlist",
    summary:
      "A Go binary with a hand-rolled release process and zero tests. The planned loop exercises the command surface, generates golden-file tests and verifies the release pipeline end to end.",
    highlights: [
      "Planned: command-surface mapping from flag parsing to output",
      "Planned: golden-file test generation against captured real outputs",
    ],
    tags: ["Go", "CLI", "Release engineering", "Golden files"],
    risk: "Low",
  },
];

export function findPlaybookByShape(shape: string): Playbook | undefined {
  return PLAYBOOKS.find((p) => p.shape === shape);
}

export const PLAYBOOK_CATEGORIES = [
  "Web app",
  "API service",
  "Static frontend",
  "Hostile tree",
] as const;
