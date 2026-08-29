import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { toast } from "sonner";
import { type Origin, getAgentName } from "@plannotator/shared/agents";
import {
  annotateFileFeedback,
  annotateMessageFeedback,
} from "@plannotator/shared/feedback-templates";
import {
  parseMarkdownToBlocks,
  exportAnnotations,
  exportLinkedDocAnnotations,
  exportEditorAnnotations,
  exportCodeFileAnnotations,
  exportMessageAnnotations,
  extractFrontmatter,
  wrapFeedbackForAgent,
  type LinkedDocAnnotationEntry,
  type MessageAnnotationEntry,
} from "@plannotator/ui/utils/parser";
import { type ViewerHandle } from "@plannotator/ui/components/Viewer";
import { type MarkdownEditorHandle } from "@plannotator/ui/components/MarkdownEditor";
import {
  Annotation,
  AnnotationType,
  Block,
  EditorMode,
  type CodeAnnotation,
  type InputMethod,
  type ImageAttachment,
  type ActionsLabelMode,
} from "@plannotator/ui/types";
import {
  isChoiceAnnotation,
  reconcileChoiceAnnotations,
} from "@plannotator/ui/utils/choiceAnnotations";
import { useSharing } from "@plannotator/ui/hooks/useSharing";
import { getCallbackConfig, CallbackAction, executeCallback } from "@plannotator/ui/utils/callback";
import { useActiveSection } from "@plannotator/ui/hooks/useActiveSection";
import { configStore, useConfigValue } from "@plannotator/ui/config";
import { loadCodeFont, loadProseFont } from "@plannotator/ui/utils/diffFonts";
import {
  getObsidianSettings,
  getEffectiveVaultPath,
  isObsidianConfigured,
} from "@plannotator/ui/utils/obsidian";
import { getDefaultNotesApp } from "@plannotator/ui/utils/defaultNotesApp";
import {
  getAIProviderSettings,
  isPiProvider,
  resolveAIModelForProvider,
  resolveAIProviderSelection,
  saveAIProviderSelection,
  type AIProviderOption,
} from "@plannotator/ui/utils/aiProvider";
import {
  markLookAndFeelAnnouncementSeen,
  needsLookAndFeelAnnouncement,
} from "@plannotator/ui/utils/lookAndFeelAnnouncement";
import { buildDefaultPrompt, useAIChat } from "@plannotator/ui/hooks/useAIChat";
import { getUIPreferences } from "@plannotator/ui/utils/uiPreferences";
import { getEditorMode, saveEditorMode } from "@plannotator/ui/utils/editorMode";
import { getInputMethod, saveInputMethod } from "@plannotator/ui/utils/inputMethod";
import { useInputMethodSwitch } from "@plannotator/ui/hooks/useInputMethodSwitch";
import { usePrintMode } from "@plannotator/ui/hooks/usePrintMode";
import { useResizablePanel } from "@plannotator/ui/hooks/useResizablePanel";
import { useOverlayViewport } from "@plannotator/ui/hooks/useOverlayViewport";
import { useIsMobile } from "@plannotator/ui/hooks/useIsMobile";
import { deriveImageName } from "@plannotator/ui/components/AttachmentsButton";
import { useSidebar, type SidebarTab } from "@plannotator/ui/hooks/useSidebar";
import { useLinkedDoc } from "@plannotator/ui/hooks/useLinkedDoc";
import { useCodeFilePopout } from "@plannotator/ui/hooks/useCodeFilePopout";
import { useAnnotationDraft } from "@plannotator/ui/hooks/useAnnotationDraft";
import { useEditorAnnotations } from "@plannotator/ui/hooks/useEditorAnnotations";
import { useExternalAnnotations } from "@plannotator/ui/hooks/useExternalAnnotations";
import { decodeAnnotation } from "@plannotator/ui/utils/annotationSchemas";
import { useExternalAnnotationHighlights } from "@plannotator/ui/hooks/useExternalAnnotationHighlights";
import { useFileBrowser } from "@plannotator/ui/hooks/useFileBrowser";
import { getFileEditStatus } from "@plannotator/ui/components/sidebar/FileBrowser";
import { isVaultBrowserEnabled } from "@plannotator/ui/utils/obsidian";
import { isFileBrowserEnabled, getFileBrowserSettings } from "@plannotator/ui/utils/fileBrowser";
import { generateId } from "@plannotator/ui/utils/generateId";
import type { PickerMessage } from "@plannotator/ui/components/sidebar/MessagesBrowser";
import type { CodeFileAnnotationInput } from "@plannotator/ui/components/CodeFilePopout";
import type { AIContext } from "@plannotator/ai";
import type { CommentAskAIContext } from "@plannotator/ui/components/CommentPopover";
import { type SourceSaveCapability } from "@plannotator/shared/source-save";
import type { ObsidianConfig } from "@plannotator/shared/integrations-common";
import type { AgentTerminalCapability } from "@plannotator/shared/agent-terminal";
import { DEMO_PLAN_CONTENT } from "./demoPlan";
import {
  parseAICapabilitiesResponse,
  parsePlanResponse,
  parseSaveNotesResponse,
  parseShareHtmlResponse,
} from "./app-boundaries";
import {
  canUseAnnotateWideMode,
  resolveWideModeExitLayout,
  type WideModeLayoutSnapshot,
  type WideModeType,
} from "./wideMode";
import { useCheckboxOverrides } from "./hooks/useCheckboxOverrides";
import { type AnnotateAgentTerminalPanelHandle } from "./components/AnnotateAgentTerminalPanel";
import { type EditorExportTab, type SourceFileEditWarningAction } from "./components/EditorDialogs";
import { type PendingPasteImage } from "./components/EditorOverlays";
import { EditorAppScreen } from "./components/EditorAppScreen";
import {
  buildAgentTerminalDeliveryRecord,
  buildTerminalAskPrompt,
  isMatchingAgentTerminalDelivery,
  shouldSendAgentTerminalFeedback,
  type AgentTerminalDeliveryRecord,
  type AnnotateFeedbackTarget,
} from "./agentTerminalIntegration";
import {
  buildPlanEditPanelItem,
  buildDirectEditsSection,
  buildSavedFileChangePanelItems,
  buildSavedFileChangesSection,
  composeFeedbackWithEditSections,
  computeEditStats,
  normalizeEditedMarkdown,
} from "./directEdits";
import {
  sourceBackedDocumentKey,
  sourceBackedLinkedDocumentKey,
  useSourceBackedDocuments,
  type SourceBackedDocumentDraftData,
  type SourceBackedSavedFileChangeDraftData,
  type SourceBackedDocumentLifecycleOutcome,
} from "./sourceBackedDocuments";
import { createSourceDocumentWatch } from "./sourceDocumentWatch";
import { dirnameBrowserPath, normalizeBrowserPath, pathIsInsideDir } from "./sourceDocumentPaths";
import { pickRestoredSingleFileDraftToDisplay } from "./draftRestoreSelection";
import { decodeGlobalPasteUploadResponse } from "./globalPasteUploadResponse";
import {
  buildMessageAnnotationCounts,
  countMessageAnnotations,
  createEmptyMessageAnnotationState,
  normalizeMessageAnnotationState,
  type MessageAnnotationState,
} from "./messageAnnotationSession";
import {
  buildAnnotationFeedbackHeading,
  buildAppDocumentPresentation,
  buildFeedbackLossDescription,
  getActionsLabelMode,
  type AnnotateSource,
  type SubmissionStatus,
} from "./appPresentation";
import { buildAppLayoutPresentation } from "./appLayoutPresentation";

type NoteAutoSaveResults = {
  obsidian?: boolean;
};

type AnnotationTypographyStyle = React.CSSProperties & {
  "--annotation-prose-font-family"?: string;
  "--annotation-prose-font-size"?: string;
  "--annotation-code-font-family"?: string;
  "--annotation-code-font-size"?: string;
};

type SaveNotesRequest = {
  obsidian?: ObsidianConfig;
};

type EditorFeedbackRequest = {
  draftGeneration: number;
  feedback: string;
  annotations: Annotation[];
  codeAnnotations: CodeAnnotation[];
  selectedMessageId?: string;
  feedbackScope?: "messages";
};

type PlanResponse = ReturnType<typeof parsePlanResponse>;

type SourceBackedDraftRestorePlan = {
  savedFileChangeCandidates: SourceBackedSavedFileChangeDraftData[];
  editedDocuments: SourceBackedDocumentDraftData[];
};

const buildSourceBackedDraftRestorePlan = (
  editedDocuments: SourceBackedDocumentDraftData[],
  savedFileChanges: SourceBackedSavedFileChangeDraftData[],
): SourceBackedDraftRestorePlan => {
  const candidates = new Map<string, SourceBackedSavedFileChangeDraftData>();
  for (const change of savedFileChanges) candidates.set(change.key, change);
  for (const document of editedDocuments) {
    if (document.savedChange) candidates.set(document.savedChange.key, document.savedChange);
  }

  return {
    savedFileChangeCandidates: [...candidates.values()],
    editedDocuments,
  };
};

function getHTMLElementTarget(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

const choiceQuestionsFromBlocks = (blocks: Block[]) =>
  blocks.flatMap((block) =>
    block.type === "choice-question"
      ? [
          {
            blockId: block.id,
            question: block.content,
            options: block.choiceOptions ?? [],
            recommendedLabel: block.recommendedChoiceLabel,
            sourceText: block.sourceText ?? block.content,
            sourceLineCount: block.sourceLineCount ?? 1,
          },
        ]
      : [],
  );

const reconcileDocumentChoiceAnnotations = (annotations: readonly Annotation[], blocks: Block[]) =>
  reconcileChoiceAnnotations(annotations, choiceQuestionsFromBlocks(blocks));

const App: React.FC = () => {
  const [markdown, setMarkdown] = useState(DEMO_PLAN_CONTENT);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const annotationsRef = useRef<Annotation[]>(annotations);
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);
  const [codeAnnotations, setCodeAnnotations] = useState<CodeAnnotation[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const selectedAnnotationIdRef = useRef<string | null>(selectedAnnotationId);
  useEffect(() => {
    selectedAnnotationIdRef.current = selectedAnnotationId;
  }, [selectedAnnotationId]);
  const [selectedCodeAnnotationId, setSelectedCodeAnnotationId] = useState<string | null>(null);
  const [activeSourceDocumentKey, setActiveSourceDocumentKey] = useState<string | null>(null);
  const activeSourceDocumentKeyRef = useRef<string | null>(activeSourceDocumentKey);
  useEffect(() => {
    activeSourceDocumentKeyRef.current = activeSourceDocumentKey;
  }, [activeSourceDocumentKey]);
  const sourceBackedDocuments = useSourceBackedDocuments();
  const activeSourceBackedDocument = useMemo(
    () =>
      activeSourceDocumentKey
        ? sourceBackedDocuments.getSourceBackedDocument(activeSourceDocumentKey)
        : null,
    [activeSourceDocumentKey, sourceBackedDocuments, sourceBackedDocuments.version],
  );
  const displayedMarkdown = activeSourceBackedDocument?.currentText ?? markdown;
  const frontmatter = useMemo(
    () => extractFrontmatter(displayedMarkdown).frontmatter,
    [displayedMarkdown],
  );
  const blocks = useMemo(() => parseMarkdownToBlocks(displayedMarkdown), [displayedMarkdown]);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showFeedbackPrompt, setShowFeedbackPrompt] = useState(false);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [showSourceFileEditWarning, setShowSourceFileEditWarning] = useState(false);
  const [sourceFileEditWarningAction, setSourceFileEditWarningAction] =
    useState<SourceFileEditWarningAction>("send-feedback");
  const sourceFileEditWarningContinuationRef = useRef<(() => void | Promise<void>) | null>(null);
  // When the warning dialog confirms, route to the handler matching the button that opened it.
  const [exitWarningAction, setExitWarningAction] = useState<"close" | "approve">("close");
  const [isPanelOpen, setIsPanelOpen] = useState(() => window.innerWidth >= 768);
  const [rightSidebarTab, setRightSidebarTab] = useState<"annotations" | "ai">("annotations");
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>(getEditorMode);
  const [inputMethod, setInputMethod] = useState<InputMethod>(getInputMethod);
  const gridEnabled = useConfigValue("gridEnabled");
  const annotationCodeFontFamily = useConfigValue("annotationCodeFontFamily");
  const annotationCodeFontSize = useConfigValue("annotationCodeFontSize");
  const annotationProseFontFamily = useConfigValue("annotationProseFontFamily");
  const annotationProseFontSize = useConfigValue("annotationProseFontSize");
  const annotationTypographyStyle = useMemo<AnnotationTypographyStyle>(() => {
    const style: AnnotationTypographyStyle = {};
    if (annotationProseFontFamily) {
      style["--annotation-prose-font-family"] = `'${annotationProseFontFamily}', var(--font-sans)`;
    }
    if (annotationProseFontSize) {
      style["--annotation-prose-font-size"] = annotationProseFontSize;
    }
    if (annotationCodeFontFamily) {
      style["--annotation-code-font-family"] = `'${annotationCodeFontFamily}', var(--font-mono)`;
    }
    if (annotationCodeFontSize) {
      style["--annotation-code-font-size"] = annotationCodeFontSize;
    }
    return style;
  }, [
    annotationCodeFontFamily,
    annotationCodeFontSize,
    annotationProseFontFamily,
    annotationProseFontSize,
  ]);
  useEffect(() => {
    if (annotationProseFontFamily) loadProseFont(annotationProseFontFamily);
  }, [annotationProseFontFamily]);
  useEffect(() => {
    if (annotationCodeFontFamily) loadCodeFont(annotationCodeFontFamily, "annotationCodeFont");
  }, [annotationCodeFontFamily]);
  const [uiPrefs, setUiPrefs] = useState(() => getUIPreferences());

  // Plan-area width (inside the OverlayScrollArea, after sidebar/panel
  // shrinkage) drives the action button label compactness. ResizeObserver
  // fires every frame during a resize drag, so we store only the BUCKET
  // ('full' | 'short' | 'icon') in state — App.tsx then re-renders at
  // most twice across an entire drag (once per threshold crossing) instead
  // of on every pixel, which would chug the whole tree.
  //
  //   full  → "Global comment" / "Copy plan"  — fits when planArea >= 800
  //   short → "Comment" / "Copy"              — fits when planArea >= 680
  //   icon  → labels hidden                    — fallback below that
  const planAreaRef = useRef<HTMLDivElement>(null);
  const [actionsLabelMode, setActionsLabelMode] = useState<ActionsLabelMode>("full");
  const [isApiMode, setIsApiMode] = useState(false);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [gitUser, setGitUser] = useState<string | undefined>();
  // Markdown edit mode (prototype): CM6 live-preview editor over the raw plan
  // text. originalMarkdownRef is the as-submitted baseline for the edit diff —
  // set once at plan load, never by linked-doc navigation or edit commits.
  const [isEditingMarkdown, setIsEditingMarkdown] = useState(false);
  const isEditingMarkdownRef = useRef(isEditingMarkdown);
  useEffect(() => {
    isEditingMarkdownRef.current = isEditingMarkdown;
  }, [isEditingMarkdown]);
  const [editStats, setEditStats] = useState<{ added: number; removed: number } | null>(null);
  // Bumped on every edit commit so the Viewer remounts: web-highlighter mutates
  // the Viewer DOM, and reconciling changed blocks against the old subtree throws.
  const [editGeneration, setEditGeneration] = useState(0);
  // True while the open editor buffer differs from what it mounted with.
  const [_editorDirty, setEditorDirty] = useState(false);
  // True while the open editor buffer differs from the as-submitted baseline.
  const [editorDiffersFromBaseline, setEditorDiffersFromBaseline] = useState(false);
  const [agentFeedbackRevision, setAgentFeedbackRevision] = useState(0);
  // Two-step guard for the "Cancel" (discard edits + exit) action.
  const [confirmCancelEdits, setConfirmCancelEdits] = useState(false);
  const originalMarkdownRef = useRef<string | null>(null);
  // Last COMMITTED editor text (null = no edits). The Direct Edits diff reads
  // this — never the shared `markdown` state, which linked-doc navigation,
  // message switching, and checkbox toggles repurpose.
  const editedMarkdownRef = useRef<string | null>(null);
  // What the current edit session mounted with, for live dirty tracking.
  const editSessionBaseRef = useRef<string>("");
  const markdownEditorHandleRef = useRef<MarkdownEditorHandle | null>(null);
  const handleMarkdownEditorReady = useCallback((handle: MarkdownEditorHandle | null) => {
    markdownEditorHandleRef.current = handle;
  }, []);
  const suspendedRootSourceBackedDocumentKeyRef = useRef<string | null>(null);
  const [globalAttachments, setGlobalAttachments] = useState<ImageAttachment[]>([]);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [gate, setGate] = useState(false);
  const [annotateSource, setAnnotateSource] = useState<AnnotateSource>(null);
  const [recentMessages, setRecentMessages] = useState<PickerMessage[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const messageStateCacheRef = useRef<Map<string, MessageAnnotationState>>(new Map());
  const [cachedMessageAnnotationCounts, setCachedMessageAnnotationCounts] = useState<
    Map<string, number>
  >(new Map());
  const [sourceInfo, setSourceInfo] = useState<string | undefined>();
  const [sourceConverted, setSourceConverted] = useState(false);
  const [renderAs, setRenderAs] = useState<"markdown" | "html">("markdown");
  const [rawHtml, setRawHtml] = useState("");
  const [shareHtml, setShareHtml] = useState("");
  // Session-level force-markdown preference (`--markdown`). When set, folder/linked HTML
  // files are converted instead of rendered raw — threaded into /api/doc as &convert=1.
  const [convertHtml, setConvertHtml] = useState(false);
  // Hide the floating HTML annotation controls (toolstrip + action cluster) so the
  // user can read the rendered page unobstructed. Selections/annotations are unaffected.
  const [htmlToolsHidden, setHtmlToolsHidden] = useState(false);
  const [sourceFilePath, setSourceFilePath] = useState<string | undefined>();
  const [imageBaseDir, setImageBaseDir] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [submitted, setSubmitted] = useState<SubmissionStatus>(null);
  const [pendingPasteImage, setPendingPasteImage] = useState<PendingPasteImage | null>(null);
  const [sharingEnabled, setSharingEnabled] = useState(true);
  const [shareBaseUrl, setShareBaseUrl] = useState<string | undefined>(undefined);
  const [pasteApiUrl, setPasteApiUrl] = useState<string | undefined>(undefined);
  const [repoInfo, setRepoInfo] = useState<{
    display: string;
    branch?: string;
    host?: string;
  } | null>(null);
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [agentTerminalCapability, setAgentTerminalCapability] =
    useState<AgentTerminalCapability | null>(null);
  const [isAgentTerminalOpen, setIsAgentTerminalOpen] = useState(false);
  const [isAgentTerminalRunning, setIsAgentTerminalRunning] = useState(false);
  const [isAgentTerminalReady, setIsAgentTerminalReady] = useState(false);
  const [agentTerminalSessionId, setAgentTerminalSessionId] = useState<number | null>(null);
  const [agentTerminalDelivery, setAgentTerminalDeliveryState] =
    useState<AgentTerminalDeliveryRecord | null>(null);
  const agentTerminalDeliveryRef = useRef<AgentTerminalDeliveryRecord | null>(null);
  const agentTerminalSessionSeqRef = useRef(0);
  const agentTerminalRef = useRef<AnnotateAgentTerminalPanelHandle>(null);
  const [wideModeType, setWideModeType] = useState<WideModeType | null>(null);
  const wideModeSnapshotRef = useRef<WideModeLayoutSnapshot | null>(null);
  const initialSidebarPreferenceAppliedRef = useRef(false);
  const lastAppliedTocEnabledRef = useRef(uiPrefs.tocEnabled);
  useEffect(() => {
    document.title = repoInfo ? `${repoInfo.display} · Plannotator` : "Plannotator";
  }, [repoInfo]);

  const [initialExportTab, setInitialExportTab] = useState<EditorExportTab>();
  const [aiSessionEnabled, setAISessionEnabled] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiProviders, setAiProviders] = useState<
    Array<{
      id: string;
      name: string;
      capabilities?: Record<string, boolean>;
      models?: Array<{ id: string; label: string; default?: boolean }>;
    }>
  >([]);
  type EditorAIConfig = {
    providerId: string | null;
    model: string | null;
    reasoningEffort: string | null;
  };
  const [aiConfig, setAIConfig] = useState<EditorAIConfig>(() => {
    const saved = getAIProviderSettings();
    const providerId = saved.providerId;
    return {
      providerId,
      model: providerId ? (saved.preferredModels[providerId] ?? null) : null,
      reasoningEffort: null,
    };
  });
  const [showLookAndFeelAnnouncement, setShowLookAndFeelAnnouncement] = useState(
    needsLookAndFeelAnnouncement,
  );
  const isMobile = useIsMobile();

  const viewerRef = useRef<ViewerHandle>(null);
  // containerRef + scrollViewport both point at the OverlayScrollbars
  // viewport element (the node that actually scrolls), not the <main>
  // host. Consumers: useActiveSection (IntersectionObserver root) and
  // everything reading ScrollViewportContext.
  const {
    ref: containerRef,
    viewport: scrollViewport,
    onViewportReady: handleViewportReady,
  } = useOverlayViewport();

  usePrintMode();

  // Sidebar (shared TOC, files, messages)
  const sidebar = useSidebar(false);

  // Resizable panels
  const panelResize = useResizablePanel({
    storageKey: "plannotator-panel-width",
    // Drag the right panel skinny → snap it shut (matches the contents sidebar).
    onSnapClose: () => setIsPanelOpen(false),
    // Render-free drag: write the live width to a :root var the panel reads,
    // so dragging never re-renders this (heavy) App.
    apply: (w) => document.documentElement.style.setProperty("--rpanel-w", `${w}px`),
  });
  const tocResize = useResizablePanel({
    storageKey: "plannotator-toc-width",
    defaultWidth: 240,
    minWidth: 160,
    maxWidth: 400,
    side: "left",
    // Drag the contents panel skinny → snap it shut (prototype behavior).
    onSnapClose: sidebar.close,
    // Render-free drag: write the live width to a :root var the panel reads.
    apply: (w) => document.documentElement.style.setProperty("--toc-w", `${w}px`),
  });
  const agentTerminalResize = useResizablePanel({
    storageKey: "plannotator-agent-terminal-width",
    defaultWidth: 360,
    minWidth: 280,
    maxWidth: 640,
    side: "left",
    onSnapClose: () => setIsAgentTerminalOpen(false),
    apply: (w) => document.documentElement.style.setProperty("--agent-terminal-w", `${w}px`),
  });
  // Whether the document has any TOC-eligible headings (level <= 3, matching
  // buildTocHierarchy). Drives the empty-doc auto-close behavior below — must
  // be declared before the effects that reference it (TDZ in dep arrays).
  const hasTocEntries = useMemo(
    () => blocks.some((b) => b.type === "heading" && (b.level ?? 0) <= 3),
    [blocks],
  );

  const exitWideMode = useCallback(
    (options?: { restore?: boolean; sidebarTab?: SidebarTab; panelOpen?: boolean }) => {
      if (wideModeType === null) {
        if (options?.sidebarTab) sidebar.open(options.sidebarTab);
        if (options?.panelOpen === true) setIsPanelOpen(true);
        else if (options?.panelOpen === false) setIsPanelOpen(false);
        return;
      }

      const snapshot = wideModeSnapshotRef.current;
      const layout = resolveWideModeExitLayout(snapshot, options);

      setWideModeType(null);
      wideModeSnapshotRef.current = null;

      if (layout.sidebarOpen && layout.sidebarTab) {
        sidebar.open(layout.sidebarTab);
      } else {
        sidebar.close();
      }

      if (layout.panelOpen !== undefined) {
        setIsPanelOpen(layout.panelOpen);
      }
    },
    [wideModeType, sidebar.close, sidebar.open],
  );

  const openSidebarTab = useCallback(
    (tab: SidebarTab) => {
      if (wideModeType !== null) {
        exitWideMode({ restore: false, sidebarTab: tab, panelOpen: false });
        return;
      }
      sidebar.open(tab);
    },
    [exitWideMode, wideModeType, sidebar.open],
  );

  const toggleSidebarTab = useCallback(
    (tab: SidebarTab) => {
      if (wideModeType !== null) {
        exitWideMode({ restore: false, sidebarTab: tab, panelOpen: false });
        return;
      }
      sidebar.toggleTab(tab);
    },
    [exitWideMode, wideModeType, sidebar.toggleTab],
  );

  const handleAnnotationPanelToggle = useCallback(() => {
    if (wideModeType !== null) {
      exitWideMode({ restore: false, panelOpen: true });
      setRightSidebarTab("annotations");
      return;
    }
    setRightSidebarTab("annotations");
    setIsPanelOpen((prev) => (rightSidebarTab === "annotations" ? !prev : true));
  }, [exitWideMode, rightSidebarTab, wideModeType]);

  const dismissAIAnnouncement = useCallback(() => {}, []);

  const dismissLookAndFeelAnnouncement = useCallback(() => {
    markLookAndFeelAnnouncementSeen();
    setShowLookAndFeelAnnouncement(false);
  }, []);

  const handleAIChatToggle = useCallback(() => {
    dismissAIAnnouncement();
    if (wideModeType !== null) {
      exitWideMode({ restore: false, panelOpen: true });
      setRightSidebarTab("ai");
      return;
    }
    setRightSidebarTab("ai");
    setIsPanelOpen((prev) => (rightSidebarTab === "ai" ? !prev : true));
  }, [dismissAIAnnouncement, exitWideMode, rightSidebarTab, wideModeType]);

  const hideAgentTerminal = useCallback(() => {
    setIsAgentTerminalOpen(false);
  }, []);

  const handleAgentTerminalRunningChange = useCallback((isRunning: boolean) => {
    setIsAgentTerminalRunning(isRunning);
  }, []);

  const setAgentTerminalDelivery = useCallback((delivery: AgentTerminalDeliveryRecord | null) => {
    agentTerminalDeliveryRef.current = delivery;
    setAgentTerminalDeliveryState(delivery);
  }, []);

  const closeAgentTerminal = useCallback(() => {
    if (agentTerminalRef.current) {
      agentTerminalRef.current.stop();
      return;
    }
    setIsAgentTerminalRunning(false);
    setIsAgentTerminalReady(false);
    setAgentTerminalSessionId(null);
    setAgentTerminalDelivery(null);
    hideAgentTerminal();
  }, [hideAgentTerminal, setAgentTerminalDelivery]);

  const handleAgentTerminalReadyChange = useCallback(
    (ready: boolean) => {
      setIsAgentTerminalReady(ready);
      setAgentTerminalDelivery(null);
      if (!ready) {
        setAgentTerminalSessionId(null);
        return;
      }
      agentTerminalSessionSeqRef.current += 1;
      setAgentTerminalSessionId(agentTerminalSessionSeqRef.current);
    },
    [setAgentTerminalDelivery],
  );

  const openAgentTerminal = useCallback(() => {
    if (wideModeType !== null) {
      exitWideMode({ restore: false, panelOpen: false });
    }
    setIsAgentTerminalOpen(true);
  }, [exitWideMode, wideModeType]);

  const toggleAgentTerminal = useCallback(() => {
    if (isAgentTerminalOpen) {
      hideAgentTerminal();
      return;
    }
    openAgentTerminal();
  }, [hideAgentTerminal, isAgentTerminalOpen, openAgentTerminal]);

  useEffect(() => {
    if (annotateMode && annotateSource !== "message" && agentTerminalCapability) return;
    closeAgentTerminal();
  }, [agentTerminalCapability, annotateMode, annotateSource, closeAgentTerminal]);

  // Sync sidebar open state when the "Auto-open Sidebar" preference changes in
  // Settings. Deliberately does NOT react to the document or render mode —
  // switching files (e.g. in annotate-folder) leaves the sidebar exactly as the
  // user left it.
  useEffect(() => {
    if (wideModeType !== null) return;
    if (lastAppliedTocEnabledRef.current === uiPrefs.tocEnabled) return;
    lastAppliedTocEnabledRef.current = uiPrefs.tocEnabled;
    if (uiPrefs.tocEnabled && hasTocEntries) sidebar.open("toc");
    else if (!uiPrefs.tocEnabled) sidebar.close();
  }, [wideModeType, sidebar.close, sidebar.open, uiPrefs.tocEnabled, hasTocEntries]);

  // Auto-close the sidebar when blocks parse with no TOC entries. Fires
  // only on blocks/hasTocEntries change (not on sidebar state) so a user
  // who manually re-opens the empty sidebar is left alone — until the
  // document changes again (e.g. picking a new file in annotate-folder).
  useEffect(() => {
    if (blocks.length === 0) return;
    if (hasTocEntries) return;
    if (sidebar.activeTab === "toc" && sidebar.isOpen) {
      sidebar.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, hasTocEntries]);

  const linkedDocSidebar = useMemo(
    () => ({
      ...sidebar,
      open: openSidebarTab,
      toggleTab: toggleSidebarTab,
    }),
    [openSidebarTab, sidebar.activeTab, sidebar.close, sidebar.isOpen, toggleSidebarTab],
  );

  const snapshotActiveSourceBackedDocument = useCallback(() => {
    if (!activeSourceBackedDocument) return;
    if (isEditingMarkdown) {
      const live = markdownEditorHandleRef.current?.getMarkdown();
      if (live != null)
        sourceBackedDocuments.updateSourceBackedDocumentText(activeSourceBackedDocument.key, live, {
          forceNotify: true,
        });
      return;
    }
    sourceBackedDocuments.updateSourceBackedDocumentText(
      activeSourceBackedDocument.key,
      displayedMarkdown,
      { forceNotify: true },
    );
  }, [activeSourceBackedDocument, displayedMarkdown, sourceBackedDocuments, isEditingMarkdown]);

  const getLinkedDocumentMarkdown = useCallback(
    (filepath: string, fallback?: string) => {
      const record = sourceBackedDocuments.getSourceBackedDocument(`file:${filepath}`);
      return record?.sourceSave?.enabled ? record.currentText : fallback;
    },
    [sourceBackedDocuments],
  );

  const restoreLinkedDocumentSourceBackedKey = useCallback(() => {
    const restoreKey = suspendedRootSourceBackedDocumentKeyRef.current;
    suspendedRootSourceBackedDocumentKeyRef.current = null;
    setActiveSourceDocumentKey(restoreKey);
  }, []);

  const handleLinkedDocumentLoaded = useCallback(
    (doc: {
      markdown?: string;
      filepath?: string;
      renderAs?: "markdown" | "html";
      sourceSave?: SourceSaveCapability;
    }) => {
      if (annotateSource !== "folder") {
        if (activeSourceBackedDocument?.sourceSave?.enabled) {
          suspendedRootSourceBackedDocumentKeyRef.current = activeSourceBackedDocument.key;
          setActiveSourceDocumentKey(null);
        }
        return undefined;
      }

      if (doc.renderAs === "html" || !doc.filepath || doc.markdown == null) {
        setActiveSourceDocumentKey(null);
        return undefined;
      }

      const key = sourceBackedLinkedDocumentKey(doc.sourceSave, doc.filepath);
      if (!key || !doc.sourceSave?.enabled) {
        setActiveSourceDocumentKey(null);
        return undefined;
      }

      const sourceSave = doc.sourceSave;
      sourceBackedDocuments.openSourceBackedDocument({ key, text: doc.markdown, sourceSave });
      setActiveSourceDocumentKey(key);
      const currentText = sourceBackedDocuments.getSourceBackedDocumentText(key) ?? doc.markdown;
      const record = sourceBackedDocuments.getSourceBackedDocument(key);

      if (isEditingMarkdown) {
        editSessionBaseRef.current = currentText;
        setEditorDirty(false);
        setEditorDiffersFromBaseline(record ? currentText !== record.diskBaseline : false);
      }

      return currentText;
    },
    [activeSourceBackedDocument, annotateSource, sourceBackedDocuments, isEditingMarkdown],
  );

  // Linked document navigation
  const linkedDocHook = useLinkedDoc({
    markdown,
    annotations,
    selectedAnnotationId,
    globalAttachments,
    setMarkdown,
    setAnnotations,
    setSelectedAnnotationId,
    setGlobalAttachments,
    renderAs,
    rawHtml,
    shareHtml,
    setRenderAs,
    setRawHtml,
    setShareHtml,
    viewerRef,
    sidebar: linkedDocSidebar,
    sourceFilePath,
    sourceConverted,
    onBeforeNavigate: snapshotActiveSourceBackedDocument,
    onDocumentLoaded: handleLinkedDocumentLoaded,
    getDocumentMarkdown: getLinkedDocumentMarkdown,
    onAfterBack: restoreLinkedDocumentSourceBackedKey,
  });

  // Active document's directory — feeds both click-time popout fetches and
  // the validator hook so they resolve against the same base. Drifting
  // these would silently re-introduce the demote-correct-link bug.
  const activeDocBaseDir = useMemo(
    () =>
      linkedDocHook.filepath
        ? linkedDocHook.filepath.replace(/\/[^/]+$/, "")
        : imageBaseDir?.includes("/")
          ? imageBaseDir
          : undefined,
    [linkedDocHook.filepath, imageBaseDir],
  );

  // Code file popout (read-only syntax-highlighted overlay)
  const codeFilePopout = useCodeFilePopout({
    buildUrl: useCallback(
      (codePath: string) => {
        return activeDocBaseDir
          ? `/api/doc?path=${encodeURIComponent(codePath)}&base=${encodeURIComponent(activeDocBaseDir)}`
          : `/api/doc?path=${encodeURIComponent(codePath)}`;
      },
      [activeDocBaseDir],
    ),
  });

  const canUseWideMode = useMemo(() => canUseAnnotateWideMode(), []);

  const enterViewMode = useCallback(
    (type: WideModeType) => {
      if (!canUseWideMode) return;
      if (wideModeType === null) {
        wideModeSnapshotRef.current = {
          sidebarIsOpen: sidebar.isOpen,
          sidebarTab: sidebar.activeTab,
          panelOpen: isPanelOpen,
        };
      }
      if (isAgentTerminalOpen) hideAgentTerminal();
      setWideModeType(type);
      sidebar.close();
      setIsPanelOpen(false);
    },
    [
      canUseWideMode,
      hideAgentTerminal,
      isAgentTerminalOpen,
      isPanelOpen,
      wideModeType,
      sidebar.activeTab,
      sidebar.close,
      sidebar.isOpen,
    ],
  );

  const toggleViewMode = useCallback(
    (type: WideModeType) => {
      if (wideModeType === type) {
        exitWideMode();
      } else {
        enterViewMode(type);
      }
    },
    [enterViewMode, exitWideMode, wideModeType],
  );

  useEffect(() => {
    if (!canUseWideMode && wideModeType !== null) {
      exitWideMode();
    }
  }, [canUseWideMode, exitWideMode, wideModeType]);

  // Markdown file browser (also handles vault dirs via isVault flag)
  const fileBrowser = useFileBrowser();
  const vaultPath = useMemo(() => {
    if (!isVaultBrowserEnabled()) return "";
    return getEffectiveVaultPath(getObsidianSettings());
  }, [uiPrefs]);
  const showFilesTab = useMemo(
    () => !!projectRoot || isFileBrowserEnabled() || isVaultBrowserEnabled(),
    [projectRoot, uiPrefs],
  );
  const fileBrowserDirs = useMemo(() => {
    const projectDirs = projectRoot ? [projectRoot] : [];
    const userDirs = isFileBrowserEnabled() ? getFileBrowserSettings().directories : [];
    return [...new Set([...projectDirs, ...userDirs])];
  }, [projectRoot, uiPrefs]);

  // Clear active file when file browser is disabled
  useEffect(() => {
    if (!showFilesTab) fileBrowser.setActiveFile(null);
  }, [showFilesTab]);

  // When vault is disabled, prune any stale vault dirs immediately
  useEffect(() => {
    if (!vaultPath) fileBrowser.clearVaultDirs();
  }, [vaultPath]);

  useEffect(() => {
    if (sidebar.activeTab === "files" && showFilesTab) {
      // Load regular dirs
      if (fileBrowserDirs.length > 0) {
        const regularLoaded = fileBrowser.dirs.filter((d) => !d.isVault).map((d) => d.path);
        const needsRegular =
          fileBrowserDirs.some((d) => !regularLoaded.includes(d)) ||
          regularLoaded.some((d) => !fileBrowserDirs.includes(d));
        if (needsRegular) fileBrowser.fetchAll(fileBrowserDirs);
      }
      // Load vault dir; addVaultDir atomically replaces any existing vault entry so
      // switching vault paths never accumulates stale sections
      if (
        vaultPath &&
        !fileBrowser.dirs.find((d) => d.isVault && d.path === vaultPath && !d.error)
      ) {
        fileBrowser.addVaultDir(vaultPath);
      }
    }
  }, [sidebar.activeTab, showFilesTab, fileBrowserDirs, vaultPath]);

  const buildCurrentMessageState = React.useCallback((): MessageAnnotationState | null => {
    if (annotateSource !== "message" || !selectedMessageId) return null;
    const msg = recentMessages.find((m) => m.messageId === selectedMessageId);
    if (!msg) return null;
    const snapshot = linkedDocHook.snapshotSession();
    return normalizeMessageAnnotationState(
      {
        messageId: msg.messageId,
        text: msg.text,
        timestamp: msg.timestamp,
        linkedDocSession: snapshot,
        codeAnnotations: [...codeAnnotations],
        selectedCodeAnnotationId,
      },
      msg,
    );
  }, [
    annotateSource,
    selectedMessageId,
    recentMessages,
    linkedDocHook.snapshotSession,
    codeAnnotations,
    selectedCodeAnnotationId,
  ]);

  const getMessageStatesWithCurrent = React.useCallback((): Map<string, MessageAnnotationState> => {
    const states = new Map(messageStateCacheRef.current);
    const current = buildCurrentMessageState();
    if (current) states.set(current.messageId, current);
    return states;
  }, [buildCurrentMessageState]);

  const saveCurrentMessageState = React.useCallback((): Map<string, MessageAnnotationState> => {
    const states = getMessageStatesWithCurrent();
    messageStateCacheRef.current = states;
    setCachedMessageAnnotationCounts(buildMessageAnnotationCounts(states));
    return states;
  }, [getMessageStatesWithCurrent]);

  const buildMessageAnnotationEntries = React.useCallback((): MessageAnnotationEntry[] => {
    if (annotateSource !== "message" || recentMessages.length === 0) return [];
    // Must be a PURE read: this runs on the render path via
    // currentFeedbackPayload (useMemo) -> getCurrentFeedbackPayload ->
    // buildFullAnnotationsOutput. saveCurrentMessageState() writes React state
    // (setCachedMessageAnnotationCounts), which during render is an infinite
    // re-render loop in multi-message mode (#949). getMessageStatesWithCurrent
    // returns the same merged data without the setState side effect; the cache
    // persistence happens in event handlers (handleSelectMessage) instead.
    const states = getMessageStatesWithCurrent();
    return recentMessages.map((msg) => {
      const state = states.get(msg.messageId) ?? createEmptyMessageAnnotationState(msg);
      const linkedDocs: Map<string, LinkedDocAnnotationEntry> = new Map();
      for (const [filepath, doc] of state.linkedDocSession.docs) {
        linkedDocs.set(filepath, {
          ...doc,
          blocks: doc.markdown ? parseMarkdownToBlocks(doc.markdown) : undefined,
        });
      }
      return {
        messageId: msg.messageId,
        text: msg.text,
        timestamp: msg.timestamp,
        annotations: state.linkedDocSession.root.annotations,
        globalAttachments: state.linkedDocSession.root.globalAttachments,
        blocks: parseMarkdownToBlocks(state.linkedDocSession.root.markdown),
        linkedDocs,
        codeAnnotations: state.codeAnnotations,
      };
    });
  }, [annotateSource, recentMessages, getMessageStatesWithCurrent]);

  const activeMessageAnnotationCounts = React.useMemo(() => {
    const counts = new Map(cachedMessageAnnotationCounts);
    const current = buildCurrentMessageState();
    if (current) {
      const count = countMessageAnnotations(current);
      if (count > 0) counts.set(current.messageId, count);
      else counts.delete(current.messageId);
    }
    return counts;
  }, [cachedMessageAnnotationCounts, buildCurrentMessageState]);

  const messageFeedbackAnnotationCount = React.useMemo(
    () => Array.from(activeMessageAnnotationCounts.values()).reduce((sum, count) => sum + count, 0),
    [activeMessageAnnotationCounts],
  );

  const annotatedMessageIds = React.useMemo(
    () => Array.from(activeMessageAnnotationCounts.keys()),
    [activeMessageAnnotationCounts],
  );

  // File browser file selection: open via linked doc system
  // For vault dirs (isVault), use the Obsidian doc endpoint; otherwise use generic /api/doc
  const handleSelectMessage = React.useCallback(
    (messageId: string) => {
      const msg = recentMessages.find((m) => m.messageId === messageId);
      if (!msg || messageId === selectedMessageId) return;

      const states = saveCurrentMessageState();
      const targetState = normalizeMessageAnnotationState(
        states.get(messageId) ?? createEmptyMessageAnnotationState(msg),
        msg,
      );

      setSelectedMessageId(messageId);
      linkedDocHook.restoreSession(targetState.linkedDocSession);
      setCodeAnnotations([...targetState.codeAnnotations]);
      setSelectedCodeAnnotationId(targetState.selectedCodeAnnotationId);
    },
    [recentMessages, selectedMessageId, saveCurrentMessageState, linkedDocHook.restoreSession],
  );

  const handleFileBrowserSelect = React.useCallback(
    (absolutePath: string, dirPath: string) => {
      const normalizedAbsolutePath = normalizeBrowserPath(absolutePath);
      const dirState = fileBrowser.dirs.find((d) => d.path === dirPath);
      const normalizedDirPath = normalizeBrowserPath(dirPath);
      const dirPrefix =
        normalizedDirPath === "/" || /^[A-Za-z]:\/$/.test(normalizedDirPath)
          ? normalizedDirPath
          : `${normalizedDirPath}/`;
      const relativePath =
        normalizedAbsolutePath === normalizedDirPath
          ? ""
          : normalizedAbsolutePath.startsWith(dirPrefix)
            ? normalizedAbsolutePath.slice(dirPrefix.length)
            : undefined;
      const sourceBackedStatus = getFileEditStatus(
        absolutePath,
        sourceBackedDocuments.fileEditStatuses,
        relativePath,
        dirState?.workspaceStatus,
      );
      const sourceBackedKey = sourceBackedStatus?.key ?? `file:${absolutePath}`;
      const sourceBackedRecord = sourceBackedDocuments.getSourceBackedDocument(sourceBackedKey);
      if (sourceBackedRecord?.missingOnDisk && sourceBackedRecord.sourceSave?.enabled) {
        linkedDocHook.openLoaded(
          {
            filepath: sourceBackedRecord.path ?? absolutePath,
            markdown: sourceBackedRecord.currentText,
            renderAs: "markdown",
            sourceSave: sourceBackedRecord.sourceSave,
          },
          "files",
          { notifyDocumentLoaded: false },
        );
        setActiveSourceDocumentKey(sourceBackedKey);
        if (isEditingMarkdown) {
          editSessionBaseRef.current = sourceBackedRecord.currentText;
          setEditorDirty(false);
          setEditorDiffersFromBaseline(
            sourceBackedRecord.currentText !== sourceBackedRecord.diskBaseline,
          );
          setEditStats(
            sourceBackedRecord.currentText !== sourceBackedRecord.diskBaseline
              ? computeEditStats(sourceBackedRecord.diskBaseline, sourceBackedRecord.currentText)
              : null,
          );
        }
        fileBrowser.setActiveFile(absolutePath);
        return;
      }

      const buildUrl = dirState?.isVault
        ? (path: string) =>
            `/api/reference/obsidian/doc?vaultPath=${encodeURIComponent(dirPath)}&path=${encodeURIComponent(path)}`
        : (path: string) =>
            `/api/doc?path=${encodeURIComponent(path)}&base=${encodeURIComponent(dirPath)}${convertHtml ? "&convert=1" : ""}`;
      linkedDocHook.open(absolutePath, buildUrl, "files");
      fileBrowser.setActiveFile(absolutePath);
    },
    [sourceBackedDocuments, linkedDocHook, fileBrowser, convertHtml, isEditingMarkdown],
  );

  // Route linked doc opens through the correct endpoint based on current context
  const handleOpenLinkedDoc = React.useCallback(
    (docPath: string) => {
      const activeDirState = fileBrowser.dirs.find((d) => d.path === fileBrowser.activeDirPath);
      if (activeDirState?.isVault && fileBrowser.activeDirPath) {
        linkedDocHook.open(
          docPath,
          (path) =>
            `/api/reference/obsidian/doc?vaultPath=${encodeURIComponent(fileBrowser.activeDirPath!)}&path=${encodeURIComponent(path)}`,
        );
      } else if (fileBrowser.activeFile && fileBrowser.activeDirPath) {
        // When viewing a file browser doc, resolve links relative to current file's directory
        const baseDir =
          linkedDocHook.filepath?.replace(/\/[^/]+$/, "") || fileBrowser.activeDirPath;
        linkedDocHook.open(
          docPath,
          (path) =>
            `/api/doc?path=${encodeURIComponent(path)}&base=${encodeURIComponent(baseDir)}${convertHtml ? "&convert=1" : ""}`,
        );
      } else {
        // Pass the current file's directory as base for relative path resolution
        const baseDir = linkedDocHook.filepath
          ? linkedDocHook.filepath.replace(/\/[^/]+$/, "")
          : imageBaseDir?.includes("/")
            ? imageBaseDir
            : undefined;
        if (baseDir) {
          linkedDocHook.open(
            docPath,
            (path) =>
              `/api/doc?path=${encodeURIComponent(path)}&base=${encodeURIComponent(baseDir)}${convertHtml ? "&convert=1" : ""}`,
          );
        } else {
          linkedDocHook.open(docPath);
        }
      }
    },
    [
      fileBrowser.dirs,
      fileBrowser.activeDirPath,
      fileBrowser.activeFile,
      linkedDocHook,
      imageBaseDir,
      convertHtml,
    ],
  );

  // Wrap linked doc back to also clear file browser active file
  const handleLinkedDocBack = React.useCallback(() => {
    linkedDocHook.back();
    if (isEditingMarkdown) {
      setIsEditingMarkdown(false);
      setEditorDirty(false);
      setEditorDiffersFromBaseline(false);
    }
    fileBrowser.setActiveFile(null);
  }, [linkedDocHook, isEditingMarkdown, fileBrowser]);

  // Derive annotation counts per file from linked doc cache (includes active doc's live state)
  const allAnnotationCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [fp, cached] of linkedDocHook.getDocAnnotations()) {
      const count = cached.annotations.length + cached.globalAttachments.length;
      if (count > 0) counts.set(fp, count);
    }
    return counts;
  }, [linkedDocHook.getDocAnnotations, annotations, globalAttachments]);

  // FileBrowser counts: all files under any loaded dir (regular + vault)
  const fileAnnotationCounts = useMemo(() => {
    const allDirPaths = fileBrowser.dirs.map((d) => d.path);
    if (allDirPaths.length === 0) return allAnnotationCounts;
    const counts = new Map<string, number>();
    for (const [fp, count] of allAnnotationCounts) {
      if (allDirPaths.some((dir) => pathIsInsideDir(fp, dir))) {
        counts.set(fp, count);
      }
    }
    return counts;
  }, [allAnnotationCounts, fileBrowser.dirs]);

  const hasFileAnnotations = fileAnnotationCounts.size > 0;

  // Annotations in other files (not the current view) — for the right panel "+N" indicator
  const otherFileAnnotations = useMemo(() => {
    const currentFile = linkedDocHook.filepath;
    let count = 0;
    let files = 0;
    for (const [fp, n] of allAnnotationCounts) {
      if (fp !== currentFile) {
        count += n;
        files++;
      }
    }
    return count > 0 ? { count, files } : undefined;
  }, [allAnnotationCounts, linkedDocHook.filepath]);

  // Flash highlight for annotated files in the sidebar
  const [highlightedFiles, setHighlightedFiles] = useState<Set<string> | undefined>();
  const flashTimerRef = React.useRef<ReturnType<typeof setTimeout>>();
  const handleFlashAnnotatedFiles = React.useCallback(() => {
    const filePaths = new Set(allAnnotationCounts.keys());
    if (filePaths.size === 0) return;
    // Open sidebar to the files tab so the flash is visible
    if (!sidebar.isOpen || sidebar.activeTab !== "files") {
      openSidebarTab("files");
    }
    // Cancel any pending clear from a previous flash
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    // Clear first so re-triggering restarts the CSS animation
    setHighlightedFiles(undefined);
    requestAnimationFrame(() => {
      setHighlightedFiles(filePaths);
      flashTimerRef.current = setTimeout(() => setHighlightedFiles(undefined), 1200);
    });
  }, [allAnnotationCounts, openSidebarTab, sidebar, hasFileAnnotations]);

  // Track active section for TOC highlighting
  const headingCount = useMemo(() => blocks.filter((b) => b.type === "heading").length, [blocks]);
  const activeSection = useActiveSection(containerRef, headingCount, scrollViewport);

  const { editorAnnotations, deleteEditorAnnotation } = useEditorAnnotations();
  const { externalAnnotations, updateExternalAnnotation, deleteExternalAnnotation } =
    useExternalAnnotations(decodeAnnotation, { enabled: isApiMode });
  const externalChoiceReconciliation = useMemo(
    () => reconcileDocumentChoiceAnnotations(externalAnnotations, blocks),
    [externalAnnotations, blocks],
  );
  const safeExternalAnnotations = externalChoiceReconciliation.retained;
  useEffect(() => {
    const invalidatedIds = new Set(externalChoiceReconciliation.invalidatedIds);
    for (const id of externalChoiceReconciliation.invalidatedIds) deleteExternalAnnotation(id);
    if (selectedAnnotationIdRef.current && invalidatedIds.has(selectedAnnotationIdRef.current)) {
      selectedAnnotationIdRef.current = null;
      setSelectedAnnotationId(null);
    }
  }, [deleteExternalAnnotation, externalChoiceReconciliation]);

  // Drive DOM highlights for SSE-delivered external annotations. Disabled
  // while a linked doc overlay is open (Viewer DOM is hidden) and while the
  // a dedicated diff surface is active (diff view has its own annotation surface).
  const { reset: resetExternalHighlights } = useExternalAnnotationHighlights({
    viewerRef,
    externalAnnotations: safeExternalAnnotations,
    enabled: isApiMode && !linkedDocHook.isActive && true && !isEditingMarkdown,
    planKey: markdown,
  });

  // Merge local + SSE annotations, deduping draft-restored externals against
  // live SSE versions. Prefer the SSE version when both exist (same source,
  // type, and originalText). This avoids the timing issues of an effect-based
  // cleanup — draft-restored externals persist until SSE actually re-delivers them.
  const allAnnotations = useMemo(() => {
    if (safeExternalAnnotations.length === 0) return annotations;

    const local = annotations.filter((a) => {
      if (!a.source) return true;
      return !safeExternalAnnotations.some(
        (ext) =>
          ext.source === a.source && ext.type === a.type && ext.originalText === a.originalText,
      );
    });

    return [...local, ...safeExternalAnnotations];
  }, [annotations, safeExternalAnnotations]);

  // Plan diff state — memoize filtered annotation lists to avoid new references per render
  const _diffAnnotations = useMemo(
    () => allAnnotations.filter((a) => !!a.diffContext),
    [allAnnotations],
  );
  const viewerAnnotations = useMemo(
    () => allAnnotations.filter((a) => !a.diffContext),
    [allAnnotations],
  );
  // Any-annotations flag used by Close/Approve/Send guards. Consolidates the
  // four-term check that was inlined across the annotate-mode header + keyboard paths.
  const messageMultiSelectMode = annotateSource === "message" && recentMessages.length > 1;
  const hasAnyAnnotations = useMemo(
    () =>
      messageMultiSelectMode
        ? messageFeedbackAnnotationCount > 0 || editorAnnotations.length > 0
        : allAnnotations.length > 0 ||
          codeAnnotations.length > 0 ||
          editorAnnotations.length > 0 ||
          linkedDocHook.docAnnotationCount > 0 ||
          globalAttachments.length > 0,
    [
      messageMultiSelectMode,
      messageFeedbackAnnotationCount,
      allAnnotations.length,
      codeAnnotations.length,
      editorAnnotations.length,
      linkedDocHook.docAnnotationCount,
      globalAttachments.length,
    ],
  );
  const feedbackAnnotationCount = messageMultiSelectMode
    ? messageFeedbackAnnotationCount + editorAnnotations.length
    : allAnnotations.length +
      codeAnnotations.length +
      editorAnnotations.length +
      linkedDocHook.docAnnotationCount +
      globalAttachments.length;

  const buildFullAnnotationsOutput = React.useCallback((): string => {
    if (messageMultiSelectMode) {
      let output = exportMessageAnnotations(buildMessageAnnotationEntries());
      if (editorAnnotations.length > 0) {
        output += `\n\n${exportEditorAnnotations(editorAnnotations)}`;
      }
      return output;
    }
    return "";
  }, [messageMultiSelectMode, buildMessageAnnotationEntries, editorAnnotations]);

  const annotationsOutput = useMemo(() => {
    const docAnnotations = linkedDocHook.getDocAnnotations();
    const hasDocAnnotations = Array.from(docAnnotations.values()).some(
      (d) => d.annotations.length > 0 || d.globalAttachments.length > 0,
    );
    const hasPlanAnnotations = allAnnotations.length > 0 || globalAttachments.length > 0;
    const hasEditorAnnotations = editorAnnotations.length > 0;
    const hasCodeAnnotations = codeAnnotations.length > 0;

    if (!hasPlanAnnotations && !hasDocAnnotations && !hasEditorAnnotations && !hasCodeAnnotations) {
      return "User reviewed the document and has no feedback.";
    }

    const activeConverted = linkedDocHook.isActive
      ? (docAnnotations.get(linkedDocHook.filepath ?? "")?.isConverted ?? false)
      : sourceConverted;

    let output = hasPlanAnnotations
      ? exportAnnotations(
          blocks,
          allAnnotations,
          globalAttachments,
          buildAnnotationFeedbackHeading(annotateSource),
          annotateSource ?? "file",
          { sourceConverted: activeConverted },
        )
      : "";

    if (hasDocAnnotations) {
      const enriched: Map<string, LinkedDocAnnotationEntry> = new Map(docAnnotations);
      for (const [filepath, entry] of enriched) {
        if (entry.markdown) {
          enriched.set(filepath, { ...entry, blocks: parseMarkdownToBlocks(entry.markdown) });
        }
      }
      output += exportLinkedDocAnnotations(enriched);
    }

    if (hasEditorAnnotations) {
      output += exportEditorAnnotations(editorAnnotations);
    }

    if (hasCodeAnnotations) {
      output += exportCodeFileAnnotations(codeAnnotations);
    }

    return output;
  }, [
    blocks,
    allAnnotations,
    globalAttachments,
    linkedDocHook.getDocAnnotations,
    editorAnnotations,
    codeAnnotations,
    sourceConverted,
    annotateSource,
    linkedDocHook.isActive,
    linkedDocHook.filepath,
  ]);

  // Code-file comments are intentionally not serialized into share URLs in v1.
  // Hide share entry points once they exist so we do not silently drop feedback.
  const canShareCurrentSession = sharingEnabled && codeAnnotations.length === 0;

  const resolveRawHtmlForShare = useCallback(async (): Promise<string | null> => {
    if (renderAs !== "html" || !rawHtml) return null;
    if (shareHtml) return shareHtml;
    if (!isApiMode) return rawHtml;

    const params = new URLSearchParams();
    const activePath = linkedDocHook.filepath ?? sourceFilePath;
    if (activePath) params.set("path", activePath);
    const query = params.toString();
    const res = await fetch(`/api/share-html${query ? `?${query}` : ""}`);
    const data = parseShareHtmlResponse(await res.json().catch(() => ({})));
    if (!res.ok || data.error || data.shareHtml === undefined) {
      throw new Error(data.error || "Failed to prepare HTML for sharing");
    }
    setShareHtml(data.shareHtml);
    return data.shareHtml;
  }, [isApiMode, linkedDocHook.filepath, rawHtml, renderAs, shareHtml, sourceFilePath]);

  // URL-based sharing
  const {
    isSharedSession,
    isLoadingShared,
    shareUrl,
    shareUrlSize,
    shortShareUrl,
    isGeneratingShortUrl,
    shortUrlError,
    pendingSharedAnnotations,
    _sharedGlobalAttachments,
    clearPendingSharedAnnotations,
    generateShortUrl,
    importFromShareUrl,
    shareLoadError,
    clearShareLoadError,
  } = useSharing(
    markdown,
    allAnnotations,
    globalAttachments,
    setMarkdown,
    setAnnotations,
    setGlobalAttachments,
    () => {
      // When loaded from share, mark as loaded
      setIsLoading(false);
    },
    shareBaseUrl,
    pasteApiUrl,
    renderAs === "html" ? rawHtml : undefined,
    resolveRawHtmlForShare,
    setRawHtml,
    setShareHtml,
    setRenderAs,
  );

  useEffect(() => {
    if (initialSidebarPreferenceAppliedRef.current) return;
    if (isLoading || isLoadingShared) return;
    if (wideModeType !== null) return;

    initialSidebarPreferenceAppliedRef.current = true;
    if (annotateSource === "folder") return;
    if (renderAs === "html") {
      sidebar.close();
      return;
    }
    if (uiPrefs.tocEnabled && hasTocEntries) {
      sidebar.open("toc");
    }
  }, [
    annotateSource,
    hasTocEntries,
    isLoading,
    isLoadingShared,
    renderAs,
    sidebar.close,
    sidebar.open,
    uiPrefs.tocEnabled,
    wideModeType,
  ]);

  const ensureShareLink = useCallback(async (): Promise<string | null> => {
    const existing = shortShareUrl || shareUrl;
    if (existing) return existing;
    if (!canShareCurrentSession) return null;
    return await generateShortUrl();
  }, [canShareCurrentSession, generateShortUrl, shareUrl, shortShareUrl]);

  // useLayoutEffect + synchronous getBoundingClientRect so the initial
  // bucket is set before the browser paints. Otherwise narrow viewports
  // get a one-frame flash of "Global comment"/"Copy plan" labels before
  // the ResizeObserver callback collapses them.
  useLayoutEffect(() => {
    if (isLoading && !isSharedSession) return;

    const el = planAreaRef.current;
    if (!el) return;
    setActionsLabelMode(getActionsLabelMode(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([entry]) => {
      const next = getActionsLabelMode(entry.contentRect.width);
      setActionsLabelMode((prev) => (prev === next ? prev : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isLoading, isSharedSession]);

  // The user's current direct-edit text: the open editor buffer, else the
  // last commit; null when there is none or it matches the baseline. Never
  // the shared `markdown` state, which linked docs, message switching, and
  // checkbox toggles legitimately mutate. Feeds both the draft auto-save and
  // the Direct Edits feedback section.
  const getEditedMarkdown = useCallback((): string | null => {
    if (activeSourceBackedDocument?.sourceSave?.enabled) {
      const live = isEditingMarkdown ? markdownEditorHandleRef.current?.getMarkdown() : null;
      return normalizeEditedMarkdown(
        activeSourceBackedDocument.diskBaseline,
        live ?? activeSourceBackedDocument.currentText,
      );
    }

    const base = originalMarkdownRef.current;
    if (base === null) return null;
    const live = isEditingMarkdown ? markdownEditorHandleRef.current?.getMarkdown() : null;
    return normalizeEditedMarkdown(base, live ?? editedMarkdownRef.current);
  }, [activeSourceBackedDocument, isEditingMarkdown]);

  const getDraftEditedMarkdown = useCallback((): string | null => {
    if (activeSourceBackedDocument?.sourceSave?.enabled) return null;
    return getEditedMarkdown();
  }, [activeSourceBackedDocument, getEditedMarkdown]);

  // Auto-save annotation drafts
  const {
    draftBanner,
    restoreDraft,
    scheduleDraftSave,
    scheduleDraftSaveAfterSubmitFailure,
    getDraftGeneration,
    dismissDraft,
  } = useAnnotationDraft({
    annotations: allAnnotations,
    codeAnnotations,
    globalAttachments,
    getEditedMarkdown: getDraftEditedMarkdown,
    getEditedDocuments: sourceBackedDocuments.getSourceBackedDraftDocuments,
    getSavedFileChanges: sourceBackedDocuments.getSourceBackedDraftSavedFileChanges,
    isApiMode,
    isSharedSession,
    // isSubmitting counts: a save firing while approve/deny is in flight can
    // land after the server's draft delete and ghost a "Draft Recovered"
    // banner into the next session for this plan. Saving resumes if it fails.
    submitted: !!submitted || isSubmitting,
  });

  // Apply shared annotations to DOM after they're loaded
  useEffect(() => {
    if (pendingSharedAnnotations && pendingSharedAnnotations.length > 0) {
      const pendingChoiceReconciliation = reconcileDocumentChoiceAnnotations(
        pendingSharedAnnotations,
        blocks,
      );
      const invalidatedPendingIds = new Set(pendingChoiceReconciliation.invalidatedIds);
      pendingChoiceReconciliation.invalidatedIds.forEach((id) =>
        viewerRef.current?.removeHighlight(id),
      );
      if (
        selectedAnnotationIdRef.current &&
        invalidatedPendingIds.has(selectedAnnotationIdRef.current)
      ) {
        selectedAnnotationIdRef.current = null;
        setSelectedAnnotationId(null);
      }
      const safePendingAnnotations = pendingChoiceReconciliation.retained;
      setAnnotations(safePendingAnnotations);

      // Small delay to ensure DOM is rendered
      const timer = setTimeout(() => {
        // Clear existing highlights first (important when loading new share URL)
        viewerRef.current?.clearAllHighlights();
        viewerRef.current?.applySharedAnnotations(
          safePendingAnnotations.filter((a) => !a.diffContext),
        );
        clearPendingSharedAnnotations();
        // `clearAllHighlights` wiped live external SSE highlights too;
        // tell the external-highlight bookkeeper to re-apply them.
        resetExternalHighlights();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [blocks, pendingSharedAnnotations, clearPendingSharedAnnotations, resetExternalHighlights]);

  // Swap the document to `next` and re-resolve annotation block anchors against
  // the new parse so exported line labels don't point at stale content.
  // Annotations whose text no longer exists get blockId '' — exportAnnotations
  // omits the line label instead of emitting a wrong one. Returns the remapped
  // objects so callers repaint THOSE, not the pre-remap ones (whose stale
  // startMeta/endMeta would let fromStore() silently highlight wrong content).
  // `list` defaults to current state; draft restore passes the restored set,
  // which isn't in state yet when the remap runs.
  const applyEditedDocument = useCallback((next: string, list?: Annotation[]): Annotation[] => {
    const sourceAnnotations = list ?? annotationsRef.current;
    const newBlocks = parseMarkdownToBlocks(next);
    const choiceReconciliation = reconcileDocumentChoiceAnnotations(sourceAnnotations, newBlocks);
    const retainedChoices = new Map(
      choiceReconciliation.retained
        .filter(isChoiceAnnotation)
        .map((annotation) => [annotation.id, annotation]),
    );
    const invalidatedChoiceIds = new Set(choiceReconciliation.invalidatedIds);
    choiceReconciliation.invalidatedIds.forEach((id) => viewerRef.current?.removeHighlight(id));
    if (
      selectedAnnotationIdRef.current &&
      invalidatedChoiceIds.has(selectedAnnotationIdRef.current)
    ) {
      selectedAnnotationIdRef.current = null;
      setSelectedAnnotationId(null);
    }

    const remapped = sourceAnnotations.flatMap((a) => {
      if (isChoiceAnnotation(a)) {
        const retainedChoice = retainedChoices.get(a.id);
        return retainedChoice ? [retainedChoice] : [];
      }
      if (
        a.diffContext ||
        a.type === AnnotationType.GLOBAL_COMMENT ||
        a.id.startsWith("ann-checkbox-")
      )
        return [a];
      const blk = newBlocks.find((b) => b.content.includes(a.originalText));
      if ((blk?.id ?? "") === a.blockId) return [a];
      // Block moved: also strip startMeta/endMeta — fromStore() anchors by
      // positional parent index without validating text. Text-search is safe.
      return [{ ...a, _blockId: blk?.id ?? "", startMeta: undefined, endMeta: undefined }];
    });
    setMarkdown(next);
    setEditGeneration((g) => g + 1);
    annotationsRef.current = remapped;
    setAnnotations(remapped);
    return remapped;
  }, []);

  // The Viewer is remounted after every edit-mode exit (it was unmounted while
  // editing), so highlight DOM is rebuilt from scratch. Re-anchor via the same
  // text-search restore used by draft/share/linked-doc flows, then report
  // annotations whose text vanished. resetExternalHighlights repaints live SSE
  // annotation highlights the same way the share-import path does.
  const repaintHighlights = useCallback(
    (list: Annotation[]) => {
      resetExternalHighlights();
      const planAnnotations = list.filter(
        (a) =>
          !a.diffContext &&
          a.type !== AnnotationType.GLOBAL_COMMENT &&
          !a.id.startsWith("ann-checkbox-"),
      );
      if (planAnnotations.length === 0) return;
      setTimeout(() => {
        viewerRef.current?.applySharedAnnotations(planAnnotations);
        // web-highlighter restores use data-highlight-id; manual code-block
        // wraps use data-bind-id. Either counts as present.
        const missing = planAnnotations.filter(
          (a) => !document.querySelector(`[data-bind-id="${a.id}"], [data-highlight-id="${a.id}"]`),
        );
        if (missing.length > 0) {
          toast(
            `${missing.length} annotation${missing.length === 1 ? "" : "s"} no longer match the text`,
            {
              description: "The highlighted text was edited. They remain listed in the panel.",
              duration: 5000,
            },
          );
        }
      }, 120);
    },
    [resetExternalHighlights],
  );

  // Commits the open editor buffer: updates markdown state, records the edit
  // for the Direct Edits diff, re-anchors annotations, repaints highlights.
  const commitMarkdownEdits = useCallback(() => {
    if (!isEditingMarkdown) return;
    const edited = markdownEditorHandleRef.current?.getMarkdown();
    setIsEditingMarkdown(false);
    setEditorDirty(false);
    setEditorDiffersFromBaseline(false);

    const base = originalMarkdownRef.current;
    if (edited != null) {
      if (activeSourceBackedDocument?.sourceSave?.enabled) {
        sourceBackedDocuments.updateSourceBackedDocumentText(
          activeSourceBackedDocument.key,
          edited,
          { forceNotify: true },
        );
        const sourceEdited = normalizeEditedMarkdown(
          activeSourceBackedDocument.diskBaseline,
          edited,
        );
        editedMarkdownRef.current = null;
        setEditStats(
          sourceEdited !== null
            ? computeEditStats(activeSourceBackedDocument.diskBaseline, sourceEdited)
            : null,
        );
        if (sourceEdited !== null && window.innerWidth >= 768) {
          setRightSidebarTab("annotations");
          setIsPanelOpen(true);
        }
      } else {
        const normalizedEdited = normalizeEditedMarkdown(base, edited);
        editedMarkdownRef.current = normalizedEdited;
        setEditStats(
          base !== null && normalizedEdited !== null
            ? computeEditStats(base, normalizedEdited)
            : null,
        );
        // Surface the Direct Edits card so the user sees where their changes went.
        if (base !== null && normalizedEdited !== null && window.innerWidth >= 768) {
          setRightSidebarTab("annotations");
          setIsPanelOpen(true);
        }
      }
    }

    const renderedBaseline = activeSourceBackedDocument?.sourceSave?.enabled
      ? markdown
      : displayedMarkdown;
    const remapped =
      edited != null && edited !== renderedBaseline ? applyEditedDocument(edited) : annotations;
    repaintHighlights(remapped);
    scheduleDraftSave();
  }, [
    activeSourceBackedDocument,
    displayedMarkdown,
    sourceBackedDocuments,
    isEditingMarkdown,
    annotations,
    markdown,
    applyEditedDocument,
    repaintHighlights,
    scheduleDraftSave,
  ]);

  // Discards direct edits for one document. Source-backed folder edits are
  // file-scoped; the root annotation document has a single document.
  const handleDiscardEdits = useCallback(
    (sourceKey?: string) => {
      const targetKey = sourceKey ?? activeSourceBackedDocument?.key;
      const targetIsActive = activeSourceDocumentKey === targetKey;
      const targetRecord = targetKey
        ? sourceBackedDocuments.getSourceBackedDocument(targetKey)
        : null;
      if (sourceKey && !targetRecord?.sourceSave?.enabled) return;

      if (targetKey && targetRecord?.sourceSave?.enabled) {
        const outcome = sourceBackedDocuments.discardSourceBackedDocumentEdits(targetKey);
        if (outcome.type !== "document-discarded") return;
        const discarded = outcome.record;
        if (!targetIsActive) {
          scheduleDraftSave();
          return;
        }

        setIsEditingMarkdown(false);
        setEditorDirty(false);
        setEditorDiffersFromBaseline(false);
        editedMarkdownRef.current = null;
        setEditStats(null);
        if (discarded.missingOnDisk) {
          setActiveSourceDocumentKey(null);
          if (linkedDocHook.isActive) {
            linkedDocHook.back();
            fileBrowser.setActiveFile(null);
          } else {
            const remapped = displayedMarkdown !== "" ? applyEditedDocument("") : annotations;
            repaintHighlights(remapped);
            originalMarkdownRef.current = "";
          }
          scheduleDraftSave();
          return;
        }
        const remapped =
          displayedMarkdown !== discarded.diskBaseline
            ? applyEditedDocument(discarded.diskBaseline)
            : annotations;
        repaintHighlights(remapped);
        scheduleDraftSave();
        return;
      }

      const base = originalMarkdownRef.current;
      if (base === null) return;
      setIsEditingMarkdown(false);
      setEditorDirty(false);
      setEditorDiffersFromBaseline(false);
      editedMarkdownRef.current = null;
      setEditStats(null);
      const remapped = markdown !== base ? applyEditedDocument(base) : annotations;
      repaintHighlights(remapped);
      scheduleDraftSave();
    },
    [
      activeSourceBackedDocument,
      activeSourceDocumentKey,
      sourceBackedDocuments,
      displayedMarkdown,
      markdown,
      annotations,
      applyEditedDocument,
      repaintHighlights,
      linkedDocHook,
      fileBrowser,
      scheduleDraftSave,
    ],
  );

  // Restores a recovered draft: annotations always; direct edits when present
  // and the baseline exists. Edits flow through the same helpers
  // commitMarkdownEdits uses, with the RESTORED annotations remapped against
  // the edited document (they aren't in state yet when the remap runs).
  const validateDraftSavedFileChanges = useCallback(
    async (
      changes: SourceBackedSavedFileChangeDraftData[],
    ): Promise<{
      kept: SourceBackedSavedFileChangeDraftData[];
      changedOrMissing: SourceBackedSavedFileChangeDraftData[];
      unverified: SourceBackedSavedFileChangeDraftData[];
    }> => {
      if (changes.length === 0) return { kept: [], changedOrMissing: [], unverified: [] };
      const result = await sourceBackedDocuments.validateSourceBackedSavedFileChanges(changes);
      const changedOrMissing = result.dropped
        .filter((entry) => entry.reason === "changed" || entry.reason === "missing")
        .map((entry) => entry.change);

      if (changedOrMissing.length > 0) {
        toast("Some saved edit context was not restored", {
          description: "Those files changed or disappeared after Plannotator saved them.",
          duration: 5000,
        });
      }
      if (result.unverified.length > 0) {
        toast("Some saved edit context could not be verified", {
          description: "Plannotator kept it for now and will check again before sending feedback.",
          duration: 5000,
        });
      }

      return {
        kept: [...result.valid, ...result.unverified],
        changedOrMissing,
        unverified: result.unverified,
      };
    },
    [sourceBackedDocuments],
  );

  const handleRestoreDraft = React.useCallback(async () => {
    const {
      annotations: restored,
      codeAnnotations: restoredCode,
      globalAttachments: restoredGlobal,
      editedMarkdown,
      editedDocuments,
      savedFileChanges,
    } = restoreDraft();
    if (restoredCode.length > 0) setCodeAnnotations(restoredCode);
    if (restoredGlobal.length > 0) setGlobalAttachments(restoredGlobal);

    const sourceBackedRestorePlan = buildSourceBackedDraftRestorePlan(
      editedDocuments,
      savedFileChanges,
    );
    const validatedSaved = await validateDraftSavedFileChanges(
      sourceBackedRestorePlan.savedFileChangeCandidates,
    );
    const validSavedChangeByKey = new Map(
      validatedSaved.kept.map((change) => [change.key, change]),
    );
    const editedDocumentKeys = new Set(editedDocuments.map((doc) => doc.key));
    const cleanSavedFileChanges = validatedSaved.kept.filter(
      (change) => !editedDocumentKeys.has(change.key),
    );
    const editedDocumentsForRestore: SourceBackedDocumentDraftData[] =
      sourceBackedRestorePlan.editedDocuments.map((doc) =>
        doc.savedChange
          ? { ...doc, savedChange: validSavedChangeByKey.get(doc.savedChange.key) }
          : doc,
      );

    const restoreSourceBackedDrafts = (): boolean => {
      if (cleanSavedFileChanges.length > 0) {
        sourceBackedDocuments.restoreSourceBackedSavedFileChanges(cleanSavedFileChanges);
        if (window.innerWidth >= 768) {
          setRightSidebarTab("annotations");
          setIsPanelOpen(true);
        }
      }
      if (editedDocumentsForRestore.length === 0) return false;
      if (isEditingMarkdown) {
        toast("Draft file edits were not restored", {
          description: "You already have edits in this session — those take precedence.",
          duration: 5000,
        });
        return false;
      }

      const restoredDocumentKeys =
        sourceBackedDocuments.restoreSourceBackedDraftDocuments(editedDocumentsForRestore);
      if (restoredDocumentKeys.length < editedDocumentsForRestore.length) {
        toast("Some draft file edits were not restored", {
          description: "You already have edits in this session — those take precedence.",
          duration: 5000,
        });
      }
      const restoredSingleFileDraft = pickRestoredSingleFileDraftToDisplay(
        editedDocumentsForRestore,
        restoredDocumentKeys,
        activeSourceDocumentKeyRef.current,
      );
      const nextActiveSourceDocumentKey =
        restoredSingleFileDraft?.key ?? activeSourceDocumentKeyRef.current;
      if (restoredSingleFileDraft) setActiveSourceDocumentKey(restoredSingleFileDraft.key);

      const activeRestoredDocument = nextActiveSourceDocumentKey
        ? sourceBackedDocuments.getSourceBackedDocument(nextActiveSourceDocumentKey)
        : null;
      const isRestoredActiveDocument =
        activeRestoredDocument?.sourceSave?.enabled &&
        restoredDocumentKeys.includes(activeRestoredDocument.key);
      if (!isRestoredActiveDocument || !activeRestoredDocument) return false;

      const remapped = applyEditedDocument(activeRestoredDocument.currentText, restored);
      repaintHighlights(remapped);
      if (activeRestoredDocument.currentText !== activeRestoredDocument.diskBaseline) {
        setEditStats(
          computeEditStats(activeRestoredDocument.diskBaseline, activeRestoredDocument.currentText),
        );
        if (window.innerWidth >= 768) {
          setRightSidebarTab("annotations");
          setIsPanelOpen(true);
        }
      }
      scheduleDraftSave();
      return true;
    };

    if (restoreSourceBackedDrafts()) return;

    // CRLF normalize is insurance against a hand-edited draft file — a \r
    // here would fabricate a whole-document diff against the LF baseline.
    const base = originalMarkdownRef.current;
    const edited = editedMarkdown !== null ? editedMarkdown.replace(/\r\n?/g, "\n") : null;
    // editStats/isEditingMarkdown guards are defensive: the restore dialog is
    // modal on load, so live edits can't exist yet — but if they ever do,
    // the user's current work wins over the draft.
    if (
      edited !== null &&
      base !== null &&
      edited !== base &&
      editStats === null &&
      !isEditingMarkdown
    ) {
      editedMarkdownRef.current = edited;
      setEditorDiffersFromBaseline(false);
      setEditStats(computeEditStats(base, edited));
      if (window.innerWidth >= 768) {
        setRightSidebarTab("annotations");
        setIsPanelOpen(true);
      }
      const remapped = applyEditedDocument(edited, restored);
      repaintHighlights(remapped);
      scheduleDraftSave();
      return;
    }
    if (edited !== null && (editStats !== null || isEditingMarkdown)) {
      // Skipped, not silently dropped: the user started editing before the
      // (late) draft banner was answered. Their live work wins.
      toast("Draft edits were not restored", {
        description: "You already have edits in this session — those take precedence.",
        duration: 5000,
      });
    }

    const restoredChoiceReconciliation = reconcileDocumentChoiceAnnotations(
      restored,
      parseMarkdownToBlocks(markdown),
    );
    const restoredInvalidatedIds = new Set(restoredChoiceReconciliation.invalidatedIds);
    restoredChoiceReconciliation.invalidatedIds.forEach((id) =>
      viewerRef.current?.removeHighlight(id),
    );
    if (
      selectedAnnotationIdRef.current &&
      restoredInvalidatedIds.has(selectedAnnotationIdRef.current)
    ) {
      selectedAnnotationIdRef.current = null;
      setSelectedAnnotationId(null);
    }
    const restoredAnnotations = restoredChoiceReconciliation.retained;
    if (restored.length > 0) {
      setAnnotations(restoredAnnotations);
      if (restoredAnnotations.length > 0) {
        // Apply highlights to DOM after a tick
        setTimeout(() => {
          viewerRef.current?.applySharedAnnotations(
            restoredAnnotations.filter((a) => !a.diffContext),
          );
        }, 100);
      }
    }
    scheduleDraftSave();
  }, [
    restoreDraft,
    validateDraftSavedFileChanges,
    editStats,
    isEditingMarkdown,
    sourceBackedDocuments,
    activeSourceBackedDocument,
    markdown,
    applyEditedDocument,
    repaintHighlights,
    scheduleDraftSave,
  ]);

  const handleEditToggle = useCallback(() => {
    if (isEditingMarkdown) {
      commitMarkdownEdits();
      return;
    }
    // Normalize CRLF before it becomes a baseline (e.g. share-imported content) —
    // CM6 emits \n-joined text, and a CRLF baseline would fabricate a full diff.
    const normalized = displayedMarkdown.includes("\r")
      ? displayedMarkdown.replace(/\r\n?/g, "\n")
      : displayedMarkdown;
    if (normalized !== displayedMarkdown) {
      if (activeSourceBackedDocument?.sourceSave?.enabled) {
        sourceBackedDocuments.updateSourceBackedDocumentText(
          activeSourceBackedDocument.key,
          normalized,
          { forceNotify: true },
        );
      } else {
        setMarkdown(normalized);
      }
    }
    // Safety net for paths that loaded content without setting the baseline.
    if (originalMarkdownRef.current === null) originalMarkdownRef.current = normalized;
    const base = originalMarkdownRef.current;
    editSessionBaseRef.current = normalized;
    if (activeSourceBackedDocument?.sourceSave?.enabled) {
      sourceBackedDocuments.beginSourceBackedDocumentEdit(
        activeSourceBackedDocument.key,
        normalized,
      );
    }
    setEditorDirty(false);
    setEditorDiffersFromBaseline(
      activeSourceBackedDocument?.sourceSave?.enabled
        ? normalized !== activeSourceBackedDocument.diskBaseline
        : base !== null && normalized !== base,
    );
    setIsEditingMarkdown(true);
  }, [
    activeSourceBackedDocument,
    displayedMarkdown,
    sourceBackedDocuments,
    isEditingMarkdown,
    commitMarkdownEdits,
  ]);

  // Live dirty tracking for the open editor session. String compare per
  // keystroke is fine at plan sizes; setState bails out on unchanged values.
  const handleEditorChange = useCallback(
    (md: string) => {
      setEditorDirty(md !== editSessionBaseRef.current);
      if (activeSourceBackedDocument?.sourceSave?.enabled) {
        sourceBackedDocuments.updateSourceBackedDocumentText(activeSourceBackedDocument.key, md);
        setEditorDiffersFromBaseline(md !== activeSourceBackedDocument.diskBaseline);
      } else {
        const base = originalMarkdownRef.current;
        setEditorDiffersFromBaseline(base !== null && md !== base);
      }
      // Mid-edit keystrokes persist too — a crash loses at most the debounce
      // window. The hook reads the live buffer via getDraftEditedMarkdown.
      if (agentTerminalDeliveryRef.current) {
        setAgentFeedbackRevision((version) => version + 1);
      }
      scheduleDraftSave();
    },
    [activeSourceBackedDocument, sourceBackedDocuments, scheduleDraftSave],
  );

  const unsavedSourceBackedDocuments = useMemo(
    () => sourceBackedDocuments.getUnsavedSourceBackedDocuments(),
    [sourceBackedDocuments, sourceBackedDocuments.version],
  );
  const savedFileChanges = useMemo(
    () => sourceBackedDocuments.getSourceBackedSavedFileChanges(),
    [sourceBackedDocuments, sourceBackedDocuments.version],
  );
  const openSourceDocuments = useMemo(
    () => sourceBackedDocuments.getSourceBackedDocuments(),
    [sourceBackedDocuments, sourceBackedDocuments.version],
  );
  const savedFileChangesForValidation = useMemo(() => {
    return sourceBackedDocuments.getSourceBackedSavedFileChangesForValidation();
  }, [sourceBackedDocuments, sourceBackedDocuments.version]);
  const activeSourceSave = activeSourceBackedDocument?.sourceSave?.enabled
    ? activeSourceBackedDocument.sourceSave
    : null;

  // Save-button display is driven by the sourceBackedDocuments state machine — one
  // source of truth for dirty/saving/saved, rather than a parallel flag.
  const activeSaveStatus = activeSourceBackedDocument?.saveStatus;
  const hasUnsavedDiskChanges =
    activeSaveStatus === "dirty" ||
    activeSaveStatus === "conflict" ||
    activeSaveStatus === "error" ||
    activeSaveStatus === "missing";
  // Emphasize the Save control (dot + primary text) whenever there is work to
  // persist or a save is in flight — one predicate drives both so they can't diverge.
  const emphasizeSave = hasUnsavedDiskChanges || activeSaveStatus === "saving";
  // A rejected save (disk conflict or write error) — surfaced as a destructive
  // dot/label so it reads as "save failed, retry" rather than ordinary unsaved.
  const saveFailed = activeSaveStatus === "conflict" || activeSaveStatus === "error";
  const activeSourceBufferDirty =
    activeSourceBackedDocument?.sourceSave?.enabled === true &&
    activeSourceBackedDocument.currentText !== activeSourceBackedDocument.diskBaseline;
  const canOverwriteDiskConflict =
    activeSourceBackedDocument?.sourceSave?.enabled === true &&
    !!activeSourceBackedDocument.diskConflict &&
    activeSourceBackedDocument.currentText !== activeSourceBackedDocument.diskConflict.text;

  // Editing exit control: a source-backed session with unsaved edits gets a
  // two-step "Cancel" (discard + exit). Plan mode and clean source sessions keep
  // the plain "Done" (commit edits + exit), so annotation close behavior is unchanged.
  const cancelMode =
    isEditingMarkdown &&
    !!activeSourceSave &&
    (activeSourceBufferDirty || activeSaveStatus === "conflict" || activeSaveStatus === "error");
  const handleEditExitClick = useCallback(() => {
    if (!isEditingMarkdown) {
      handleEditToggle();
      return;
    } // enter edit mode
    if (cancelMode) {
      // discard flow (two-step)
      if (confirmCancelEdits) {
        setConfirmCancelEdits(false);
        handleDiscardEdits();
      } else setConfirmCancelEdits(true);
      return;
    }
    handleEditToggle(); // commit edits + exit
  }, [isEditingMarkdown, cancelMode, confirmCancelEdits, handleEditToggle, handleDiscardEdits]);
  // Drop the discard confirmation once it no longer applies — exited the editor,
  // or the doc went clean (e.g. the user saved).
  useEffect(() => {
    if (!cancelMode && confirmCancelEdits) setConfirmCancelEdits(false);
  }, [cancelMode, confirmCancelEdits]);
  // Each file owns its edit state: switching the active file (folder mode keeps
  // the editor open across files) starts the discard confirmation fresh, so an
  // armed "Discard?" on one file can never drop another file's edits on first click.
  useEffect(() => {
    setConfirmCancelEdits(false);
  }, [activeSourceBackedDocument?.key]);

  const hasUnsavedSourceFileBuffers = unsavedSourceBackedDocuments.length > 0;

  // True when the feedback payload carries unsaved direct edits. Source-backed
  // file buffers are ordinary dirty editor state; they only become review
  // context once saved to disk and tracked through savedFileChanges.
  const hasDirectEdits =
    !activeSourceSave &&
    !hasUnsavedSourceFileBuffers &&
    (isEditingMarkdown ? editorDiffersFromBaseline : editedMarkdownRef.current !== null);
  const hasSavedFileChanges = savedFileChanges.length > 0;
  const hasFeedbackContent = hasAnyAnnotations || hasDirectEdits || hasSavedFileChanges;
  const feedbackLoss = buildFeedbackLossDescription(feedbackAnnotationCount, hasDirectEdits);
  const hasUnsentFeedback = feedbackAnnotationCount > 0 || hasDirectEdits;

  // Pinned "Direct edits" card data for the annotation sidebar. Source-backed
  // documents show saved-to-disk changes only; dirty buffers stay in the editor
  // and file tree until the user explicitly saves.
  const directEditsPanelInfo = useMemo(() => {
    if (savedFileChanges.length > 0) {
      return buildSavedFileChangePanelItems(savedFileChanges);
    }

    if (activeSourceBackedDocument?.sourceSave?.enabled) return null;
    if (!editStats) return null;
    const base = originalMarkdownRef.current;
    const edited = editedMarkdownRef.current;
    if (base === null || edited === null) return null;
    return [buildPlanEditPanelItem(base, edited)];
  }, [activeSourceBackedDocument, editStats, savedFileChanges]);

  // "Direct Edits" feedback section: unified diff of user edits vs the
  // as-submitted baseline. getEditedMarkdown owns the read discipline.
  const buildEditsSection = useCallback((): string => {
    if (activeSourceSave || hasUnsavedSourceFileBuffers) return "";
    const base = originalMarkdownRef.current;
    return buildDirectEditsSection(base, getEditedMarkdown(), sourceConverted);
  }, [activeSourceSave, getEditedMarkdown, hasUnsavedSourceFileBuffers, sourceConverted]);

  const buildSavedChangesSection = useCallback(
    (changes = savedFileChanges): string => {
      return buildSavedFileChangesSection(
        changes.map((change) => ({
          path: change.path,
          basename: change.basename,
          beforeText: change.beforeText,
          afterText: change.afterText,
        })),
      );
    },
    [savedFileChanges],
  );

  // Prepends the Direct Edits section to annotation feedback. When edits exist
  // but there are no annotations, the "no feedback" sentinel is replaced rather
  // than appended to.
  const composeFeedback = useCallback(
    (annotationsText: string, checkedSavedFileChanges = savedFileChanges): string => {
      return composeFeedbackWithEditSections(
        annotationsText,
        buildEditsSection(),
        buildSavedChangesSection(checkedSavedFileChanges),
      );
    },
    [buildEditsSection, buildSavedChangesSection],
  );

  const getCurrentFeedbackPayload = useCallback(
    (checkedSavedFileChanges = savedFileChanges): string => {
      return composeFeedback(
        messageMultiSelectMode ? buildFullAnnotationsOutput() : annotationsOutput,
        checkedSavedFileChanges,
      );
    },
    [
      annotationsOutput,
      buildFullAnnotationsOutput,
      composeFeedback,
      messageMultiSelectMode,
      savedFileChanges,
    ],
  );

  const withDraftGeneration = useCallback(
    (path: string): string => {
      const separator = path.includes("?") ? "&" : "?";
      return `${path}${separator}draftGeneration=${getDraftGeneration()}`;
    },
    [getDraftGeneration],
  );

  const validateSavedFileChangesBeforeSubmit = useCallback(async (): Promise<
    SourceBackedSavedFileChangeDraftData[] | null
  > => {
    if (savedFileChangesForValidation.length === 0) return [];
    const result = await sourceBackedDocuments.validateSourceBackedSavedFileChanges(
      savedFileChangesForValidation,
    );
    const stale = result.dropped.filter(
      (entry) => entry.reason === "changed" || entry.reason === "missing",
    );

    if (stale.length > 0) {
      sourceBackedDocuments.clearSourceBackedSavedFileChanges(
        stale.map((entry) => entry.change.key),
      );
      scheduleDraftSave();
      toast.error("Saved edits changed on disk", {
        description: "Plannotator removed the stale edit context. Nothing was sent.",
      });
      return null;
    }

    if (result.unverified.length > 0) {
      toast.error("Saved edits could not be verified", {
        description: "Check the file tree and try sending feedback again.",
      });
      return null;
    }

    return result.valid;
  }, [sourceBackedDocuments, savedFileChangesForValidation, scheduleDraftSave]);

  const handleSourceBackedDocumentLifecycleOutcome = useCallback(
    (outcome: SourceBackedDocumentLifecycleOutcome) => {
      if (outcome.type === "missing-file") {
        if (!outcome.alreadyMissing && outcome.record.key === activeSourceDocumentKeyRef.current) {
          setEditorDiffersFromBaseline(outcome.record.currentText !== outcome.record.diskBaseline);
          if (isEditingMarkdownRef.current) {
            setEditorDirty(outcome.record.currentText !== editSessionBaseRef.current);
            setEditStats(
              outcome.record.currentText !== outcome.record.diskBaseline
                ? computeEditStats(outcome.record.diskBaseline, outcome.record.currentText)
                : null,
            );
          }
          toast("File no longer exists on disk", {
            description: `Save ${outcome.record.basename} to recreate it.`,
            duration: 5000,
          });
        }
        return;
      }

      if (outcome.type === "disk-update-applied") {
        if (outcome.record.key === activeSourceDocumentKeyRef.current) {
          const remapped = applyEditedDocument(outcome.record.currentText);
          repaintHighlights(remapped);
          editSessionBaseRef.current = outcome.record.currentText;
          setEditorDirty(false);
          setEditorDiffersFromBaseline(false);
          setEditStats(null);
        }
        if (outcome.clearedSavedChange) {
          toast("File updated from disk", {
            description: `${outcome.record.basename} changed outside Plannotator, so its old Edits card was cleared.`,
          });
        }
        return;
      }

      if (
        outcome.type === "disk-conflict-applied" &&
        outcome.record.key === activeSourceDocumentKeyRef.current
      ) {
        setEditorDirty(true);
        setEditorDiffersFromBaseline(true);
        setEditStats(computeEditStats(outcome.record.diskBaseline, outcome.record.currentText));
        toast.error("File changed on disk", {
          description: "Choose whether to overwrite disk or reload the file.",
        });
      }
    },
    [applyEditedDocument, repaintHighlights],
  );

  const runSourceBackedDocumentReconciliation = useCallback(
    async (changedDir?: string) => {
      const activeKey = activeSourceDocumentKeyRef.current;
      if (isEditingMarkdownRef.current && activeKey) {
        const live = markdownEditorHandleRef.current?.getMarkdown();
        if (live != null)
          sourceBackedDocuments.updateSourceBackedDocumentText(activeKey, live, {
            forceNotify: true,
          });
      }
      const outcomes = await sourceBackedDocuments.reconcileSourceBackedDocuments(changedDir);
      for (const outcome of outcomes) handleSourceBackedDocumentLifecycleOutcome(outcome);
      if (
        outcomes.some((outcome) =>
          [
            "disk-update-applied",
            "disk-status-updated",
            "disk-conflict-applied",
            "missing-file",
          ].includes(outcome.type),
        )
      ) {
        scheduleDraftSave();
      }
    },
    [handleSourceBackedDocumentLifecycleOutcome, sourceBackedDocuments, scheduleDraftSave],
  );
  const sourceBackedDocumentReconciliationRef = useRef(runSourceBackedDocumentReconciliation);
  useEffect(() => {
    sourceBackedDocumentReconciliationRef.current = runSourceBackedDocumentReconciliation;
  }, [runSourceBackedDocumentReconciliation]);

  const sourceWatchDirsKey = useMemo(() => {
    const dirs = new Set<string>();
    for (const doc of openSourceDocuments) dirs.add(dirnameBrowserPath(doc.sourceSave.path));
    return [...dirs].sort().join("\n");
  }, [openSourceDocuments]);

  useEffect(() => {
    if (!sourceWatchDirsKey) return;
    return createSourceDocumentWatch({
      directories: sourceWatchDirsKey.split("\n").filter(Boolean),
      onReconcile: (changedDir) => sourceBackedDocumentReconciliationRef.current(changedDir),
    });
  }, [sourceWatchDirsKey]);

  const handleEditorModeChange = (mode: EditorMode) => {
    setEditorMode(mode);
    saveEditorMode(mode);
  };

  const handleInputMethodChange = (method: InputMethod) => {
    setInputMethod(method);
    saveInputMethod(method);
  };

  // Alt/Option key: hold to temporarily switch, double-tap to toggle
  useInputMethodSwitch(inputMethod, handleInputMethodChange);

  const initializePlanDocument = (data: PlanResponse) => {
      // Initialize config store with server-provided values (config file > cookie > default)
      configStore.init(data.serverConfig ? { ...data.serverConfig } : undefined);
      // Session-level force-markdown preference (--markdown); threaded into folder/linked
      // /api/doc requests so on-demand HTML files convert too.
      setConvertHtml(data.convertHtml ?? false);
      setAISessionEnabled(true);
      // gitUser drives the "Use git name" button in Settings; stays undefined (button hidden) when unavailable
      setGitUser(data.serverConfig?.gitUser);
      if (data.renderAs === "html" && data.rawHtml) {
        setRenderAs("html");
        setRawHtml(data.rawHtml);
        setShareHtml(data.shareHtml ?? "");
        setMarkdown("");
        return;
      }
      if (data.mode === "annotate-folder") {
        // Folder annotation mode: clear demo content, let user pick a file
        setMarkdown("");
        return;
      }
      if (data.plan === null || data.plan === undefined) return;

      // CM6 joins lines with \n; CRLF input would make an untouched edit round-trip
      // fabricate a whole-document diff. Normalize once.
      const normalizedPlan = data.plan.replace(/\r\n?/g, "\n");
      setMarkdown(normalizedPlan);
      originalMarkdownRef.current = normalizedPlan;
      if (data.mode === "annotate" && data.sourceSave?.enabled) {
        const key = sourceBackedDocumentKey(data.sourceSave, `file:${data.sourceSave.path}`);
        sourceBackedDocuments.openSourceBackedDocument({
          key,
          text: normalizedPlan,
          sourceSave: data.sourceSave,
        });
        setActiveSourceDocumentKey(key);
      }
  };

  const initializeAnnotateSession = (data: PlanResponse) => {
      const isAnnotateSession =
        data.mode === "annotate" ||
        data.mode === "annotate-last" ||
        data.mode === "annotate-folder";
      if (!isAnnotateSession) return;

      setAnnotateMode(true);
      setGate(data.gate ?? false);
      if (data.mode === "annotate-folder") sidebar.open("files");
      setAnnotateSource(
        data.mode === "annotate-last"
          ? "message"
          : data.mode === "annotate-folder"
            ? "folder"
            : "file",
      );
  };

  const initializeRecentMessages = (data: PlanResponse) => {
    messageStateCacheRef.current = new Map();
    setCachedMessageAnnotationCounts(new Map());
    if (data.mode === "annotate-last" && data.recentMessages && data.recentMessages.length > 0) {
      setRecentMessages(data.recentMessages);
      setSelectedMessageId(data.recentMessages[0].messageId);
      return;
    }
    setRecentMessages([]);
    setSelectedMessageId(null);
  };

  const initializeSourceSession = (data: PlanResponse) => {
    setSourceInfo(data.sourceInfo ?? undefined);
    setSourceConverted(!!data.sourceConverted);
    if (data.filePath) {
      setImageBaseDir(
        data.mode === "annotate-folder" ? data.filePath : data.filePath.replace(/\/[^/]+$/, ""),
      );
      if (data.mode === "annotate") setSourceFilePath(data.filePath);
    }
    if (data.sharingEnabled !== undefined) setSharingEnabled(data.sharingEnabled);
    if (data.shareBaseUrl) setShareBaseUrl(data.shareBaseUrl);
    if (data.pasteApiUrl) setPasteApiUrl(data.pasteApiUrl);
    if (data.repoInfo) setRepoInfo(data.repoInfo);
    if (data.projectRoot) setProjectRoot(data.projectRoot);
    setAgentTerminalCapability(data.agentTerminal ?? null);
    if (data.origin) setOrigin(data.origin);
  };

  // Check if we're in API mode (served from Bun hook server)
  // Skip if we loaded from a shared URL
  useEffect(() => {
    if (isLoadingShared) return; // Wait for share check to complete
    if (isSharedSession) return; // Already loaded from share

    fetch("/api/plan")
      .then((res) => {
        if (!res.ok) throw new Error("Not in API mode");
        return res.json().then((body) => parsePlanResponse(body));
      })
      .then((data) => {
        initializePlanDocument(data);
        setIsApiMode(true);
        initializeAnnotateSession(data);
        initializeRecentMessages(data);
        initializeSourceSession(data);
      })
      .catch(() => {
        // Not in API mode - use default content
        setIsApiMode(false);
        setAISessionEnabled(false);
        setAgentTerminalCapability(null);
        // Demo mode still exercises edit mode; baseline is the demo plan.
        originalMarkdownRef.current = DEMO_PLAN_CONTENT;
      })
      .finally(() => setIsLoading(false));
  }, [isLoadingShared, isSharedSession]);

  useEffect(() => {
    if (!aiSessionEnabled || !isApiMode || isSharedSession) {
      setAiAvailable(false);
      setAiProviders([]);
      return;
    }

    let cancelled = false;
    fetch("/api/ai/capabilities")
      .then((res) => (res.ok ? res.json().then((body) => parseAICapabilitiesResponse(body)) : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.available) {
          const providers = (data.providers ?? []).filter(isPiProvider);
          const defaultProvider =
            data.defaultProvider !== null &&
            providers.some((provider) => provider.id === data.defaultProvider)
              ? data.defaultProvider
              : null;
          setAiAvailable(providers.length > 0);
          setAiProviders(providers);
          setAIConfig((prev) => {
            const saved = getAIProviderSettings();
            const selection = resolveAIProviderSelection({
              providers,
              origin,
              settings: saved,
              serverDefaultProvider: defaultProvider,
            });

            if (prev.providerId === selection.providerId && prev.model === selection.model)
              return prev;

            return { ...prev, providerId: selection.providerId, model: selection.model };
          });
        } else {
          setAiAvailable(false);
          setAiProviders([]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAiAvailable(false);
          setAiProviders([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [aiSessionEnabled, isApiMode, isSharedSession, origin]);

  // Auto-save to notes apps on plan arrival (each gated by its autoSave toggle)
  const autoSaveAttempted = useRef(false);
  const autoSaveResultsRef = useRef<NoteAutoSaveResults>({});
  const autoSavePromiseRef = useRef<Promise<NoteAutoSaveResults> | null>(null);

  useEffect(() => {
    autoSaveAttempted.current = false;
    autoSaveResultsRef.current = {};
    autoSavePromiseRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount;
    // markdown changes from edit commits, linked docs, or discard must NOT reset
    // the arrival auto-save.
  }, []);

  useEffect(() => {
    if (!isApiMode || !markdown || isSharedSession || annotateMode || false) return;
    if (autoSaveAttempted.current) return;

    const body: SaveNotesRequest = {};
    const targets: string[] = [];

    const obsSettings = getObsidianSettings();
    if (obsSettings.autoSave && obsSettings.enabled) {
      const vaultPath = getEffectiveVaultPath(obsSettings);
      if (vaultPath) {
        body.obsidian = {
          vaultPath,
          folder: obsSettings.folder || "plannotator",
          plan: markdown,
          ...(obsSettings.filenameFormat && { filenameFormat: obsSettings.filenameFormat }),
          ...(obsSettings.filenameSeparator &&
            obsSettings.filenameSeparator !== "space" && {
              filenameSeparator: obsSettings.filenameSeparator,
            }),
        };
        targets.push("Obsidian");
      }
    }

    if (targets.length === 0) return;
    autoSaveAttempted.current = true;

    const autoSavePromise = fetch("/api/save-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((res) => res.json().then((data) => parseSaveNotesResponse(data)))
      .then((data) => {
        const results: NoteAutoSaveResults = {};
        if (body.obsidian) results.obsidian = Boolean(data.results?.obsidian?.success);
        autoSaveResultsRef.current = results;

        const didSave = (target: string): boolean => {
          return target === "Obsidian" && data.results?.obsidian?.success === true;
        };
        const failed = targets.filter((target) => !didSave(target));
        if (failed.length === 0) {
          toast.success(`Auto-saved to ${targets.join(" & ")}`);
        } else {
          toast.error(`Auto-save failed for ${failed.join(" & ")}`);
        }

        return results;
      })
      .catch(() => {
        autoSaveResultsRef.current = {};
        toast.error("Auto-save failed");
        return {};
      });
    autoSavePromiseRef.current = autoSavePromise;
  }, [isApiMode, markdown, isSharedSession, annotateMode]);

  // Global paste listener for image attachments
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            // Derive name before showing annotator so user sees it immediately
            const initialName = deriveImageName(
              file.name,
              globalAttachments.map((g) => g.name),
            );
            const blobUrl = URL.createObjectURL(file);
            setPendingPasteImage({ file, blobUrl, initialName });
          }
          break;
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [globalAttachments]);

  // Handle paste annotator accept — name comes from ImageAnnotator
  const handlePasteAnnotatorAccept = async (blob: Blob, hasDrawings: boolean, name: string) => {
    if (!pendingPasteImage) return;

    try {
      const formData = new FormData();
      const fileToUpload = hasDrawings
        ? new File([blob], "annotated.png", { type: "image/png" })
        : pendingPasteImage.file;
      formData.append("file", fileToUpload);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const attachment = await decodeGlobalPasteUploadResponse(res, name);
      if (attachment) setGlobalAttachments((prev) => [...prev, attachment]);
    } catch {
      // Upload failed silently
    } finally {
      URL.revokeObjectURL(pendingPasteImage.blobUrl);
      setPendingPasteImage(null);
    }
  };

  const handlePasteAnnotatorClose = () => {
    if (pendingPasteImage) {
      URL.revokeObjectURL(pendingPasteImage.blobUrl);
      setPendingPasteImage(null);
    }
  };

  const sendToAgentTerminal = useCallback(
    (message: string) => {
      const sent = agentTerminalRef.current?.sendMessage(message) ?? false;
      if (!sent) return false;
      openAgentTerminal();
      return true;
    },
    [openAgentTerminal],
  );

  const getAnnotateFeedbackTarget = useCallback((): AnnotateFeedbackTarget => {
    if (linkedDocHook.isActive && linkedDocHook.filepath) {
      return { fileHeader: "File", filePath: linkedDocHook.filepath };
    }
    if (sourceFilePath) {
      return { fileHeader: "File", filePath: sourceFilePath };
    }
    if (fileBrowser.activeFile) {
      return { fileHeader: "File", filePath: fileBrowser.activeFile };
    }
    if (annotateSource === "folder") {
      return {
        fileHeader: "Folder",
        filePath: fileBrowser.activeDirPath ?? projectRoot ?? "selected folder",
      };
    }
    return { fileHeader: "File", filePath: "current file" };
  }, [
    annotateSource,
    fileBrowser.activeDirPath,
    fileBrowser.activeFile,
    linkedDocHook.filepath,
    linkedDocHook.isActive,
    projectRoot,
    sourceFilePath,
  ]);

  const buildAnnotateAgentFeedback = useCallback(
    (feedback: string) => {
      if (annotateSource === "message") {
        return annotateMessageFeedback(feedback);
      }

      return annotateFileFeedback(feedback, getAnnotateFeedbackTarget());
    },
    [annotateSource, getAnnotateFeedbackTarget],
  );

  const currentFeedbackPayload = useMemo(
    () => getCurrentFeedbackPayload(),
    [
      agentFeedbackRevision,
      sourceBackedDocuments.version,
      editorDiffersFromBaseline,
      getCurrentFeedbackPayload,
      savedFileChanges,
    ],
  );
  const currentAgentFeedbackTarget = useMemo(
    () => getAnnotateFeedbackTarget(),
    [getAnnotateFeedbackTarget],
  );
  const currentAgentFeedbackDelivery = useMemo(() => {
    if (agentTerminalSessionId === null) return null;
    return buildAgentTerminalDeliveryRecord({
      terminalSessionId: agentTerminalSessionId,
      feedback: currentFeedbackPayload,
      targetPath: annotateSource === "message" ? null : currentAgentFeedbackTarget.filePath,
    });
  }, [
    agentTerminalSessionId,
    annotateSource,
    currentFeedbackPayload,
    currentAgentFeedbackTarget.filePath,
  ]);
  const isCurrentFeedbackDeliveredToAgent = isMatchingAgentTerminalDelivery(
    agentTerminalDelivery,
    currentAgentFeedbackDelivery,
  );
  const showAgentTerminalDeliveryStatus =
    annotateMode && agentTerminalDelivery !== null && isCurrentFeedbackDeliveredToAgent;
  const hasFeedbackToSend = hasFeedbackContent && !isCurrentFeedbackDeliveredToAgent;

  // Annotate mode handler — sends feedback to the running terminal agent when
  // available, otherwise through the original server feedback channel.
  const handleAnnotateFeedback = async () => {
    setIsSubmitting(true);
    try {
      snapshotActiveSourceBackedDocument();
      const checkedSavedFileChanges = await validateSavedFileChangesBeforeSubmit();
      if (checkedSavedFileChanges === null) {
        setIsSubmitting(false);
        return;
      }
      const feedback = getCurrentFeedbackPayload(checkedSavedFileChanges);
      const agentFeedbackDelivery =
        agentTerminalSessionId === null
          ? null
          : buildAgentTerminalDeliveryRecord({
              terminalSessionId: agentTerminalSessionId,
              feedback,
              targetPath:
                annotateSource === "message" ? null : getAnnotateFeedbackTarget().filePath,
            });
      if (isAgentTerminalReady) {
        if (
          !shouldSendAgentTerminalFeedback(agentTerminalDeliveryRef.current, agentFeedbackDelivery)
        ) {
          dismissDraft();
          setIsSubmitting(false);
          return;
        }
        const agentFeedback = buildAnnotateAgentFeedback(feedback);
        if (agentFeedbackDelivery && sendToAgentTerminal(agentFeedback)) {
          setAgentTerminalDelivery(agentFeedbackDelivery);
          dismissDraft();
          setIsSubmitting(false);
          return;
        }
        handleAgentTerminalReadyChange(false);
        toast.error("Agent terminal is not ready. Sending through the original session.");
      }

      const scopedSelectedMessageId = messageMultiSelectMode
        ? annotatedMessageIds.length === 1
          ? annotatedMessageIds[0]
          : undefined
        : (selectedMessageId ?? undefined);
      const feedbackRequest: EditorFeedbackRequest = {
        draftGeneration: getDraftGeneration(),
        feedback,
        annotations: allAnnotations,
        codeAnnotations,
      };
      if (scopedSelectedMessageId) feedbackRequest.selectedMessageId = scopedSelectedMessageId;
      if (messageMultiSelectMode && annotatedMessageIds.length > 1) {
        feedbackRequest.feedbackScope = "messages";
      }
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feedbackRequest),
      });
      if (!res.ok) throw new Error("Failed to send feedback");
      dismissDraft();
      setSubmitted("denied"); // reuse 'denied' state for "feedback sent" overlay
    } catch {
      setIsSubmitting(false);
      scheduleDraftSaveAfterSubmitFailure();
    }
  };

  // Annotate gate-mode handler — approves the artifact without feedback
  const handleAnnotateApprove = async () => {
    setIsSubmitting(true);
    try {
      await fetch(withDraftGeneration("/api/approve"), { method: "POST" });
      setSubmitted("approved");
    } catch {
      setIsSubmitting(false);
    }
  };

  // Exit annotation session without sending feedback
  const handleAnnotateExit = useCallback(async () => {
    setIsExiting(true);
    try {
      const res = await fetch(withDraftGeneration("/api/exit"), { method: "POST" });
      if (res.ok) {
        setSubmitted("exited");
      } else {
        throw new Error("Failed to exit");
      }
    } catch {
      setIsExiting(false);
    }
  }, [withDraftGeneration]);

  const confirmUnsavedSourceFileEdits = useCallback(
    (action: SourceFileEditWarningAction, continueAction: () => void | Promise<void>) => {
      sourceFileEditWarningContinuationRef.current = continueAction;
      setSourceFileEditWarningAction(action);
      setShowSourceFileEditWarning(true);
    },
    [],
  );

  const maybeConfirmUnsavedSourceFileEdits = useCallback(
    (action: SourceFileEditWarningAction, continueAction: () => void | Promise<void>): boolean => {
      if (!hasUnsavedSourceFileBuffers) return false;
      confirmUnsavedSourceFileEdits(action, continueAction);
      return true;
    },
    [confirmUnsavedSourceFileEdits, hasUnsavedSourceFileBuffers],
  );

  const closeSourceFileEditWarning = useCallback(() => {
    sourceFileEditWarningContinuationRef.current = null;
    setShowSourceFileEditWarning(false);
  }, []);

  const confirmSourceFileEditWarning = useCallback(() => {
    const continuation = sourceFileEditWarningContinuationRef.current;
    sourceFileEditWarningContinuationRef.current = null;
    setShowSourceFileEditWarning(false);
    void continuation?.();
  }, []);

  const hasOpenSubmitShortcutModal = () =>
    showExport ||
    showImport ||
    showFeedbackPrompt ||
    showSourceFileEditWarning ||
    showExitWarning ||
    pendingPasteImage !== null;

  const isSubmitShortcutBlocked = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return true;

      const target = getHTMLElementTarget(event.target);
      const tag = target?.tagName;
      const isTextField =
        tag === "INPUT" || tag === "TEXTAREA" || Boolean(target?.isContentEditable);

      // Let active confirmation dialogs own Cmd/Ctrl+Enter and Escape.
      if (document.querySelector('[data-plannotator-confirm-dialog="true"]')) return true;
      if (hasOpenSubmitShortcutModal()) return true;
      if (submitted || isSubmitting || isExiting || !isApiMode || isEditingMarkdown) return true;
      // Folder files are the active review target; normal linked docs are side
      // references and should not submit the root plan.
      if (linkedDocHook.isActive && annotateSource !== "folder") return true;
      return isTextField;
  };

  // Global keyboard shortcuts (Cmd/Ctrl+Enter to submit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSubmitShortcutBlocked(e)) return;

      e.preventDefault();

      // Annotate mode: gate-enabled + no annotations → approve (empty stdout).
      // Otherwise: send feedback.
      if (annotateMode) {
        if (gate && !hasFeedbackToSend) {
          if (maybeConfirmUnsavedSourceFileEdits("approve", () => handleAnnotateApprove())) return;
          handleAnnotateApprove();
          return;
        }
        if (maybeConfirmUnsavedSourceFileEdits("send-feedback", () => handleAnnotateFeedback()))
          return;
        handleAnnotateFeedback();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    annotateMode,
    gate,
    hasFeedbackToSend,
    isSubmitShortcutBlocked,
    maybeConfirmUnsavedSourceFileEdits,
  ]);

  const handleAddAnnotation = (ann: Annotation) => {
    const safeAnnotation = reconcileDocumentChoiceAnnotations([ann], blocks).retained[0];
    if (!safeAnnotation) return;
    setAnnotations((prev) => [...prev, safeAnnotation]);
    setSelectedAnnotationId(safeAnnotation.id);
    setSelectedCodeAnnotationId(null);
  };

  // Keep selection behavior explicit across mobile/wide-mode transitions.
  const handleSelectAnnotation = React.useCallback(
    (id: string | null) => {
      setSelectedAnnotationId(id);
      if (id) setSelectedCodeAnnotationId(null);
      if (id && isMobile && wideModeType === null) setIsPanelOpen(true);
    },
    [isMobile, wideModeType],
  );

  const handleAddCodeAnnotation = React.useCallback((input: CodeFileAnnotationInput) => {
    const annotation: CodeAnnotation = {
      id: generateId("code-ann"),
      type: "comment",
      scope: "line",
      filePath: input.filePath,
      lineStart: input.lineStart,
      lineEnd: input.lineEnd,
      side: "new",
      text: input.text,
      images: input.images,
      originalCode: input.originalCode,
      createdAt: Date.now(),
      author: configStore.get("displayName") || undefined,
    };
    setCodeAnnotations((prev) => [...prev, annotation]);
    setSelectedAnnotationId(null);
    setSelectedCodeAnnotationId(annotation.id);
  }, []);

  const handleSelectCodeFileAnnotation = React.useCallback((id: string | null) => {
    setSelectedAnnotationId(null);
    setSelectedCodeAnnotationId(id);
  }, []);

  // The code popout is full-viewport modal — the annotation panel is behind it.
  // This handler only fires when the popout is closed (sidebar visible), so
  // reopening the file via codeFilePopout.open() is the correct behavior.
  const handleSelectCodeAnnotation = React.useCallback(
    (id: string) => {
      const annotation = codeAnnotations.find((a) => a.id === id);
      if (!annotation) return;
      setSelectedAnnotationId(null);
      setSelectedCodeAnnotationId(id);
      codeFilePopout.open(annotation.filePath);
      if (isMobile && wideModeType === null) setIsPanelOpen(true);
    },
    [codeAnnotations, codeFilePopout.open, isMobile, wideModeType],
  );

  const handleDeleteCodeAnnotation = React.useCallback(
    (id: string) => {
      setCodeAnnotations((prev) => prev.filter((a) => a.id !== id));
      if (selectedCodeAnnotationId === id) setSelectedCodeAnnotationId(null);
    },
    [selectedCodeAnnotationId],
  );

  const handleEditCodeAnnotation = React.useCallback(
    (id: string, updates: Partial<CodeAnnotation>) => {
      setCodeAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
    },
    [],
  );

  // Core annotation removal — highlight cleanup + state filter + selection clear
  const removeAnnotation = (id: string) => {
    viewerRef.current?.removeHighlight(id);
    if (externalAnnotations.some((annotation) => annotation.id === id)) {
      deleteExternalAnnotation(id);
    } else {
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    }
    if (selectedAnnotationId === id) setSelectedAnnotationId(null);
  };

  // Interactive checkbox toggling with annotation tracking
  const checkbox = useCheckboxOverrides({
    blocks,
    annotations,
    addAnnotation: handleAddAnnotation,
    removeAnnotation,
  });

  const handleDeleteAnnotation = (id: string) => {
    const ann = allAnnotations.find((a) => a.id === id);
    // External annotations (live in SSE hook) route to the SSE hook, not local state.
    // Check membership by ID — source alone is insufficient because share-imported
    // and draft-restored annotations also carry source but live in local state.
    if (ann?.source && externalAnnotations.some((e) => e.id === id)) {
      deleteExternalAnnotation(id);
      if (selectedAnnotationId === id) setSelectedAnnotationId(null);
      return;
    }
    // If this is a checkbox annotation, revert the visual override
    if (id.startsWith("ann-checkbox-")) {
      if (ann) {
        checkbox.revertOverride(ann.blockId);
      }
    }
    removeAnnotation(id);
  };

  const handleEditAnnotation = (id: string, updates: Partial<Annotation>) => {
    const ann = allAnnotations.find((a) => a.id === id);
    if (ann?.source && externalAnnotations.some((e) => e.id === id)) {
      updateExternalAnnotation(id, updates);
      return;
    }
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  };

  const handleIdentityChange = useCallback((oldIdentity: string, newIdentity: string) => {
    setAnnotations((prev) =>
      prev.map((ann) => (ann.author === oldIdentity ? { ...ann, author: newIdentity } : ann)),
    );
    setCodeAnnotations((prev) =>
      prev.map((ann) => (ann.author === oldIdentity ? { ...ann, author: newIdentity } : ann)),
    );
  }, []);

  const handleAddGlobalAttachment = (image: ImageAttachment) => {
    setGlobalAttachments((prev) => [...prev, image]);
  };

  const handleRemoveGlobalAttachment = (path: string) => {
    setGlobalAttachments((prev) => prev.filter((p) => p.path !== path));
  };

  const handleTocNavigate = (_blockId: string) => {
    // Navigation handled by TableOfContents component
    // This is just a placeholder for future custom logic
  };

  const aiAnnotationsContext = useMemo(
    () => (hasAnyAnnotations ? annotationsOutput : undefined),
    [annotationsOutput, hasAnyAnnotations],
  );

  const aiDocumentPath = linkedDocHook.isActive
    ? (linkedDocHook.filepath ?? "linked document")
    : (sourceFilePath ??
      (annotateSource === "message"
        ? "agent message"
        : annotateSource === "folder"
          ? "folder document"
          : "document"));
  const aiSourceInfo = linkedDocHook.isActive ? (linkedDocHook.filepath ?? undefined) : sourceInfo;
  const aiSourceConverted = linkedDocHook.isActive
    ? (linkedDocHook.getDocAnnotations().get(linkedDocHook.filepath ?? "")?.isConverted ?? false)
    : sourceConverted;
  // renderAs now tracks the active file (plan, linked doc, or folder file), so the AI
  // sees the current surface's mode — raw HTML for an .html file, markdown otherwise.
  const aiRenderAs = renderAs;
  const _aiDocumentMode = annotateMode || linkedDocHook.isActive;
  const hasAIDocumentContext =
    annotateMode || linkedDocHook.isActive || !!sourceFilePath || annotateSource === "message";

  const aiContext = useMemo<AIContext | null>(() => {
    if (!aiSessionEnabled || !hasAIDocumentContext) return null;

    return {
      mode: "annotate",
      annotate: {
        content: aiRenderAs === "html" && rawHtml ? rawHtml : displayedMarkdown,
        filePath: aiDocumentPath,
        sourceInfo: aiSourceInfo,
        sourceConverted: aiSourceConverted,
        renderAs: aiRenderAs,
        annotations: aiAnnotationsContext,
      },
    };
  }, [
    aiAnnotationsContext,
    aiDocumentPath,
    aiRenderAs,
    aiSessionEnabled,
    aiSourceConverted,
    aiSourceInfo,
    displayedMarkdown,
    hasAIDocumentContext,
    rawHtml,
  ]);

  const aiChat = useAIChat({
    context: aiContext,
    providerId: aiConfig.providerId,
    model: aiConfig.model,
    reasoningEffort: aiConfig.reasoningEffort,
    threadTitle: "Document chat",
  });
  const {
    messages: aiMessages,
    isCreatingSession: aiIsCreatingSession,
    isStreaming: aiIsStreaming,
    permissionRequests: aiPermissionRequests,
    respondToPermission: respondToAIPermission,
    ask: askAI,
    resetSession: resetAISession,
    resetThread: resetAIThread,
    sessionId: aiSessionId,
  } = aiChat;
  const layoutPresentation = buildAppLayoutPresentation({
    isAgentTerminalResizing: agentTerminalResize.isDragging,
    isLeftSidebarResizing: tocResize.isDragging,
    isRightSidebarResizing: panelResize.isDragging,
    wideModeType,
    isRightSidebarOpen: isPanelOpen,
    rightSidebarTab,
    annotateSource,
    recentMessageCount: recentMessages.length,
    messageAnnotationCount: activeMessageAnnotationCounts.size,
    aiAvailable,
    hasAIContext: aiContext !== null,
    isAgentTerminalReady,
    aiMessages,
    aiConfig,
  });
  const { aiSidebar: layoutAISidebar } = layoutPresentation;
  const {
    canUseAI,
    canUseAskAI,
    hasMessages: aiSidebarHasMessages,
    visibleConfig: visibleAIConfig,
    visibleMessages: visibleAIMessages,
  } = layoutAISidebar;
  const canUseDocumentAskAI = canUseAskAI;
  const visibleAIProviders = useMemo<AIProviderOption[]>(
    () => (isAgentTerminalReady ? [{ id: "agent-terminal", name: "Agent terminal" }] : aiProviders),
    [aiProviders, isAgentTerminalReady],
  );

  const terminalAskReadableFilePath = useMemo(() => {
    if (linkedDocHook.isActive && linkedDocHook.filepath) return linkedDocHook.filepath;
    if (sourceFilePath) return sourceFilePath;
    if (fileBrowser.activeFile) return fileBrowser.activeFile;
    return null;
  }, [fileBrowser.activeFile, linkedDocHook.filepath, linkedDocHook.isActive, sourceFilePath]);

  const buildAgentAskPrompt = useCallback(
    (question: string, context?: CommentAskAIContext) => {
      const scope = context
        ? {
            kind: context.kind,
            label: context.label,
            text: context.text,
            sourcePath: context.sourcePath ?? aiDocumentPath,
          }
        : undefined;
      const scopedQuestion = buildDefaultPrompt({
        prompt: question,
        scope,
      });
      return buildTerminalAskPrompt({
        scopedQuestion,
        documentPath: aiDocumentPath,
        annotationsContext: aiAnnotationsContext,
        readableFilePath: terminalAskReadableFilePath,
        inlineDocument: terminalAskReadableFilePath
          ? null
          : {
              label: aiRenderAs === "html" ? "Current document HTML" : "Current document text",
              content: aiRenderAs === "html" && rawHtml ? rawHtml : displayedMarkdown,
            },
      });
    },
    [
      aiAnnotationsContext,
      aiDocumentPath,
      aiRenderAs,
      displayedMarkdown,
      rawHtml,
      terminalAskReadableFilePath,
    ],
  );

  const aiDocumentKey = aiContext ? `document:${aiRenderAs}:${aiDocumentPath}` : "none";
  const previousAIDocumentKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!aiSessionEnabled) return;
    if (previousAIDocumentKeyRef.current && previousAIDocumentKeyRef.current !== aiDocumentKey) {
      resetAIThread();
    }
    previousAIDocumentKeyRef.current = aiDocumentKey;
  }, [aiDocumentKey, aiSessionEnabled, resetAIThread]);

  const handleAIConfigChange = useCallback(
    (config: {
      providerId?: string | null;
      model?: string | null;
      reasoningEffort?: string | null;
    }) => {
      setAIConfig((prev) => {
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

  const openAIChat = useCallback(() => {
    if (wideModeType !== null) {
      exitWideMode({ restore: false, panelOpen: true });
    }
    setRightSidebarTab("ai");
    setIsPanelOpen(true);
  }, [exitWideMode, wideModeType]);

  const _handleOpenAIAnnouncement = useCallback(() => {
    dismissAIAnnouncement();
    openAIChat();
  }, [dismissAIAnnouncement, openAIChat]);

  const handleAskAI = useCallback(
    (question: string, context?: CommentAskAIContext): boolean => {
      if (isAgentTerminalReady) {
        if (sendToAgentTerminal(buildAgentAskPrompt(question, context))) {
          dismissAIAnnouncement();
          return true;
        }
        handleAgentTerminalReadyChange(false);
        if (!canUseAI) {
          toast.error("Agent terminal is not ready");
          return false;
        }
      }

      if (!canUseAI) {
        toast.error("Ask AI is unavailable");
        return false;
      }
      dismissAIAnnouncement();
      openAIChat();
      askAI({
        prompt: question,
        scope: context
          ? {
              kind: context.kind,
              label: context.label,
              text: context.text,
              sourcePath: context.sourcePath ?? aiDocumentPath,
            }
          : undefined,
        contextUpdate: aiSessionId ? aiAnnotationsContext : undefined,
      });
      return true;
    },
    [
      aiAnnotationsContext,
      aiDocumentPath,
      aiSessionId,
      askAI,
      buildAgentAskPrompt,
      canUseAI,
      dismissAIAnnouncement,
      handleAgentTerminalReadyChange,
      isAgentTerminalReady,
      openAIChat,
      sendToAgentTerminal,
    ],
  );

  const handleAskGeneralAI = useCallback(
    (question: string) => {
      handleAskAI(question, { kind: "general", label: "Document", sourcePath: aiDocumentPath });
    },
    [aiDocumentPath, handleAskAI],
  );

  // Bot callback config — read once from URL search params (?cb=&ct=)
  // TODO: bot callbacks post shareUrl which doesn't include code-file annotations.
  // If a user adds code comments and hits the callback button, those comments are silently dropped.
  // Fix: either disable callbacks when codeAnnotations exist, or include annotationsOutput in the payload.
  const callbackConfig = React.useMemo(() => getCallbackConfig(), []);

  const callCallback = React.useCallback(
    async (action: CallbackAction) => {
      if (!callbackConfig || isSubmitting) return;
      setIsSubmitting(true);
      try {
        const callbackShareUrl = await ensureShareLink();
        if (!callbackShareUrl) {
          toast.error("Failed to create share link");
          return;
        }
        const result = await executeCallback(action, callbackConfig, callbackShareUrl);
        if (result) {
          if (result.type === "success") {
            toast.success(result.message);
            setSubmitted(action === CallbackAction.Approve ? "approved" : "denied");
          } else {
            toast.error(result.message);
          }
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [callbackConfig, ensureShareLink, isSubmitting],
  );

  const handleCallbackApprove = React.useCallback(
    () => callCallback(CallbackAction.Approve),
    [callCallback],
  );
  const handleCallbackFeedback = React.useCallback(
    () => callCallback(CallbackAction.Feedback),
    [callCallback],
  );

  // Quick-save handlers for export dropdown and keyboard shortcut
  const handleDownloadAnnotations = () => {
    const output = getCurrentFeedbackPayload();
    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "annotations.md";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded annotations");
  };

  const handleQuickSaveToNotes = async () => {
    const body: SaveNotesRequest = {};
    // Mid-edit saves describe the live buffer, matching handleApprove.
    const quickSaveMarkdown = isEditingMarkdown
      ? (markdownEditorHandleRef.current?.getMarkdown() ?? displayedMarkdown)
      : displayedMarkdown;

    const s = getObsidianSettings();
    const vaultPath = getEffectiveVaultPath(s);
    if (vaultPath) {
      body.obsidian = {
        vaultPath,
        folder: s.folder || "plannotator",
        plan: quickSaveMarkdown,
        ...(s.filenameFormat && { filenameFormat: s.filenameFormat }),
        ...(s.filenameSeparator &&
          s.filenameSeparator !== "space" && { filenameSeparator: s.filenameSeparator }),
      };
    }

    const targetName = "Obsidian";
    try {
      const res = await fetch("/api/save-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = parseSaveNotesResponse(await res.json());
      const result = data.results?.obsidian;
      if (result?.success) {
        toast.success(`Saved to ${targetName}`);
      } else {
        toast.error(result?.error || "Save failed");
      }
    } catch {
      toast.error("Save failed");
    }
  };

  const handleSaveEditedSourceFile = useCallback(
    async (options?: { overwriteDiskConflict?: boolean }): Promise<boolean> => {
      const activeDocument = activeSourceBackedDocument;
      const activeSourceSave = activeDocument?.sourceSave;
      if (!activeDocument || !activeSourceSave?.enabled) {
        toast.error("This document cannot be saved to a file");
        return true;
      }

      const edited = isEditingMarkdown
        ? markdownEditorHandleRef.current?.getMarkdown()
        : activeDocument.currentText;
      if (edited == null) {
        toast.error("Editor is not ready");
        return true;
      }

      const savedChangedFromOpen =
        edited.replace(/\r\n?/g, "\n") !== activeDocument.sessionOpenText;
      try {
        const outcome = await sourceBackedDocuments.saveSourceBackedDocument({
          key: activeDocument.key,
          text: edited,
          overwriteDiskConflict: options?.overwriteDiskConflict,
        });
        if (!outcome || outcome.type === "save-blocked-conflict") {
          toast.error("Resolve the disk conflict first", {
            description: "Choose Overwrite disk or Reload from disk.",
          });
          return true;
        }

        const applySaveConflict = (
          result: Extract<SourceBackedDocumentLifecycleOutcome, { type: "save-conflict" }>,
        ): boolean => {
          if (activeSourceDocumentKeyRef.current === activeDocument.key) {
            setEditorDirty(true);
            setEditorDiffersFromBaseline(true);
            setEditStats(computeEditStats(result.record.diskBaseline, result.record.currentText));
          }
          scheduleDraftSave();
          toast.error("File changed on disk", {
            description: "Choose whether to overwrite disk or reload the file.",
          });
          return true;
        };

        const applyDiskUpdate = (
          result: Extract<
            SourceBackedDocumentLifecycleOutcome,
            { type: "save-disk-update-applied" }
          >,
        ): boolean => {
          if (activeSourceDocumentKeyRef.current === activeDocument.key) {
            const remapped = applyEditedDocument(result.record.currentText);
            repaintHighlights(remapped);
            editSessionBaseRef.current = result.record.currentText;
            setEditorDirty(false);
            setEditorDiffersFromBaseline(false);
            setEditStats(null);
          }
          scheduleDraftSave();
          toast("File updated from disk", {
            description: `${result.record.basename} changed outside Plannotator, so it was reloaded instead of saved.`,
          });
          return true;
        };

        const applySaveError = (
          result: Extract<SourceBackedDocumentLifecycleOutcome, { type: "save-error" }>,
        ): boolean => {
          if (result.reason === "conflict-snapshot-unavailable") {
            toast.error("File changed on disk", {
              description: "Plannotator could not load the latest disk version. Try saving again.",
            });
            return true;
          }
          toast.error(result.message);
          return true;
        };

        const applySaveSuccess = (
          result: Extract<SourceBackedDocumentLifecycleOutcome, { type: "save-succeeded" }>,
        ): boolean => {
          const normalizedEdited = edited.replace(/\r\n?/g, "\n");
          editedMarkdownRef.current = null;
          if (activeSourceDocumentKeyRef.current === activeDocument.key) {
            const live = isEditingMarkdown ? markdownEditorHandleRef.current?.getMarkdown() : null;
            const normalizedLive = live?.replace(/\r\n?/g, "\n");
            editSessionBaseRef.current = normalizedEdited;
            const currentText =
              normalizedLive ??
              sourceBackedDocuments.getSourceBackedDocument(activeDocument.key)?.currentText ??
              normalizedEdited;
            if (currentText === normalizedEdited) {
              setEditorDirty(false);
              setEditorDiffersFromBaseline(false);
              setEditStats(null);
            } else {
              sourceBackedDocuments.updateSourceBackedDocumentText(activeDocument.key, currentText, {
                forceNotify: true,
              });
              setEditorDirty(true);
              setEditorDiffersFromBaseline(true);
              setEditStats(computeEditStats(normalizedEdited, currentText));
            }
          }
          if (savedChangedFromOpen && window.innerWidth >= 768) {
            setRightSidebarTab("annotations");
            setIsPanelOpen(true);
          }
          scheduleDraftSave();
          toast.success(`Saved ${result.record.basename}`);
          return true;
        };

        if (outcome.type === "save-conflict") return applySaveConflict(outcome);
        if (outcome.type === "save-disk-update-applied") return applyDiskUpdate(outcome);
        if (outcome.type === "save-error") return applySaveError(outcome);
        if (outcome.type === "save-succeeded") return applySaveSuccess(outcome);
        return true;
      } catch {
        toast.error("Save failed");
        return true;
      }
    },
    [
      activeSourceBackedDocument,
      applyEditedDocument,
      sourceBackedDocuments,
      isEditingMarkdown,
      repaintHighlights,
      scheduleDraftSave,
    ],
  );

  const handleOverwriteDiskConflict = useCallback(() => {
    void handleSaveEditedSourceFile({ overwriteDiskConflict: true });
  }, [handleSaveEditedSourceFile]);

  const handleSaveMissingSourceFile = useCallback(() => {
    void handleSaveEditedSourceFile();
  }, [handleSaveEditedSourceFile]);

  const handleSaveSourceFile = useCallback(() => {
    void handleSaveEditedSourceFile();
  }, [handleSaveEditedSourceFile]);

  const handleReloadDiskConflict = useCallback(() => {
    const activeDocument = activeSourceBackedDocument;
    if (!activeDocument?.diskConflict) return;
    const outcome = sourceBackedDocuments.reloadSourceBackedDocument(activeDocument.key);
    if (outcome.type !== "document-reloaded") return;
    const remapped = applyEditedDocument(outcome.record.currentText);
    repaintHighlights(remapped);
    editSessionBaseRef.current = outcome.record.currentText;
    setEditorDirty(false);
    setEditorDiffersFromBaseline(false);
    setEditStats(null);
    scheduleDraftSave();
    toast.success(`Reloaded ${outcome.record.basename} from disk`);
  }, [
    activeSourceBackedDocument,
    applyEditedDocument,
    sourceBackedDocuments,
    repaintHighlights,
    scheduleDraftSave,
  ]);

  const handleCopyShareLink = async () => {
    const url = await ensureShareLink();
    if (!url) {
      setInitialExportTab("share");
      setShowExport(true);
      toast.error("Failed to create share link");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied");
    } catch {
      toast.error("Failed to copy");
    }
  };

  // Cmd/Ctrl+S keyboard shortcut — while editing, save the active source file;
  // otherwise keep the existing default notes/export behavior.
  const saveCurrentAnnotations = () => {
    const defaultApp = getDefaultNotesApp();
    const obsOk = isObsidianConfigured();
    if (defaultApp === "download") {
      handleDownloadAnnotations();
      return;
    }
    if (defaultApp === "obsidian" && obsOk) {
      handleQuickSaveToNotes();
      return;
    }
    setInitialExportTab("notes");
    setShowExport(true);
  };

  useEffect(() => {
    const handleSaveShortcut = (e: KeyboardEvent) => {
      if (e.key !== "s" || !(e.metaKey || e.ctrlKey)) return;

      const tag = getHTMLElementTarget(e.target)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (
        showExport ||
        showFeedbackPrompt ||
        showSourceFileEditWarning ||
        showExitWarning ||
        pendingPasteImage
      )
        return;

      if (submitted || !isApiMode) return;

      if (isEditingMarkdown && activeSourceBackedDocument?.sourceSave?.enabled) {
        e.preventDefault();
        void handleSaveEditedSourceFile();
        return;
      }

      e.preventDefault();

      saveCurrentAnnotations();
    };

    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [
    showExport,
    showFeedbackPrompt,
    showSourceFileEditWarning,
    showExitWarning,
    pendingPasteImage,
    submitted,
    isApiMode,
    isEditingMarkdown,
    activeSourceBackedDocument,
    handleSaveEditedSourceFile,
    saveCurrentAnnotations,
  ]);

  // Cmd/Ctrl+P keyboard shortcut — print document
  useEffect(() => {
    const handlePrintShortcut = (e: KeyboardEvent) => {
      if (e.key !== "p" || !(e.metaKey || e.ctrlKey)) return;

      const tag = getHTMLElementTarget(e.target)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (
        showExport ||
        showFeedbackPrompt ||
        showSourceFileEditWarning ||
        showExitWarning ||
        pendingPasteImage
      )
        return;

      if (submitted) return;

      e.preventDefault();
      window.print();
    };

    window.addEventListener("keydown", handlePrintShortcut);
    return () => window.removeEventListener("keydown", handlePrintShortcut);
  }, [
    showExport,
    showFeedbackPrompt,
    showSourceFileEditWarning,
    showExitWarning,
    pendingPasteImage,
    submitted,
  ]);

  const agentName = useMemo(() => getAgentName(origin), [origin]);

  // Header handlers ref — stores latest handler references so the stable
  // callbacks below always call the current version without needing useCallback
  // dep arrays for every handler. This lets React.memo on AppHeader work.
  const headerHandlersRef = useRef({
    handleAnnotateApprove,
    handleAnnotateFeedback,
    handleAnnotateExit,
    handleQuickSaveToNotes,
    handleDownloadAnnotations,
    handleCopyShareLink,
    getDocAnnotations: linkedDocHook.getDocAnnotations,
  });
  headerHandlersRef.current = {
    handleAnnotateApprove,
    handleAnnotateFeedback,
    handleAnnotateExit,
    handleQuickSaveToNotes,
    handleDownloadAnnotations,
    handleCopyShareLink,
    getDocAnnotations: linkedDocHook.getDocAnnotations,
  };

  const handleHeaderAnnotateExit = useCallback(() => {
    const close = () => {
      if (hasFeedbackToSend) {
        setExitWarningAction("close");
        setShowExitWarning(true);
      } else {
        headerHandlersRef.current.handleAnnotateExit();
      }
    };
    if (maybeConfirmUnsavedSourceFileEdits("close", close)) return;
    close();
  }, [hasFeedbackToSend, maybeConfirmUnsavedSourceFileEdits]);

  const handleHeaderAnnotateFeedback = useCallback(() => {
    const sendFeedback = () => headerHandlersRef.current.handleAnnotateFeedback();
    if (maybeConfirmUnsavedSourceFileEdits("send-feedback", sendFeedback)) return;
    sendFeedback();
  }, [maybeConfirmUnsavedSourceFileEdits]);

  const handleHeaderAnnotateApprove = useCallback(() => {
    const approve = () => headerHandlersRef.current.handleAnnotateApprove();
    if (maybeConfirmUnsavedSourceFileEdits("approve", approve)) return;
    approve();
  }, [maybeConfirmUnsavedSourceFileEdits]);
  const handleHeaderDownloadAnnotations = useCallback(
    () => headerHandlersRef.current.handleDownloadAnnotations(),
    [],
  );
  const handleHeaderCopyShareLink = useCallback(
    () => headerHandlersRef.current.handleCopyShareLink(),
    [],
  );
  const handleToggleHtmlTools = useCallback(() => {
    setHtmlToolsHidden((hidden) => !hidden);
  }, []);
  const handleCopyAgentInstructions = useCallback(() => {}, []);
  const handleOpenSettings = useCallback(() => setMobileSettingsOpen(true), []);
  const handleCloseSettings = useCallback(() => setMobileSettingsOpen(false), []);
  const handleOpenMessagePicker = useCallback(() => sidebar.open("messages"), [sidebar.open]);
  const handleCloseRightSidebar = useCallback(() => setIsPanelOpen(false), []);
  const handleSelectSidebarFile = useCallback(
    (absolutePath: string, dirPath: string) => {
      if (isEditingMarkdown && annotateSource !== "folder") {
        toast("Finish editing first", { description: 'Use "Done editing" before opening files.' });
        return;
      }
      if (isEditingMarkdown && !/\.(mdx?|txt)$/i.test(absolutePath)) {
        toast("Finish editing first", {
          description: 'Use "Done editing" before opening non-editable files.',
        });
        return;
      }
      handleFileBrowserSelect(absolutePath, dirPath);
    },
    [annotateSource, handleFileBrowserSelect, isEditingMarkdown],
  );
  const handleFetchAllSidebarFiles = useCallback(() => {
    fileBrowser.fetchAll(fileBrowserDirs);
  }, [fileBrowser, fileBrowserDirs]);
  const handleRetrySidebarVaultDirectory = useCallback(
    (vaultPath: string) => fileBrowser.addVaultDir(vaultPath),
    [fileBrowser],
  );
  const handleQuickCopyFeedback = useCallback(async () => {
    const output = getCurrentFeedbackPayload();
    await navigator.clipboard.writeText(wrapFeedbackForAgent(output));
  }, [getCurrentFeedbackPayload]);
  const handleOpenShareExport = useCallback(() => {
    setIsPanelOpen(false);
    setInitialExportTab("share");
    setShowExport(true);
  }, []);
  const handleDiscardPlanEdits = useCallback(() => handleDiscardEdits(), [handleDiscardEdits]);
  const handleOpenExport = useCallback(() => {
    setInitialExportTab(undefined);
    setShowExport(true);
  }, []);
  const handleCloseExport = useCallback(() => {
    setShowExport(false);
    setInitialExportTab(undefined);
  }, []);
  const handlePrint = useCallback(() => window.print(), []);
  const handleOpenImport = useCallback(() => setShowImport(true), []);
  const handleCloseImport = useCallback(() => setShowImport(false), []);
  const handleCloseFeedbackPrompt = useCallback(() => setShowFeedbackPrompt(false), []);
  const handleCloseExitWarning = useCallback(() => setShowExitWarning(false), []);
  const handleConfirmExitWarning = useCallback(() => {
    setShowExitWarning(false);
    if (exitWarningAction === "approve") handleAnnotateApprove();
    else handleAnnotateExit();
  }, [exitWarningAction, handleAnnotateApprove, handleAnnotateExit]);
  const handleToggleGrid = useCallback((enabled: boolean) => {
    configStore.set("gridEnabled", enabled);
  }, []);
  const handleSaveToObsidian = useCallback(
    () => headerHandlersRef.current.handleQuickSaveToNotes(),
    [],
  );

  const documentPresentation = buildAppDocumentPresentation({
    displayedMarkdown,
    rootMarkdown: markdown,
    renderAs,
    annotateSource,
    selectedMessageId,
    editGeneration,
    activeSourceSaveEnabled: activeSourceBackedDocument?.sourceSave?.enabled === true,
    hasEditStats: editStats !== null,
    linkedDocumentIsActive: linkedDocHook.isActive,
    isSharedSession,
    isSubmitted: submitted !== null,
    canUseWideMode,
    wideModeType,
    planWidth: uiPrefs.planWidth,
    annotateMode,
    agentTerminalAvailable: agentTerminalCapability !== null,
    isAgentTerminalOpen,
    isAgentTerminalRunning,
    sourceFilePath,
    linkedDocumentPath: linkedDocHook.filepath,
    isActiveFileVault:
      fileBrowser.dirs.find((directory) => directory.path === fileBrowser.activeDirPath)?.isVault ===
      true,
    hasActiveFile: fileBrowser.activeFile !== null,
  });
  const {
    annotateReaderMaxWidth,
    backLabel,
    canEditMarkdown,
    isHtmlSurface,
    linkedDocumentLabel,
    linkedDocumentVariant,
    shouldRenderAgentTerminal,
    showAgentTerminalControls,
    showEmptyFolderPresentation,
    viewerContentKey,
    viewerCopyLabel,
    viewerOpenInAppPath,
  } = documentPresentation;
  const _selectedAIProvider =
    aiProviders.find((provider) => provider.id === aiConfig.providerId) ?? null;
  // Only greet in a normal authoring context — not on a read-only shared session
  // (a viewer would also be able to flip the owner's gridEnabled). Deferred
  // (not marked seen) until then.
  const shouldShowLookAndFeelAnnouncement = showLookAndFeelAnnouncement && !isSharedSession;
  const renderedLinkedDocument = linkedDocHook.isActive
    ? {
        filepath: linkedDocHook.filepath!,
        onBack: handleLinkedDocBack,
        label: linkedDocumentLabel,
        backLabel,
        variant: linkedDocumentVariant,
      }
    : null;
  const viewerMessagePickerInfo =
    annotateSource === "message" && recentMessages.length > 1
      ? {
          current: recentMessages.findIndex((message) => message.messageId === selectedMessageId) + 1,
          total: recentMessages.length,
        }
      : undefined;
  const { leftSidebar: layoutLeftSidebar, rightSidebar: layoutRightSidebar } = layoutPresentation;

  // SAFETY: sonner style tokens are custom CSS properties (--normal-bg & friends)
  // that React.CSSProperties deliberately excludes via closed typing; the keys are
  // all valid custom properties and the values are var()/oklch() references.
  const toastStyle = {
    "--normal-bg": "var(--card)",
    "--normal-border": "var(--border)",
    "--normal-text": "var(--foreground)",
    "--success-bg": "oklch(from var(--success) l c h / 0.15)",
    "--success-border": "oklch(from var(--success) l c h / 0.3)",
    "--success-text": "var(--success)",
    "--error-bg": "oklch(from var(--destructive) l c h / 0.15)",
    "--error-border": "oklch(from var(--destructive) l c h / 0.3)",
    "--error-text": "var(--destructive)",
  } as React.CSSProperties;

  return (
    <EditorAppScreen
      model={{
        isLoading,
        isSharedSession,
        header: {
          htmlSurface: isHtmlSurface,
          htmlToolsHidden,
          isApiMode,
          annotateMode,
          gate,
          isSharedSession,
          origin,
          isSubmitting,
          isExiting,
          isPanelOpen: layoutRightSidebar.isAnnotationPanelOpen,
          aiAvailable: canUseAskAI,
          isAIChatOpen: layoutRightSidebar.isAIChatOpen,
          aiHasMessages: aiSidebarHasMessages,
          hasAnyAnnotations: hasAnyAnnotations || hasDirectEdits || hasSavedFileChanges,
          linkedDocIsActive: linkedDocHook.isActive,
          callbackShareUrlReady: callbackConfig
            ? Boolean(shareUrl || shortShareUrl || (renderAs === "html" && (shareHtml || rawHtml)))
            : true,
          canShareCurrentSession,
          callbackConfig,
          mobileSettingsOpen,
          gitUser,
          appVersion: __APP_VERSION__,
          agentInstructionsEnabled: false,
          obsidianConfigured: isObsidianConfigured(),
        },
        banners: {
          linkedDocumentError: linkedDocHook.error,
          hasDiskConflict: Boolean(activeSourceBackedDocument?.diskConflict),
          conflictedFileName: activeSourceBackedDocument?.basename ?? "",
          hasMissingSourceFile:
            activeSourceBackedDocument?.missingOnDisk === true &&
            !activeSourceBackedDocument.diskConflict,
          missingFileName: activeSourceBackedDocument?.basename ?? "",
          isEditingMarkdown,
          canOverwriteDiskConflict,
          isSavingSourceFile: activeSaveStatus === "saving",
          showAgentTerminalDeliveryStatus,
        },
        workspace: {
          scrollViewport,
          isResizing: layoutPresentation.isResizing,
          terminal: {
            shouldRender: shouldRenderAgentTerminal,
            isOpen: isAgentTerminalOpen,
            capability: agentTerminalCapability,
            panelRef: agentTerminalRef,
            width: agentTerminalResize.width,
            isResizeDragging: agentTerminalResize.isDragging,
            resizeHandleStyle: agentTerminalResize.handleProps.style,
          },
          leftSidebar: {
            isWideMode: layoutLeftSidebar.isWideMode,
            isOpen: sidebar.isOpen,
            activeTab: sidebar.activeTab,
            width: tocResize.width,
            isResizeDragging: tocResize.isDragging,
            resizeHandleStyle: tocResize.handleProps.style,
            showFilesTab,
            showMessagesTab: layoutLeftSidebar.showMessagesTab,
            showAgentTerminalControls,
            isAgentTerminalOpen,
            isAgentTerminalRunning,
            hasMessageAnnotations: layoutLeftSidebar.hasMessageAnnotations,
            hasFileAnnotations,
            blocks,
            annotations,
            activeSection,
            isLinkedDocumentActive: linkedDocHook.isActive,
            linkedDocumentFilepath: linkedDocHook.filepath,
            backLabel,
            fileAnnotationCounts,
            highlightedFiles,
            fileEditStatuses: sourceBackedDocuments.fileEditStatuses,
            fileBrowserDirectories: fileBrowser.dirs,
            expandedFolders: fileBrowser.expandedFolders,
            collapsedDirectories: fileBrowser.collapsedDirs,
            activeFile: fileBrowser.activeFile,
            messages: recentMessages,
            selectedMessageId,
            messageAnnotationCounts: activeMessageAnnotationCounts,
          },
          document: {
            isHtmlSurface,
            gridEnabled,
            sidebarIsOpen: sidebar.isOpen,
            agentTerminalIsOpen: isAgentTerminalOpen,
            wideModeType,
            isEditingMarkdown,
            htmlToolsHidden,
            stickyActionsEnabled: uiPrefs.stickyActionsEnabled,
            inputMethod,
            editorMode,
            repoInfo,
            readerMaxWidth: annotateReaderMaxWidth,
            viewerContentKey,
            showEmptyFolderPresentation,
            canUseWideMode,
            canEditMarkdown,
            activeSourceSaveFileName: activeSourceSave?.basename ?? null,
            activeSaveStatus,
            saveFailed,
            emphasizeSave,
            hasUnsavedDiskChanges,
            cancelMode,
            confirmCancelEdits,
            planAreaRef,
            renderAs,
            rawHtml,
            displayedMarkdown,
            blocks,
            frontmatter,
            annotations: viewerAnnotations,
            selectedAnnotationId,
            globalAttachments,
            activeSourceDocumentKey: activeSourceBackedDocument?.key ?? null,
            editGeneration,
            viewerRef,
            showDemoBadge: !isApiMode && !isLoadingShared && !isSharedSession,
            linkedDocument: renderedLinkedDocument,
            imageBaseDir,
            codePathBaseDir: activeDocBaseDir,
            copyLabel: viewerCopyLabel,
            sourceInfo,
            openInAppPath: viewerOpenInAppPath,
            messagePickerInfo: viewerMessagePickerInfo,
            checkboxOverrides: checkbox.overrides,
            actionsLabelMode,
            typographyStyle: annotationTypographyStyle,
          },
          rightSidebar: {
            isOpen: layoutRightSidebar.isOpen,
            activeTab: rightSidebarTab,
            isWideMode: layoutRightSidebar.isWideMode,
            canUseAskAI,
            isMobile,
            width: panelResize.width,
            isResizeDragging: panelResize.isDragging,
            resizeHandleStyle: panelResize.handleProps.style,
            blocks,
            annotations: allAnnotations,
            selectedAnnotationId,
            selectedCodeAnnotationId,
            codeAnnotations,
            sharingEnabled: canShareCurrentSession,
            editorAnnotations,
            otherFileAnnotations,
            directEdits: directEditsPanelInfo,
            aiMessages: visibleAIMessages,
            aiIsCreatingSession,
            aiIsStreaming,
            aiPermissionRequests,
            aiProviders: visibleAIProviders,
            aiConfig: visibleAIConfig,
            isAgentTerminalReady,
          },
        },
        dialogs: {
          draftBanner,
          showExport,
          shareUrl,
          shareUrlSize,
          shortShareUrl,
          isGeneratingShortUrl,
          shortUrlError,
          annotationsOutput: showExport ? getCurrentFeedbackPayload() : "",
          annotationCount: allAnnotations.length + codeAnnotations.length,
          sharingEnabled: canShareCurrentSession,
          markdown,
          isApiMode,
          initialExportTab,
          showImport,
          shareBaseUrl,
          showFeedbackPrompt,
          canEditMarkdown,
          agentName,
          showSourceFileEditWarning,
          sourceFileEditWarningAction,
          showExitWarning,
          exitWarningAction,
          feedbackLoss,
          hasSavedFileChanges,
          hasUnsentFeedback,
          savedFileChangesCount: savedFileChanges.length,
          shareLoadError,
        },
        overlays: {
          codeFilePopoutProps: codeFilePopout.popoutProps,
          codeAnnotations,
          selectedCodeAnnotationId,
          submitted,
          agentName,
          annotateSource,
          shouldShowLookAndFeelAnnouncement,
          gridEnabled,
          pendingPasteImage,
        },
        toastStyle,
      }}
      actions={{
        header: {
          onToggleHtmlTools: handleToggleHtmlTools,
          onCallbackFeedback: handleCallbackFeedback,
          onCallbackApprove: handleCallbackApprove,
          onAnnotateExit: handleHeaderAnnotateExit,
          onAnnotateFeedback: handleHeaderAnnotateFeedback,
          onAnnotateApprove: handleHeaderAnnotateApprove,
          onAnnotationPanelToggle: handleAnnotationPanelToggle,
          onAIChatToggle: handleAIChatToggle,
          onIdentityChange: handleIdentityChange,
          onUIPreferencesChange: setUiPrefs,
          onOpenSettings: handleOpenSettings,
          onCloseSettings: handleCloseSettings,
          onOpenExport: handleOpenExport,
          onCopyAgentInstructions: handleCopyAgentInstructions,
          onDownloadAnnotations: handleHeaderDownloadAnnotations,
          onPrint: handlePrint,
          onCopyShareLink: handleHeaderCopyShareLink,
          onOpenImport: handleOpenImport,
          onSaveToObsidian: handleSaveToObsidian,
        },
        banners: {
          onDismissLinkedDocumentError: linkedDocHook.dismissError,
          onOverwriteDiskConflict: handleOverwriteDiskConflict,
          onReloadDiskConflict: handleReloadDiskConflict,
          onSaveMissingSourceFile: handleSaveMissingSourceFile,
        },
        workspace: {
          terminal: {
            onSessionActiveChange: handleAgentTerminalRunningChange,
            onSessionReadyChange: handleAgentTerminalReadyChange,
            onClose: hideAgentTerminal,
            onResizePointerDown: agentTerminalResize.handleProps.onPointerDown,
            onResizeDoubleClick: agentTerminalResize.handleProps.onDoubleClick,
          },
          leftSidebar: {
            onToggleTab: toggleSidebarTab,
            onClose: sidebar.close,
            onToggleAgentTerminal: toggleAgentTerminal,
            onResizePointerDown: tocResize.handleProps.onPointerDown,
            onResizeDoubleClick: tocResize.handleProps.onDoubleClick,
            onTocNavigate: handleTocNavigate,
            onLinkedDocumentBack: handleLinkedDocBack,
            onSelectFile: handleSelectSidebarFile,
            onFetchAllFiles: handleFetchAllSidebarFiles,
            onRetryVaultDirectory: handleRetrySidebarVaultDirectory,
            onToggleFolder: fileBrowser.toggleFolder,
            onToggleDirectoryCollapse: fileBrowser.toggleCollapse,
            onFetchFileTree: fileBrowser.fetchTree,
            onClearVaultDirectories: fileBrowser.clearVaultDirs,
            onSetActiveFile: fileBrowser.setActiveFile,
            onSelectMessage: handleSelectMessage,
          },
          document: {
            onViewportReady: handleViewportReady,
            onInputMethodChange: handleInputMethodChange,
            onEditorModeChange: handleEditorModeChange,
            onToggleViewMode: toggleViewMode,
            onSaveSourceFile: handleSaveSourceFile,
            onEditExit: handleEditExitClick,
            onAddAnnotation: handleAddAnnotation,
            onRemoveAnnotation: removeAnnotation,
            onSelectAnnotation: handleSelectAnnotation,
            onAddGlobalAttachment: handleAddGlobalAttachment,
            onRemoveGlobalAttachment: handleRemoveGlobalAttachment,
            onEditorHandleReady: handleMarkdownEditorReady,
            onMarkdownChange: handleEditorChange,
            onOpenLinkedDocument: handleOpenLinkedDoc,
            onOpenCodeFile: codeFilePopout.open,
            onOpenMessagePicker: handleOpenMessagePicker,
            onToggleCheckbox: checkbox.toggle,
            onAskAI: canUseDocumentAskAI ? handleAskAI : undefined,
          },
          rightSidebar: {
            onClose: handleCloseRightSidebar,
            onResizePointerDown: panelResize.handleProps.onPointerDown,
            onResizeDoubleClick: panelResize.handleProps.onDoubleClick,
            onSelectAnnotation: handleSelectAnnotation,
            onDeleteAnnotation: handleDeleteAnnotation,
            onEditAnnotation: handleEditAnnotation,
            onSelectCodeAnnotation: handleSelectCodeAnnotation,
            onDeleteCodeAnnotation: handleDeleteCodeAnnotation,
            onEditCodeAnnotation: handleEditCodeAnnotation,
            onDeleteEditorAnnotation: deleteEditorAnnotation,
            onQuickCopy: handleQuickCopyFeedback,
            onOpenShareExport: handleOpenShareExport,
            onShowAnnotatedFiles: handleFlashAnnotatedFiles,
            onDiscardPlanEdits: handleDiscardPlanEdits,
            onAskGeneralAI: handleAskGeneralAI,
            onRespondToAIPermission: respondToAIPermission,
            onAIConfigChange: handleAIConfigChange,
          },
        },
        dialogs: {
          onDismissDraft: dismissDraft,
          onRestoreDraft: handleRestoreDraft,
          onCloseExport: handleCloseExport,
          onGenerateShortUrl: generateShortUrl,
          onCloseImport: handleCloseImport,
          onImport: importFromShareUrl,
          onCloseFeedbackPrompt: handleCloseFeedbackPrompt,
          onCloseSourceFileEditWarning: closeSourceFileEditWarning,
          onConfirmSourceFileEditWarning: confirmSourceFileEditWarning,
          onCloseExitWarning: handleCloseExitWarning,
          onConfirmExitWarning: handleConfirmExitWarning,
          onClearShareLoadError: clearShareLoadError,
        },
        overlays: {
          onAddCodeAnnotation: handleAddCodeAnnotation,
          onEditCodeAnnotation: handleEditCodeAnnotation,
          onDeleteCodeAnnotation: handleDeleteCodeAnnotation,
          onSelectCodeAnnotation: handleSelectCodeFileAnnotation,
          onToggleGrid: handleToggleGrid,
          onDismissLookAndFeelAnnouncement: dismissLookAndFeelAnnouncement,
          onAcceptPasteImage: handlePasteAnnotatorAccept,
          onClosePasteImage: handlePasteAnnotatorClose,
        },
      }}
    />
  );
};

export default App;
