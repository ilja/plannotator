import { describe, expect, it } from "bun:test";
import {
  buildReviewFileTreeActions,
  buildReviewWorkspaceViewModel,
  type BuildReviewWorkspaceViewModelInput,
} from "./buildReviewAppPresentation";

const source = (
  overrides: Partial<BuildReviewWorkspaceViewModelInput> = {},
): BuildReviewWorkspaceViewModelInput => ({
  shouldShowFileTree: true,
  isResizing: false,
  isFileTreeOpen: true,
  prMetadata: null,
  displayRepo: "",
  prNumberLabel: "",
  prStackInfo: null,
  prStackTree: null,
  prDiffScope: undefined,
  prDiffScopeOptions: undefined,
  isSwitchingPRScope: false,
  repoInfo: null,
  diffStyle: "split",
  origin: null,
  reviewDestination: "agent",
  showDestinationMenu: false,
  platformActionError: null,
  reviewMode: "local",
  diffError: null,
  prPatchIncomplete: false,
  prPatchUpgradeAvailable: false,
  isLoadingFullDiff: false,
  isDiffStale: false,
  isLoadingDiff: false,
  platformMode: null,
  totalAnnotationCount: 0,
  isSendingFeedback: false,
  isApproving: false,
  isExiting: false,
  isPlatformActioning: false,
  platformUser: null,
  copyFeedback: null,
  isSidebarOpen: false,
  activeSidebarTab: "annotations",
  aiAvailable: false,
  aiMessages: [],
  appVersion: "test",
  files: [
    {
      path: "src/App.tsx",
      patch: "",
      additions: 1,
      deletions: 0,
      status: "modified",
    },
  ],
  activeFileIndex: 0,
  annotations: [],
  viewedFiles: new Set(),
  hideViewedFiles: false,
  hasSearchableFiles: true,
  isExportOpen: false,
  workspaceDiffOptions: undefined,
  gitContext: null,
  activeDiffBase: "uncommitted",
  fileTreeWidth: 256,
  activeWorktreePath: null,
  selectedBase: null,
  stagedFiles: new Set(),
  rawPatch: undefined,
  copyRawDiffStatus: "idle",
  searchQuery: "",
  isSearchOpen: false,
  isSearchPending: false,
  searchInputRef: undefined,
  searchGroups: [],
  searchMatches: [],
  activeSearchMatchId: null,
  isSemanticDiffActive: false,
  semanticDiffAvailable: false,
  isAllFilesActive: false,
  allFilesVisibleFile: null,
  agentCwd: null,
  fileTreeResizeHandle: { isDragging: false, style: {} },
  resolvedMode: "dark",
  panelResizeHandle: { isDragging: false, style: {} },
  panelWidth: 320,
  selectedAnnotationId: null,
  editorAnnotations: [],
  feedbackMarkdown: "",
  aiIsCreatingSession: false,
  aiIsStreaming: false,
  scrollToQuestionId: null,
  pendingAIContext: null,
  aiComposerFocusToken: 0,
  aiPermissionRequests: [],
  aiProviders: [],
  aiConfig: { providerId: null, model: null, reasoningEffort: null },
  aiSessionId: null,
  ...overrides,
});

describe("buildReviewWorkspaceViewModel", () => {
  it("defaults an unavailable AI message collection to zero in the header", () => {
    const workspace = buildReviewWorkspaceViewModel(source({ aiMessages: undefined }));

    expect(workspace.header.aiMessageCount).toBe(0);
  });

  it("builds workspace controls and all-files highlighting from local review state", () => {
    const workspace = buildReviewWorkspaceViewModel(
      source({
        reviewMode: "workspace",
        workspaceDiffOptions: [{ id: "workspace-staged", label: "Staged" }],
        gitContext: {
          cwd: "/repo",
          currentBranch: "feature",
          defaultBranch: "main",
          diffOptions: [{ id: "uncommitted", label: "Uncommitted" }],
          worktrees: [],
          availableBranches: { local: ["main"], remote: [] },
        },
        selectedBase: "main",
        activeWorktreePath: "/repo/worktree",
        agentCwd: "/repo/agent",
        isAllFilesActive: true,
        allFilesVisibleFile: "src/App.tsx",
      }),
    );

    expect(workspace.fileTree.diffOptions).toEqual([{ id: "workspace-staged", label: "Staged" }]);
    expect(workspace.fileTree.enableKeyboardNav).toBe(true);
    expect(workspace.fileTree.availableBranches).toEqual({ local: ["main"], remote: [] });
    expect(workspace.fileTree.selectedBase).toBe("main");
    expect(workspace.fileTree.detectedBase).toBe("main");
    expect(workspace.fileTree.scrollHighlightIndex).toBe(0);
    expect(workspace.fileTree.repoRoot).toBe("/repo/worktree");
  });

  it("withholds local-only controls and search state for pull request review", () => {
    const workspace = buildReviewWorkspaceViewModel(
      source({
        prMetadata: {
          host: "github.com",
          owner: "owner",
          repo: "repo",
          number: 1,
          title: "Title",
          author: "reviewer",
          baseBranch: "main",
          headBranch: "feature",
          baseSha: "base",
          headSha: "head",
          url: "https://github.com/owner/repo/pull/1",
        },
        hasSearchableFiles: false,
        isExportOpen: true,
        selectedBase: "main",
        searchQuery: "needle",
        isSearchOpen: true,
        activeWorktreePath: "/repo/worktree",
        agentCwd: "/repo/agent",
      }),
    );

    expect(workspace.fileTree.enableKeyboardNav).toBe(false);
    expect(workspace.fileTree.availableBranches).toBeUndefined();
    expect(workspace.fileTree.selectedBase).toBeUndefined();
    expect(workspace.fileTree.detectedBase).toBeUndefined();
    expect(workspace.fileTree.recentCommits).toBeUndefined();
    expect(workspace.fileTree.detectedEvoBase).toBeUndefined();
    expect(workspace.fileTree.searchQuery).toBe("");
    expect(workspace.fileTree.isSearchOpen).toBe(false);
    expect(workspace.fileTree.searchGroups).toEqual([]);
    expect(workspace.fileTree.activeSearchMatchId).toBeNull();
    expect(workspace.fileTree.repoRoot).toBeNull();
  });

  it("uses git diff options and the agent path when no worktree is active", () => {
    const workspace = buildReviewWorkspaceViewModel(
      source({
        gitContext: {
          cwd: "/repo",
          currentBranch: "feature",
          defaultBranch: "main",
          diffOptions: [{ id: "uncommitted", label: "Uncommitted" }],
          worktrees: [],
          availableBranches: { local: ["main"], remote: [] },
        },
        agentCwd: "/repo/agent",
      }),
    );

    expect(workspace.fileTree.diffOptions).toEqual([{ id: "uncommitted", label: "Uncommitted" }]);
    expect(workspace.fileTree.repoRoot).toBe("/repo/agent");
  });

  it("withholds file tree actions that are unavailable in pull request review", () => {
    const noop = () => {};
    const actions = buildReviewFileTreeActions(
      true,
      false,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
    );

    expect(actions.onSelectBase).toBeUndefined();
    expect(actions.onOpenSearch).toBeUndefined();
    expect(actions.onSearchChange).toBeUndefined();
    expect(actions.onStepSearchMatch).toBeUndefined();
  });
});
