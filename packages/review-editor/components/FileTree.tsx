import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CodeAnnotation } from "@plannotator/ui/types";
import type {
  AvailableBranches,
  CompareTargetConfig,
  DiffOption,
  JjEvoLogEntry,
  RecentCommit,
  WorktreeInfo,
} from "@plannotator/shared/types";
import {
  buildFileTree,
  getAncestorPaths,
  getAllFolderPaths,
  getVisualFileOrder,
  type FileTreeNode,
} from "../utils/buildFileTree";
import { FileTreeNodeItem } from "./FileTreeNode";
import { BaseBranchPicker } from "./BaseBranchPicker";
import { EvoLogPicker } from "./EvoLogPicker";
import { DiffTypePicker } from "./DiffTypePicker";
import { WorktreePicker } from "./WorktreePicker";
import {
  getReviewSearchSideLabel,
  type ReviewSearchFileGroup,
  type ReviewSearchMatch,
} from "../utils/reviewSearch";
import type { DiffFile } from "../types";
import { OverlayScrollArea } from "@plannotator/ui/components/OverlayScrollArea";

interface FileTreeProps {
  files: DiffFile[];
  activeFileIndex: number;
  onSelectFile: (index: number) => void;
  onDoubleClickFile?: (index: number) => void;
  annotations: CodeAnnotation[];
  viewedFiles: Set<string>;
  onToggleViewed?: (filePath: string) => void;
  hideViewedFiles?: boolean;
  onToggleHideViewed?: () => void;
  enableKeyboardNav?: boolean;
  diffOptions?: DiffOption[];
  activeDiffType?: string;
  onSelectDiff?: (diffType: string) => void;
  isLoadingDiff?: boolean;
  width?: number;
  worktrees?: WorktreeInfo[];
  activeWorktreePath?: string | null;
  onSelectWorktree?: (path: string | null) => void;
  currentBranch?: string;
  /** Compare target picker — base branch for Git, bookmark/revision for jj. */
  availableBranches?: AvailableBranches;
  selectedBase?: string;
  detectedBase?: string;
  onSelectBase?: (branch: string) => void;
  compareTarget?: CompareTargetConfig;
  /** HEAD ancestry for the commit-baseline picker (git only, #709). */
  recentCommits?: RecentCommit[];
  /** Evolution log entries for the current jj change (jj-evolog mode only). */
  jjEvologs?: JjEvoLogEntry[];
  /** Default evolog commit ID to compare against (second evolog entry). */
  detectedEvoBase?: string;
  stagedFiles?: Set<string>;
  onCopyRawDiff?: () => void;
  canCopyRawDiff?: boolean;
  copyRawDiffStatus?: "idle" | "success" | "error";
  searchQuery?: string;
  isSearchOpen?: boolean;
  isSearchPending?: boolean;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onOpenSearch?: () => void;
  onSearchChange?: (value: string) => void;
  onSearchClear?: () => void;
  onSearchClose?: () => void;
  searchGroups?: ReviewSearchFileGroup[];
  searchMatches?: ReviewSearchMatch[];
  activeSearchMatchId?: string | null;
  onSelectSearchMatch?: (matchId: string) => void;
  onStepSearchMatch?: (direction: 1 | -1) => void;
  onSelectSemanticDiff?: () => void;
  isSemanticDiffActive?: boolean;
  semanticDiffAvailable?: boolean;
  onSelectAllFiles?: () => void;
  isAllFilesActive?: boolean;
  scrollHighlightIndex?: number;
  /** Absolute repo root for the "Copy full path" context menu item. Null/undefined hides the option (e.g. PR review mode). */
  repoRoot?: string | null;
}

interface KeyboardNavigationOptions {
  enabled: boolean;
  activeFileIndex: number;
  visualOrder: number[];
  onSelectFile: (index: number) => void;
}

function useFileTreeKeyboardNavigation({
  enabled,
  activeFileIndex,
  visualOrder,
  onSelectFile,
}: KeyboardNavigationOptions) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement.closest(
          '[role="menu"], [role="dialog"], [role="listbox"], [data-radix-popper-content-wrapper]',
        )
      ) {
        return;
      }

      const visualPosition = visualOrder.indexOf(activeFileIndex);
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        if (visualPosition < visualOrder.length - 1) onSelectFile(visualOrder[visualPosition + 1]);
        return;
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        if (visualPosition > 0) onSelectFile(visualOrder[visualPosition - 1]);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        onSelectFile(visualOrder[0]);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        onSelectFile(visualOrder[visualOrder.length - 1]);
      }
    },
    [enabled, activeFileIndex, visualOrder, onSelectFile],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

interface ExpandedFoldersOptions {
  tree: FileTreeNode[];
  allFolderPaths: string[];
  files: DiffFile[];
  activeFileIndex: number;
}

function useExpandedFolders({
  tree,
  allFolderPaths,
  files,
  activeFileIndex,
}: ExpandedFoldersOptions) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(allFolderPaths),
  );
  const [previousTree, setPreviousTree] = useState(tree);

  if (tree !== previousTree) {
    setPreviousTree(tree);
    setExpandedFolders(new Set(allFolderPaths));
  }

  useEffect(() => {
    const activeFile = files[activeFileIndex];
    if (!activeFile) return;

    const ancestors = getAncestorPaths(activeFile.path);
    setExpandedFolders((previousFolders) => {
      const missingFolders = ancestors.filter((path) => !previousFolders.has(path));
      if (missingFolders.length === 0) return previousFolders;

      const nextFolders = new Set(previousFolders);
      for (const path of missingFolders) nextFolders.add(path);
      return nextFolders;
    });
  }, [activeFileIndex, files]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((previousFolders) => {
      const nextFolders = new Set(previousFolders);
      if (nextFolders.has(path)) nextFolders.delete(path);
      else nextFolders.add(path);
      return nextFolders;
    });
  }, []);

  const areAllFoldersExpanded =
    allFolderPaths.length > 0 && allFolderPaths.every((path) => expandedFolders.has(path));
  const toggleAllFolders = useCallback(() => {
    setExpandedFolders(areAllFoldersExpanded ? new Set() : new Set(allFolderPaths));
  }, [allFolderPaths, areAllFoldersExpanded]);

  return { expandedFolders, toggleFolder, areAllFoldersExpanded, toggleAllFolders };
}

function useAnnotationCountMap(annotations: CodeAnnotation[]) {
  const annotationCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const annotation of annotations) {
      counts.set(annotation.filePath, (counts.get(annotation.filePath) ?? 0) + 1);
    }
    return counts;
  }, [annotations]);

  return useCallback(
    (filePath: string) => annotationCountMap.get(filePath) ?? 0,
    [annotationCountMap],
  );
}

interface FileTreeHeaderProps {
  searchQuery: string;
  isSearchVisible: boolean;
  files: DiffFile[];
  viewedFiles: Set<string>;
  stagedFiles?: Set<string>;
  onOpenSearch?: () => void;
  onToggleHideViewed?: () => void;
  hideViewedFiles: boolean;
  allFolderPaths: string[];
  areAllFoldersExpanded: boolean;
  onToggleAllFolders: () => void;
}

const FileTreeHeader: React.FC<FileTreeHeaderProps> = ({
  searchQuery,
  isSearchVisible,
  files,
  viewedFiles,
  stagedFiles,
  onOpenSearch,
  onToggleHideViewed,
  hideViewedFiles,
  allFolderPaths,
  areAllFoldersExpanded,
  onToggleAllFolders,
}) => (
  <div
    className="px-3 flex items-center border-b border-border/50"
    style={{ height: "var(--panel-header-h)" }}
  >
    <div className="w-full flex items-center justify-between">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {searchQuery.trim() ? "Results" : "Files"}
      </span>
      <div className="flex items-center gap-1.5">
        {stagedFiles && stagedFiles.size > 0 && (
          <span className="text-xs text-primary font-medium">{stagedFiles.size} added</span>
        )}
        {onOpenSearch && <SearchToggle isSearchVisible={isSearchVisible} onOpen={onOpenSearch} />}
        <FolderToggle
          isExpanded={areAllFoldersExpanded}
          isDisabled={allFolderPaths.length === 0}
          onToggle={onToggleAllFolders}
        />
        {onToggleHideViewed && (
          <ViewedFilesToggle isHidden={hideViewedFiles} onToggle={onToggleHideViewed} />
        )}
        <span className="text-xs text-muted-foreground">
          {viewedFiles.size}/{files.length}
        </span>
      </div>
    </div>
  </div>
);

const SearchToggle: React.FC<{ isSearchVisible: boolean; onOpen: () => void }> = ({
  isSearchVisible,
  onOpen,
}) => (
  <button
    onClick={onOpen}
    className={`p-1 rounded transition-colors ${isSearchVisible ? "bg-primary/15 text-primary" : "hover:bg-muted text-muted-foreground"}`}
    title="Search diff (Cmd/Ctrl+F)"
  >
    <SearchIcon />
  </button>
);

const FolderToggle: React.FC<{
  isExpanded: boolean;
  isDisabled: boolean;
  onToggle: () => void;
}> = ({ isExpanded, isDisabled, onToggle }) => (
  <button
    onClick={onToggle}
    disabled={isDisabled}
    className="p-1 rounded transition-colors hover:bg-muted text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
    title={isExpanded ? "Collapse all folders" : "Expand all folders"}
  >
    {isExpanded ? <CollapseFoldersIcon /> : <ExpandFoldersIcon />}
  </button>
);

const ViewedFilesToggle: React.FC<{ isHidden: boolean; onToggle: () => void }> = ({
  isHidden,
  onToggle,
}) => (
  <button
    onClick={onToggle}
    className={`p-1 rounded transition-colors ${isHidden ? "bg-primary/15 text-primary" : "hover:bg-muted text-muted-foreground"}`}
    title={isHidden ? "Show viewed files" : "Hide viewed files"}
  >
    {isHidden ? <HiddenEyeIcon /> : <VisibleEyeIcon />}
  </button>
);

interface SearchInputProps {
  searchQuery: string;
  isSearchPending?: boolean;
  searchMatches: ReviewSearchMatch[];
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onSearchChange?: (value: string) => void;
  onSearchClear?: () => void;
  onSearchClose?: () => void;
  onStepSearchMatch?: (direction: 1 | -1) => void;
}

const SearchInput: React.FC<SearchInputProps> = ({
  searchQuery,
  isSearchPending,
  searchMatches,
  searchInputRef,
  onSearchChange,
  onSearchClear,
  onSearchClose,
  onStepSearchMatch,
}) => {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      return;
    }
    if (event.key === "Enter" && searchMatches.length > 0 && !isSearchPending) {
      event.preventDefault();
      onStepSearchMatch?.(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (searchQuery) onSearchClear?.();
      else {
        onSearchClose?.();
        event.currentTarget.blur();
      }
    }
  };

  return (
    <div
      className="px-2 flex items-center border-b border-border/50"
      style={{ height: "var(--panel-header-h)" }}
    >
      <div className="relative flex-1">
        <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60 pointer-events-none" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(event) => onSearchChange?.(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search diff..."
          className="w-full pl-7 py-1.5 pr-7 bg-muted rounded text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {searchQuery.trim() && !isSearchPending && (
            <span className="text-[10px] text-muted-foreground/40 tabular-nums">
              {searchMatches.length}
            </span>
          )}
          <button
            onClick={searchQuery ? onSearchClear : onSearchClose}
            className="p-0.5 rounded hover:bg-background/50 text-muted-foreground hover:text-foreground transition-colors"
            title={searchQuery ? "Clear search" : "Close search"}
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
};

interface DiffSourceControlsProps {
  worktrees?: WorktreeInfo[];
  activeWorktreePath?: string | null;
  onSelectWorktree?: (path: string | null) => void;
  currentBranch?: string;
  diffOptions?: DiffOption[];
  activeDiffType?: string;
  onSelectDiff?: (diffType: string) => void;
  isLoadingDiff?: boolean;
  availableBranches?: AvailableBranches;
  onSelectBase?: (branch: string) => void;
}

const DiffSourceControls: React.FC<DiffSourceControlsProps> = ({
  worktrees,
  activeWorktreePath,
  onSelectWorktree,
  currentBranch,
  diffOptions,
  activeDiffType,
  onSelectDiff,
  isLoadingDiff,
  availableBranches,
  onSelectBase,
}) => {
  const hasWorktreePicker = Boolean(worktrees?.length && onSelectWorktree);
  const hasDiffPicker = Boolean(diffOptions?.length && onSelectDiff);
  if (!hasWorktreePicker && !hasDiffPicker) return null;

  return (
    <div className="px-2 py-1.5 border-b border-border/30 flex gap-2">
      {worktrees && worktrees.length > 0 && onSelectWorktree && (
        <WorktreeSourcePicker
          worktrees={worktrees}
          activeWorktreePath={activeWorktreePath}
          currentBranch={currentBranch}
          onSelectWorktree={onSelectWorktree}
          isLoadingDiff={isLoadingDiff}
        />
      )}
      {diffOptions && diffOptions.length > 0 && onSelectDiff && (
        <DiffSourcePicker
          options={diffOptions}
          activeDiffType={activeDiffType}
          onSelectDiff={onSelectDiff}
          isLoadingDiff={isLoadingDiff}
          availableBranches={availableBranches}
          onSelectBase={onSelectBase}
        />
      )}
    </div>
  );
};

interface WorktreeSourcePickerProps {
  worktrees: WorktreeInfo[];
  activeWorktreePath?: string | null;
  currentBranch?: string;
  onSelectWorktree: (path: string | null) => void;
  isLoadingDiff?: boolean;
}

const WorktreeSourcePicker: React.FC<WorktreeSourcePickerProps> = ({
  worktrees,
  activeWorktreePath,
  currentBranch,
  onSelectWorktree,
  isLoadingDiff,
}) => (
  <div className="flex-1 min-w-0">
    <WorktreePicker
      worktrees={worktrees}
      activeWorktreePath={activeWorktreePath ?? null}
      currentBranch={currentBranch}
      onSelect={onSelectWorktree}
      disabled={isLoadingDiff}
    />
  </div>
);

interface DiffSourcePickerProps {
  options: DiffOption[];
  activeDiffType?: string;
  onSelectDiff: (diffType: string) => void;
  isLoadingDiff?: boolean;
  availableBranches?: AvailableBranches;
  onSelectBase?: (branch: string) => void;
}

const DiffSourcePicker: React.FC<DiffSourcePickerProps> = ({
  options,
  activeDiffType,
  onSelectDiff,
  isLoadingDiff,
  availableBranches,
  onSelectBase,
}) => (
  <div className="flex-1 min-w-0">
    <DiffTypePicker
      options={options}
      activeDiffType={activeDiffType || "uncommitted"}
      onSelect={onSelectDiff}
      isLoading={isLoadingDiff}
      hasBasePicker={!!onSelectBase && !!availableBranches}
    />
  </div>
);

interface CompareTargetControlsProps {
  activeDiffType?: string;
  onSelectBase?: (branch: string) => void;
  selectedBase?: string;
  detectedBase?: string;
  availableBranches?: AvailableBranches;
  compareTarget?: CompareTargetConfig;
  recentCommits?: RecentCommit[];
  jjEvologs?: JjEvoLogEntry[];
  detectedEvoBase?: string;
  isLoadingDiff?: boolean;
}

const CompareTargetControls: React.FC<CompareTargetControlsProps> = (props) => (
  <>
    <EvoLogCompareTarget {...props} />
    <BranchCompareTarget {...props} />
  </>
);

const EvoLogCompareTarget: React.FC<CompareTargetControlsProps> = ({
  activeDiffType,
  onSelectBase,
  selectedBase,
  jjEvologs,
  detectedEvoBase,
  isLoadingDiff,
}) => {
  const isVisible =
    activeDiffType === "jj-evolog" &&
    onSelectBase &&
    selectedBase &&
    jjEvologs &&
    jjEvologs.length >= 2 &&
    detectedEvoBase;
  if (!isVisible) return null;

  return (
    <div className="px-2 py-1.5 border-b border-border/30 flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex-shrink-0">
        from evolution
      </span>
      <div className="flex-1 min-w-0">
        <EvoLogPicker
          entries={jjEvologs}
          selectedCommitId={selectedBase}
          detectedCommitId={detectedEvoBase}
          onSelect={onSelectBase}
          disabled={isLoadingDiff}
        />
      </div>
    </div>
  );
};

const BranchCompareTarget: React.FC<CompareTargetControlsProps> = ({
  activeDiffType,
  onSelectBase,
  selectedBase,
  detectedBase,
  availableBranches,
  compareTarget,
  recentCommits,
  isLoadingDiff,
}) => {
  const isVisible =
    activeDiffType !== "jj-evolog" &&
    onSelectBase &&
    selectedBase &&
    detectedBase &&
    availableBranches &&
    activeDiffType &&
    compareTarget?.diffTypes.includes(activeDiffType);
  if (!isVisible) return null;

  return (
    <div className="px-2 py-1.5 border-b border-border/30 flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex-shrink-0">
        {compareTarget.picker.rowLabel}
      </span>
      <div className="flex-1 min-w-0">
        <BaseBranchPicker
          availableBranches={availableBranches}
          selectedBase={selectedBase}
          detectedBase={detectedBase}
          onSelectBase={onSelectBase}
          disabled={isLoadingDiff}
          copy={compareTarget.picker}
          recentCommits={recentCommits}
        />
      </div>
    </div>
  );
};

interface FileTreeContentProps {
  files: DiffFile[];
  tree: FileTreeNode[];
  searchQuery: string;
  isSearchPending?: boolean;
  searchGroups: ReviewSearchFileGroup[];
  activeSearchMatchId: string | null;
  onSelectSearchMatch?: (matchId: string) => void;
  semanticDiffAvailable: boolean;
  onSelectSemanticDiff?: () => void;
  isSemanticDiffActive: boolean;
  onSelectAllFiles?: () => void;
  isAllFilesActive: boolean;
  expandedFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  activeFileIndex: number;
  scrollHighlightIndex?: number;
  onSelectFile: (index: number) => void;
  onDoubleClickFile?: (index: number) => void;
  viewedFiles: Set<string>;
  onToggleViewed?: (filePath: string) => void;
  hideViewedFiles: boolean;
  getAnnotationCount: (filePath: string) => number;
  stagedFiles?: Set<string>;
  repoRoot?: string | null;
}

const FileTreeContent: React.FC<FileTreeContentProps> = ({ searchQuery, ...props }) => (
  <OverlayScrollArea className="flex-1 min-h-0">
    <div className="px-1 py-1">
      {searchQuery.trim() ? (
        <SearchResults searchQuery={searchQuery} {...props} />
      ) : (
        <TreeMode {...props} />
      )}
    </div>
  </OverlayScrollArea>
);

interface SearchResultsProps {
  searchQuery: string;
  isSearchPending?: boolean;
  searchGroups: ReviewSearchFileGroup[];
  activeSearchMatchId: string | null;
  onSelectSearchMatch?: (matchId: string) => void;
}

const SearchResults: React.FC<SearchResultsProps> = ({
  searchQuery,
  isSearchPending,
  searchGroups,
  activeSearchMatchId,
  onSelectSearchMatch,
}) => {
  if (isSearchPending) return <SearchEmptyState>Searching…</SearchEmptyState>;
  if (searchGroups.length === 0) return <SearchEmptyState>No matches found</SearchEmptyState>;

  return searchGroups.map((group) => (
    <SearchFileGroup
      key={group.filePath}
      group={group}
      searchQuery={searchQuery}
      activeSearchMatchId={activeSearchMatchId}
      onSelectMatch={onSelectSearchMatch}
    />
  ));
};

const SearchEmptyState: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div className="py-6 text-center text-xs text-muted-foreground/50">{children}</div>
);

type TreeModeProps = Omit<
  FileTreeContentProps,
  "searchQuery" | "isSearchPending" | "searchGroups" | "activeSearchMatchId" | "onSelectSearchMatch"
>;

const TreeMode: React.FC<TreeModeProps> = ({
  files,
  tree,
  semanticDiffAvailable,
  onSelectSemanticDiff,
  isSemanticDiffActive,
  onSelectAllFiles,
  isAllFilesActive,
  expandedFolders,
  onToggleFolder,
  activeFileIndex,
  scrollHighlightIndex,
  onSelectFile,
  onDoubleClickFile,
  viewedFiles,
  onToggleViewed,
  hideViewedFiles,
  getAnnotationCount,
  stagedFiles,
  repoRoot,
}) => (
  <>
    {semanticDiffAvailable && onSelectSemanticDiff && (
      <SemanticDiffButton isActive={isSemanticDiffActive} onSelect={onSelectSemanticDiff} />
    )}
    {onSelectAllFiles && (
      <AllFilesButton files={files} isActive={isAllFilesActive} onSelect={onSelectAllFiles} />
    )}
    {tree.map((node) => (
      <FileTreeNodeItem
        key={node.type === "file" ? node.path : `folder:${node.path}`}
        node={node}
        expandedFolders={expandedFolders}
        onToggleFolder={onToggleFolder}
        activeFileIndex={isAllFilesActive || isSemanticDiffActive ? -1 : activeFileIndex}
        scrollHighlightIndex={isAllFilesActive ? scrollHighlightIndex : undefined}
        onSelectFile={onSelectFile}
        onDoubleClickFile={onDoubleClickFile}
        viewedFiles={viewedFiles}
        onToggleViewed={onToggleViewed}
        hideViewedFiles={hideViewedFiles}
        getAnnotationCount={getAnnotationCount}
        stagedFiles={stagedFiles}
        repoRoot={repoRoot}
      />
    ))}
  </>
);

const SemanticDiffButton: React.FC<{ isActive: boolean; onSelect: () => void }> = ({
  isActive,
  onSelect,
}) => (
  <button
    onClick={onSelect}
    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors mb-0.5 ${
      isActive
        ? "bg-primary/15 text-primary font-medium"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`}
  >
    <span className="w-3.5 h-3.5 flex flex-shrink-0 items-center justify-center" aria-hidden="true">
      ∆
    </span>
    <span>Semantic diff</span>
  </button>
);

const AllFilesButton: React.FC<{ files: DiffFile[]; isActive: boolean; onSelect: () => void }> = ({
  files,
  isActive,
  onSelect,
}) => (
  <button
    onClick={onSelect}
    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors mb-0.5 ${
      isActive
        ? "bg-primary/15 text-primary font-medium"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`}
  >
    <AllFilesIcon />
    <span>All files</span>
    <span className="ml-auto text-[10px] tabular-nums opacity-60">
      <span className="text-green-500">
        +{files.reduce((sum, file) => sum + file.additions, 0)}
      </span>{" "}
      <span className="text-red-500">-{files.reduce((sum, file) => sum + file.deletions, 0)}</span>
    </span>
  </button>
);

interface FileTreeFooterProps {
  files: DiffFile[];
  onCopyRawDiff?: () => void;
  canCopyRawDiff: boolean;
  copyRawDiffStatus: "idle" | "success" | "error";
}

const FileTreeFooter: React.FC<FileTreeFooterProps> = ({
  files,
  onCopyRawDiff,
  canCopyRawDiff,
  copyRawDiffStatus,
}) => (
  <div className="px-2 py-1.5 border-t border-border/50 text-xs text-muted-foreground">
    <div className="flex items-center justify-between">
      {onCopyRawDiff ? (
        <CopyRawDiffButton
          onCopy={onCopyRawDiff}
          canCopy={canCopyRawDiff}
          status={copyRawDiffStatus}
        />
      ) : (
        <span />
      )}
      <span className="file-stats inline-flex items-center gap-1.5">
        <span className="additions">+{files.reduce((sum, file) => sum + file.additions, 0)}</span>
        <span className="deletions">-{files.reduce((sum, file) => sum + file.deletions, 0)}</span>
      </span>
    </div>
  </div>
);

const CopyRawDiffButton: React.FC<{
  onCopy: () => void;
  canCopy: boolean;
  status: "idle" | "success" | "error";
}> = ({ onCopy, canCopy, status }) => (
  <button
    onClick={onCopy}
    disabled={!canCopy}
    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    title="Copy all raw diffs to clipboard (Cmd/Ctrl+Shift+C)"
  >
    {status === "success" ? (
      <CopySuccessIcon />
    ) : status === "error" ? (
      <CopyErrorIcon />
    ) : (
      <CopyIcon />
    )}
    {status === "success" ? "Copied" : status === "error" ? "Failed" : "Copy diffs"}
  </button>
);

export const FileTree: React.FC<FileTreeProps> = ({
  files,
  activeFileIndex,
  onSelectFile,
  onDoubleClickFile,
  annotations,
  viewedFiles,
  onToggleViewed,
  hideViewedFiles = false,
  onToggleHideViewed,
  enableKeyboardNav = true,
  diffOptions,
  activeDiffType,
  onSelectDiff,
  isLoadingDiff,
  width,
  worktrees,
  activeWorktreePath,
  onSelectWorktree,
  currentBranch,
  availableBranches,
  selectedBase,
  detectedBase,
  onSelectBase,
  compareTarget,
  recentCommits,
  jjEvologs,
  detectedEvoBase,
  stagedFiles,
  onCopyRawDiff,
  canCopyRawDiff = false,
  copyRawDiffStatus = "idle",
  searchQuery = "",
  isSearchOpen = false,
  isSearchPending,
  searchInputRef,
  onOpenSearch,
  onSearchChange,
  onSearchClear,
  onSearchClose,
  searchGroups = [],
  searchMatches = [],
  activeSearchMatchId,
  onSelectSearchMatch,
  onStepSearchMatch,
  onSelectSemanticDiff,
  isSemanticDiffActive = false,
  semanticDiffAvailable = false,
  onSelectAllFiles,
  isAllFilesActive = false,
  scrollHighlightIndex,
  repoRoot,
}) => {
  const isSearchVisible = Boolean(onSearchChange && (isSearchOpen || searchQuery.trim()));
  const tree = useMemo(() => buildFileTree(files), [files]);
  const allFolderPaths = useMemo(() => getAllFolderPaths(tree), [tree]);
  const visualOrder = useMemo(() => getVisualFileOrder(tree), [tree]);
  useFileTreeKeyboardNavigation({
    enabled: enableKeyboardNav,
    activeFileIndex,
    visualOrder,
    onSelectFile,
  });
  const getAnnotationCount = useAnnotationCountMap(annotations);
  const { expandedFolders, toggleFolder, areAllFoldersExpanded, toggleAllFolders } =
    useExpandedFolders({
      tree,
      allFolderPaths,
      files,
      activeFileIndex,
    });

  return (
    <aside
      className="border-r border-border/50 bg-card/30 flex flex-col flex-shrink-0 overflow-hidden"
      style={{ width: width ?? 256 }}
    >
      <FileTreeHeader
        searchQuery={searchQuery}
        isSearchVisible={isSearchVisible}
        files={files}
        viewedFiles={viewedFiles}
        stagedFiles={stagedFiles}
        onOpenSearch={onOpenSearch}
        onToggleHideViewed={onToggleHideViewed}
        hideViewedFiles={hideViewedFiles}
        allFolderPaths={allFolderPaths}
        areAllFoldersExpanded={areAllFoldersExpanded}
        onToggleAllFolders={toggleAllFolders}
      />
      {isSearchVisible && (
        <SearchInput
          searchQuery={searchQuery}
          isSearchPending={isSearchPending}
          searchMatches={searchMatches}
          searchInputRef={searchInputRef}
          onSearchChange={onSearchChange}
          onSearchClear={onSearchClear}
          onSearchClose={onSearchClose}
          onStepSearchMatch={onStepSearchMatch}
        />
      )}
      <DiffSourceControls
        worktrees={worktrees}
        activeWorktreePath={activeWorktreePath}
        onSelectWorktree={onSelectWorktree}
        currentBranch={currentBranch}
        diffOptions={diffOptions}
        activeDiffType={activeDiffType}
        onSelectDiff={onSelectDiff}
        isLoadingDiff={isLoadingDiff}
        availableBranches={availableBranches}
        onSelectBase={onSelectBase}
      />
      <CompareTargetControls
        activeDiffType={activeDiffType}
        onSelectBase={onSelectBase}
        selectedBase={selectedBase}
        detectedBase={detectedBase}
        availableBranches={availableBranches}
        compareTarget={compareTarget}
        recentCommits={recentCommits}
        jjEvologs={jjEvologs}
        detectedEvoBase={detectedEvoBase}
        isLoadingDiff={isLoadingDiff}
      />
      <FileTreeContent
        files={files}
        tree={tree}
        searchQuery={searchQuery}
        isSearchPending={isSearchPending}
        searchGroups={searchGroups}
        activeSearchMatchId={activeSearchMatchId ?? null}
        onSelectSearchMatch={onSelectSearchMatch}
        semanticDiffAvailable={semanticDiffAvailable}
        onSelectSemanticDiff={onSelectSemanticDiff}
        isSemanticDiffActive={isSemanticDiffActive}
        onSelectAllFiles={onSelectAllFiles}
        isAllFilesActive={isAllFilesActive}
        expandedFolders={expandedFolders}
        onToggleFolder={toggleFolder}
        activeFileIndex={activeFileIndex}
        scrollHighlightIndex={scrollHighlightIndex}
        onSelectFile={onSelectFile}
        onDoubleClickFile={onDoubleClickFile}
        viewedFiles={viewedFiles}
        onToggleViewed={onToggleViewed}
        hideViewedFiles={hideViewedFiles}
        getAnnotationCount={getAnnotationCount}
        stagedFiles={stagedFiles}
        repoRoot={repoRoot}
      />
      <FileTreeFooter
        files={files}
        onCopyRawDiff={onCopyRawDiff}
        canCopyRawDiff={canCopyRawDiff}
        copyRawDiffStatus={copyRawDiffStatus}
      />
    </aside>
  );
};

function highlightQuery(text: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return text;
  const regex = new RegExp(`(${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="search-match-highlight">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

const SearchFileGroup: React.FC<{
  group: ReviewSearchFileGroup;
  searchQuery: string;
  activeSearchMatchId: string | null;
  onSelectMatch?: (matchId: string) => void;
}> = ({ group, searchQuery, activeSearchMatchId, onSelectMatch }) => {
  const [collapsed, setCollapsed] = useState(false);
  const fileName = group.filePath.split("/").pop() || group.filePath;
  const directoryPath = group.filePath.includes("/")
    ? group.filePath.slice(0, group.filePath.lastIndexOf("/"))
    : "";

  return (
    <div className="mb-1">
      <button
        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors group"
        onClick={() => setCollapsed((previous) => !previous)}
      >
        <ChevronIcon
          className={`w-3 h-3 text-muted-foreground/50 transition-transform flex-shrink-0 ${collapsed ? "" : "rotate-90"}`}
        />
        <FileIcon />
        <span className="truncate text-foreground font-medium">{fileName}</span>
        {directoryPath && (
          <span className="truncate text-muted-foreground/50 text-[10px]">{directoryPath}</span>
        )}
        <span className="ml-auto flex-shrink-0 text-[10px] text-muted-foreground/50 bg-muted rounded px-1.5 py-0.5">
          {group.matches.length}
        </span>
      </button>
      {!collapsed && (
        <div className="ml-3 border-l border-border/30 pl-2">
          {group.matches.map((match) => (
            <SearchMatchRow
              key={match.id}
              match={match}
              searchQuery={searchQuery}
              isActive={activeSearchMatchId === match.id}
              onSelect={() => onSelectMatch?.(match.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SearchMatchRow: React.FC<{
  match: ReviewSearchMatch;
  searchQuery: string;
  isActive: boolean;
  onSelect: () => void;
}> = ({ match, searchQuery, isActive, onSelect }) => {
  const sideLabel = getReviewSearchSideLabel(match.side);
  const sideColor =
    match.side === "addition"
      ? "text-success"
      : match.side === "deletion"
        ? "text-destructive"
        : "text-muted-foreground/60";

  return (
    <button
      className={`w-full text-left px-2 py-1 rounded-sm text-xs font-mono transition-colors flex items-start gap-1.5 ${
        isActive ? "bg-primary/15 text-foreground" : "hover:bg-muted/50 text-muted-foreground"
      }`}
      onClick={onSelect}
    >
      <span className="flex-shrink-0 text-muted-foreground/40 w-7 text-right tabular-nums">
        {match.lineNumber}
      </span>
      <span className={`flex-shrink-0 w-6 text-[10px] font-semibold uppercase ${sideColor}`}>
        {sideLabel}
      </span>
      <span className="truncate leading-relaxed">{highlightQuery(match.snippet, searchQuery)}</span>
    </button>
  );
};

const SearchIcon: React.FC<{ className?: string }> = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
    />
  </svg>
);

const CollapseFoldersIcon: React.FC = () => (
  <svg
    className="w-3.5 h-3.5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 2l7 6 7-6" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 22l7-6 7 6" />
  </svg>
);

const ExpandFoldersIcon: React.FC = () => (
  <svg
    className="w-3.5 h-3.5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 8l7-6 7 6" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 16l7 6 7-6" />
  </svg>
);

const HiddenEyeIcon: React.FC = () => (
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
      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
    />
  </svg>
);

const VisibleEyeIcon: React.FC = () => (
  <svg
    className="w-3.5 h-3.5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
    />
  </svg>
);

const CloseIcon: React.FC = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const AllFilesIcon: React.FC = () => (
  <svg
    className="w-3.5 h-3.5 flex-shrink-0"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m-13.5 0A2.25 2.25 0 003 12v3a2.25 2.25 0 002.25 2.25h13.5A2.25 2.25 0 0021 15v-3a2.25 2.25 0 00-2.25-2.25m-13.5 0h13.5"
    />
  </svg>
);

const CopySuccessIcon: React.FC = () => (
  <svg
    className="w-3 h-3 text-success"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const CopyErrorIcon: React.FC = () => (
  <svg
    className="w-3 h-3 text-destructive"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CopyIcon: React.FC = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
);

const ChevronIcon: React.FC<{ className: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

const FileIcon: React.FC = () => (
  <svg
    className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
    />
  </svg>
);
