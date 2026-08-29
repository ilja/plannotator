import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { type Origin } from "@plannotator/shared/agents";
import { ThemeProvider, useTheme } from "@plannotator/ui/components/ThemeProvider";
import { TooltipProvider } from "@plannotator/ui/components/Tooltip";
import { getDisplayRepo } from "@plannotator/shared/pr-types";
import type { SemanticDiffAdvert } from "@plannotator/shared/semantic-diff-types";
import { configStore, useConfigValue } from "@plannotator/ui/config";
import { loadDiffFont } from "@plannotator/ui/utils/diffFonts";
import {
  getAIProviderSettings,
  resolveAIModelForProvider,
  resolveAIProviderSelection,
  saveAIProviderSelection,
} from "@plannotator/ui/utils/aiProvider";
import { needsDiffTypeSetup } from "@plannotator/ui/utils/diffTypeSetup";
import {
  markLookAndFeelAnnouncementSeen,
  needsLookAndFeelAnnouncement,
} from "@plannotator/ui/utils/lookAndFeelAnnouncement";
import {
  CodeAnnotation,
  CodeAnnotationType,
  SelectedLineRange,
  TokenAnnotationMeta,
  ConventionalLabel,
  ConventionalDecoration,
} from "@plannotator/ui/types";
import { useResizablePanel } from "@plannotator/ui/hooks/useResizablePanel";
import { useCodeAnnotationDraft } from "@plannotator/ui/hooks/useCodeAnnotationDraft";
import { useGitAdd } from "./hooks/useGitAdd";
import { generateId } from "./utils/generateId";
import { useAIChat } from "./hooks/useAIChat";
import { toast } from "sonner";
import { useCodeNav, type CodeNavRequest } from "./hooks/useCodeNav";
import { buildPendingAIContext, type PendingAIContext } from "./utils/pendingAIContext";
import { isTypingTarget, useReviewSearch, type ReviewSearchMatch } from "./hooks/useReviewSearch";
import { useReviewNavigationShortcuts } from "./hooks/useReviewNavigationShortcuts";
import { useEditorAnnotations } from "@plannotator/ui/hooks/useEditorAnnotations";
import { useExternalAnnotations } from "@plannotator/ui/hooks/useExternalAnnotations";
import { decodeCodeAnnotation } from "@plannotator/ui/utils/annotationSchemas";
import { exportEditorAnnotations } from "@plannotator/ui/utils/parser";
import { type DockviewReadyEvent, type DockviewApi } from "dockview-react";
import type { ReviewSidebarTab } from "./components/ReviewSidebar";
import { useSidebar } from "@plannotator/ui/hooks/useSidebar";
import {
  ReviewWorkspace,
  type ReviewWorkspaceActions,
  type ReviewWorkspaceViewModel,
} from "./components/ReviewWorkspace";
import { usePRStack } from "./hooks/usePRStack";
import { useDiffFreshness } from "./hooks/useDiffFreshness";
import { usePRSession, type PRSessionUpdate } from "./hooks/usePRSession";
import { useAnnotationFactory } from "./hooks/useAnnotationFactory";
import { DEMO_DIFF } from "./demoData";
import { exportReviewFeedback } from "./utils/exportFeedback";
import { useAgentReviewActions } from "./hooks/useAgentReviewActions";
import { useReviewSubmissionShortcut } from "./hooks/useReviewSubmissionShortcut";
import { parseDiffToFiles } from "./utils/diffParser";
import {
  decodeDiffSwitchResponse,
  loadInitialDiffResponse,
  type InitialDiffResponse,
} from "./utils/initial-diff-response";
import { loadReviewAICapabilitiesState } from "./utils/ai-capabilities-response";
import { ReviewStateProvider, type ReviewState } from "./dock/ReviewStateContext";
import {
  ReviewDialogs,
  type ReviewDialogsActions,
  type ReviewDialogsModel,
} from "./components/ReviewDialogs";
import {
  ReviewOverlays,
  type ReviewOverlaysActions,
  type ReviewOverlaysModel,
  type ReviewSubmissionStatus,
} from "./components/ReviewOverlays";
import { usePRContext } from "./hooks/usePRContext";
import {
  REVIEW_PANEL_TYPES,
  REVIEW_DIFF_PANEL_ID,
  getReviewDiffPanelFilePath,
  isReviewDiffPanelId,
  REVIEW_PR_SUMMARY_PANEL_ID,
  REVIEW_PR_COMMENTS_PANEL_ID,
  REVIEW_PR_CHECKS_PANEL_ID,
  REVIEW_SEMANTIC_DIFF_PANEL_ID,
  REVIEW_ALL_FILES_PANEL_ID,
  REVIEW_CODE_NAV_PANEL_ID,
} from "./dock/reviewPanelTypes";
import type { DiffFile, AnnotationScrollTarget } from "./types";
import { annotationMatchesPrScope } from "./utils/annotationScope";
import type { DiffOption, GitContext } from "@plannotator/shared/types";
import type { PRDiffScope, PRDiffScopeOption, PRStackInfo } from "@plannotator/shared/pr-stack";
import { usePlatformReviewActions } from "./hooks/usePlatformReviewActions";

declare const __APP_VERSION__: string;

interface DiffData {
  files: DiffFile[];
  rawPatch: string;
  gitRef: string;
  origin?: Origin;
  diffType?: string;
  gitContext?: GitContext;
  diffOptions?: DiffOption[];
  _sharingEnabled?: boolean;
  prStackInfo?: PRStackInfo | null;
  prDiffScope?: PRDiffScope;
  prDiffScopeOptions?: PRDiffScopeOption[];
  semanticDiff?: SemanticDiffAdvert;
}

function getFileTabTitle(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

interface DiffSwitchRequest {
  diffType: string;
  base?: string;
  hideWhitespace: boolean;
}

function buildDiffSwitchRequest(
  diffType: string,
  baseOverride: string | undefined,
  selectedBase: string | null,
  hideWhitespace: boolean,
): DiffSwitchRequest {
  const base = baseOverride ?? selectedBase;
  return {
    diffType,
    ...(base && { base }),
    hideWhitespace,
  };
}

const ReviewApp: React.FC = () => {
  const { resolvedMode } = useTheme();
  const [diffData, setDiffData] = useState<DiffData | null>(null);
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [annotations, setAnnotations] = useState<CodeAnnotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  // Sidebar-initiated "scroll to this comment" signal. The token bumps on every
  // sidebar click so re-selecting the same comment re-navigates. Selecting a
  // comment in the diff sets selectedAnnotationId but NOT this — so it never
  // moves the viewport.
  const [scrollTargetAnnotation, setScrollTargetAnnotation] =
    useState<AnnotationScrollTarget | null>(null);
  const [isAllFilesActive, setIsAllFilesActive] = useState(false);
  // Mirror ref: handlers captured by Pierre slot portals (which only republish
  // on item version bumps) and early-declared callbacks read the CURRENT value
  // at call time instead of a stale closure capture.
  const isAllFilesActiveRef = useRef(isAllFilesActive);
  isAllFilesActiveRef.current = isAllFilesActive;
  const [isSemanticDiffActive, setIsSemanticDiffActive] = useState(false);
  const [semanticDiffAvailable, setSemanticDiffAvailable] = useState(false);
  const [isDiffPanelActive, setIsDiffPanelActive] = useState(false);
  const [allFilesVisibleFile, setAllFilesVisibleFile] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<SelectedLineRange | null>(null);
  const [pendingAIContext, setPendingAIContext] = useState<PendingAIContext | null>(null);
  const [aiComposerFocusToken, setAIComposerFocusToken] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showWorktreeDialog, setShowWorktreeDialog] = useState(false);
  const [openSettingsMenu, setOpenSettingsMenu] = useState(false);
  const [showNoAnnotationsDialog, setShowNoAnnotationsDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const diffStyle = useConfigValue("diffStyle");
  const diffOverflow = useConfigValue("diffOverflow");
  const diffIndicators = useConfigValue("diffIndicators");
  const diffLineDiffType = useConfigValue("diffLineDiffType");
  const diffShowLineNumbers = useConfigValue("diffShowLineNumbers");
  const diffShowBackground = useConfigValue("diffShowBackground");
  const diffHideWhitespace = useConfigValue("diffHideWhitespace");
  const diffExpandUnchanged = useConfigValue("diffExpandUnchanged");
  const diffFontFamily = useConfigValue("diffFontFamily");
  const diffFontSize = useConfigValue("diffFontSize");
  const diffTabSize = useConfigValue("diffTabSize");
  // Global plan-look preference; surfaced here only by the shared 0.20.0
  // look-and-feel announcement (the grid/clean chooser applies to plan review).
  const gridEnabled = useConfigValue("gridEnabled");

  // Load custom diff font and override --font-mono for surrounding review elements
  useEffect(() => {
    if (diffFontFamily) {
      loadDiffFont(diffFontFamily);
      document.documentElement.style.setProperty(
        "--diff-font-override",
        `'${diffFontFamily}', monospace`,
      );
    } else {
      document.documentElement.style.removeProperty("--diff-font-override");
    }
    if (diffFontSize) {
      document.documentElement.style.setProperty("--diff-font-size-override", diffFontSize);
    } else {
      document.documentElement.style.removeProperty("--diff-font-size-override");
    }
    document.documentElement.style.setProperty("--diffs-tab-size", String(diffTabSize));
  }, [diffFontFamily, diffFontSize, diffTabSize]);

  const reviewSidebar = useSidebar<ReviewSidebarTab>(true, "annotations");
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(true);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [copyRawDiffStatus, setCopyRawDiffStatus] = useState<"idle" | "success" | "error">("idle");
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(new Set());
  const [hideViewedFiles, setHideViewedFiles] = useState(false);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [gitUser, setGitUser] = useState<string | undefined>();
  const [reviewMode, setReviewMode] = useState<string | null>(null);
  const [diffType, setDiffType] = useState<string>("uncommitted");
  const [gitContext, setGitContext] = useState<GitContext | null>(null);
  const [workspaceDiffOptions, setWorkspaceDiffOptions] = useState<DiffOption[] | null>(null);
  // Two bases:
  //   selectedBase  — what the picker is currently showing (UI intent).
  //                   Updates immediately when the user picks, so the chip
  //                   feels responsive.
  //   committedBase — the base the server last computed the patch against.
  //                   Drives file-content fetches. Only updates after
  //                   /api/diff/switch returns, so we never pair an old
  //                   patch with a new base's file contents (race that
  //                   produced "trailing context mismatch" warnings).
  const [selectedBase, setSelectedBase] = useState<string | null>(null);
  const [committedBase, setCommittedBase] = useState<string | null>(null);
  const [agentCwd, setAgentCwd] = useState<string | null>(null);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<ReviewSubmissionStatus>(false);
  const [showApproveWarning, setShowApproveWarning] = useState(false);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [_sharingEnabled, setSharingEnabled] = useState(true);
  const [repoInfo, setRepoInfo] = useState<{ display: string; branch?: string } | null>(null);

  useEffect(() => {
    document.title = repoInfo ? `${repoInfo.display} · Code Review` : "Code Review";
  }, [repoInfo]);

  const {
    prMetadata,
    prStackInfo,
    prStackTree,
    prDiffScope,
    prDiffScopeOptions,
    prPatchIncomplete,
    prPatchUpgradeAvailable,
    updatePRSession,
  } = usePRSession();
  const { withPRContext } = useAnnotationFactory(prMetadata, prStackInfo ? prDiffScope : undefined);

  const prStackCallbacksRef = useRef<import("./hooks/usePRStack").PRStackCallbacks | null>(null);
  const {
    isSwitchingPRScope,
    isLoadingFullDiff,
    handleScopeSelect: handlePRDiffScopeSelect,
    handleLoadFullDiff,
    handlePRSwitch,
  } = usePRStack(prStackCallbacksRef);
  const prNumberLabel = prMetadata ? `#${prMetadata.number}` : "";
  const displayRepo = prMetadata ? getDisplayRepo(prMetadata) : "";
  const appVersion = __APP_VERSION__;

  const identity = useConfigValue("displayName");

  const _clearPendingSelection = useCallback(() => {
    setPendingSelection(null);
  }, []);

  // VS Code editor annotations (only polls when inside VS Code webview)
  const { editorAnnotations, deleteEditorAnnotation } = useEditorAnnotations();

  // External annotations (SSE-based, for any external tool)
  // TODO: Replace !!origin with a dedicated isApiMode boolean (set on /api/diff success/failure).
  // origin is an identity field, not a connectivity signal — the standalone dev server
  // (apps/review/) doesn't set it, so external annotations are silently disabled there.
  // The same !!origin proxy is used elsewhere in this file (draft hook, feedback guard, conditional UI)
  // so this should be addressed as a broader refactor.
  const { externalAnnotations, updateExternalAnnotation, deleteExternalAnnotation } =
    useExternalAnnotations(decodeCodeAnnotation, { enabled: !!origin });
  // Dockview center panel API for the review workspace.
  const [dockApi, setDockApi] = useState<DockviewApi | null>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  const needsInitialDiffPanel = useRef(true);
  const semanticDiffAutoFallbackPending = useRef(false);

  // PR context (lifted from sidebar so center dock PR panels can access it)
  const {
    prContext,
    isLoading: isPRContextLoading,
    error: prContextError,
    fetchContext: fetchPRContext,
  } = usePRContext(prMetadata ?? null);

  // Sync activeFileIndex from dockview's active panel (wired in handleDockReady)

  const openDiffFile = useCallback(
    (filePath: string) => {
      const file = files.find((candidate) => candidate.path === filePath);
      if (!file) return;
      semanticDiffAutoFallbackPending.current = false;

      if (!dockApi) {
        const fileIndex = files.findIndex((candidate) => candidate.path === filePath);
        if (fileIndex !== -1) {
          setActiveFileIndex(fileIndex);
        }
        return;
      }

      const existing = dockApi.getPanel(REVIEW_DIFF_PANEL_ID);
      if (existing) {
        const existingFilePath = getReviewDiffPanelFilePath(existing.params);
        if (existingFilePath === filePath) {
          if (dockApi.activePanel?.id !== REVIEW_DIFF_PANEL_ID) {
            existing.api.setActive();
          }
          const fileIndex = files.findIndex((candidate) => candidate.path === filePath);
          if (fileIndex !== -1) {
            setActiveFileIndex(fileIndex);
          }
          needsInitialDiffPanel.current = false;
          return;
        }

        setPendingSelection(null);
        existing.api.updateParameters({ filePath });
        existing.api.setTitle(getFileTabTitle(file.path));
        existing.api.setActive();
      } else {
        setPendingSelection(null);
        dockApi.addPanel({
          id: REVIEW_DIFF_PANEL_ID,
          component: REVIEW_PANEL_TYPES.DIFF,
          title: getFileTabTitle(file.path),
          params: { filePath },
        });
      }

      setActiveFileIndex(files.findIndex((candidate) => candidate.path === filePath));
      needsInitialDiffPanel.current = false;
    },
    [dockApi, files],
  );

  const handleRevealSearchMatch = useCallback(
    (match: ReviewSearchMatch) => {
      // Respect the surface the user is in. When the all-files panel is active,
      // reveal IN PLACE — AllFilesCodeView scrolls to + highlights the active
      // match via the activeSearchMatch prop. When a single-file panel is active
      // (or there's no dock yet), open the match's file there instead (legacy
      // behavior). Unconditionally activating the all-files panel here would
      // teleport the user out of their tab just for typing a query (reveal also
      // fires on first-match auto-activation, not only on explicit clicks).
      if (dockApi && isAllFilesActiveRef.current) {
        return;
      }
      openDiffFile(match.filePath);
    },
    [dockApi, openDiffFile],
  );

  const {
    searchQuery,
    debouncedSearchQuery,
    isSearchPending,
    isSearchOpen,
    activeSearchMatchId,
    activeSearchMatch,
    activeFileSearchMatches,
    searchMatches,
    searchGroups,
    searchInputRef,
    openSearch,
    closeSearch,
    clearSearch,
    stepSearchMatch,
    handleSearchInputChange,
    handleSelectSearchMatch,
  } = useReviewSearch({
    files,
    activeFilePath: files[activeFileIndex]?.path ?? null,
    onRevealMatch: handleRevealSearchMatch,
  });

  const hasSearchableFiles = files.length > 0;
  const shouldShowFileTree =
    hasSearchableFiles ||
    (reviewMode === "workspace" && !!workspaceDiffOptions?.length) ||
    !!gitContext?.diffOptions?.length ||
    !!gitContext?.worktrees?.length;

  // Merge local + SSE annotations, deduping draft-restored externals against
  // live SSE versions. Prefer the SSE version when both exist (same source,
  // type, and originalText). This avoids the timing issues of an effect-based
  // cleanup — draft-restored externals persist until SSE actually re-delivers them.
  const allAnnotations = useMemo(() => {
    if (externalAnnotations.length === 0) return annotations;

    const local = annotations.filter((a) => {
      if (!a.source) return true;
      return !externalAnnotations.some(
        (ext) =>
          ext.source === a.source &&
          ext.type === a.type &&
          ext.filePath === a.filePath &&
          ext.lineStart === a.lineStart &&
          ext.lineEnd === a.lineEnd &&
          ext.side === a.side,
      );
    });

    return [...local, ...externalAnnotations];
  }, [annotations, externalAnnotations]);
  const allAnnotationsRef = useRef(allAnnotations);
  allAnnotationsRef.current = allAnnotations;

  const {
    reviewDestination,
    selectReviewDestination,
    showDestinationMenu,
    setShowDestinationMenu,
    isPlatformActioning,
    platformActionError,
    platformUser,
    setPlatformUser,
    platformCommentDialog,
    platformGeneralComment,
    setPlatformGeneralComment,
    platformOpenPR,
    setPlatformOpenPR,
    platformMode,
    openPlatformDialog,
    closePlatformDialog,
    submitPlatformAction,
  } = usePlatformReviewActions({
    allAnnotations,
    editorAnnotations,
    files,
    prMetadata,
    onSubmitted: setSubmitted,
  });

  // Auto-save code annotation drafts
  const { draftBanner, restoreDraft, getDraftGeneration, dismissDraft } = useCodeAnnotationDraft({
    annotations: allAnnotations,
    viewedFiles,
    isApiMode: !!origin,
    submitted: !!submitted,
  });

  const handleRestoreDraft = useCallback(() => {
    const restored = restoreDraft();
    if (restored.annotations.length > 0) setAnnotations(restored.annotations);
    if (restored.viewedFiles.length > 0) setViewedFiles(new Set(restored.viewedFiles));
  }, [restoreDraft]);

  // AI Chat
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiProviders, setAiProviders] = useState<
    Array<{
      id: string;
      name: string;
      capabilities: Record<string, boolean>;
      models?: Array<{ id: string; label: string; default?: boolean }>;
    }>
  >([]);
  const [aiDefaultProvider, setAiDefaultProvider] = useState<string | null>(null);
  interface AiConfigState {
    providerId: string | null;
    model: string | null;
    reasoningEffort: string | null;
  }

  const [aiConfig, setAiConfig] = useState(() => {
    const saved = getAIProviderSettings();
    const pid = saved.providerId;
    const config: AiConfigState = {
      providerId: pid,
      model: pid ? (saved.preferredModels[pid] ?? null) : null,
      reasoningEffort: null,
    };
    return config;
  });
  const [showDiffTypeSetup, setShowDiffTypeSetup] = useState(false);
  const [diffTypeSetupPending, setDiffTypeSetupPending] = useState(false);
  // The 0.20.0 release / look-and-feel announcement also runs in code review.
  // Seen-state is a shared cookie (host-scoped), so dismissing it in either app
  // suppresses it in the other — it appears once across both.
  const [showLookAndFeel, setShowLookAndFeel] = useState(needsLookAndFeelAnnouncement);
  const dismissLookAndFeel = useCallback(() => {
    markLookAndFeelAnnouncementSeen();
    setShowLookAndFeel(false);
  }, []);
  const aiChat = useAIChat({
    patch: diffData?.rawPatch ?? "",
    providerId: aiConfig.providerId,
    model: aiConfig.model,
    reasoningEffort: aiConfig.reasoningEffort,
  });
  const {
    messages: aiMessages,
    isCreatingSession: aiIsCreatingSession,
    isStreaming: aiIsStreaming,
    permissionRequests: aiPermissionRequests,
    respondToPermission: respondToAIPermission,
    ask: askAI,
    resetSession: resetAISession,
    sessionId: aiSessionId,
  } = aiChat;

  const codeNav = useCodeNav();

  const handleCodeNavRequest = useCallback(
    (request: CodeNavRequest) => {
      if (!gitContext && !agentCwd) {
        toast("Code navigation requires a local checkout", {
          description: "Re-run with --local for PR reviews",
          duration: 4000,
        });
        return;
      }
      codeNav.resolve(request);
      if (!dockApi) return;
      const existing = dockApi.getPanel(REVIEW_CODE_NAV_PANEL_ID);
      if (existing) {
        existing.api.setTitle(`References: ${request.symbol}`);
        existing.api.setActive();
      } else {
        const refPanel = isSemanticDiffActive
          ? REVIEW_SEMANTIC_DIFF_PANEL_ID
          : isAllFilesActive
            ? REVIEW_ALL_FILES_PANEL_ID
            : REVIEW_DIFF_PANEL_ID;
        dockApi.addPanel({
          id: REVIEW_CODE_NAV_PANEL_ID,
          component: REVIEW_PANEL_TYPES.CODE_NAV,
          title: `References: ${request.symbol}`,
          position: { direction: "below", referencePanel: refPanel },
          initialHeight: 250,
        });
      }
    },
    [codeNav.resolve, dockApi, isAllFilesActive, isSemanticDiffActive, gitContext, agentCwd],
  );

  // Check AI capabilities on mount
  useEffect(() => {
    fetch("/api/ai/capabilities")
      .then(loadReviewAICapabilitiesState)
      .then((state) => {
        if (!state) return;
        setAiAvailable(state.available);
        setAiProviders(state.providers);
        setAiDefaultProvider(state.defaultProvider);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!aiAvailable || aiProviders.length === 0) return;
    setAiConfig((prev) => {
      const saved = getAIProviderSettings();
      const selection = resolveAIProviderSelection({
        providers: aiProviders,
        origin,
        settings: saved,
        serverDefaultProvider: aiDefaultProvider,
      });

      if (prev.providerId === selection.providerId && prev.model === selection.model) return prev;

      return { ...prev, providerId: selection.providerId, model: selection.model };
    });
  }, [aiAvailable, aiProviders, aiDefaultProvider, origin]);

  const handleAIConfigChange = useCallback(
    (config: {
      providerId?: string | null;
      model?: string | null;
      reasoningEffort?: string | null;
    }) => {
      setAiConfig((prev) => {
        const saved = getAIProviderSettings();
        const providerId = config.providerId !== undefined ? config.providerId : prev.providerId;
        const providerChanged =
          config.providerId !== undefined && config.providerId !== prev.providerId;
        const provider = aiProviders.find((p) => p.id === providerId) ?? null;
        const model = providerChanged
          ? config.model !== undefined
            ? config.model
            : resolveAIModelForProvider(provider, saved.preferredModels)
          : config.model !== undefined
            ? config.model
            : prev.model;
        const next = { ...prev, ...config, providerId, model };
        saveAIProviderSelection({
          providerId: next.providerId,
          model: next.model,
          origin,
          settings: saved,
        });
        return next;
      });
      resetAISession();
    },
    [aiProviders, origin, resetAISession],
  );

  const handleAttachAIContextForFile = useCallback(
    (filePath: string, lineNumber: number, side: "additions" | "deletions") => {
      const file = files.find((candidate) => candidate.path === filePath);
      if (!file) return;

      setPendingAIContext(buildPendingAIContext(file, lineNumber, side));
      setAIComposerFocusToken((token) => token + 1);
      reviewSidebar.open("ai");
    },
    [files, reviewSidebar.open],
  );

  const handleScrollToAILines = useCallback(
    (filePath: string, lineStart: number, lineEnd: number, side: "old" | "new") => {
      openDiffFile(filePath);
      // Set a selection to highlight the lines
      setPendingSelection({
        start: lineStart,
        end: lineEnd,
        side: side === "new" ? "additions" : "deletions",
      });
    },
    [openDiffFile],
  );

  // Click AI marker in diff → scroll sidebar to that Q&A
  const [scrollToQuestionId, setScrollToQuestionId] = useState<string | null>(null);
  const handleClickAIMarker = useCallback((questionId: string) => {
    setScrollToQuestionId(questionId);
    reviewSidebar.open("ai");
    // Clear after a tick so it can re-trigger for the same question
    setTimeout(() => setScrollToQuestionId(null), 500);
  }, []);

  const handleAskChat = useCallback(
    (question: string) => {
      void askAI(
        pendingAIContext ? { prompt: question, ...pendingAIContext } : { prompt: question },
      );
      setPendingAIContext(null);
    },
    [askAI, pendingAIContext],
  );

  const handleRemovePendingAIContext = useCallback(() => {
    setPendingAIContext(null);
  }, []);

  // Resizable panels
  const panelResize = useResizablePanel({
    storageKey: "plannotator-review-panel-width",
    onSnapClose: () => reviewSidebar.close(),
  });
  const fileTreeResize = useResizablePanel({
    storageKey: "plannotator-filetree-width",
    defaultWidth: 256,
    minWidth: 160,
    maxWidth: 400,
    side: "left",
    onSnapClose: () => setIsFileTreeOpen(false),
  });
  const isResizing = panelResize.isDragging || fileTreeResize.isDragging;

  // Dockview ready handler — stores API and wires active panel tracking.
  // Initial panel creation happens in the effect below once dockApi is set.
  const handleDockReady = useCallback((event: DockviewReadyEvent) => {
    setDockApi(event.api);

    // Sync activeFileIndex when user switches between dock tabs
    event.api.onDidActivePanelChange((panel) => {
      if (!panel) {
        setIsAllFilesActive(false);
        setIsSemanticDiffActive(false);
        setIsDiffPanelActive(false);
        return;
      }
      setIsAllFilesActive(panel.id === REVIEW_ALL_FILES_PANEL_ID);
      setIsSemanticDiffActive(panel.id === REVIEW_SEMANTIC_DIFF_PANEL_ID);
      setIsDiffPanelActive(isReviewDiffPanelId(panel.id));
      if (!isReviewDiffPanelId(panel.id)) return;
      const filePath = getReviewDiffPanelFilePath(panel.params);
      if (!filePath) return;
      const fileIndex = filesRef.current.findIndex((file) => file.path === filePath);
      if (fileIndex !== -1) {
        setActiveFileIndex(fileIndex);
      }
    });

    // Hide Dockview chrome only for the dedicated single diff tab.
    // Any lone non-diff panel still needs a visible header so it can be
    // dragged, closed, and used as a way back out of the dock.
    const updateHeaders = () => {
      const lonePanel =
        event.api.totalPanels === 1 && event.api.groups.length === 1
          ? event.api.groups[0]?.panels[0]
          : undefined;
      const hideHeaders =
        lonePanel?.id === REVIEW_DIFF_PANEL_ID ||
        lonePanel?.id === REVIEW_SEMANTIC_DIFF_PANEL_ID ||
        lonePanel?.id === REVIEW_ALL_FILES_PANEL_ID;
      for (const group of event.api.groups) {
        group.header.hidden = hideHeaders;
      }
    };
    event.api.onDidAddPanel(updateHeaders);
    event.api.onDidRemovePanel(updateHeaders);
    event.api.onDidAddGroup(updateHeaders);
    event.api.onDidRemoveGroup(updateHeaders);
    event.api.onDidMovePanel(updateHeaders);
    event.api.onDidLayoutChange(updateHeaders);
    updateHeaders();
  }, []);

  // Open PR panel as center dock panel
  const handleOpenPRPanel = useCallback(
    (type: "summary" | "comments" | "checks") => {
      const api = dockApi;
      if (!api) return;
      const config = {
        summary: {
          id: REVIEW_PR_SUMMARY_PANEL_ID,
          component: REVIEW_PANEL_TYPES.PR_SUMMARY,
          title: "PR Summary",
        },
        comments: {
          id: REVIEW_PR_COMMENTS_PANEL_ID,
          component: REVIEW_PANEL_TYPES.PR_COMMENTS,
          title: "PR Comments",
        },
        checks: {
          id: REVIEW_PR_CHECKS_PANEL_ID,
          component: REVIEW_PANEL_TYPES.PR_CHECKS,
          title: "PR Checks",
        },
      }[type];
      const existing = api.getPanel(config.id);
      if (existing) {
        existing.api.setActive();
        return;
      }
      api.addPanel({
        id: config.id,
        component: config.component,
        title: config.title,
      });
    },
    [dockApi],
  );

  const openAllFilesPanel = useCallback(() => {
    if (!dockApi) return;
    semanticDiffAutoFallbackPending.current = false;
    const existing = dockApi.getPanel(REVIEW_ALL_FILES_PANEL_ID);
    if (existing) {
      existing.api.setActive();
      return;
    }
    dockApi.addPanel({
      id: REVIEW_ALL_FILES_PANEL_ID,
      component: REVIEW_PANEL_TYPES.ALL_FILES,
      title: "All files",
    });
  }, [dockApi]);

  const openSemanticDiffPanel = useCallback(
    (options?: { autoFallbackOnError?: boolean }) => {
      if (!dockApi) return;
      semanticDiffAutoFallbackPending.current = options?.autoFallbackOnError === true;
      if (!semanticDiffAvailable) {
        openAllFilesPanel();
        return;
      }
      const existing = dockApi.getPanel(REVIEW_SEMANTIC_DIFF_PANEL_ID);
      if (existing) {
        existing.api.setActive();
        return;
      }
      dockApi.addPanel({
        id: REVIEW_SEMANTIC_DIFF_PANEL_ID,
        component: REVIEW_PANEL_TYPES.SEMANTIC_DIFF,
        title: "Semantic diff",
      });
    },
    [dockApi, openAllFilesPanel, semanticDiffAvailable],
  );

  const handleSemanticDiffUnavailable = useCallback(() => {
    semanticDiffAutoFallbackPending.current = false;
    setSemanticDiffAvailable(false);
    dockApi?.getPanel(REVIEW_SEMANTIC_DIFF_PANEL_ID)?.api.close();
    openAllFilesPanel();
  }, [dockApi, openAllFilesPanel]);

  const handleSemanticDiffLoadSuccess = useCallback(() => {
    semanticDiffAutoFallbackPending.current = false;
  }, []);

  const handleSemanticDiffLoadError = useCallback(() => {
    if (!semanticDiffAutoFallbackPending.current) return false;
    if (dockApi?.activePanel?.id !== REVIEW_SEMANTIC_DIFF_PANEL_ID) {
      // The user has already moved on; don't steal focus by auto-opening All files.
      semanticDiffAutoFallbackPending.current = false;
      return false;
    }
    semanticDiffAutoFallbackPending.current = false;
    dockApi?.getPanel(REVIEW_SEMANTIC_DIFF_PANEL_ID)?.api.close();
    openAllFilesPanel();
    return true;
  }, [dockApi, openAllFilesPanel]);

  const applySemanticDiffAdvert = useCallback(
    (semanticDiff?: SemanticDiffAdvert) => {
      if (!semanticDiff) return;
      const available = semanticDiff.available === true;
      setSemanticDiffAvailable(available);
      if (!available) {
        semanticDiffAutoFallbackPending.current = false;
        dockApi?.getPanel(REVIEW_SEMANTIC_DIFF_PANEL_ID)?.api.close();
        if (isSemanticDiffActive) openAllFilesPanel();
      }
    },
    [dockApi, isSemanticDiffActive, openAllFilesPanel],
  );

  // Open the All files overview on first load. Semantic diff stays available via
  // the file-tree nav entry, but it's no longer the default landing view.
  useEffect(() => {
    if (!dockApi || !needsInitialDiffPanel.current || files.length === 0) return;
    needsInitialDiffPanel.current = false;
    openAllFilesPanel();
  }, [dockApi, files, openAllFilesPanel]);

  // Global keyboard shortcuts
  useReviewNavigationShortcuts({
    hasSearchableFiles,
    isSearchPending,
    searchMatches,
    showDestinationMenu,
    showExportModal,
    isSearchOpen,
    searchQuery,
    openSearch,
    stepSearchMatch,
    clearSearch,
    closeSearch,
    isFileTreeOpen,
    setIsFileTreeOpen,
    setShowDestinationMenu,
    setShowExportModal,
    isSidebarOpen: reviewSidebar.isOpen,
    openSidebar: reviewSidebar.open,
    closeSidebar: reviewSidebar.close,
  });

  const initializeInitialPRSession = (data: InitialDiffResponse): void => {
    updatePRSession({
      ...(data.prMetadata && { prMetadata: data.prMetadata }),
      ...(data.prStackInfo !== undefined && { prStackInfo: data.prStackInfo }),
      ...(data.prStackTree !== undefined && { prStackTree: data.prStackTree }),
      ...(data.prDiffScope && { prDiffScope: data.prDiffScope }),
      ...(data.prDiffScopeOptions && { prDiffScopeOptions: data.prDiffScopeOptions }),
      ...(data.prMetadata && {
        prPatchIncomplete: data.prPatchIncomplete === true,
        prPatchUpgradeAvailable: data.prPatchUpgradeAvailable === true,
      }),
    });
  };

  const initializeInitialGitContext = (data: InitialDiffResponse): void => {
    if (!data.gitContext) return;
    setGitContext(data.gitContext);
    const initial =
      data.base || data.gitContext.defaultBranch || data.gitContext.compareTarget?.fallback || null;
    setSelectedBase(initial);
    setCommittedBase(initial);
  };

  const scheduleDiffTypeSetup = (data: InitialDiffResponse): void => {
    if (
      data.diffType &&
      data.mode !== "workspace" &&
      !data.prMetadata &&
      data.gitContext &&
      data.gitContext.vcsType !== "p4" &&
      data.gitContext.vcsType !== "jj" &&
      needsDiffTypeSetup()
    ) {
      setDiffTypeSetupPending(true);
    }
  };

  // Load diff content - try API first, fall back to demo
  useEffect(() => {
    const fallbackToDemo = () => {
      const demoFiles = parseDiffToFiles(DEMO_DIFF);
      setDiffData({
        files: demoFiles,
        rawPatch: DEMO_DIFF,
        gitRef: "demo",
      });
      setFiles(demoFiles);
      setWorkspaceDiffOptions(null);
      setSemanticDiffAvailable(false);
    };

    fetch("/api/diff")
      .then((res) => {
        if (!res.ok) throw new Error("Not in API mode");
        return loadInitialDiffResponse(() => res.json());
      })
      .then((result) => {
        if (result.source === "demo") {
          fallbackToDemo();
          return;
        }

        const data = result.data;
        // Initialize config store with server-provided values (config file > cookie > default)
        configStore.init(data.serverConfig);
        // gitUser drives the "Use git name" button in Settings; stays undefined (button hidden) when unavailable
        setGitUser(data.serverConfig?.gitUser);
        const apiFiles = parseDiffToFiles(data.rawPatch);
        setDiffData({
          files: apiFiles,
          rawPatch: data.rawPatch,
          gitRef: data.gitRef,
          origin: data.origin,
          diffType: data.diffType,
          gitContext: data.gitContext,
          diffOptions: data.diffOptions,
          sharingEnabled: data.sharingEnabled,
        });
        setFiles(apiFiles);
        setReviewMode(data.mode ?? null);
        setWorkspaceDiffOptions(data.mode === "workspace" ? (data.diffOptions ?? []) : null);
        if (data.origin) setOrigin(data.origin);
        if (data.diffType) setDiffType(data.diffType);
        initializeInitialGitContext(data);
        if (data.agentCwd !== undefined) setAgentCwd(data.agentCwd);
        if (data.sharingEnabled !== undefined) setSharingEnabled(data.sharingEnabled);
        if (data.repoInfo) setRepoInfo(data.repoInfo);
        initializeInitialPRSession(data);
        if (data.platformUser) setPlatformUser(data.platformUser);
        // Initialize viewed files from GitHub's state (set before draft restore so draft takes precedence)
        if (data.viewedFiles && data.viewedFiles.length > 0) {
          setViewedFiles(new Set(data.viewedFiles));
        }
        if (data.error) setDiffError(data.error);
        setSemanticDiffAvailable(data.semanticDiff?.available === true);
        // Mark diff type setup as pending on first run (local mode only)
        scheduleDiffTypeSetup(data);
      })
      .catch(fallbackToDemo)
      .finally(() => setIsLoading(false));
  }, []);

  // Show diff type setup after the initial diff payload marks it pending.
  useEffect(() => {
    if (diffTypeSetupPending) {
      setDiffTypeSetupPending(false);
      setShowDiffTypeSetup(true);
    }
  }, [diffTypeSetupPending]);

  const handleDiffStyleChange = useCallback((style: "split" | "unified") => {
    configStore.set("diffStyle", style);
  }, []);

  // Handle line selection from diff viewer
  const handleLineSelection = useCallback((range: SelectedLineRange | null) => {
    setPendingSelection(range);
  }, []);

  const handleAddAnnotationForFile = useCallback(
    (
      filePath: string,
      type: CodeAnnotationType,
      text?: string,
      suggestedCode?: string,
      originalCode?: string,
      conventionalLabel?: ConventionalLabel,
      decorations?: ConventionalDecoration[],
      tokenMeta?: TokenAnnotationMeta,
    ) => {
      if (!pendingSelection) return;
      const lineStart = Math.min(pendingSelection.start, pendingSelection.end);
      const lineEnd = Math.max(pendingSelection.start, pendingSelection.end);
      const newAnnotation: CodeAnnotation = {
        id: generateId(),
        type,
        scope: "line",
        filePath,
        lineStart,
        lineEnd,
        side: pendingSelection.side === "additions" ? "new" : "old",
        text,
        suggestedCode,
        originalCode,
        ...(tokenMeta && {
          charStart: tokenMeta.charStart,
          charEnd: tokenMeta.charEnd,
          tokenText: tokenMeta.tokenText,
        }),
        createdAt: Date.now(),
        author: identity,
        conventionalLabel,
        decorations,
      };
      setAnnotations((prev) => [...prev, withPRContext(newAnnotation)]);
      setPendingSelection(null);
    },
    [pendingSelection, identity, withPRContext],
  );

  const handleAddAnnotation = useCallback(
    (
      type: CodeAnnotationType,
      text?: string,
      suggestedCode?: string,
      originalCode?: string,
      conventionalLabel?: ConventionalLabel,
      decorations?: ConventionalDecoration[],
      tokenMeta?: TokenAnnotationMeta,
    ) => {
      if (!files[activeFileIndex]) return;
      handleAddAnnotationForFile(
        files[activeFileIndex].path,
        type,
        text,
        suggestedCode,
        originalCode,
        conventionalLabel,
        decorations,
        tokenMeta,
      );
    },
    [files, activeFileIndex, handleAddAnnotationForFile],
  );

  const handleAddFileComment = useCallback(
    (text: string) => {
      const activeFile = files[activeFileIndex];
      const trimmed = text.trim();
      if (!activeFile || !trimmed) return;

      const newAnnotation: CodeAnnotation = {
        id: generateId(),
        type: "comment",
        scope: "file",
        filePath: activeFile.path,
        lineStart: 1,
        lineEnd: 1,
        side: "new",
        text: trimmed,
        createdAt: Date.now(),
        author: identity,
      };

      setAnnotations((prev) => [...prev, withPRContext(newAnnotation)]);
    },
    [files, activeFileIndex, identity, withPRContext],
  );

  const handleAddFileCommentForFile = useCallback(
    (filePath: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const newAnnotation: CodeAnnotation = {
        id: generateId(),
        type: "comment",
        scope: "file",
        filePath,
        lineStart: 1,
        lineEnd: 1,
        side: "new",
        text: trimmed,
        createdAt: Date.now(),
        author: identity,
      };

      setAnnotations((prev) => [...prev, withPRContext(newAnnotation)]);
    },
    [identity, withPRContext],
  );

  // Edit annotation
  const handleEditAnnotation = useCallback(
    (
      id: string,
      text?: string,
      suggestedCode?: string,
      originalCode?: string,
      conventionalLabel?: ConventionalLabel | null,
      decorations?: ConventionalDecoration[],
    ) => {
      const ann = allAnnotationsRef.current.find((a) => a.id === id);
      const updates: Partial<CodeAnnotation> = {
        ...(text !== undefined && { text }),
        ...(suggestedCode !== undefined && { suggestedCode }),
        ...(originalCode !== undefined && { originalCode }),
        // null clears the label; undefined means "not provided, keep existing"
        ...(conventionalLabel !== undefined && {
          conventionalLabel: conventionalLabel ?? undefined,
        }),
        ...(decorations !== undefined && { decorations }),
      };
      if (ann?.source && externalAnnotations.some((e) => e.id === id)) {
        updateExternalAnnotation(id, updates);
        return;
      }
      setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
    },
    [updateExternalAnnotation, externalAnnotations],
  );

  // selectedAnnotationId is cleared via a functional update (not a captured
  // value): this handler is captured by Pierre slot portals (inline annotation
  // delete buttons) that only republish on item version bumps — a closure over
  // the state value goes stale and would leave a dangling selection id after
  // deleting the currently-selected annotation.
  const handleDeleteAnnotation = useCallback(
    (id: string) => {
      const ann = allAnnotationsRef.current.find((a) => a.id === id);
      if (ann?.source && externalAnnotations.some((e) => e.id === id)) {
        deleteExternalAnnotation(id);
        setSelectedAnnotationId((prev) => (prev === id ? null : prev));
        return;
      }
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
      setSelectedAnnotationId((prev) => (prev === id ? null : prev));
    },
    [deleteExternalAnnotation, externalAnnotations],
  );

  // Handle identity change - update author on existing annotations
  const handleIdentityChange = useCallback((oldIdentity: string, newIdentity: string) => {
    setAnnotations((prev) =>
      prev.map((ann) => (ann.author === oldIdentity ? { ...ann, author: newIdentity } : ann)),
    );
  }, []);

  // Switch file in the dedicated center diff panel.
  const handleFilePreview = useCallback(
    (index: number) => {
      const file = files[index];
      if (!file) return;
      openDiffFile(file.path);
    },
    [files, openDiffFile],
  );

  // Double-click currently behaves the same as single-click.
  const handleFilePinned = useCallback(
    (index: number) => {
      const file = files[index];
      if (!file) return;
      openDiffFile(file.path);
    },
    [files, openDiffFile],
  );

  // Legacy file switch (used by handleSelectAnnotation, diff switch, etc.)
  const handleFileSwitch = useCallback(
    (index: number) => {
      const file = files[index];
      if (file) {
        openDiffFile(file.path);
      }
    },
    [files, openDiffFile],
  );

  const handleToggleViewed = useCallback(
    (filePath: string) => {
      setViewedFiles((prev) => {
        const next = new Set(prev);
        const willBeViewed = !prev.has(filePath);
        if (willBeViewed) {
          next.add(filePath);
        } else {
          next.delete(filePath);
        }
        // Sync viewed state to GitHub (fire and forget — best effort)
        // Capture willBeViewed inside the callback to ensure correctness with React batching
        if (prMetadata) {
          fetch("/api/pr-viewed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filePaths: [filePath], viewed: willBeViewed }),
          }).catch(() => {
            // Silently ignore — viewed sync is best-effort
          });
        }
        return next;
      });
    },
    [prMetadata],
  );

  // Derive worktree path and base diff type from the composite diffType string
  const { activeWorktreePath, activeDiffBase } = useMemo(() => {
    if (diffType.startsWith("worktree:")) {
      const rest = diffType.slice("worktree:".length);
      const lastColon = rest.lastIndexOf(":");
      if (lastColon !== -1) {
        const sub = rest.slice(lastColon + 1);
        if (
          [
            "uncommitted",
            "staged",
            "unstaged",
            "last-commit",
            "branch",
            "merge-base",
            "all",
          ].includes(sub)
        ) {
          return { activeWorktreePath: rest.slice(0, lastColon), activeDiffBase: sub };
        }
      }
      return { activeWorktreePath: rest, activeDiffBase: "uncommitted" };
    }
    return { activeWorktreePath: null, activeDiffBase: diffType };
  }, [diffType]);

  // Git add/staging logic
  const handleFileViewedFromStage = useCallback(
    (path: string) => setViewedFiles((prev) => new Set(prev).add(path)),
    [],
  );
  const {
    stagedFiles,
    stagingFile,
    canStageFiles: canStageRaw,
    stageFile,
    resetStagedFiles,
    stageError,
  } = useGitAdd({
    activeDiffBase,
    onFileViewed: handleFileViewedFromStage,
  });
  // Staging is never available in PR review mode — the server rejects it and the UI shouldn't offer it.
  const canStageInWorkspace =
    reviewMode !== "workspace" ||
    workspaceDiffOptions?.some((option) => option.id === "workspace-staged");
  const canStageFiles = canStageRaw && !prMetadata && canStageInWorkspace;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || isTypingTarget(e.target)) return;
      if (!isDiffPanelActive) return;
      const filePath = files[activeFileIndex]?.path;
      if (!filePath) return;

      if (e.key === "v") {
        e.preventDefault();
        handleToggleViewed(filePath);
      } else if (e.key === "a" && canStageFiles) {
        e.preventDefault();
        stageFile(filePath);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [files, activeFileIndex, isDiffPanelActive, handleToggleViewed, canStageFiles, stageFile]);

  // Shared function: apply a PR response (used by both initial load and PR switch)
  function applyPRResponse(
    data: PRSessionUpdate & {
      rawPatch: string;
      gitRef: string;
      repoInfo?: { display: string; branch?: string };
      viewedFiles?: string[];
      error?: string;
      semanticDiff?: SemanticDiffAdvert;
      agentCwd?: string | null;
    },
  ) {
    const isPRSwitch = !!data.prMetadata;
    const nextFiles = parseDiffToFiles(data.rawPatch);
    dockApi?.getPanel(REVIEW_DIFF_PANEL_ID)?.api.close();
    needsInitialDiffPanel.current = true;
    setDiffData((prev) =>
      prev ? { ...prev, rawPatch: data.rawPatch, gitRef: data.gitRef } : prev,
    );
    setFiles(nextFiles);
    if (isPRSwitch) {
      setActiveFileIndex(0);
    } else {
      const currentFile = files[activeFileIndex];
      const preserved = currentFile ? nextFiles.findIndex((f) => f.path === currentFile.path) : -1;
      setActiveFileIndex(preserved >= 0 ? preserved : 0);
    }
    setPendingSelection(null);
    updatePRSession({
      ...(data.prMetadata && { prMetadata: data.prMetadata }),
      ...(data.prStackInfo !== undefined && { prStackInfo: data.prStackInfo }),
      ...(data.prStackTree !== undefined && { prStackTree: data.prStackTree }),
      ...(data.prDiffScope && { prDiffScope: data.prDiffScope }),
      ...(data.prDiffScopeOptions && { prDiffScopeOptions: data.prDiffScopeOptions }),
      // Scope/switch responses authoritatively report partiality; absence
      // means the patch is complete (e.g. after the local recompute upgrade).
      prPatchIncomplete: data.prPatchIncomplete === true,
      prPatchUpgradeAvailable: data.prPatchUpgradeAvailable === true,
    });
    if (data.repoInfo) setRepoInfo(data.repoInfo);
    if (data.prMetadata) {
      setViewedFiles(data.viewedFiles ? new Set(data.viewedFiles) : new Set());
    }
    setDiffError(data.error || null);
    applySemanticDiffAdvert(data.semanticDiff);
    // The PR's local checkout changes on switch (and warms in later). Use the
    // server's value when present; otherwise clear it on a switch so the Open-in
    // button can't keep pointing at the previous PR's checkout (the 5s freshness
    // probe re-advertises the new one). Scope toggles keep the same checkout.
    if (data.agentCwd !== undefined) {
      setAgentCwd(data.agentCwd);
    } else if (isPRSwitch) {
      setAgentCwd(null);
    }
    resetStagedFiles();
  }

  prStackCallbacksRef.current = {
    applyPRResponse,
    onError: (message) => setDiffError(message),
  };

  // Shared helper: fetch a diff switch and update state.
  // Returns true on success, false on failure — callers that optimistically
  // updated UI state (e.g. the base picker) can use this to revert.
  const fetchDiffSwitch = useCallback(
    async (
      fullDiffType: string,
      baseOverride?: string,
      options?: { preserveFile?: boolean },
    ): Promise<boolean> => {
      setIsLoadingDiff(true);
      try {
        const res = await fetch("/api/diff/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Server ignores base for modes that don't use it (uncommitted/staged/etc),
          // so forwarding it when available keeps the request shape uniform.
          body: JSON.stringify(
            buildDiffSwitchRequest(fullDiffType, baseOverride, selectedBase, diffHideWhitespace),
          ),
        });

        if (!res.ok) throw new Error("Failed to switch diff");

        const rawData: unknown = await res.json();
        const data = decodeDiffSwitchResponse(rawData);
        if (!data) throw new Error("Failed to switch diff");

        const nextFiles = parseDiffToFiles(data.rawPatch);
        applySemanticDiffAdvert(data.semanticDiff);

        if (options?.preserveFile) {
          // Whitespace toggle: update patch in-place, keep the active file.
          // If the current file was removed (whitespace-only), retarget the
          // dock panel to the first remaining file.
          setDiffData((prev) =>
            prev ? { ...prev, rawPatch: data.rawPatch, gitRef: data.gitRef } : prev,
          );
          if (data.diffOptions) setWorkspaceDiffOptions(data.diffOptions);
          setFiles(nextFiles);
          const currentPath = files[activeFileIndex]?.path;
          const nextIdx = currentPath ? nextFiles.findIndex((f) => f.path === currentPath) : -1;
          if (nextIdx !== -1) {
            setActiveFileIndex(nextIdx);
          } else if (nextFiles.length > 0) {
            setActiveFileIndex(0);
            openDiffFile(nextFiles[0].path);
          }
          // Line numbers can shift when whitespace handling changes, so a
          // selection anchored to the old patch is stale — clear it (the
          // non-preserve branch below already does).
          setPendingSelection(null);
        } else {
          dockApi?.getPanel(REVIEW_DIFF_PANEL_ID)?.api.close();
          needsInitialDiffPanel.current = true;
          setDiffData((prev) =>
            prev
              ? { ...prev, rawPatch: data.rawPatch, gitRef: data.gitRef, diffType: data.diffType }
              : prev,
          );
          setFiles(nextFiles);
          setDiffType(data.diffType);
          if (data.diffOptions) setWorkspaceDiffOptions(data.diffOptions);
          if (data.base) {
            setSelectedBase(data.base);
            setCommittedBase(data.base);
          }
          // Merge only the per-cwd fields so the sidebar reflects the worktree
          // we're now in. Keep the original `worktrees` list (already filtered to
          // exclude the server's startup cwd — replacing it with the new context's
          // list would duplicate the "Main repo" entry) and `availableBranches`
          // (shared across worktrees of the same repo).
          //
          // IMPORTANT: we deliberately do NOT overwrite `currentBranch`. The
          // WorktreePicker's top "launch" row uses it as a label, and that row
          // represents the cwd plannotator was launched in — not whichever
          // worktree is currently active. Freezing `currentBranch` at its
          // initial-load value keeps that label truthful. `defaultBranch` and
          // `diffOptions` update because they describe the active diff, which
          // other UI (empty-state text, diff-type picker) should see fresh.
          if (data.gitContext) {
            setGitContext((prev) => {
              if (!prev) return data.gitContext!;
              return {
                ...prev,
                defaultBranch: data.gitContext!.defaultBranch,
                diffOptions: data.gitContext!.diffOptions,
                compareTarget: data.gitContext!.compareTarget,
                jjEvologs: data.gitContext!.jjEvologs,
                // HEAD differs per worktree, so refresh the commit-baseline picker.
                recentCommits: data.gitContext!.recentCommits,
              };
            });
          }
          setActiveFileIndex(0);
          setPendingSelection(null);
          resetStagedFiles();
        }
        setDiffError(data.error || null);
        return true;
      } catch (err) {
        console.error("Failed to switch diff:", err);
        setDiffError(err instanceof Error ? err.message : "Failed to switch diff");
        return false;
      } finally {
        setIsLoadingDiff(false);
      }
    },
    [
      dockApi,
      resetStagedFiles,
      selectedBase,
      diffHideWhitespace,
      files,
      activeFileIndex,
      openDiffFile,
      applySemanticDiffAdvert,
    ],
  );

  // Switch the base branch the current diff compares against.
  // Only triggers a refetch when the active mode actually uses a base.
  // Optimistically updates the picker; reverts if the server-side switch
  // fails so the chip doesn't lie about what the viewer is actually showing.
  const handleBaseSelect = useCallback(
    async (branch: string) => {
      if (branch === selectedBase) return;
      const previous = selectedBase;
      setSelectedBase(branch);
      if (
        activeDiffBase === "branch" ||
        activeDiffBase === "merge-base" ||
        activeDiffBase === "jj-line" ||
        activeDiffBase === "jj-evolog"
      ) {
        const ok = await fetchDiffSwitch(diffType, branch);
        if (!ok) setSelectedBase(previous);
      }
    },
    [selectedBase, activeDiffBase, diffType, fetchDiffSwitch],
  );

  // Switch diff type (uncommitted, last-commit, branch) — composes worktree prefix if active
  const handleDiffSwitch = useCallback(
    async (baseDiffType: string) => {
      const fullDiffType = activeWorktreePath
        ? `worktree:${activeWorktreePath}:${baseDiffType}`
        : baseDiffType;
      if (fullDiffType === diffType) return;
      // For evolog, default to the second entry (previous state of @) so the
      // server doesn't fall back to the jj bookmark/trunk revset.
      // When leaving evolog, restore the base to the detected compare target
      // so other base-dependent modes (jj-line) don't inherit a commit ID.
      const enteringEvolog =
        baseDiffType === "jj-evolog" && gitContext?.jjEvologs && gitContext.jjEvologs.length >= 2;
      const leavingEvolog =
        !enteringEvolog && activeDiffBase === "jj-evolog" && gitContext?.defaultBranch;
      const baseOverride = enteringEvolog
        ? gitContext!.jjEvologs![1].commitId
        : leavingEvolog
          ? gitContext!.defaultBranch
          : undefined;
      if (baseOverride) setSelectedBase(baseOverride);
      await fetchDiffSwitch(fullDiffType, baseOverride);
    },
    [diffType, activeWorktreePath, fetchDiffSwitch, gitContext],
  );

  // Switch worktree context (or back to main repo). Preserves the current
  // diff mode across the switch — if the reviewer was looking at "PR Diff"
  // in the main repo, they should keep looking at "PR Diff" in the target
  // worktree rather than being silently snapped back to "Uncommitted".
  const handleWorktreeSwitch = useCallback(
    async (worktreePath: string | null) => {
      if (worktreePath === activeWorktreePath) return;
      const fullDiffType = worktreePath
        ? `worktree:${worktreePath}:${activeDiffBase}`
        : activeDiffBase;
      await fetchDiffSwitch(fullDiffType);
    },
    [activeWorktreePath, activeDiffBase, fetchDiffSwitch],
  );

  // Re-fetch diff when hideWhitespace toggles so the server applies git diff -w.
  // Preserves the active file since only whitespace hunks change.
  const hideWhitespaceInitialized = useRef(false);
  useEffect(() => {
    if (!origin || (!gitContext && reviewMode !== "workspace")) return;
    if (!hideWhitespaceInitialized.current) {
      hideWhitespaceInitialized.current = true;
      return;
    }
    fetchDiffSwitch(diffType, selectedBase, { preserveFile: true });
  }, [diffHideWhitespace, origin, reviewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Diff staleness ---------------------------------------------------------
  // Files changing mid-review (an agent editing/committing while the user
  // reviews) make the snapshot on screen stale. The hook polls the server's
  // cheap fingerprint check; the toolbar shows a non-blocking notice and the
  // user refreshes when THEY are ready — never automatically (annotations are
  // line-anchored; rug-pulling the diff under them is worse than staleness).
  const diffFreshness = useDiffFreshness({
    enabled: !!origin,
    resetKey: diffData?.rawPatch ?? "",
    onAgentCwd: setAgentCwd,
  });

  const handleRefreshStaleDiff = useCallback(() => {
    if (prMetadata) {
      // Only the full-stack scope can go stale locally — the layer diff is
      // computed by GitHub and its fingerprint never flips.
      if (prDiffScope === "full-stack") handlePRDiffScopeSelect("full-stack");
      return;
    }
    // Same params, fresh snapshot. preserveFile keeps the reviewer on the
    // file they were reading.
    void fetchDiffSwitch(diffType, selectedBase, { preserveFile: true });
  }, [prMetadata, prDiffScope, handlePRDiffScopeSelect, fetchDiffSwitch, diffType, selectedBase]);

  // Select annotation - switches file if needed and scrolls to it.
  // isAllFilesActive is read through the ref (declared with the state): this
  // handler is baked into Pierre slot portals, which only republish on item
  // version bumps — a stale captured value would yank the user out of the
  // all-files tab into the single-file panel when they click an annotation.
  // Inline-card selection: toggle the highlight + ring only. No scroll, no file
  // switch — the clicked card is already on screen. Clicking the selected card
  // again (or a null id) clears it.
  const handleSelectAnnotation = useCallback((id: string | null) => {
    // An inline selection supersedes any pending sidebar/findings navigate target,
    // so a later remount (Refresh / base switch) doesn't re-scroll back to it.
    setScrollTargetAnnotation(null);
    setSelectedAnnotationId((prev) => (!id || prev === id ? null : id));
  }, []);

  // Sidebar navigation: select AND scroll-to the comment (DiffsHub "set +
  // scroll"). The token bump re-fires the panels' scroll effect even when the
  // same comment is clicked twice; in single-file mode it switches to the
  // owning file first so the scroll target exists.
  const handleNavigateToAnnotation = useCallback(
    (id: string | null) => {
      if (!id) {
        setSelectedAnnotationId(null);
        return;
      }
      const annotation = allAnnotationsRef.current.find((a) => a.id === id);
      // Ignore navigation to an annotation that's gone (deleted) or filtered out of
      // the active PR/diff-scope — there's nothing in the current diff to scroll to
      // or highlight, so don't fake a selection.
      if (!annotation || !annotationMatchesPrScope(annotation, prMetadata?.url, prDiffScope)) {
        return;
      }
      if (!isAllFilesActiveRef.current) {
        const fileIndex = files.findIndex((f) => f.path === annotation.filePath);
        if (fileIndex !== -1) handleFileSwitch(fileIndex);
      }
      setSelectedAnnotationId(id);
      setScrollTargetAnnotation((prev) => ({ id, token: (prev?.token ?? 0) + 1 }));
    },
    [files, handleFileSwitch, prMetadata, prDiffScope],
  );

  // Diff context bundled into local-mode feedback headers so the receiving
  // agent knows which diff the annotations are anchored to. Uses committedBase
  // (what the server actually computed) and activeDiffBase/activeWorktreePath
  // (derived from the committed diffType). Skipped in PR mode — the PR header
  // already carries the relevant context.
  // Declared before reviewStateValue because both reviewStateValue and the
  // feedbackMarkdown memo below read it; moving it below either would put it
  // in the TDZ when those memos run on first render.
  const feedbackDiffContext = useMemo(
    () =>
      prMetadata || !activeDiffBase
        ? undefined
        : {
            mode: activeDiffBase,
            base: committedBase ?? undefined,
            worktreePath: activeWorktreePath,
          },
    [prMetadata, activeDiffBase, committedBase, activeWorktreePath],
  );

  const prReviewScopeLabel = useMemo(() => {
    if (!prMetadata || !prStackInfo) return undefined;
    if (prDiffScope === "full-stack") {
      return `Diff vs \`${prMetadata.defaultBranch ?? "default branch"}\``;
    }
    return `Diff vs \`${prMetadata.baseBranch}\``;
  }, [prMetadata, prStackInfo, prDiffScope]);

  // Build ReviewState value for dock panel context
  const reviewStateValue = useMemo<ReviewState>(
    () => ({
      files,
      rawPatch: diffData?.rawPatch ?? "",
      focusedFileIndex: activeFileIndex,
      focusedFilePath: files[activeFileIndex]?.path ?? null,
      diffStyle,
      diffOverflow,
      diffIndicators,
      lineDiffType: diffLineDiffType,
      disableLineNumbers: !diffShowLineNumbers,
      disableBackground: !diffShowBackground,
      expandUnchanged: diffExpandUnchanged,
      fontFamily: diffFontFamily || undefined,
      fontSize: diffFontSize || undefined,
      // Only propagate base for modes where it affects old/new content. Avoids
      // needless file-content re-fetches when switching to uncommitted/staged/etc.
      // Uses committedBase (not selectedBase) so file-content queries wait for
      // the new patch to arrive before refetching — otherwise the viewer can
      // briefly pair an old patch with the new base's content.
      reviewBase:
        activeDiffBase === "branch" ||
        activeDiffBase === "merge-base" ||
        activeDiffBase === "jj-line" ||
        activeDiffBase === "jj-evolog"
          ? (committedBase ?? undefined)
          : undefined,
      activeDiffBase,
      feedbackDiffContext,
      prReviewScope: prReviewScopeLabel,
      prDiffScope,
      agentCwd,
      allAnnotations,
      externalAnnotations,
      selectedAnnotationId,
      scrollTargetAnnotation,
      pendingSelection,
      onLineSelection: handleLineSelection,
      onAddAnnotation: handleAddAnnotation,
      onAddAnnotationForFile: handleAddAnnotationForFile,
      onAddFileComment: handleAddFileComment,
      onAddFileCommentForFile: handleAddFileCommentForFile,
      onEditAnnotation: handleEditAnnotation,
      onSelectAnnotation: handleSelectAnnotation,
      onNavigateToAnnotation: handleNavigateToAnnotation,
      onDeleteAnnotation: handleDeleteAnnotation,
      viewedFiles,
      onToggleViewed: handleToggleViewed,
      stagedFiles,
      stagingFile,
      onStage: stageFile,
      canStageFiles,
      stageError,
      searchQuery: isSearchPending ? "" : debouncedSearchQuery,
      isSearchPending,
      debouncedSearchQuery,
      activeFileSearchMatches,
      activeSearchMatchId,
      activeSearchMatch:
        activeSearchMatch?.filePath === files[activeFileIndex]?.path ? activeSearchMatch : null,
      searchMatches,
      allFilesActiveSearchMatch: activeSearchMatch,
      aiAvailable,
      aiMessages,
      onClickAIMarker: handleClickAIMarker,
      onAttachAIContextForFile: handleAttachAIContextForFile,
      prMetadata,
      prContext,
      isPRContextLoading,
      prContextError,
      fetchPRContext,
      platformUser,
      openDiffFile,
      onAllFilesVisibleFileChange: setAllFilesVisibleFile,
      isAllFilesActive,
      isSemanticDiffActive,
      semanticDiffAvailable,
      onSemanticDiffUnavailable: handleSemanticDiffUnavailable,
      onSemanticDiffLoadError: handleSemanticDiffLoadError,
      onSemanticDiffLoadSuccess: handleSemanticDiffLoadSuccess,
      onCodeNavRequest: handleCodeNavRequest,
      codeNavResult: codeNav.result,
      codeNavIsLoading: codeNav.isLoading,
      codeNavActiveSymbol: codeNav.activeSymbol,
    }),
    [
      files,
      diffData?.rawPatch,
      activeFileIndex,
      diffStyle,
      diffOverflow,
      diffIndicators,
      diffLineDiffType,
      diffShowLineNumbers,
      diffShowBackground,
      diffExpandUnchanged,
      diffFontFamily,
      diffFontSize,
      activeDiffBase,
      committedBase,
      feedbackDiffContext,
      prReviewScopeLabel,
      prDiffScope,
      agentCwd,
      allAnnotations,
      externalAnnotations,
      selectedAnnotationId,
      scrollTargetAnnotation,
      pendingSelection,
      handleLineSelection,
      handleAddAnnotation,
      handleAddFileComment,
      handleAddFileCommentForFile,
      handleEditAnnotation,
      handleSelectAnnotation,
      handleNavigateToAnnotation,
      handleDeleteAnnotation,
      viewedFiles,
      handleToggleViewed,
      stagedFiles,
      stagingFile,
      stageFile,
      canStageFiles,
      stageError,
      isSearchPending,
      debouncedSearchQuery,
      activeFileSearchMatches,
      activeSearchMatchId,
      activeSearchMatch,
      searchMatches,
      aiAvailable,
      aiMessages,
      handleClickAIMarker,
      handleAttachAIContextForFile,
      prMetadata,
      prContext,
      isPRContextLoading,
      prContextError,
      fetchPRContext,
      platformUser,
      openDiffFile,
      isAllFilesActive,
      isSemanticDiffActive,
      semanticDiffAvailable,
      handleSemanticDiffUnavailable,
      handleSemanticDiffLoadError,
      handleSemanticDiffLoadSuccess,
      handleAddAnnotationForFile,
      handleCodeNavRequest,
      codeNav.result,
      codeNav.isLoading,
      codeNav.activeSymbol,
    ],
  );

  // Separate context for high-frequency job logs — prevents re-rendering all panels on every SSE event

  // Copy raw diff to clipboard
  const handleCopyDiff = useCallback(async () => {
    if (!diffData) return;
    try {
      await navigator.clipboard.writeText(diffData.rawPatch);
      setCopyRawDiffStatus("success");
      setTimeout(() => setCopyRawDiffStatus("idle"), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      setCopyRawDiffStatus("error");
      setTimeout(() => setCopyRawDiffStatus("idle"), 2000);
    }
  }, [diffData]);

  // Copy feedback markdown to clipboard
  const handleCopyFeedback = useCallback(async () => {
    if (allAnnotations.length === 0) {
      setShowNoAnnotationsDialog(true);
      return;
    }
    try {
      const feedback = exportReviewFeedback(
        allAnnotations,
        prMetadata,
        feedbackDiffContext,
        prReviewScopeLabel,
      );
      await navigator.clipboard.writeText(feedback);
      setCopyFeedback("Feedback copied!");
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      setCopyFeedback("Failed to copy");
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  }, [allAnnotations, prMetadata, feedbackDiffContext, prReviewScopeLabel]);

  const feedbackMarkdown = useMemo(() => {
    let output = exportReviewFeedback(
      allAnnotations,
      prMetadata,
      feedbackDiffContext,
      prReviewScopeLabel,
    );
    if (editorAnnotations.length > 0) {
      output += exportEditorAnnotations(editorAnnotations);
    }
    return output;
  }, [allAnnotations, prMetadata, feedbackDiffContext, prReviewScopeLabel, editorAnnotations]);

  const totalAnnotationCount = allAnnotations.length + editorAnnotations.length;

  const {
    isSendingFeedback,
    isApproving,
    isExiting,
    sendFeedback: handleSendFeedback,
    approveReview: handleApprove,
    exitReview: handleExit,
  } = useAgentReviewActions({
    allAnnotations,
    editorAnnotations,
    feedbackMarkdown,
    totalAnnotationCount,
    getDraftGeneration,
    onSubmitted: setSubmitted,
    onFeedbackStatusChange: setCopyFeedback,
    onNoAnnotations: () => setShowNoAnnotationsDialog(true),
  });

  useReviewSubmissionShortcut({
    platformCommentDialog,
    platformGeneralComment,
    submitted: !!submitted,
    isSendingFeedback,
    isApproving,
    isExiting,
    isPlatformActioning,
    isDemoMode: !origin,
    isPlatformMode: platformMode,
    isOwnPullRequest: !!platformUser && prMetadata?.author === platformUser,
    totalAnnotationCount,
    hasBlockingDialog:
      showExportModal || showNoAnnotationsDialog || showApproveWarning || showExitWarning,
    submitPlatformAction,
    openPlatformDialog,
    approveReview: handleApprove,
    sendFeedback: handleSendFeedback,
  });

  const handleToggleFileTree = useCallback(() => {
    setIsFileTreeOpen((previous) => !previous);
  }, []);

  const handleToggleDestinationMenu = useCallback(() => {
    setShowDestinationMenu((previous) => !previous);
  }, [setShowDestinationMenu]);

  const handleCloseDestinationMenu = useCallback(() => {
    setShowDestinationMenu(false);
  }, [setShowDestinationMenu]);

  const handleSelectReviewDestination = useCallback(
    (destination: "agent" | "platform") => {
      selectReviewDestination(destination);
      setShowDestinationMenu(false);
    },
    [selectReviewDestination, setShowDestinationMenu],
  );

  const handleRequestApprove = useCallback(() => {
    if (totalAnnotationCount > 0) {
      setShowApproveWarning(true);
      return;
    }
    handleApprove();
  }, [totalAnnotationCount, handleApprove]);

  const handleRequestExit = useCallback(() => {
    if (totalAnnotationCount > 0) {
      setShowExitWarning(true);
      return;
    }
    handleExit();
  }, [totalAnnotationCount, handleExit]);

  const handleRequestPlatformComment = useCallback(() => {
    openPlatformDialog("comment");
  }, [openPlatformDialog]);

  const handleRequestPlatformApprove = useCallback(() => {
    if (platformUser && prMetadata?.author === platformUser) return;
    openPlatformDialog("approve");
  }, [platformUser, prMetadata, openPlatformDialog]);

  const handleToggleAnnotations = useCallback(() => {
    reviewSidebar.toggleTab("annotations");
  }, [reviewSidebar]);

  const handleToggleAI = useCallback(() => {
    reviewSidebar.toggleTab("ai");
  }, [reviewSidebar]);

  const handleOpenSettingsMenu = useCallback(() => {
    setOpenSettingsMenu(true);
  }, []);

  const handleOpenExportModal = useCallback(() => {
    setShowExportModal(true);
  }, []);

  const handleCloseExportModal = useCallback(() => {
    setShowExportModal(false);
  }, []);

  const handleCopyExportFeedback = useCallback(async () => {
    await navigator.clipboard.writeText(feedbackMarkdown);
  }, [feedbackMarkdown]);

  const handleCloseSettingsMenu = useCallback(() => {
    setOpenSettingsMenu(false);
  }, []);

  const worktreePath = agentCwd || gitContext?.cwd || null;

  const handleCloseWorktreeDialog = useCallback(() => {
    setShowWorktreeDialog(false);
  }, []);

  const handleCopyWorktreePath = useCallback(() => {
    if (!worktreePath) return;
    void navigator.clipboard.writeText(worktreePath);
  }, [worktreePath]);

  const handleCloseNoAnnotationsDialog = useCallback(() => {
    setShowNoAnnotationsDialog(false);
  }, []);

  const handleCloseApproveWarning = useCallback(() => {
    setShowApproveWarning(false);
  }, []);

  const handleConfirmApproveWarning = useCallback(() => {
    setShowApproveWarning(false);
    handleApprove();
  }, [handleApprove]);

  const handleCloseExitWarning = useCallback(() => {
    setShowExitWarning(false);
  }, []);

  const handleConfirmExitWarning = useCallback(() => {
    setShowExitWarning(false);
    handleExit();
  }, [handleExit]);

  const handleToggleGrid = useCallback((enabled: boolean) => {
    configStore.set("gridEnabled", enabled);
  }, []);

  const handleCompleteDiffTypeSetup = useCallback(
    (selectedDiffType: string) => {
      setShowDiffTypeSetup(false);
      if (selectedDiffType !== diffType) handleDiffSwitch(selectedDiffType);
    },
    [diffType, handleDiffSwitch],
  );

  const handleChangePlatformGeneralComment = useCallback(
    (comment: string) => {
      setPlatformGeneralComment(comment);
    },
    [setPlatformGeneralComment],
  );

  const handleChangePlatformOpenPR = useCallback(
    (openPR: boolean) => {
      setPlatformOpenPR(openPR);
    },
    [setPlatformOpenPR],
  );

  const handleConfirmPlatformSubmission = useCallback(() => {
    if (!platformCommentDialog) return;
    void submitPlatformAction(
      platformCommentDialog.action,
      platformCommentDialog.plan,
      platformGeneralComment,
    );
  }, [platformCommentDialog, platformGeneralComment, submitPlatformAction]);

  const handleCancelPlatformSubmission = useCallback(() => {
    closePlatformDialog();
  }, [closePlatformDialog]);

  const handleToggleSidebar = useCallback(() => {
    if (reviewSidebar.isOpen) {
      reviewSidebar.close();
      return;
    }
    reviewSidebar.open();
  }, [reviewSidebar]);

  const handleToggleHideViewed = useCallback(() => {
    setHideViewedFiles((previous) => !previous);
  }, []);

  const handleCollapseFileTree = useCallback(() => {
    setIsFileTreeOpen(false);
  }, []);

  const handleCollapseSidebar = useCallback(() => {
    reviewSidebar.close();
  }, [reviewSidebar]);

  const handleSelectSemanticDiff = useCallback(() => {
    openSemanticDiffPanel();
  }, [openSemanticDiffPanel]);

  const isOwnPullRequest = !!platformUser && prMetadata?.author === platformUser;

  const workspaceViewModel: ReviewWorkspaceViewModel = {
    header: {
      shouldShowFileTree,
      isFileTreeOpen,
      prMetadata,
      displayRepo,
      prNumberLabel,
      prStackInfo,
      prStackTree,
      prDiffScope,
      prDiffScopeOptions,
      isSwitchingPRScope,
      repoInfo,
      diffStyle,
      origin,
      reviewDestination,
      showDestinationMenu,
      platformActionError,
      isWorkspaceReview: reviewMode === "workspace",
      diffError,
      fileCount: files.length,
      prPatchIncomplete,
      prPatchUpgradeAvailable,
      isLoadingFullDiff,
      isDiffStale: diffFreshness.isStale,
      isLoadingDiff,
      platformMode,
      totalAnnotationCount,
      isSendingFeedback,
      isApproving,
      isExiting,
      isPlatformActioning,
      isOwnPullRequest,
      copyFeedback,
      isSidebarOpen: reviewSidebar.isOpen,
      activeSidebarTab: reviewSidebar.activeTab,
      aiAvailable,
      aiMessageCount: aiMessages.length,
      appVersion,
    },
    isResizing,
    shouldShowFileTree,
    fileTree: {
      files,
      activeFileIndex,
      annotations: allAnnotations,
      viewedFiles,
      hideViewedFiles,
      enableKeyboardNav: !showExportModal && hasSearchableFiles,
      diffOptions:
        reviewMode === "workspace" ? (workspaceDiffOptions ?? undefined) : gitContext?.diffOptions,
      activeDiffType: activeDiffBase,
      isLoadingDiff,
      width: fileTreeResize.width,
      worktrees: gitContext?.worktrees,
      activeWorktreePath,
      currentBranch: gitContext?.currentBranch,
      availableBranches: prMetadata ? undefined : gitContext?.availableBranches,
      selectedBase: prMetadata ? undefined : (selectedBase ?? undefined),
      detectedBase: prMetadata
        ? undefined
        : gitContext?.defaultBranch || gitContext?.compareTarget?.fallback,
      compareTarget: gitContext?.compareTarget,
      recentCommits: prMetadata ? undefined : gitContext?.recentCommits,
      jjEvologs: prMetadata ? undefined : gitContext?.jjEvologs,
      detectedEvoBase: prMetadata ? undefined : gitContext?.jjEvologs?.[1]?.commitId,
      stagedFiles,
      canCopyRawDiff: !!diffData?.rawPatch,
      copyRawDiffStatus,
      searchQuery: hasSearchableFiles ? searchQuery : "",
      isSearchOpen: hasSearchableFiles ? isSearchOpen : false,
      isSearchPending,
      searchInputRef: hasSearchableFiles ? searchInputRef : undefined,
      searchGroups: hasSearchableFiles ? searchGroups : [],
      searchMatches: hasSearchableFiles ? searchMatches : [],
      activeSearchMatchId: hasSearchableFiles ? activeSearchMatchId : null,
      isSemanticDiffActive,
      semanticDiffAvailable,
      isAllFilesActive,
      scrollHighlightIndex:
        isAllFilesActive && allFilesVisibleFile
          ? files.findIndex((file) => file.path === allFilesVisibleFile)
          : undefined,
      repoRoot: prMetadata ? null : (activeWorktreePath ?? agentCwd ?? gitContext?.cwd ?? null),
      resizeHandle: {
        isDragging: fileTreeResize.isDragging,
        style: fileTreeResize.handleProps.style,
      },
    },
    dock: {
      hasDiffFiles: files.length > 0,
      resolvedMode,
      diffError,
      activeDiffBase,
      activeWorktreePath,
      selectedBase,
      defaultBranch: gitContext?.defaultBranch,
      isWorkspaceReview: reviewMode === "workspace",
      workspaceDiffOptionCount: workspaceDiffOptions?.length ?? 0,
      gitDiffOptionCount: gitContext?.diffOptions?.length ?? 0,
    },
    sidebar: {
      isOpen: reviewSidebar.isOpen,
      activeTab: reviewSidebar.activeTab,
      annotations: allAnnotations,
      files,
      selectedAnnotationId,
      feedbackMarkdown,
      width: panelResize.width,
      editorAnnotations,
      prMetadata,
      aiAvailable,
      aiMessages,
      isAICreatingSession: aiIsCreatingSession,
      isAIStreaming: aiIsStreaming,
      activeFilePath: files[activeFileIndex]?.path,
      scrollToQuestionId,
      pendingAIContext,
      aiComposerFocusToken,
      aiPermissionRequests,
      aiProviders,
      aiConfig,
      hasAISession: !!aiSessionId,
      resizeHandle: {
        isDragging: panelResize.isDragging,
        style: panelResize.handleProps.style,
      },
    },
  };

  const workspaceActions: ReviewWorkspaceActions = {
    header: {
      onToggleFileTree: handleToggleFileTree,
      onSelectPR: handlePRSwitch,
      onSelectPRDiffScope: handlePRDiffScopeSelect,
      onOpenPRPanel: handleOpenPRPanel,
      onDiffStyleChange: handleDiffStyleChange,
      onToggleDestinationMenu: handleToggleDestinationMenu,
      onCloseDestinationMenu: handleCloseDestinationMenu,
      onSelectReviewDestination: handleSelectReviewDestination,
      onLoadFullDiff: handleLoadFullDiff,
      onRefreshStaleDiff: handleRefreshStaleDiff,
      onDismissStaleDiff: diffFreshness.dismiss,
      onSendFeedback: handleSendFeedback,
      onRequestApprove: handleRequestApprove,
      onRequestExit: handleRequestExit,
      onRequestPlatformComment: handleRequestPlatformComment,
      onRequestPlatformApprove: handleRequestPlatformApprove,
      onCopyFeedback: handleCopyFeedback,
      onToggleAnnotations: handleToggleAnnotations,
      onToggleAI: handleToggleAI,
      onOpenSettings: handleOpenSettingsMenu,
      onOpenExport: handleOpenExportModal,
      onToggleSidebar: handleToggleSidebar,
    },
    fileTree: {
      onSelectFile: handleFilePreview,
      onDoubleClickFile: handleFilePinned,
      onToggleViewed: handleToggleViewed,
      onToggleHideViewed: handleToggleHideViewed,
      onSelectDiff: handleDiffSwitch,
      onSelectWorktree: handleWorktreeSwitch,
      onSelectBase: prMetadata ? undefined : handleBaseSelect,
      onCopyRawDiff: handleCopyDiff,
      onOpenSearch: hasSearchableFiles ? openSearch : undefined,
      onSearchChange: hasSearchableFiles ? handleSearchInputChange : undefined,
      onSearchClear: hasSearchableFiles ? clearSearch : undefined,
      onSearchClose: hasSearchableFiles ? closeSearch : undefined,
      onSelectSearchMatch: hasSearchableFiles ? handleSelectSearchMatch : undefined,
      onStepSearchMatch: hasSearchableFiles ? stepSearchMatch : undefined,
      onSelectSemanticDiff: handleSelectSemanticDiff,
      onSelectAllFiles: openAllFilesPanel,
      resizeHandle: {
        onPointerDown: fileTreeResize.handleProps.onPointerDown,
        onDoubleClick: fileTreeResize.handleProps.onDoubleClick,
      },
      onCollapse: handleCollapseFileTree,
    },
    dock: {
      onReady: handleDockReady,
    },
    sidebar: {
      onClose: reviewSidebar.close,
      onSelectAnnotation: handleSelectAnnotation,
      onNavigateToAnnotation: handleNavigateToAnnotation,
      onDeleteAnnotation: handleDeleteAnnotation,
      onDeleteEditorAnnotation: deleteEditorAnnotation,
      onScrollToAILines: handleScrollToAILines,
      onAskChat: handleAskChat,
      onRemovePendingAIContext: handleRemovePendingAIContext,
      onRespondToPermission: respondToAIPermission,
      onAIConfigChange: handleAIConfigChange,
      onOpenPRPanel: handleOpenPRPanel,
      resizeHandle: {
        onPointerDown: panelResize.handleProps.onPointerDown,
        onDoubleClick: panelResize.handleProps.onDoubleClick,
      },
      onCollapse: handleCollapseSidebar,
    },
  };

  const dialogsModel: ReviewDialogsModel = {
    draftRecovery: draftBanner,
    origin,
    aiProviders,
    gitUser,
    isSettingsOpen: openSettingsMenu,
    isPullRequestReview: prMetadata !== null,
    worktreePath,
    isWorktreeDialogOpen: showWorktreeDialog,
    isNoAnnotationsDialogOpen: showNoAnnotationsDialog,
    annotationCount: totalAnnotationCount,
    isApproveWarningOpen: showApproveWarning,
    isExitWarningOpen: showExitWarning,
    isLookAndFeelAnnouncementOpen: showLookAndFeel,
    gridEnabled,
    isDiffTypeSetupOpen: showDiffTypeSetup,
    platformSubmission: platformCommentDialog,
    platformGeneralComment,
    platformOpenPR,
    isPlatformSubmitting: isPlatformActioning,
  };

  const dialogsActions: ReviewDialogsActions = {
    onDismissDraftRecovery: dismissDraft,
    onRestoreDraftRecovery: handleRestoreDraft,
    onIdentityChange: handleIdentityChange,
    onCloseSettings: handleCloseSettingsMenu,
    onCloseWorktreeDialog: handleCloseWorktreeDialog,
    onCopyWorktreePath: handleCopyWorktreePath,
    onCloseNoAnnotationsDialog: handleCloseNoAnnotationsDialog,
    onCloseApproveWarning: handleCloseApproveWarning,
    onConfirmApproveWarning: handleConfirmApproveWarning,
    onCloseExitWarning: handleCloseExitWarning,
    onConfirmExitWarning: handleConfirmExitWarning,
    onToggleGrid: handleToggleGrid,
    onDismissLookAndFeelAnnouncement: dismissLookAndFeel,
    onCompleteDiffTypeSetup: handleCompleteDiffTypeSetup,
    onChangePlatformGeneralComment: handleChangePlatformGeneralComment,
    onChangePlatformOpenPR: handleChangePlatformOpenPR,
    onConfirmPlatformSubmission: handleConfirmPlatformSubmission,
    onCancelPlatformSubmission: handleCancelPlatformSubmission,
  };

  const overlaysModel: ReviewOverlaysModel = {
    isSwitchingPRScope,
    isExportOpen: showExportModal,
    annotationCount: allAnnotations.length,
    feedbackMarkdown,
    submitted,
    origin,
    platformMode,
  };

  const overlaysActions: ReviewOverlaysActions = {
    onCloseExport: handleCloseExportModal,
    onCopyExportFeedback: handleCopyExportFeedback,
  };

  if (isLoading) {
    return (
      <ThemeProvider defaultTheme="dark">
        <div className="h-screen flex items-center justify-center bg-background">
          <div className="text-muted-foreground text-sm">Loading diff...</div>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider delayDuration={200} skipDelayDuration={100}>
        <ReviewStateProvider value={reviewStateValue}>
          <ReviewOverlays model={overlaysModel} actions={overlaysActions} />
          <div className="h-screen flex flex-col bg-background overflow-hidden">
            <ReviewWorkspace viewModel={workspaceViewModel} actions={workspaceActions} />
            <ReviewDialogs model={dialogsModel} actions={dialogsActions} />
          </div>
        </ReviewStateProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
};

export default ReviewApp;
