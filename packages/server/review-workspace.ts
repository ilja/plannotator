import {
  getFileContentsForDiff,
  getGitContext,
  gitAddFile,
  gitResetFile,
  runGitDiff,
  runtime,
} from "./git";
import { getGitDiffFingerprint } from "@plannotator/shared/review-core";
import {
  WorkspaceReviewSession,
  type WorkspaceReviewBuildOptions,
  type WorkspaceReviewRuntime,
} from "@plannotator/shared/review-workspace";

export {
  WorkspaceReviewSession,
  mapRepoDiffTypeToWorkspaceMode,
  mapWorkspaceModeToRepoDiffType,
  resolveWorkspaceInitialDiffType,
  type WorkspaceDiffType,
  type WorkspaceRepoRuntimeState,
  type WorkspaceReviewPromptContext,
} from "@plannotator/shared/review-workspace";

export {
  aggregateWorkspacePatch,
  discoverWorkspaceRepoPaths,
  prefixWorkspacePatchPaths as prefixPatchPaths,
  resolveWorkspaceFilePath,
  type WorkspacePatchAggregate,
} from "@plannotator/shared/review-workspace-node";

export type LocalWorkspaceReview = WorkspaceReviewSession;

const workspaceRuntime: WorkspaceReviewRuntime = {
  getGitContext,
  runGitDiff,
  getFileContentsForDiff,
  gitAddFile,
  gitResetFile,
  getGitDiffFingerprint: (diffType, defaultBranch, cwd, options) =>
    getGitDiffFingerprint(runtime, diffType, defaultBranch, cwd, options),
};

export async function buildLocalWorkspaceReview(
  root: string,
  options: WorkspaceReviewBuildOptions = {},
): Promise<WorkspaceReviewSession> {
  return WorkspaceReviewSession.create(workspaceRuntime, root, options);
}
