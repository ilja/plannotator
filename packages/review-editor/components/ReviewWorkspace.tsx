import React, { type ComponentProps } from "react";
import { DockviewReact, type DockviewReadyEvent } from "dockview-react";
import { ResizeHandle } from "@plannotator/ui/components/ResizeHandle";
import { FileTree } from "./FileTree";
import { ReviewHeader } from "./ReviewHeader";
import { ReviewSidebar } from "./ReviewSidebar";
import { reviewPanelComponents } from "../dock/reviewPanelComponents";
import { ReviewDockTabRenderer } from "../dock/ReviewDockTabRenderer";

type ReviewHeaderProps = ComponentProps<typeof ReviewHeader>;

type ReviewFileTreeProps = ComponentProps<typeof FileTree>;

type ReviewSidebarProps = ComponentProps<typeof ReviewSidebar>;

type ResizeHandleProps = ComponentProps<typeof ResizeHandle>;

type ReviewResizeHandleViewModel = Readonly<Pick<ResizeHandleProps, "isDragging" | "style">>;

type ReviewResizeHandleActions = Readonly<
  Pick<ResizeHandleProps, "onPointerDown" | "onDoubleClick">
>;

type ReviewHeaderViewModelKeys = Exclude<
  keyof ReviewHeaderProps,
  | "onToggleFileTree"
  | "onSelectPR"
  | "onSelectPRDiffScope"
  | "onOpenPRPanel"
  | "onDiffStyleChange"
  | "onToggleDestinationMenu"
  | "onCloseDestinationMenu"
  | "onSelectReviewDestination"
  | "onLoadFullDiff"
  | "onRefreshStaleDiff"
  | "onDismissStaleDiff"
  | "onSendFeedback"
  | "onRequestApprove"
  | "onRequestExit"
  | "onRequestPlatformComment"
  | "onRequestPlatformApprove"
  | "onCopyFeedback"
  | "onToggleAnnotations"
  | "onToggleAI"
  | "onOpenSettings"
  | "onOpenExport"
  | "onToggleSidebar"
>;

type ReviewHeaderActionKeys = Exclude<keyof ReviewHeaderProps, ReviewHeaderViewModelKeys>;

/** Read-only values rendered by the unchanged review header. */
export type ReviewHeaderViewModel = Readonly<Pick<ReviewHeaderProps, ReviewHeaderViewModelKeys>>;

/** Named callbacks invoked by the unchanged review header. */
export type ReviewHeaderActions = Readonly<Pick<ReviewHeaderProps, ReviewHeaderActionKeys>>;

type ReviewFileTreeViewModelKeys = Exclude<
  keyof ReviewFileTreeProps,
  | "onSelectFile"
  | "onDoubleClickFile"
  | "onToggleViewed"
  | "onToggleHideViewed"
  | "onSelectDiff"
  | "onSelectWorktree"
  | "onSelectBase"
  | "onCopyRawDiff"
  | "onOpenSearch"
  | "onSearchChange"
  | "onSearchClear"
  | "onSearchClose"
  | "onSelectSearchMatch"
  | "onStepSearchMatch"
  | "onSelectSemanticDiff"
  | "onSelectAllFiles"
>;

type ReviewFileTreeActionKeys = Exclude<keyof ReviewFileTreeProps, ReviewFileTreeViewModelKeys>;

/** Read-only values rendered by the review file tree. */
export type ReviewFileTreeViewModel = Readonly<
  Pick<ReviewFileTreeProps, ReviewFileTreeViewModelKeys>
> & { readonly resizeHandle: ReviewResizeHandleViewModel };

/** Named callbacks invoked by the review file tree. */
export type ReviewFileTreeActions = Readonly<
  Pick<ReviewFileTreeProps, ReviewFileTreeActionKeys>
> & {
  readonly resizeHandle: ReviewResizeHandleActions;
  readonly onCollapse: () => void;
};

/** Read-only values rendered by the docked diff workspace. */
export interface ReviewDockViewModel {
  readonly hasDiffFiles: boolean;
  readonly resolvedMode: "dark" | "light" | undefined;
  readonly diffError: string | null;
  readonly activeDiffBase: string;
  readonly activeWorktreePath: string | null;
  readonly selectedBase: string | null;
  readonly defaultBranch: string | undefined;
  readonly isWorkspaceReview: boolean;
  readonly workspaceDiffOptionCount: number;
  readonly gitDiffOptionCount: number;
}

/** Named callbacks invoked by the docked diff workspace. */
export interface ReviewDockActions {
  readonly onReady: (event: DockviewReadyEvent) => void;
}

type ReviewSidebarViewModelKeys = Exclude<
  keyof ReviewSidebarProps,
  | "onClose"
  | "onSelectAnnotation"
  | "onNavigateToAnnotation"
  | "onDeleteAnnotation"
  | "onDeleteEditorAnnotation"
  | "onScrollToAILines"
  | "onAskChat"
  | "onRemovePendingAIContext"
  | "onRespondToPermission"
  | "onAIConfigChange"
  | "onOpenPRPanel"
>;

type ReviewSidebarActionKeys = Exclude<keyof ReviewSidebarProps, ReviewSidebarViewModelKeys>;

/** Read-only values rendered by the review sidebar. */
export type ReviewSidebarViewModel = Readonly<
  Pick<ReviewSidebarProps, ReviewSidebarViewModelKeys>
> & { readonly resizeHandle: ReviewResizeHandleViewModel };

/** Named callbacks invoked by the review sidebar. */
export type ReviewSidebarActions = Readonly<Pick<ReviewSidebarProps, ReviewSidebarActionKeys>> & {
  readonly resizeHandle: ReviewResizeHandleActions;
  readonly onCollapse: () => void;
};

/** Read-only workspace state grouped by its semantic screen regions. */
export interface ReviewWorkspaceViewModel {
  readonly header: ReviewHeaderViewModel;
  readonly isResizing: boolean;
  readonly shouldShowFileTree: boolean;
  readonly fileTree: ReviewFileTreeViewModel;
  readonly dock: ReviewDockViewModel;
  readonly sidebar: ReviewSidebarViewModel;
}

/** Workspace callbacks grouped by the semantic screen region that invokes them. */
export interface ReviewWorkspaceActions {
  readonly header: ReviewHeaderActions;
  readonly fileTree: ReviewFileTreeActions;
  readonly dock: ReviewDockActions;
  readonly sidebar: ReviewSidebarActions;
}

/** Renders the review header and three-pane workspace without owning review state. */
export const ReviewWorkspace: React.FC<{
  readonly viewModel: ReviewWorkspaceViewModel;
  readonly actions: ReviewWorkspaceActions;
}> = ({ viewModel, actions }) => (
  <>
    <ReviewHeader {...viewModel.header} {...actions.header} />
    <div className={`flex-1 flex overflow-hidden ${viewModel.isResizing ? "select-none" : ""}`}>
      {viewModel.shouldShowFileTree && viewModel.header.isFileTreeOpen && (
        <ReviewFileTree viewModel={viewModel.fileTree} actions={actions.fileTree} />
      )}
      <ReviewDockArea viewModel={viewModel.dock} actions={actions.dock} />
      {viewModel.sidebar.isOpen && (
        <ReviewSidebarPanel viewModel={viewModel.sidebar} actions={actions.sidebar} />
      )}
    </div>
  </>
);

const ReviewFileTree: React.FC<{
  readonly viewModel: ReviewFileTreeViewModel;
  readonly actions: ReviewFileTreeActions;
}> = ({ viewModel, actions }) => {
  const { resizeHandle, ...fileTreeViewModel } = viewModel;
  const { resizeHandle: resizeHandleActions, onCollapse, ...fileTreeActions } = actions;

  return (
    <div className="contents group/sidebar">
      <FileTree {...fileTreeViewModel} {...fileTreeActions} />
      <ResizeHandle
        {...resizeHandle}
        {...resizeHandleActions}
        className="z-10"
        side="left"
        onCollapse={onCollapse}
      />
    </div>
  );
};

const ReviewDockArea: React.FC<{
  readonly viewModel: ReviewDockViewModel;
  readonly actions: ReviewDockActions;
}> = ({ viewModel, actions }) => (
  <div className="flex-1 min-w-0 overflow-hidden relative">
    {viewModel.hasDiffFiles ? (
      <DockviewReact
        className={`h-full ${viewModel.resolvedMode === "light" ? "dockview-theme-light" : "dockview-theme-dark"}`}
        components={reviewPanelComponents}
        defaultTabComponent={ReviewDockTabRenderer}
        onReady={actions.onReady}
        disableFloatingGroups
      />
    ) : (
      <ReviewEmptyState viewModel={viewModel} />
    )}
  </div>
);

const ReviewEmptyState: React.FC<{ readonly viewModel: ReviewDockViewModel }> = ({ viewModel }) => (
  <div className="h-full flex items-center justify-center">
    <div className="text-center space-y-3 max-w-md px-8">
      <ReviewEmptyStateIcon hasError={Boolean(viewModel.diffError)} />
      {viewModel.diffError ? (
        <ReviewLoadError message={viewModel.diffError} />
      ) : (
        <ReviewEmptyDiffMessage viewModel={viewModel} />
      )}
      <ReviewEmptyStateHint viewModel={viewModel} />
    </div>
  </div>
);

const ReviewEmptyStateIcon: React.FC<{ readonly hasError: boolean }> = ({ hasError }) => (
  <div
    className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${hasError ? "bg-destructive/10" : "bg-muted/50"}`}
  >
    {hasError ? <ReviewLoadErrorIcon /> : <ReviewNoChangesIcon />}
  </div>
);

const ReviewLoadErrorIcon: React.FC = () => (
  <svg
    className="w-6 h-6 text-destructive"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
    />
  </svg>
);

const ReviewNoChangesIcon: React.FC = () => (
  <svg
    className="w-6 h-6 text-muted-foreground"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
    />
  </svg>
);

const ReviewLoadError: React.FC<{ readonly message: string }> = ({ message }) => (
  <div>
    <h3 className="text-sm font-medium text-destructive">Failed to load diff</h3>
    <p className="text-xs text-muted-foreground mt-1 max-w-sm break-words line-clamp-3">
      {message}
    </p>
  </div>
);

const ReviewEmptyDiffMessage: React.FC<{ readonly viewModel: ReviewDockViewModel }> = ({
  viewModel,
}) => (
  <div>
    <h3 className="text-sm font-medium text-foreground">No changes</h3>
    <p className="text-xs text-muted-foreground mt-1">{getReviewEmptyDiffMessage(viewModel)}</p>
  </div>
);

function getReviewEmptyDiffMessage(viewModel: ReviewDockViewModel): string {
  switch (viewModel.activeDiffBase) {
    case "uncommitted":
      return getUncommittedEmptyDiffMessage(viewModel);
    case "staged":
      return "No staged changes. Stage some files with git add.";
    case "unstaged":
      return "No unstaged changes. All changes are staged.";
    case "last-commit":
      return getLastCommitEmptyDiffMessage(viewModel);
    case "workspace-current":
      return "No current changes in the workspace repositories.";
    case "workspace-staged":
      return "No staged changes in the workspace repositories.";
    case "workspace-unstaged":
      return "No unstaged changes in the workspace repositories.";
    case "workspace-last":
      return "No changes in the last change across workspace repositories.";
    case "branch":
    case "merge-base":
      return getReviewBranchEmptyDiffMessage(viewModel);
    case "all":
      return getAllFilesEmptyDiffMessage(viewModel);
    default:
      return "";
  }
}

function getUncommittedEmptyDiffMessage(viewModel: ReviewDockViewModel): string {
  const suffix = viewModel.activeWorktreePath ? " in this worktree" : " to review";

  return `No uncommitted changes${suffix}.`;
}

function getLastCommitEmptyDiffMessage(viewModel: ReviewDockViewModel): string {
  const suffix = viewModel.activeWorktreePath ? " in this worktree" : "";

  return `No changes in the last commit${suffix}.`;
}

function getReviewBranchEmptyDiffMessage(viewModel: ReviewDockViewModel): string {
  const base = viewModel.selectedBase || viewModel.defaultBranch || "main";
  const worktreeSuffix = viewModel.activeWorktreePath ? " in this worktree" : "";

  return `No changes vs ${base}${worktreeSuffix}.`;
}

function getAllFilesEmptyDiffMessage(viewModel: ReviewDockViewModel): string {
  const location = viewModel.activeWorktreePath ? " in this worktree" : " in this repository";

  return `No tracked files${location}.`;
}

const ReviewEmptyStateHint: React.FC<{ readonly viewModel: ReviewDockViewModel }> = ({
  viewModel,
}) => {
  const diffOptionCount = viewModel.isWorkspaceReview
    ? viewModel.workspaceDiffOptionCount
    : viewModel.gitDiffOptionCount;

  if (diffOptionCount <= 1) return null;

  return (
    <p className="text-xs text-muted-foreground/60">
      Try selecting a different view from the dropdown.
    </p>
  );
};

const ReviewSidebarPanel: React.FC<{
  readonly viewModel: ReviewSidebarViewModel;
  readonly actions: ReviewSidebarActions;
}> = ({ viewModel, actions }) => {
  const { resizeHandle, ...sidebarViewModel } = viewModel;
  const { resizeHandle: resizeHandleActions, onCollapse, ...sidebarActions } = actions;

  return (
    <div className="contents group/sidebar">
      <ResizeHandle
        {...resizeHandle}
        {...resizeHandleActions}
        className="z-10"
        side="right"
        onCollapse={onCollapse}
      />
      <ReviewSidebar {...sidebarViewModel} {...sidebarActions} />
    </div>
  );
};
