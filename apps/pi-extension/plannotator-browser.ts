import { existsSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createWorktreePool, type WorktreePool } from "./generated/worktree-pool.js";
import {
  getFileContentsForDiff,
  getGitDiffFingerprint,
  gitAddFile,
  gitResetFile,
} from "./generated/review-core.js";
import { fileURLToPath } from "node:url";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { reviewRuntime, startAnnotateServer, startReviewServer, type DiffType } from "./server.js";
import { getGitContext, isGitRepository, runGitDiff } from "./server/git.js";
import { openBrowser, isRemoteSession } from "./server/network.js";
import { parsePRUrl, checkPRAuth, fetchPR } from "./server/pr.js";
import { getDisplayRepo } from "./generated/pr-provider.js";
import { parseRemoteUrl } from "./generated/repo.js";
import { fetchRef, createWorktree, ensureObjectAvailable } from "./generated/worktree.js";
import { loadConfig, resolveDefaultDiffType, resolveSharingEnabled } from "./generated/config.js";
import { WorkspaceReviewSession, type WorkspaceDiffType } from "./generated/review-workspace.js";

export { getLastAssistantMessageText } from "./assistant-message.js";

export type AnnotateMode = "annotate" | "annotate-folder" | "annotate-last";

export interface BrowserDecisionSession<T> {
  url: string;
  waitForDecision: () => Promise<T>;
  stop: () => void;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

let annotationHtmlContent = "";

let reviewHtmlContent = "";

try {
  annotationHtmlContent = readFileSync(resolve(__dirname, "plannotator.html"), "utf-8");
} catch {
  // built assets unavailable
}

try {
  reviewHtmlContent = readFileSync(resolve(__dirname, "review-editor.html"), "utf-8");
} catch {
  // built assets unavailable
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

export function hasAnnotationBrowserHtml(): boolean {
  return Boolean(annotationHtmlContent);
}

export function hasReviewBrowserHtml(): boolean {
  return Boolean(reviewHtmlContent);
}

export function getStartupErrorMessage(err: Error): string {
  return err.message;
}

async function openBrowserForServer(serverUrl: string, ctx: ExtensionContext): Promise<void> {
  const browserResult = await openBrowser(serverUrl);

  if (isRemoteSession()) {
    ctx.ui.notify(`[Plannotator] ${serverUrl}`, "info");
  } else if (!browserResult.opened) {
    ctx.ui.notify(`Open this URL to review: ${serverUrl}`, "info");
  }
}

async function buildLocalWorkspaceReview(
  root: string,
  options: {
    requestedDiffType?: DiffType | WorkspaceDiffType;
    configuredDiffType?: DiffType;
    hideWhitespace?: boolean;
  } = {},
): Promise<WorkspaceReviewSession> {
  return WorkspaceReviewSession.create(
    {
      getGitContext,
      runGitDiff,
      getFileContentsForDiff: (diffType, defaultBranch, filePath, oldPath, cwd) =>
        getFileContentsForDiff(reviewRuntime, diffType, defaultBranch, filePath, oldPath, cwd),
      getGitDiffFingerprint: (diffType, defaultBranch, cwd, options) =>
        getGitDiffFingerprint(reviewRuntime, diffType, defaultBranch, cwd, options),
      gitAddFile: (filePath, cwd) => gitAddFile(reviewRuntime, filePath, cwd),
      gitResetFile: (filePath, cwd) => gitResetFile(reviewRuntime, filePath, cwd),
    },
    root,
    options,
  );
}

function startBrowserDecisionSession<T>(
  server: { url: string; stop: () => void },
  ctx: ExtensionContext,
  waitForResult: () => Promise<T>,
): BrowserDecisionSession<T> {
  openBrowserForServer(server.url, ctx);
  let stopped = false;
  let stopReject: ((err: Error) => void) | undefined;
  let decisionPromise: Promise<T> | undefined;
  const createStoppedError = () => new Error("Plannotator browser session was stopped.");

  const stop = () => {
    if (stopped) return;
    stopped = true;
    server.stop();
    stopReject?.(createStoppedError());
    stopReject = undefined;
  };

  async function waitForResultOrStop(): Promise<T> {
    const stoppedPromise = new Promise<never>((_, reject) => {
      stopReject = reject;
    });

    try {
      const result = await Promise.race([waitForResult(), stoppedPromise]);
      stopReject = undefined;
      await delay(1500);

      return result;
    } finally {
      stop();
    }
  }

  return {
    url: server.url,
    waitForDecision: () => {
      if (decisionPromise) return decisionPromise;

      if (stopped) return Promise.reject(createStoppedError());
      decisionPromise = waitForResultOrStop();

      return decisionPromise;
    },
    stop,
  };
}

type PrMetadata = NonNullable<Awaited<ReturnType<typeof fetchPR>>["metadata"]>;

interface PreparedReview {
  rawPatch: string;
  gitRef: string;
  diffError?: string;
  diffType?: DiffType | WorkspaceDiffType;
  gitContext?: Awaited<ReturnType<typeof getGitContext>>;
  initialBase?: string;
  prMetadata?: PrMetadata;
  prPatchIncomplete?: boolean;
  workspace?: WorkspaceReviewSession;
  agentCwd?: string;
  worktreePool?: WorktreePool;
  onCleanup?: () => void | Promise<void>;
}

interface LocalPrCheckout {
  agentCwd: string;
  worktreePool: WorktreePool;
  onCleanup: () => void | Promise<void>;
}

interface PrCheckoutPaths {
  sessionDir: string;
  localPath: string;
}

function removeSessionDirectory(sessionDir: string): void {
  try {
    rmSync(sessionDir, { recursive: true, force: true });
  } catch {}
}

function getHttpsRemoteHost(remoteUrl: string): string | null {
  try {
    return new URL(remoteUrl).hostname;
  } catch {
    return null;
  }
}

function getRemoteHost(remoteUrl: string): string {
  const sshHost = remoteUrl.match(/^[^@]+@([^:]+):/)?.[1];

  return (sshHost || getHttpsRemoteHost(remoteUrl) || "").toLowerCase();
}

async function isSameRepositoryPrCheckout(
  repoDir: string,
  prMetadata: PrMetadata,
): Promise<boolean> {
  try {
    const remoteResult = await reviewRuntime.runGit(["remote", "get-url", "origin"], {
      cwd: repoDir,
    });

    if (remoteResult.exitCode !== 0) return false;
    const remoteUrl = remoteResult.stdout.trim();
    const currentRepo = parseRemoteUrl(remoteUrl);
    const prRepo = `${prMetadata.owner}/${prMetadata.repo}`;

    return (
      currentRepo?.toLowerCase() === prRepo.toLowerCase() &&
      getRemoteHost(remoteUrl) === prMetadata.host.toLowerCase()
    );
  } catch {
    return false;
  }
}

function validatePrCheckoutMetadata(prMetadata: PrMetadata): void {
  if (prMetadata.baseBranch.includes("..") || prMetadata.baseBranch.startsWith("-")) {
    throw new Error(`Invalid base branch: ${prMetadata.baseBranch}`);
  }

  if (!/^[0-9a-f]{40,64}$/i.test(prMetadata.baseSha)) {
    throw new Error(`Invalid base SHA: ${prMetadata.baseSha}`);
  }
}

function createPrCheckoutPaths(prMetadata: PrMetadata): PrCheckoutPaths {
  const identifier = `${prMetadata.owner}-${prMetadata.repo}-${prMetadata.number}`;
  const suffix = Math.random().toString(36).slice(2, 8);
  const sessionDir = join(realpathSync(tmpdir()), `plannotator-pr-${identifier}-${suffix}`);

  return {
    sessionDir,
    localPath: join(sessionDir, "pool", `pr-${prMetadata.number}`),
  };
}

async function createSameRepositoryCheckout(
  repoDir: string,
  localPath: string,
  prMetadata: PrMetadata,
  fetchRefStr: string,
): Promise<void> {
  console.error("Fetching PR branch and creating local worktree...");
  await fetchRef(reviewRuntime, prMetadata.baseBranch, { cwd: repoDir });
  await ensureObjectAvailable(reviewRuntime, prMetadata.baseSha, { cwd: repoDir });
  await fetchRef(reviewRuntime, fetchRefStr, { cwd: repoDir });
  await createWorktree(reviewRuntime, {
    ref: "FETCH_HEAD",
    path: localPath,
    detach: true,
    cwd: repoDir,
  });
}

async function createCrossRepositoryCheckout(
  localPath: string,
  prMetadata: PrMetadata,
  fetchRefStr: string,
): Promise<void> {
  const prRepo = `${prMetadata.owner}/${prMetadata.repo}`;

  if (prRepo.startsWith("-")) throw new Error(`Invalid repository identifier: ${prRepo}`);
  const cli = "gh";

  const cloneEnv =
    prMetadata.host === "github.com"
      ? undefined
      : {
          ...process.env,
          GH_HOST: prMetadata.host,
        };

  console.error(`Cloning ${prRepo} (shallow)...`);

  const cloneResult = spawnSync(
    cli,
    ["repo", "clone", prRepo, localPath, "--", "--depth=1", "--no-checkout"],
    { encoding: "utf-8", env: cloneEnv },
  );

  if ((cloneResult.status ?? 1) !== 0) {
    throw new Error(`${cli} repo clone failed: ${(cloneResult.stderr ?? "").trim()}`);
  }

  console.error("Fetching PR branch...");

  const fetchResult = await reviewRuntime.runGit(["fetch", "--depth=200", "origin", fetchRefStr], {
    cwd: localPath,
  });

  if (fetchResult.exitCode !== 0) {
    throw new Error(`Failed to fetch PR head ref: ${fetchResult.stderr.trim()}`);
  }

  const checkoutResult = await reviewRuntime.runGit(["checkout", "FETCH_HEAD"], { cwd: localPath });

  if (checkoutResult.exitCode !== 0) {
    throw new Error(`git checkout FETCH_HEAD failed: ${checkoutResult.stderr.trim()}`);
  }

  const baseFetch = await reviewRuntime.runGit(
    ["fetch", "--depth=200", "origin", prMetadata.baseSha],
    { cwd: localPath },
  );

  if (baseFetch.exitCode !== 0) {
    console.error("Warning: failed to fetch baseSha, agent diffs may be inaccurate");
  }

  await reviewRuntime.runGit(["branch", "--", prMetadata.baseBranch, prMetadata.baseSha], {
    cwd: localPath,
  });
  await reviewRuntime.runGit(
    ["update-ref", `refs/remotes/origin/${prMetadata.baseBranch}`, prMetadata.baseSha],
    { cwd: localPath },
  );
}

function registerSameRepositoryCleanup(
  repoDir: string,
  sessionDir: string,
  worktreePool: WorktreePool,
): () => Promise<void> {
  const exitHandler = () => {
    try {
      for (const entry of worktreePool.entries()) {
        spawnSync("git", ["worktree", "remove", "--force", entry.path], { cwd: repoDir });
      }
    } catch {}

    removeSessionDirectory(sessionDir);
  };

  process.once("exit", exitHandler);

  return async () => {
    process.removeListener("exit", exitHandler);
    await worktreePool.cleanup(reviewRuntime);
    removeSessionDirectory(sessionDir);
  };
}

function registerCrossRepositoryCleanup(sessionDir: string): () => void {
  const exitHandler = () => {
    removeSessionDirectory(sessionDir);
  };

  process.once("exit", exitHandler);

  return () => {
    process.removeListener("exit", exitHandler);
    removeSessionDirectory(sessionDir);
  };
}

async function createLocalPrCheckout(
  repoDir: string,
  prMetadata: PrMetadata,
): Promise<LocalPrCheckout> {
  validatePrCheckoutMetadata(prMetadata);
  const { sessionDir, localPath } = createPrCheckoutPaths(prMetadata);

  try {
    const fetchRefStr = `refs/pull/${prMetadata.number}/head`;
    const isSameRepo = await isSameRepositoryPrCheckout(repoDir, prMetadata);

    if (isSameRepo) {
      await createSameRepositoryCheckout(repoDir, localPath, prMetadata, fetchRefStr);
    } else {
      await createCrossRepositoryCheckout(localPath, prMetadata, fetchRefStr);
    }

    const worktreePool = createWorktreePool(
      { sessionDir, repoDir, isSameRepo },
      { path: localPath, prUrl: prMetadata.url, number: prMetadata.number, ready: true },
    );

    return {
      agentCwd: localPath,
      worktreePool,
      onCleanup: isSameRepo
        ? registerSameRepositoryCleanup(repoDir, sessionDir, worktreePool)
        : registerCrossRepositoryCleanup(sessionDir),
    };
  } catch (err) {
    removeSessionDirectory(sessionDir);
    throw err;
  }
}

async function prepareOptionalPrCheckout(
  repoDir: string,
  prMetadata: PrMetadata,
): Promise<LocalPrCheckout | undefined> {
  try {
    const checkout = await createLocalPrCheckout(repoDir, prMetadata);
    console.error(`Local checkout ready at ${checkout.agentCwd}`);

    return checkout;
  } catch (err) {
    console.error("Warning: local worktree creation failed, falling back to remote diff");
    console.error(err instanceof Error ? err.message : String(err));

    return undefined;
  }
}

async function fetchPrReview(urlArg: string): Promise<{
  rawPatch: string;
  gitRef: string;
  prMetadata: PrMetadata;
  prPatchIncomplete: boolean;
}> {
  const prRef = parsePRUrl(urlArg);

  if (!prRef) {
    throw new Error(
      `Invalid PR URL: ${urlArg}\n` +
        "Supported formats:\n" +
        "  GitHub: https://github.com/owner/repo/pull/123",
    );
  }

  try {
    await checkPRAuth(prRef);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("not found") || message.includes("ENOENT")) {
      throw new Error("GitHub CLI (gh) is not installed. Install it from https://cli.github.com");
    }

    throw err;
  }

  console.error(`Fetching PR #${prRef.number} from ${getDisplayRepo(prRef)}...`);
  const pr = await fetchPR(prRef);

  return {
    rawPatch: pr.rawPatch,
    gitRef: `PR #${prRef.number}`,
    prMetadata: pr.metadata,
    prPatchIncomplete: pr.patchIncomplete ?? false,
  };
}

async function preparePrReview(
  urlArg: string,
  useLocal: boolean,
  repoDir: string,
): Promise<PreparedReview> {
  const review = await fetchPrReview(urlArg);

  const checkout = useLocal
    ? await prepareOptionalPrCheckout(repoDir, review.prMetadata)
    : undefined;

  return {
    ...review,
    agentCwd: checkout?.agentCwd,
    worktreePool: checkout?.worktreePool,
    onCleanup: checkout?.onCleanup,
  };
}

async function prepareLocalReview(
  cwd: string,
  requestedDiffType: DiffType | undefined,
  requestedBase: string | undefined,
): Promise<PreparedReview> {
  const config = loadConfig();

  if (await isGitRepository(cwd)) {
    const gitContext = await getGitContext(cwd);

    const diffType =
      requestedDiffType &&
      (requestedDiffType.startsWith("worktree:") ||
        gitContext.diffOptions.some((option) => option.id === requestedDiffType))
        ? requestedDiffType
        : resolveDefaultDiffType(config);

    const base = requestedBase ?? gitContext.defaultBranch;

    const result = await runGitDiff(diffType, base, gitContext.cwd ?? cwd, {
      hideWhitespace: config.diffOptions?.hideWhitespace ?? false,
    });

    return {
      rawPatch: result.patch,
      gitRef: result.label,
      diffError: "error" in result ? result.error : undefined,
      diffType,
      gitContext,
      initialBase: base,
    };
  }

  const workspace = await buildLocalWorkspaceReview(cwd, {
    requestedDiffType,
    configuredDiffType: resolveDefaultDiffType(config),
    hideWhitespace: config.diffOptions?.hideWhitespace ?? false,
  });

  if (workspace.repos.length === 0) {
    throw new Error("Not in a Git repository and no nested Git repositories were found.");
  }

  return {
    rawPatch: workspace.rawPatch,
    gitRef: workspace.gitRef,
    diffError: workspace.error,
    diffType: workspace.diffType,
    workspace,
    agentCwd: workspace.root,
  };
}

export async function openCodeReview(
  ctx: ExtensionContext,
  options: {
    cwd?: string;
    defaultBranch?: string;
    diffType?: DiffType;
    prUrl?: string;
    useLocal?: boolean;
  } = {},
): Promise<{
  approved: boolean;
  feedback?: string;
  annotations?: readonly unknown[];
  exit?: boolean;
}> {
  const session = await startCodeReviewBrowserSession(ctx, options);

  return session.waitForDecision();
}

export async function startCodeReviewBrowserSession(
  ctx: ExtensionContext,
  options: {
    cwd?: string;
    defaultBranch?: string;
    diffType?: DiffType;
    prUrl?: string;
    useLocal?: boolean;
  } = {},
): Promise<
  BrowserDecisionSession<{
    approved: boolean;
    feedback?: string;
    annotations?: readonly unknown[];
    exit?: boolean;
  }>
> {
  if (!ctx.hasUI || !reviewHtmlContent) {
    throw new Error("Plannotator code review browser is unavailable in this session.");
  }

  const urlArg = options.prUrl;
  const isPRMode = urlArg?.startsWith("http://") || urlArg?.startsWith("https://");

  const review =
    isPRMode && urlArg
      ? await preparePrReview(urlArg, options.useLocal !== false, options.cwd ?? ctx.cwd)
      : await prepareLocalReview(options.cwd ?? ctx.cwd, options.diffType, options.defaultBranch);

  const server = await startReviewServer({
    rawPatch: review.rawPatch,
    gitRef: review.gitRef,
    error: review.diffError,
    origin: "pi",
    diffType: review.diffType,
    gitContext: review.gitContext,
    initialBase: review.initialBase,
    prMetadata: review.prMetadata,
    prPatchIncomplete: review.prPatchIncomplete ?? false,
    workspace: review.workspace,
    agentCwd: review.agentCwd,
    worktreePool: review.worktreePool,
    htmlContent: reviewHtmlContent,
    sharingEnabled: resolveSharingEnabled(loadConfig()),
    shareBaseUrl: process.env.PLANNOTATOR_SHARE_URL || undefined,
    pasteApiUrl: process.env.PLANNOTATOR_PASTE_URL || undefined,
    onCleanup: review.onCleanup,
  });

  return startBrowserDecisionSession(server, ctx, server.waitForDecision);
}

export async function openMarkdownAnnotation(
  ctx: ExtensionContext,
  filePath: string,
  markdown: string,
  mode: AnnotateMode,
  folderPath?: string,
  sourceInfo?: string,
  sourceConverted?: boolean,
  gate?: boolean,
): Promise<{
  feedback: string;
  exit?: boolean;
  approved?: boolean;
  selectedMessageId?: string;
  feedbackScope?: "message" | "messages";
}> {
  const session = await startMarkdownAnnotationSession(
    ctx,
    filePath,
    markdown,
    mode,
    folderPath,
    sourceInfo,
    sourceConverted,
    gate,
  );

  return session.waitForDecision();
}

export async function startMarkdownAnnotationSession(
  ctx: ExtensionContext,
  filePath: string,
  markdown: string,
  mode: AnnotateMode,
  folderPath?: string,
  sourceInfo?: string,
  sourceConverted?: boolean,
  gate?: boolean,
  rawHtml?: string,
  renderHtml?: boolean,
  convertHtml?: boolean,
  recentMessages?: { messageId: string; text: string; timestamp?: string }[],
): Promise<
  BrowserDecisionSession<{
    feedback: string;
    exit?: boolean;
    approved?: boolean;
    selectedMessageId?: string;
    feedbackScope?: "message" | "messages";
  }>
> {
  if (!ctx.hasUI || !annotationHtmlContent) {
    throw new Error("Plannotator annotation browser is unavailable in this session.");
  }

  let resolvedMarkdown = markdown;

  if (!renderHtml && !resolvedMarkdown.trim() && existsSync(filePath)) {
    try {
      const fileStat = statSync(filePath);

      if (!fileStat.isDirectory()) {
        resolvedMarkdown = readFileSync(filePath, "utf-8");
      }
    } catch {
      // fall back to provided markdown
    }
  }

  const server = await startAnnotateServer({
    markdown: resolvedMarkdown,
    filePath,
    origin: "pi",
    mode,
    folderPath,
    recentMessages,
    sourceInfo,
    sourceConverted,
    gate,
    rawHtml,
    renderHtml,
    convertHtml,
    htmlContent: annotationHtmlContent,
    sharingEnabled: resolveSharingEnabled(loadConfig()),
    shareBaseUrl: process.env.PLANNOTATOR_SHARE_URL || undefined,
    pasteApiUrl: process.env.PLANNOTATOR_PASTE_URL || undefined,
    agentCwd: ctx.cwd,
  });

  return startBrowserDecisionSession(server, ctx, server.waitForDecision);
}

export async function openLastMessageAnnotation(
  ctx: ExtensionContext,
  lastText: string,
  gate?: boolean,
  recentMessages?: { messageId: string; text: string; timestamp?: string }[],
): Promise<{
  feedback: string;
  exit?: boolean;
  approved?: boolean;
  selectedMessageId?: string;
  feedbackScope?: "message" | "messages";
}> {
  const session = await startLastMessageAnnotationSession(ctx, lastText, gate, recentMessages);

  return session.waitForDecision();
}

export async function startLastMessageAnnotationSession(
  ctx: ExtensionContext,
  lastText: string,
  gate?: boolean,
  recentMessages?: { messageId: string; text: string; timestamp?: string }[],
): Promise<
  BrowserDecisionSession<{
    feedback: string;
    exit?: boolean;
    approved?: boolean;
    selectedMessageId?: string;
    feedbackScope?: "message" | "messages";
  }>
> {
  return startMarkdownAnnotationSession(
    ctx,
    "last-message",
    lastText,
    "annotate-last",
    undefined,
    undefined,
    undefined,
    gate,
    undefined,
    undefined,
    undefined,
    recentMessages,
  );
}
