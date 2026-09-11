import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  type DiffResult,
  type DiffType,
  type GitCommandResult,
  type GitContext,
  type GitDiffOptions,
  type ReviewGitRuntime,
  canStageGitFiles,
  detectRemoteDefaultBranch as detectRemoteDefaultBranchCore,
  getFileContentsForDiff as getFileContentsForDiffCore,
  getGitContext as getGitContextCore,
  getGitDiffFingerprint as getGitDiffFingerprintCore,
  gitAddFile as gitAddFileCore,
  gitResetFile as gitResetFileCore,
  resolveGitDiffCwd,
  runGitDiff as runGitDiffCore,
} from "../generated/review-core.js";

function runCommand(
  args: string[],
  options?: { cwd?: string; timeoutMs?: number },
): Promise<GitCommandResult> {
  return new Promise((resolve) => {
    const proc = spawn("git", ["-c", "core.quotePath=false", ...args], {
      cwd: options?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let timer: ReturnType<typeof setTimeout> | undefined;

    if (options?.timeoutMs) timer = setTimeout(() => proc.kill(), options.timeoutMs);

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf-8"),
        stderr: Buffer.concat(stderrChunks).toString("utf-8"),
        exitCode: code ?? 1,
      });
    });
    proc.on("error", () => {
      if (timer) clearTimeout(timer);
      resolve({ stdout: "", stderr: "git not found", exitCode: 1 });
    });
  });
}

export const reviewRuntime: ReviewGitRuntime = {
  runGit: runCommand,
  async readTextFile(path: string): Promise<string | null> {
    try {
      return readFileSync(path, "utf-8");
    } catch {
      return null;
    }
  },
};

export async function isGitRepository(cwd?: string): Promise<boolean> {
  const result = await reviewRuntime.runGit(["rev-parse", "--is-inside-work-tree"], { cwd });

  return result.exitCode === 0 && result.stdout.trim() === "true";
}

export function getGitContext(cwd?: string): Promise<GitContext> {
  return getGitContextCore(reviewRuntime, cwd);
}

export function runGitDiff(
  diffType: DiffType,
  defaultBranch = "main",
  cwd?: string,
  options?: GitDiffOptions,
): Promise<DiffResult> {
  return runGitDiffCore(reviewRuntime, diffType, defaultBranch, cwd, options);
}

export function detectRemoteDefaultBranch(cwd?: string): Promise<string | null> {
  return detectRemoteDefaultBranchCore(reviewRuntime, cwd);
}

export function getGitDiffFingerprint(
  diffType: DiffType,
  defaultBranch: string,
  cwd?: string,
  options?: GitDiffOptions,
): Promise<string | null> {
  return getGitDiffFingerprintCore(reviewRuntime, diffType, defaultBranch, cwd, options);
}

export function getFileContentsForDiff(
  diffType: DiffType,
  defaultBranch: string,
  filePath: string,
  oldPath?: string,
  cwd?: string,
): Promise<{ oldContent: string | null; newContent: string | null }> {
  return getFileContentsForDiffCore(reviewRuntime, diffType, defaultBranch, filePath, oldPath, cwd);
}

export function gitAddFile(filePath: string, cwd?: string): Promise<void> {
  return gitAddFileCore(reviewRuntime, filePath, cwd);
}

export function gitResetFile(filePath: string, cwd?: string): Promise<void> {
  return gitResetFileCore(reviewRuntime, filePath, cwd);
}

export { canStageGitFiles, resolveGitDiffCwd };
