/**
 * Browser-safe GitHub pull request types and pure helpers.
 *
 * Split out from pr-provider.ts so the review UI can import types and URL
 * parsing without dragging GitHub's server implementation through the browser
 * bundle.
 */

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface PRRuntime {
  runCommand: (cmd: string, args: string[]) => Promise<CommandResult>;
  runCommandWithInput?: (cmd: string, args: string[], input: string) => Promise<CommandResult>;
}

/** A GitHub pull request parsed from a URL. */
export interface PRRef {
  host: string;
  owner: string;
  repo: string;
  number: number;
}

/** GitHub pull request metadata. */
export interface PRMetadata extends PRRef {
  /** GraphQL node ID used for mark-file-as-viewed mutations. */
  prNodeId?: string;
  title: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  /** Repository default branch, used to infer stacked pull requests. */
  defaultBranch?: string;
  baseSha: string;
  headSha: string;
  /** Common ancestor used to compute the pull request diff. */
  mergeBaseSha?: string;
  url: string;
}

export interface PRComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  url: string;
}

export interface PRReview {
  id: string;
  author: string;
  state: string;
  body: string;
  submittedAt: string;
  url?: string;
}

export interface PRCheck {
  name: string;
  status: string;
  conclusion: string | null;
  workflowName: string;
  detailsUrl: string;
}

export interface PRLinkedIssue {
  number: number;
  url: string;
  repo: string;
}

export interface PRThreadComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  url: string;
  diffHunk?: string;
}

export interface PRReviewThread {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number | null;
  startLine: number | null;
  diffSide: "LEFT" | "RIGHT" | null;
  comments: PRThreadComment[];
}

export interface PRContext {
  body: string;
  state: string;
  isDraft: boolean;
  labels: Array<{ name: string; color: string }>;
  reviewDecision: string;
  mergeable: string;
  mergeStateStatus: string;
  comments: PRComment[];
  reviews: PRReview[];
  reviewThreads: PRReviewThread[];
  checks: PRCheck[];
  linkedIssues: PRLinkedIssue[];
}

export interface PRReviewFileComment {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  body: string;
  start_line?: number;
  start_side?: "LEFT" | "RIGHT";
}

export type PRDiffScope = "layer" | "full-stack";

export interface PRDiffScopeOption {
  id: PRDiffScope;
  label: string;
  description: string;
  enabled: boolean;
}

export interface PRStackInfo {
  isStacked: boolean;
  baseBranch: string;
  defaultBranch?: string;
  label: string;
  source: "branch-inferred" | "tree-discovered" | "github-native" | "graphite" | "ghstack";
}

export interface PRStackNode {
  branch: string;
  number?: number;
  title?: string;
  url?: string;
  isCurrent: boolean;
  isDefaultBranch: boolean;
  state?: "open" | "merged" | "closed";
}

export interface PRStackTree {
  nodes: PRStackNode[];
}

export interface PRListItem {
  id: string;
  number: number;
  title: string;
  author: string;
  url: string;
  baseBranch: string;
  state: "open" | "closed" | "merged";
}

/** Format a repository name for display. */
export function getDisplayRepo(metadata: PRRef | PRMetadata): string {
  return `${metadata.owner}/${metadata.repo}`;
}

/** Reconstruct a pull request reference from metadata. */
export function prRefFromMetadata(metadata: PRMetadata): PRRef {
  return {
    host: metadata.host,
    owner: metadata.owner,
    repo: metadata.repo,
    number: metadata.number,
  };
}

/** Return whether two pull request references belong to the same repository. */
export function isSameProject(a: PRRef, b: PRRef): boolean {
  return a.host === b.host && a.owner === b.owner && a.repo === b.repo;
}

/** Encode a file path for use in GitHub API URLs. */
export function encodeApiFilePath(filePath: string): string {
  return encodeURIComponent(filePath);
}

/**
 * Parse a GitHub pull request URL, including GitHub Enterprise hosts.
 *
 * Handles `https://github.com/owner/repo/pull/123` and arbitrary GitHub
 * Enterprise hosts using the same path format.
 */
export function parsePRUrl(url: string): PRRef | null {
  if (!url) return null;

  const match = url.match(/^https?:\/\/([^/]+)\/([^/]+)\/([^/]+)\/pull\/(\d+)/);

  if (!match) return null;

  return {
    host: match[1],
    owner: match[2],
    repo: match[3],
    number: parseInt(match[4], 10),
  };
}
