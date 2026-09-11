import React from "react";
import type { Origin } from "@plannotator/shared/agents";
import type { PRMetadata } from "@plannotator/shared/pr-types";
import type {
  PRDiffScope,
  PRDiffScopeOption,
  PRStackInfo,
  PRStackTree,
} from "@plannotator/shared/pr-stack";
import {
  ApproveButton,
  ExitButton,
  FeedbackButton,
} from "@plannotator/ui/components/ToolbarButtons";
import { GitHubIcon } from "@plannotator/ui/components/GitHubIcon";
import { RepoIcon } from "@plannotator/ui/components/RepoIcon";
import { SparklesIcon } from "@plannotator/ui/components/SparklesIcon";
import { altKey } from "@plannotator/ui/utils/platform";
import { FolderTree } from "lucide-react";
import { AgentReviewActions } from "./AgentReviewActions";
import { DiffOptionsPopover } from "./DiffOptionsPopover";
import { PRSelector } from "./PRSelector";
import { ReviewHeaderMenu } from "./ReviewHeaderMenu";
import { StackedPRLabel } from "./StackedPRLabel";
import type { ReviewDestination } from "../hooks/usePlatformReviewActions";
import type { ReviewSidebarTab } from "./ReviewSidebar";

interface ReviewHeaderProps {
  readonly shouldShowFileTree: boolean;
  readonly isFileTreeOpen: boolean;
  readonly onToggleFileTree: () => void;
  readonly prMetadata: PRMetadata | null;
  readonly displayRepo: string;
  readonly prNumberLabel: string;
  readonly onSelectPR: (url: string) => void;
  readonly prStackInfo: PRStackInfo | null;
  readonly prStackTree: PRStackTree | null;
  readonly prDiffScope: PRDiffScope;
  readonly prDiffScopeOptions: PRDiffScopeOption[];
  readonly isSwitchingPRScope: boolean;
  readonly onSelectPRDiffScope: (scope: PRDiffScope) => void;
  readonly onOpenPRPanel: (type: "summary" | "comments" | "checks") => void;
  readonly repoInfo: { display: string; branch?: string } | null;
  readonly diffStyle: "split" | "unified";
  readonly onDiffStyleChange: (style: "split" | "unified") => void;
  readonly origin: Origin | null;
  readonly reviewDestination: ReviewDestination;
  readonly showDestinationMenu: boolean;
  readonly onToggleDestinationMenu: () => void;
  readonly onCloseDestinationMenu: () => void;
  readonly onSelectReviewDestination: (destination: ReviewDestination) => void;
  readonly platformActionError: string | null;
  readonly isWorkspaceReview: boolean;
  readonly diffError: string | null;
  readonly fileCount: number;
  readonly prPatchIncomplete: boolean;
  readonly prPatchUpgradeAvailable: boolean;
  readonly isLoadingFullDiff: boolean;
  readonly onLoadFullDiff: () => void;
  readonly isDiffStale: boolean;
  readonly isLoadingDiff: boolean;
  readonly onRefreshStaleDiff: () => void;
  readonly onDismissStaleDiff: () => void;
  readonly platformMode: boolean;
  readonly totalAnnotationCount: number;
  readonly isSendingFeedback: boolean;
  readonly isApproving: boolean;
  readonly isExiting: boolean;
  readonly isPlatformActioning: boolean;
  readonly onSendFeedback: () => void;
  readonly onRequestApprove: () => void;
  readonly onRequestExit: () => void;
  readonly onRequestPlatformComment: () => void;
  readonly onRequestPlatformApprove: () => void;
  readonly isOwnPullRequest: boolean;
  readonly copyFeedback: string | null;
  readonly onCopyFeedback: () => void;
  readonly isSidebarOpen: boolean;
  readonly activeSidebarTab: ReviewSidebarTab;
  readonly aiAvailable: boolean;
  readonly aiMessageCount: number;
  readonly onToggleAnnotations: () => void;
  readonly onToggleAI: () => void;
  readonly onOpenSettings: () => void;
  readonly onOpenExport: () => void;
  readonly onToggleSidebar: () => void;
  readonly appVersion: string;
}

export const ReviewHeader: React.FC<ReviewHeaderProps> = ({
  shouldShowFileTree,
  isFileTreeOpen,
  onToggleFileTree,
  prMetadata,
  displayRepo,
  prNumberLabel,
  onSelectPR,
  prStackInfo,
  prStackTree,
  prDiffScope,
  prDiffScopeOptions,
  isSwitchingPRScope,
  onSelectPRDiffScope,
  onOpenPRPanel,
  repoInfo,
  diffStyle,
  onDiffStyleChange,
  origin,
  reviewDestination,
  showDestinationMenu,
  onToggleDestinationMenu,
  onCloseDestinationMenu,
  onSelectReviewDestination,
  platformActionError,
  isWorkspaceReview,
  diffError,
  fileCount,
  prPatchIncomplete,
  prPatchUpgradeAvailable,
  isLoadingFullDiff,
  onLoadFullDiff,
  isDiffStale,
  isLoadingDiff,
  onRefreshStaleDiff,
  onDismissStaleDiff,
  platformMode,
  totalAnnotationCount,
  isSendingFeedback,
  isApproving,
  isExiting,
  isPlatformActioning,
  onSendFeedback,
  onRequestApprove,
  onRequestExit,
  onRequestPlatformComment,
  onRequestPlatformApprove,
  isOwnPullRequest,
  copyFeedback,
  onCopyFeedback,
  isSidebarOpen,
  activeSidebarTab,
  aiAvailable,
  aiMessageCount,
  onToggleAnnotations,
  onToggleAI,
  onOpenSettings,
  onOpenExport,
  onToggleSidebar,
  appVersion,
}) => (
  <header className="py-1 flex items-center justify-between px-2 md:px-4 border-b border-border/50 bg-card/50 backdrop-blur-xl z-50">
    <div className="min-w-0 flex items-center gap-2 md:gap-3">
      {shouldShowFileTree && <FileTreeToggle isOpen={isFileTreeOpen} onToggle={onToggleFileTree} />}
      <ReviewIdentity
        prMetadata={prMetadata}
        displayRepo={displayRepo}
        prNumberLabel={prNumberLabel}
        onSelectPR={onSelectPR}
        prStackInfo={prStackInfo}
        prStackTree={prStackTree}
        prDiffScope={prDiffScope}
        prDiffScopeOptions={prDiffScopeOptions}
        isSwitchingPRScope={isSwitchingPRScope}
        onSelectPRDiffScope={onSelectPRDiffScope}
        onOpenPRPanel={onOpenPRPanel}
        repoInfo={repoInfo}
      />
    </div>

    <div className="flex items-center gap-1 md:gap-2">
      <DiffDisplayControls diffStyle={diffStyle} onDiffStyleChange={onDiffStyleChange} />
      {origin ? (
        <>
          <ReviewDestinationSelector
            prMetadata={prMetadata}
            reviewDestination={reviewDestination}
            isOpen={showDestinationMenu}
            onToggle={onToggleDestinationMenu}
            onClose={onCloseDestinationMenu}
            onSelect={onSelectReviewDestination}
          />
          <ReviewNotices
            platformActionError={platformActionError}
            isWorkspaceReview={isWorkspaceReview}
            diffError={diffError}
            fileCount={fileCount}
            prPatchIncomplete={prPatchIncomplete}
            prDiffScope={prDiffScope}
            prPatchUpgradeAvailable={prPatchUpgradeAvailable}
            isSwitchingPRScope={isSwitchingPRScope}
            isLoadingFullDiff={isLoadingFullDiff}
            onLoadFullDiff={onLoadFullDiff}
            isDiffStale={isDiffStale}
            isLoadingDiff={isLoadingDiff}
            onRefreshStaleDiff={onRefreshStaleDiff}
            onDismissStaleDiff={onDismissStaleDiff}
          />
          <ReviewSubmissionActions
            platformMode={platformMode}
            totalAnnotationCount={totalAnnotationCount}
            isSendingFeedback={isSendingFeedback}
            isApproving={isApproving}
            isExiting={isExiting}
            isPlatformActioning={isPlatformActioning}
            onSendFeedback={onSendFeedback}
            onRequestApprove={onRequestApprove}
            onRequestExit={onRequestExit}
            onRequestPlatformComment={onRequestPlatformComment}
            onRequestPlatformApprove={onRequestPlatformApprove}
            isOwnPullRequest={isOwnPullRequest}
          />
        </>
      ) : (
        <CopyFeedbackButton status={copyFeedback} onCopy={onCopyFeedback} />
      )}
      <div className="w-px h-5 bg-border/50 mx-1 hidden md:block" />
      <SidebarToggles
        isOpen={isSidebarOpen}
        activeTab={activeSidebarTab}
        totalAnnotationCount={totalAnnotationCount}
        aiAvailable={aiAvailable}
        aiMessageCount={aiMessageCount}
        onToggleAnnotations={onToggleAnnotations}
        onToggleAI={onToggleAI}
      />
      <div className="w-px h-5 bg-border/50 mx-1 hidden md:block" />
      <ReviewHeaderMenu
        onOpenSettings={onOpenSettings}
        onOpenExport={onOpenExport}
        onToggleFileTree={onToggleFileTree}
        onToggleSidebar={onToggleSidebar}
        isFileTreeOpen={isFileTreeOpen}
        isSidebarOpen={isSidebarOpen}
        appVersion={appVersion}
      />
    </div>
  </header>
);

const FileTreeToggle: React.FC<{ readonly isOpen: boolean; readonly onToggle: () => void }> = ({
  isOpen,
  onToggle,
}) => (
  <>
    <button
      onClick={onToggle}
      className={`p-1 rounded-md transition-all focus-visible:outline-none ${
        isOpen ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
      title={isOpen ? "Hide file tree" : "Show file tree"}
    >
      <FolderTree className="w-3.5 h-3.5" />
    </button>
    <div className="w-px h-5 bg-border/50 mx-1 hidden md:block" />
  </>
);

interface ReviewIdentityProps {
  readonly prMetadata: PRMetadata | null;
  readonly displayRepo: string;
  readonly prNumberLabel: string;
  readonly onSelectPR: (url: string) => void;
  readonly prStackInfo: PRStackInfo | null;
  readonly prStackTree: PRStackTree | null;
  readonly prDiffScope: PRDiffScope;
  readonly prDiffScopeOptions: PRDiffScopeOption[];
  readonly isSwitchingPRScope: boolean;
  readonly onSelectPRDiffScope: (scope: PRDiffScope) => void;
  readonly onOpenPRPanel: (type: "summary" | "comments" | "checks") => void;
  readonly repoInfo: { display: string; branch?: string } | null;
}

const ReviewIdentity: React.FC<ReviewIdentityProps> = ({
  prMetadata,
  displayRepo,
  prNumberLabel,
  onSelectPR,
  prStackInfo,
  prStackTree,
  prDiffScope,
  prDiffScopeOptions,
  isSwitchingPRScope,
  onSelectPRDiffScope,
  onOpenPRPanel,
  repoInfo,
}) => {
  if (prMetadata) {
    return (
      <div className="min-w-0 flex items-center gap-2 md:gap-3">
        <span className="text-xs text-muted-foreground/60 inline-flex items-center gap-1 whitespace-nowrap">
          <RepoIcon className="w-3 h-3 flex-shrink-0" />
          {displayRepo}
        </span>
        <PRSelector
          prNumberLabel={prNumberLabel}
          prTitle={prMetadata.title}
          currentNumber={prMetadata.number}
          onSelect={onSelectPR}
          disabled={isSwitchingPRScope}
        />
        <StackedPRLabel
          metadata={prMetadata}
          prNumberLabel={prNumberLabel}
          stackInfo={prStackInfo}
          stackTree={prStackTree}
          scope={prDiffScope}
          scopeOptions={prDiffScopeOptions}
          isSwitchingScope={isSwitchingPRScope}
          onSelectScope={onSelectPRDiffScope}
          onNavigatePR={onSelectPR}
        />
        <PRPanelButtons onOpen={onOpenPRPanel} />
      </div>
    );
  }

  if (repoInfo) {
    return (
      <div className="min-w-0 flex items-center gap-2 md:gap-3">
        {repoInfo.branch && (
          <span className="text-xs font-mono text-foreground truncate" title={repoInfo.branch}>
            {repoInfo.branch}
          </span>
        )}
        <span
          className="text-xs text-muted-foreground/60 inline-flex items-center gap-1 truncate max-w-[220px]"
          title={repoInfo.display}
        >
          <RepoIcon className="w-3 h-3 flex-shrink-0" />
          {repoInfo.display}
        </span>
      </div>
    );
  }

  return <span className="text-xs text-muted-foreground/70">Review</span>;
};

const PRPanelButtons: React.FC<{
  readonly onOpen: (type: "summary" | "comments" | "checks") => void;
}> = ({ onOpen }) => (
  <div className="hidden md:flex items-center gap-0.5 ml-1">
    <button
      onClick={() => onOpen("summary")}
      className="p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors duration-150"
      title="PR Summary"
    >
      <svg
        className="w-3 h-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    </button>
    <button
      onClick={() => onOpen("comments")}
      className="p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors duration-150"
      title="PR Comments"
    >
      <svg
        className="w-3 h-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    </button>
    <button
      onClick={() => onOpen("checks")}
      className="p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors duration-150"
      title="PR Checks"
    >
      <svg
        className="w-3 h-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </button>
  </div>
);

const DiffDisplayControls: React.FC<{
  readonly diffStyle: "split" | "unified";
  readonly onDiffStyleChange: (style: "split" | "unified") => void;
}> = ({ diffStyle, onDiffStyleChange }) => (
  <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
    <button
      onClick={() => onDiffStyleChange("split")}
      className={`px-2 py-1 text-xs rounded-md transition-colors ${
        diffStyle === "split"
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      Split
    </button>
    <button
      onClick={() => onDiffStyleChange("unified")}
      className={`px-2 py-1 text-xs rounded-md transition-colors ${
        diffStyle === "unified"
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      Unified
    </button>
    <div className="w-px h-4 bg-border/60 mx-0.5" />
    <DiffOptionsPopover />
  </div>
);

const ReviewDestinationSelector: React.FC<{
  readonly prMetadata: PRMetadata | null;
  readonly reviewDestination: ReviewDestination;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
  readonly onSelect: (destination: ReviewDestination) => void;
}> = ({ prMetadata, reviewDestination, isOpen, onToggle, onClose, onSelect }) => {
  if (!prMetadata) return null;

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors"
        title={
          reviewDestination === "platform"
            ? "Posting to GitHub pull request"
            : "Sending to agent session"
        }
      >
        {reviewDestination === "platform" ? (
          <>
            <GitHubIcon className="w-3.5 h-3.5" />
            <span>GitHub</span>
          </>
        ) : (
          "Agent"
        )}
        <svg
          className="w-3 h-3 opacity-60"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <div className="absolute right-0 top-full mt-1 py-1 bg-popover border border-border rounded-lg shadow-xl z-50 min-w-[160px]">
            <DestinationMenuItem
              destination="platform"
              reviewDestination={reviewDestination}
              onSelect={onSelect}
            />
            <DestinationMenuItem
              destination="agent"
              reviewDestination={reviewDestination}
              onSelect={onSelect}
            />
            <div className="border-t border-border/50 mt-1 pt-1 px-3 py-1">
              <span className="text-[10px] text-muted-foreground/40">
                <kbd className="inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded bg-muted border border-border/60 border-b-[2px] text-[9px] font-mono leading-none text-foreground/60 shadow-sm">
                  {altKey}
                </kbd>
                <kbd className="inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded bg-muted border border-border/60 border-b-[2px] text-[9px] font-mono leading-none text-foreground/60 shadow-sm ml-0.5">
                  {altKey}
                </kbd>
                <span className="ml-1.5">to toggle</span>
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const DestinationMenuItem: React.FC<{
  readonly destination: ReviewDestination;
  readonly reviewDestination: ReviewDestination;
  readonly onSelect: (destination: ReviewDestination) => void;
}> = ({ destination, reviewDestination, onSelect }) => {
  const isPlatform = destination === "platform";
  const isSelected = reviewDestination === destination;

  return (
    <button
      onClick={() => onSelect(destination)}
      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
        isSelected
          ? "text-foreground bg-muted/50"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
      }`}
    >
      <div className="font-medium">{isPlatform ? "GitHub" : "Agent"}</div>
      <div className="text-muted-foreground/60">
        {isPlatform ? "Post to pull request" : "Send to session"}
      </div>
    </button>
  );
};

interface ReviewNoticesProps {
  readonly platformActionError: string | null;
  readonly isWorkspaceReview: boolean;
  readonly diffError: string | null;
  readonly fileCount: number;
  readonly prPatchIncomplete: boolean;
  readonly prDiffScope: PRDiffScope;
  readonly prPatchUpgradeAvailable: boolean;
  readonly isSwitchingPRScope: boolean;
  readonly isLoadingFullDiff: boolean;
  readonly onLoadFullDiff: () => void;
  readonly isDiffStale: boolean;
  readonly isLoadingDiff: boolean;
  readonly onRefreshStaleDiff: () => void;
  readonly onDismissStaleDiff: () => void;
}

const ReviewNotices: React.FC<ReviewNoticesProps> = ({
  platformActionError,
  isWorkspaceReview,
  diffError,
  fileCount,
  prPatchIncomplete,
  prDiffScope,
  prPatchUpgradeAvailable,
  isSwitchingPRScope,
  isLoadingFullDiff,
  onLoadFullDiff,
  isDiffStale,
  isLoadingDiff,
  onRefreshStaleDiff,
  onDismissStaleDiff,
}) => (
  <>
    {platformActionError && <PlatformActionError message={platformActionError} />}
    {isWorkspaceReview && diffError && (
      <WorkspaceDiffError fileCount={fileCount} error={diffError} />
    )}
    {prPatchIncomplete && prDiffScope === "layer" && !isSwitchingPRScope && (
      <PartialDiffNotice
        canLoadFullDiff={prPatchUpgradeAvailable}
        isLoading={isLoadingFullDiff}
        onLoad={onLoadFullDiff}
      />
    )}
    {isDiffStale && !isLoadingDiff && (
      <StaleDiffNotice onRefresh={onRefreshStaleDiff} onDismiss={onDismissStaleDiff} />
    )}
  </>
);

const PlatformActionError: React.FC<{ readonly message: string }> = ({ message }) => (
  <div
    className="text-xs text-destructive px-2 py-1 bg-destructive/10 rounded border border-destructive/20 max-w-[200px] truncate"
    title={message}
  >
    {message}
  </div>
);

const WorkspaceDiffError: React.FC<{ readonly fileCount: number; readonly error: string }> = ({
  fileCount,
  error,
}) => (
  <div
    className="text-xs text-amber-700 dark:text-amber-300 px-2 py-1 bg-amber-500/10 rounded border border-amber-500/25 max-w-[240px] truncate"
    title={error}
  >
    {fileCount > 0
      ? "Some workspace changes could not be loaded"
      : "Workspace changes could not be loaded"}
  </div>
);

const PartialDiffNotice: React.FC<{
  readonly canLoadFullDiff: boolean;
  readonly isLoading: boolean;
  readonly onLoad: () => void;
}> = ({ canLoadFullDiff, isLoading, onLoad }) => (
  <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 px-2 py-1 bg-amber-500/10 rounded border border-amber-500/25">
    <span
      className="hidden md:inline"
      title="GitHub omitted diff content for some files because this PR is too large"
    >
      Partial diff
    </span>
    <span className="md:hidden">Partial</span>
    {!canLoadFullDiff ? (
      <span
        className="hidden sm:inline text-amber-700/70 dark:text-amber-300/70"
        title="GitHub omitted diff content for some files and this session has no local checkout to recompute from. CLI sessions can re-run the review with --local."
      >
        (no local checkout — full diff unavailable)
      </span>
    ) : isLoading ? (
      <span
        className="flex items-center gap-1.5 font-medium"
        title="Recomputing the full diff from the local checkout — waiting for the background clone if it's still running. You can keep reviewing."
      >
        <span
          className="inline-block w-3 h-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin"
          aria-hidden
        />
        Loading full diff…
      </span>
    ) : (
      <button
        onClick={onLoad}
        className="font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100 transition-colors"
        title="Recompute the full diff from the local checkout (may wait for the background clone to finish — you can keep reviewing meanwhile)"
      >
        Load full diff
      </button>
    )}
  </div>
);

const StaleDiffNotice: React.FC<{
  readonly onRefresh: () => void;
  readonly onDismiss: () => void;
}> = ({ onRefresh, onDismiss }) => (
  <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 px-2 py-1 bg-amber-500/10 rounded border border-amber-500/25">
    <span className="hidden md:inline">Diff out of date</span>
    <span className="md:hidden">Stale</span>
    <button
      onClick={onRefresh}
      className="font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100 transition-colors"
      title="Re-run the diff with the current settings"
    >
      Refresh
    </button>
    <button
      onClick={onDismiss}
      className="text-amber-700/60 dark:text-amber-300/60 hover:text-amber-900 dark:hover:text-amber-100 transition-colors leading-none"
      title="Dismiss"
      aria-label="Dismiss stale diff notice"
    >
      ×
    </button>
  </div>
);

interface ReviewSubmissionActionsProps {
  readonly platformMode: boolean;
  readonly totalAnnotationCount: number;
  readonly isSendingFeedback: boolean;
  readonly isApproving: boolean;
  readonly isExiting: boolean;
  readonly isPlatformActioning: boolean;
  readonly onSendFeedback: () => void;
  readonly onRequestApprove: () => void;
  readonly onRequestExit: () => void;
  readonly onRequestPlatformComment: () => void;
  readonly onRequestPlatformApprove: () => void;
  readonly isOwnPullRequest: boolean;
}

const ReviewSubmissionActions: React.FC<ReviewSubmissionActionsProps> = ({
  platformMode,
  totalAnnotationCount,
  isSendingFeedback,
  isApproving,
  isExiting,
  isPlatformActioning,
  onSendFeedback,
  onRequestApprove,
  onRequestExit,
  onRequestPlatformComment,
  onRequestPlatformApprove,
  isOwnPullRequest,
}) => {
  if (!platformMode) {
    return (
      <AgentReviewActions
        totalAnnotationCount={totalAnnotationCount}
        isSendingFeedback={isSendingFeedback}
        isApproving={isApproving}
        isExiting={isExiting}
        onSendFeedback={onSendFeedback}
        onApprove={onRequestApprove}
        onExit={onRequestExit}
      />
    );
  }

  return (
    <PlatformSubmissionActions
      isSendingFeedback={isSendingFeedback}
      isApproving={isApproving}
      isExiting={isExiting}
      isPlatformActioning={isPlatformActioning}
      onRequestExit={onRequestExit}
      onRequestComment={onRequestPlatformComment}
      onRequestApprove={onRequestPlatformApprove}
      isOwnPullRequest={isOwnPullRequest}
    />
  );
};

interface PlatformSubmissionActionsProps {
  readonly isSendingFeedback: boolean;
  readonly isApproving: boolean;
  readonly isExiting: boolean;
  readonly isPlatformActioning: boolean;
  readonly onRequestExit: () => void;
  readonly onRequestComment: () => void;
  readonly onRequestApprove: () => void;
  readonly isOwnPullRequest: boolean;
}

const PlatformSubmissionActions: React.FC<PlatformSubmissionActionsProps> = ({
  isSendingFeedback,
  isApproving,
  isExiting,
  isPlatformActioning,
  onRequestExit,
  onRequestComment,
  onRequestApprove,
  isOwnPullRequest,
}) => {
  const submissionInProgress = isSendingFeedback || isApproving || isPlatformActioning;
  const approvalUnavailable = isOwnPullRequest || submissionInProgress;

  const approvalMuted =
    isOwnPullRequest && !isSendingFeedback && !isApproving && !isPlatformActioning;

  return (
    <>
      <ExitButton
        onClick={onRequestExit}
        disabled={submissionInProgress || isExiting}
        isLoading={isExiting}
      />
      <FeedbackButton
        onClick={onRequestComment}
        disabled={isSendingFeedback || isApproving || isPlatformActioning}
        isLoading={isSendingFeedback || isPlatformActioning}
        label="Post Comments"
        shortLabel="Post"
        loadingLabel="Posting..."
        shortLoadingLabel="Posting..."
        title="Post review to GitHub"
      />
      <div className="relative group/approve">
        <ApproveButton
          onClick={onRequestApprove}
          disabled={approvalUnavailable}
          isLoading={isApproving}
          muted={approvalMuted}
          title={
            isOwnPullRequest
              ? "You can't approve your own pull request"
              : "Approve - no changes needed"
          }
        />
        {isOwnPullRequest && <OwnPullRequestTooltip />}
      </div>
    </>
  );
};

const OwnPullRequestTooltip = () => (
  <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-popover border border-border rounded-lg shadow-xl text-xs text-foreground w-48 text-center opacity-0 invisible group-hover/approve:opacity-100 group-hover/approve:visible transition-all pointer-events-none z-50">
    <div className="absolute bottom-full right-4 border-4 border-transparent border-b-border" />
    <div className="absolute bottom-full right-4 mt-px border-4 border-transparent border-b-popover" />
    You can't approve your own pull request on GitHub.
  </div>
);

const CopyFeedbackButton: React.FC<{
  readonly status: string | null;
  readonly onCopy: () => void;
}> = ({ status, onCopy }) => (
  <button
    onClick={onCopy}
    className="px-2 py-1 md:px-2.5 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors flex items-center gap-1.5"
    title="Copy feedback for LLM"
  >
    {status === "Feedback copied!" ? <CopiedFeedbackIcon /> : <CopyFeedbackIcon />}
  </button>
);

const CopiedFeedbackIcon = () => (
  <>
    <svg
      className="w-3.5 h-3.5 text-success"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
    <span className="hidden md:inline">Copied!</span>
  </>
);

const CopyFeedbackIcon = () => (
  <>
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
    <span className="hidden md:inline">Copy Feedback</span>
  </>
);

interface SidebarTogglesProps {
  readonly isOpen: boolean;
  readonly activeTab: ReviewSidebarTab;
  readonly totalAnnotationCount: number;
  readonly aiAvailable: boolean;
  readonly aiMessageCount: number;
  readonly onToggleAnnotations: () => void;
  readonly onToggleAI: () => void;
}

const SidebarToggles: React.FC<SidebarTogglesProps> = ({
  isOpen,
  activeTab,
  totalAnnotationCount,
  aiAvailable,
  aiMessageCount,
  onToggleAnnotations,
  onToggleAI,
}) => (
  <>
    <button
      onClick={onToggleAnnotations}
      className={`relative p-1.5 rounded-md transition-all ${
        isOpen && activeTab === "annotations"
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
      title="Annotations"
    >
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
        />
      </svg>
      {totalAnnotationCount > 0 && <AnnotationCount count={totalAnnotationCount} />}
    </button>
    {aiAvailable && (
      <button
        onClick={onToggleAI}
        className={`relative p-1.5 rounded-md transition-all ${
          isOpen && activeTab === "ai"
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
        title="AI Chat"
      >
        <SparklesIcon className="w-4 h-4" />
        {aiMessageCount > 0 && !(isOpen && activeTab === "ai") && (
          <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-primary" />
        )}
      </button>
    )}
  </>
);

const AnnotationCount: React.FC<{ readonly count: number }> = ({ count }) => (
  <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground px-0.5">
    {count > 99 ? "99+" : count}
  </span>
);
