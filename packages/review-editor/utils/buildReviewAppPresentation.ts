import type { DiffOption, GitContext } from "@plannotator/shared/types";
import type { DiffFile } from "../types";
import type {
  ReviewDockViewModel,
  ReviewFileTreeViewModel,
  ReviewHeaderViewModel,
  ReviewSidebarViewModel,
  ReviewWorkspaceActions,
  ReviewWorkspaceViewModel,
} from "../components/ReviewWorkspace";

/** Immutable flags shared by review navigation, staging, and presentation controls. */
export interface ReviewPresentationFlags {
  readonly hasSearchableFiles: boolean;
  readonly shouldShowFileTree: boolean;
  readonly canStageFiles: boolean;
  readonly isPullRequestReview: boolean;
}

/** Immutable state used to derive the review workspace presentation. */
export interface BuildReviewWorkspaceViewModelInput {
  readonly shouldShowFileTree: boolean;
  readonly isResizing: boolean;
  readonly isFileTreeOpen: ReviewHeaderViewModel["isFileTreeOpen"];
  readonly prMetadata: ReviewHeaderViewModel["prMetadata"];
  readonly displayRepo: ReviewHeaderViewModel["displayRepo"];
  readonly prNumberLabel: ReviewHeaderViewModel["prNumberLabel"];
  readonly prStackInfo: ReviewHeaderViewModel["prStackInfo"];
  readonly prStackTree: ReviewHeaderViewModel["prStackTree"];
  readonly prDiffScope: ReviewHeaderViewModel["prDiffScope"];
  readonly prDiffScopeOptions: ReviewHeaderViewModel["prDiffScopeOptions"];
  readonly isSwitchingPRScope: ReviewHeaderViewModel["isSwitchingPRScope"];
  readonly repoInfo: ReviewHeaderViewModel["repoInfo"];
  readonly diffStyle: ReviewHeaderViewModel["diffStyle"];
  readonly origin: ReviewHeaderViewModel["origin"];
  readonly reviewDestination: ReviewHeaderViewModel["reviewDestination"];
  readonly showDestinationMenu: ReviewHeaderViewModel["showDestinationMenu"];
  readonly platformActionError: ReviewHeaderViewModel["platformActionError"];
  readonly reviewMode: string | null;
  readonly diffError: ReviewHeaderViewModel["diffError"];
  readonly prPatchIncomplete: ReviewHeaderViewModel["prPatchIncomplete"];
  readonly prPatchUpgradeAvailable: ReviewHeaderViewModel["prPatchUpgradeAvailable"];
  readonly isLoadingFullDiff: ReviewHeaderViewModel["isLoadingFullDiff"];
  readonly isDiffStale: ReviewHeaderViewModel["isDiffStale"];
  readonly isLoadingDiff: ReviewHeaderViewModel["isLoadingDiff"];
  readonly platformMode: ReviewHeaderViewModel["platformMode"];
  readonly totalAnnotationCount: ReviewHeaderViewModel["totalAnnotationCount"];
  readonly isSendingFeedback: ReviewHeaderViewModel["isSendingFeedback"];
  readonly isApproving: ReviewHeaderViewModel["isApproving"];
  readonly isExiting: ReviewHeaderViewModel["isExiting"];
  readonly isPlatformActioning: ReviewHeaderViewModel["isPlatformActioning"];
  readonly platformUser: string | null;
  readonly copyFeedback: ReviewHeaderViewModel["copyFeedback"];
  readonly isSidebarOpen: ReviewHeaderViewModel["isSidebarOpen"];
  readonly activeSidebarTab: ReviewHeaderViewModel["activeSidebarTab"];
  readonly aiAvailable: ReviewHeaderViewModel["aiAvailable"];
  readonly aiMessages: ReviewSidebarViewModel["aiMessages"];
  readonly appVersion: ReviewHeaderViewModel["appVersion"];
  readonly files: ReviewFileTreeViewModel["files"];
  readonly activeFileIndex: ReviewFileTreeViewModel["activeFileIndex"];
  readonly annotations: ReviewFileTreeViewModel["annotations"];
  readonly viewedFiles: ReviewFileTreeViewModel["viewedFiles"];
  readonly hideViewedFiles: ReviewFileTreeViewModel["hideViewedFiles"];
  readonly hasSearchableFiles: boolean;
  readonly isExportOpen: boolean;
  readonly workspaceDiffOptions: ReviewFileTreeViewModel["diffOptions"] | null;
  readonly gitContext: GitContext | null;
  readonly activeDiffBase: string;
  readonly fileTreeWidth: ReviewFileTreeViewModel["width"];
  readonly activeWorktreePath: string | null;
  readonly selectedBase: string | null;
  readonly stagedFiles: ReviewFileTreeViewModel["stagedFiles"];
  readonly rawPatch: string | undefined;
  readonly copyRawDiffStatus: ReviewFileTreeViewModel["copyRawDiffStatus"];
  readonly searchQuery: string;
  readonly isSearchOpen: boolean;
  readonly isSearchPending: boolean;
  readonly searchInputRef: ReviewFileTreeViewModel["searchInputRef"];
  readonly searchGroups: ReviewFileTreeViewModel["searchGroups"];
  readonly searchMatches: ReviewFileTreeViewModel["searchMatches"];
  readonly activeSearchMatchId: string | null;
  readonly isSemanticDiffActive: boolean;
  readonly semanticDiffAvailable: boolean;
  readonly isAllFilesActive: boolean;
  readonly allFilesVisibleFile: string | null;
  readonly agentCwd: string | null;
  readonly fileTreeResizeHandle: ReviewFileTreeViewModel["resizeHandle"];
  readonly resolvedMode: ReviewDockViewModel["resolvedMode"];
  readonly panelResizeHandle: ReviewSidebarViewModel["resizeHandle"];
  readonly panelWidth: ReviewSidebarViewModel["width"];
  readonly selectedAnnotationId: ReviewSidebarViewModel["selectedAnnotationId"];
  readonly editorAnnotations: ReviewSidebarViewModel["editorAnnotations"];
  readonly feedbackMarkdown: ReviewSidebarViewModel["feedbackMarkdown"];
  readonly aiIsCreatingSession: ReviewSidebarViewModel["isAICreatingSession"];
  readonly aiIsStreaming: ReviewSidebarViewModel["isAIStreaming"];
  readonly scrollToQuestionId: ReviewSidebarViewModel["scrollToQuestionId"];
  readonly pendingAIContext: ReviewSidebarViewModel["pendingAIContext"];
  readonly aiComposerFocusToken: ReviewSidebarViewModel["aiComposerFocusToken"];
  readonly aiPermissionRequests: ReviewSidebarViewModel["aiPermissionRequests"];
  readonly aiProviders: ReviewSidebarViewModel["aiProviders"];
  readonly aiConfig: ReviewSidebarViewModel["aiConfig"];
  readonly aiSessionId: string | null;
}

/** Derives review navigation and staging presentation flags from current diff context. */
export function buildReviewPresentationFlags(
  files: DiffFile[],
  reviewMode: string | null,
  workspaceDiffOptions: DiffOption[] | null,
  gitContext: GitContext | null,
  canStageRaw: boolean,
  isPullRequestReview: boolean,
): ReviewPresentationFlags {
  const hasSearchableFiles = files.length > 0;
  const hasWorkspaceStaging = workspaceDiffOptions?.some(
    (option) => option.id === "workspace-staged",
  );

  return {
    hasSearchableFiles,
    isPullRequestReview,
    shouldShowFileTree:
      hasSearchableFiles ||
      (reviewMode === "workspace" && Boolean(workspaceDiffOptions?.length)) ||
      Boolean(gitContext?.diffOptions?.length) ||
      Boolean(gitContext?.worktrees?.length),
    canStageFiles:
      canStageRaw &&
      !isPullRequestReview &&
      (reviewMode !== "workspace" || hasWorkspaceStaging === true),
  };
}

/** Chooses the local worktree path shown by review dialogs. */
export function buildReviewWorktreePath(
  agentCwd: string | null,
  gitContext: GitContext | null,
): string | null {
  return agentCwd || gitContext?.cwd || null;
}

/** Builds the immutable review workspace presentation without owning application lifecycle. */
export function buildReviewWorkspaceViewModel(
  input: BuildReviewWorkspaceViewModelInput,
): ReviewWorkspaceViewModel {
  return {
    header: buildReviewHeaderViewModel(input),
    isResizing: input.isResizing,
    shouldShowFileTree: input.shouldShowFileTree,
    fileTree: buildReviewFileTreeViewModel(input),
    dock: buildReviewDockViewModel(input),
    sidebar: buildReviewSidebarViewModel(input),
  };
}

function buildReviewHeaderViewModel(
  input: BuildReviewWorkspaceViewModelInput,
): ReviewHeaderViewModel {
  return {
    shouldShowFileTree: input.shouldShowFileTree,
    isFileTreeOpen: input.isFileTreeOpen,
    prMetadata: input.prMetadata,
    displayRepo: input.displayRepo,
    prNumberLabel: input.prNumberLabel,
    prStackInfo: input.prStackInfo,
    prStackTree: input.prStackTree,
    prDiffScope: input.prDiffScope,
    prDiffScopeOptions: input.prDiffScopeOptions,
    isSwitchingPRScope: input.isSwitchingPRScope,
    repoInfo: input.repoInfo,
    diffStyle: input.diffStyle,
    origin: input.origin,
    reviewDestination: input.reviewDestination,
    showDestinationMenu: input.showDestinationMenu,
    platformActionError: input.platformActionError,
    isWorkspaceReview: input.reviewMode === "workspace",
    diffError: input.diffError,
    fileCount: input.files.length,
    prPatchIncomplete: input.prPatchIncomplete,
    prPatchUpgradeAvailable: input.prPatchUpgradeAvailable,
    isLoadingFullDiff: input.isLoadingFullDiff,
    isDiffStale: input.isDiffStale,
    isLoadingDiff: input.isLoadingDiff,
    platformMode: input.platformMode,
    totalAnnotationCount: input.totalAnnotationCount,
    isSendingFeedback: input.isSendingFeedback,
    isApproving: input.isApproving,
    isExiting: input.isExiting,
    isPlatformActioning: input.isPlatformActioning,
    isOwnPullRequest:
      Boolean(input.platformUser) && input.prMetadata?.author === input.platformUser,
    copyFeedback: input.copyFeedback,
    isSidebarOpen: input.isSidebarOpen,
    activeSidebarTab: input.activeSidebarTab,
    aiAvailable: input.aiAvailable,
    aiMessageCount: input.aiMessages?.length ?? 0,
    appVersion: input.appVersion,
  };
}

function buildReviewFileTreeViewModel(
  input: BuildReviewWorkspaceViewModelInput,
): ReviewFileTreeViewModel {
  const controls = buildReviewFileTreeControls(input);
  const search = buildReviewFileTreeSearchPresentation(input);
  const location = buildReviewFileTreeLocationPresentation(input);

  return {
    files: input.files,
    activeFileIndex: input.activeFileIndex,
    annotations: input.annotations,
    viewedFiles: input.viewedFiles,
    hideViewedFiles: input.hideViewedFiles,
    enableKeyboardNav: !input.isExportOpen && input.hasSearchableFiles,
    ...controls,
    activeDiffType: input.activeDiffBase,
    isLoadingDiff: input.isLoadingDiff,
    width: input.fileTreeWidth,
    stagedFiles: input.stagedFiles,
    canCopyRawDiff: Boolean(input.rawPatch),
    copyRawDiffStatus: input.copyRawDiffStatus,
    ...search,
    isSemanticDiffActive: input.isSemanticDiffActive,
    semanticDiffAvailable: input.semanticDiffAvailable,
    isAllFilesActive: input.isAllFilesActive,
    ...location,
  };
}

function buildReviewFileTreeControls(
  input: BuildReviewWorkspaceViewModelInput,
): Readonly<
  Pick<
    ReviewFileTreeViewModel,
    | "diffOptions"
    | "worktrees"
    | "activeWorktreePath"
    | "currentBranch"
    | "availableBranches"
    | "selectedBase"
    | "detectedBase"
    | "compareTarget"
    | "recentCommits"
  >
> {
  return {
    ...buildReviewFileTreeDiffSource(input),
    ...buildReviewFileTreeCompareTarget(input),
  };
}

function buildReviewFileTreeDiffSource(
  input: BuildReviewWorkspaceViewModelInput,
): Readonly<
  Pick<
    ReviewFileTreeViewModel,
    "diffOptions" | "worktrees" | "activeWorktreePath" | "currentBranch" | "compareTarget"
  >
> {
  const gitContext = input.gitContext;

  return {
    diffOptions:
      input.reviewMode === "workspace"
        ? (input.workspaceDiffOptions ?? undefined)
        : gitContext?.diffOptions,
    worktrees: gitContext?.worktrees,
    activeWorktreePath: input.activeWorktreePath,
    currentBranch: gitContext?.currentBranch,
    compareTarget: gitContext?.compareTarget,
  };
}

function buildReviewFileTreeCompareTarget(
  input: BuildReviewWorkspaceViewModelInput,
): Readonly<
  Pick<
    ReviewFileTreeViewModel,
    | "availableBranches"
    | "selectedBase"
    | "detectedBase"
    | "recentCommits"
  >
> {
  const isPullRequestReview = input.prMetadata !== null;
  const gitContext = input.gitContext;

  return {
    availableBranches: isPullRequestReview ? undefined : gitContext?.availableBranches,
    selectedBase: isPullRequestReview ? undefined : (input.selectedBase ?? undefined),
    detectedBase: isPullRequestReview
      ? undefined
      : gitContext?.defaultBranch || gitContext?.compareTarget?.fallback,
    recentCommits: isPullRequestReview ? undefined : gitContext?.recentCommits,
  };
}

function buildReviewFileTreeSearchPresentation(
  input: BuildReviewWorkspaceViewModelInput,
): Readonly<
  Pick<
    ReviewFileTreeViewModel,
    | "searchQuery"
    | "isSearchOpen"
    | "isSearchPending"
    | "searchInputRef"
    | "searchGroups"
    | "searchMatches"
    | "activeSearchMatchId"
  >
> {
  return {
    searchQuery: input.hasSearchableFiles ? input.searchQuery : "",
    isSearchOpen: input.hasSearchableFiles ? input.isSearchOpen : false,
    isSearchPending: input.isSearchPending,
    searchInputRef: input.hasSearchableFiles ? input.searchInputRef : undefined,
    searchGroups: input.hasSearchableFiles ? input.searchGroups : [],
    searchMatches: input.hasSearchableFiles ? input.searchMatches : [],
    activeSearchMatchId: input.hasSearchableFiles ? input.activeSearchMatchId : null,
  };
}

function buildReviewFileTreeLocationPresentation(
  input: BuildReviewWorkspaceViewModelInput,
): Readonly<Pick<ReviewFileTreeViewModel, "scrollHighlightIndex" | "repoRoot" | "resizeHandle">> {
  const isPullRequestReview = input.prMetadata !== null;

  return {
    scrollHighlightIndex:
      input.isAllFilesActive && input.allFilesVisibleFile
        ? input.files.findIndex((file: DiffFile) => file.path === input.allFilesVisibleFile)
        : undefined,
    repoRoot: isPullRequestReview
      ? null
      : (input.activeWorktreePath ?? input.agentCwd ?? input.gitContext?.cwd ?? null),
    resizeHandle: input.fileTreeResizeHandle,
  };
}

/** Named file tree callbacks and their resize controls. */
export interface ReviewFileTreeActionModel {
  readonly onSelectFile: (index: number) => void;
  readonly onDoubleClickFile: ((index: number) => void) | undefined;
  readonly onToggleViewed: ((filePath: string) => void) | undefined;
  readonly onToggleHideViewed: (() => void) | undefined;
  readonly onSelectDiff: ((diffType: string) => void) | undefined;
  readonly onSelectWorktree: ((path: string | null) => void) | undefined;
  readonly onSelectBase: ((branch: string) => void) | undefined;
  readonly onCopyRawDiff: (() => void) | undefined;
  readonly onOpenSearch: (() => void) | undefined;
  readonly onSearchChange: ((value: string) => void) | undefined;
  readonly onSearchClear: (() => void) | undefined;
  readonly onSearchClose: (() => void) | undefined;
  readonly onSelectSearchMatch: ((matchId: string) => void) | undefined;
  readonly onStepSearchMatch: ((direction: 1 | -1) => void) | undefined;
  readonly onSelectSemanticDiff: (() => void) | undefined;
  readonly onSelectAllFiles: (() => void) | undefined;
  readonly resizeHandle: ReviewWorkspaceActions["fileTree"]["resizeHandle"];
  readonly onCollapse: ReviewWorkspaceActions["fileTree"]["onCollapse"];
}

/** Builds file tree callbacks while preserving pull request and search availability rules. */
export function buildReviewFileTreeActions(
  isPullRequestReview: boolean,
  hasSearchableFiles: boolean,
  onSelectFile: ReviewFileTreeActionModel["onSelectFile"],
  onDoubleClickFile: ReviewFileTreeActionModel["onDoubleClickFile"],
  onToggleViewed: ReviewFileTreeActionModel["onToggleViewed"],
  onToggleHideViewed: ReviewFileTreeActionModel["onToggleHideViewed"],
  onSelectDiff: ReviewFileTreeActionModel["onSelectDiff"],
  onSelectWorktree: ReviewFileTreeActionModel["onSelectWorktree"],
  onSelectBase: ReviewFileTreeActionModel["onSelectBase"],
  onCopyRawDiff: ReviewFileTreeActionModel["onCopyRawDiff"],
  onOpenSearch: ReviewFileTreeActionModel["onOpenSearch"],
  onSearchChange: ReviewFileTreeActionModel["onSearchChange"],
  onSearchClear: ReviewFileTreeActionModel["onSearchClear"],
  onSearchClose: ReviewFileTreeActionModel["onSearchClose"],
  onSelectSearchMatch: ReviewFileTreeActionModel["onSelectSearchMatch"],
  onStepSearchMatch: ReviewFileTreeActionModel["onStepSearchMatch"],
  onSelectSemanticDiff: ReviewFileTreeActionModel["onSelectSemanticDiff"],
  onSelectAllFiles: ReviewFileTreeActionModel["onSelectAllFiles"],
  onPointerDown: ReviewWorkspaceActions["fileTree"]["resizeHandle"]["onPointerDown"],
  onDoubleClick: ReviewWorkspaceActions["fileTree"]["resizeHandle"]["onDoubleClick"],
  onCollapse: ReviewWorkspaceActions["fileTree"]["onCollapse"],
): ReviewFileTreeActionModel {
  return {
    onSelectFile,
    onDoubleClickFile,
    onToggleViewed,
    onToggleHideViewed,
    onSelectDiff,
    onSelectWorktree,
    onSelectBase: isPullRequestReview ? undefined : onSelectBase,
    onCopyRawDiff,
    onOpenSearch: hasSearchableFiles ? onOpenSearch : undefined,
    onSearchChange: hasSearchableFiles ? onSearchChange : undefined,
    onSearchClear: hasSearchableFiles ? onSearchClear : undefined,
    onSearchClose: hasSearchableFiles ? onSearchClose : undefined,
    onSelectSearchMatch: hasSearchableFiles ? onSelectSearchMatch : undefined,
    onStepSearchMatch: hasSearchableFiles ? onStepSearchMatch : undefined,
    onSelectSemanticDiff,
    onSelectAllFiles,
    resizeHandle: { onPointerDown, onDoubleClick },
    onCollapse,
  };
}

function buildReviewDockViewModel(input: BuildReviewWorkspaceViewModelInput): ReviewDockViewModel {
  return {
    hasDiffFiles: input.files.length > 0,
    resolvedMode: input.resolvedMode,
    diffError: input.diffError,
    activeDiffBase: input.activeDiffBase,
    activeWorktreePath: input.activeWorktreePath,
    selectedBase: input.selectedBase,
    defaultBranch: input.gitContext?.defaultBranch,
    isWorkspaceReview: input.reviewMode === "workspace",
    workspaceDiffOptionCount: input.workspaceDiffOptions?.length ?? 0,
    gitDiffOptionCount: input.gitContext?.diffOptions?.length ?? 0,
  };
}

function buildReviewSidebarViewModel(
  input: BuildReviewWorkspaceViewModelInput,
): ReviewSidebarViewModel {
  return {
    isOpen: input.isSidebarOpen,
    activeTab: input.activeSidebarTab,
    annotations: input.annotations,
    files: input.files,
    selectedAnnotationId: input.selectedAnnotationId,
    feedbackMarkdown: input.feedbackMarkdown,
    width: input.panelWidth,
    editorAnnotations: input.editorAnnotations,
    prMetadata: input.prMetadata,
    aiAvailable: input.aiAvailable,
    aiMessages: input.aiMessages,
    isAICreatingSession: input.aiIsCreatingSession,
    isAIStreaming: input.aiIsStreaming,
    activeFilePath: input.files[input.activeFileIndex]?.path,
    scrollToQuestionId: input.scrollToQuestionId,
    pendingAIContext: input.pendingAIContext,
    aiComposerFocusToken: input.aiComposerFocusToken,
    aiPermissionRequests: input.aiPermissionRequests,
    aiProviders: input.aiProviders,
    aiConfig: input.aiConfig,
    hasAISession: Boolean(input.aiSessionId),
    resizeHandle: input.panelResizeHandle,
  };
}
