import type { CommentAskAIHandler } from "@plannotator/ui/components/CommentPopover";
import type { LinkedDocBadgeInfo } from "@plannotator/ui/components/DocBadges";
import type { AnnotateSource } from "./appPresentation";

/** Source-backed document facts displayed by the editor screen. */
export interface AppScreenSourceDocument {
  readonly basename: string;
  readonly diskConflict: { readonly text: string } | undefined;
  readonly missingOnDisk: boolean | undefined;
  readonly key: string;
}

/**
 * Disk-state banner: a conflict and a disappearance are mutually exclusive —
 * the builder shows the conflict when both signals are present — so they
 * share one nullable union instead of two boolean+payload pairs.
 */
export type DiskBanner =
  | { readonly kind: "conflict"; readonly fileName: string }
  | { readonly kind: "missing"; readonly fileName: string };

/** Immutable App state required to derive screen-level display values. */
export interface BuildAppScreenPresentationInput {
  readonly activeSourceDocument: AppScreenSourceDocument | null;
  readonly activeSourceSave: { readonly basename: string } | null;
  readonly isApiMode: boolean;
  readonly isLoadingShared: boolean;
  readonly isSharedSession: boolean;
  readonly showExport: boolean;
  readonly getCurrentFeedbackPayload: () => string;
  readonly canUseDocumentAskAI: boolean;
  readonly onAskAI: CommentAskAIHandler;
  readonly showLookAndFeelAnnouncement: boolean;
  readonly linkedDocumentIsActive: boolean;
  readonly linkedDocumentPath: string | null;
  readonly onLinkedDocumentBack: () => void;
  readonly linkedDocumentLabel: string | undefined;
  readonly linkedDocumentBackLabel: string;
  readonly linkedDocumentVariant: "folder-file" | "breadcrumb";
  readonly annotateSource: AnnotateSource;
  readonly recentMessages: readonly { readonly messageId: string }[];
  readonly selectedMessageId: string | null;
}

/** Read-only screen values grouped by their unchanged EditorAppScreen section. */
export interface AppScreenPresentation {
  readonly banners: {
    readonly diskBanner: DiskBanner | null;
  };
  readonly document: {
    readonly activeSourceSaveFileName: string | null;
    readonly activeSourceDocumentKey: string | null;
    readonly showDemoBadge: boolean;
    readonly linkedDocument: LinkedDocBadgeInfo | null;
    readonly messagePickerInfo: { readonly current: number; readonly total: number } | undefined;
  };
  readonly dialogs: {
    readonly annotationsOutput: string;
  };
  readonly overlays: {
    readonly shouldShowLookAndFeelAnnouncement: boolean;
  };
  readonly documentActions: {
    readonly onAskAI: CommentAskAIHandler | undefined;
  };
}

function buildLinkedDocumentBadge(
  input: BuildAppScreenPresentationInput,
): LinkedDocBadgeInfo | null {
  if (!input.linkedDocumentIsActive || input.linkedDocumentPath === null) return null;

  return {
    filepath: input.linkedDocumentPath,
    onBack: input.onLinkedDocumentBack,
    label: input.linkedDocumentLabel,
    backLabel: input.linkedDocumentBackLabel,
    variant: input.linkedDocumentVariant,
  };
}

function buildMessagePickerInfo(
  input: BuildAppScreenPresentationInput,
): { readonly current: number; readonly total: number } | undefined {
  if (input.annotateSource !== "message" || input.recentMessages.length <= 1) return undefined;

  return {
    current:
      input.recentMessages.findIndex((message) => message.messageId === input.selectedMessageId) +
      1,
    total: input.recentMessages.length,
  };
}

/** Builds editor screen display values without reading or mutating App state. */
export function buildAppScreenPresentation(
  input: BuildAppScreenPresentationInput,
): AppScreenPresentation {
  const activeDocument = input.activeSourceDocument;

  const diskBanner: DiskBanner | null = activeDocument?.diskConflict
    ? { kind: "conflict", fileName: activeDocument.basename }
    : activeDocument?.missingOnDisk === true
      ? { kind: "missing", fileName: activeDocument.basename }
      : null;

  return {
    banners: {
      diskBanner,
    },
    document: {
      activeSourceSaveFileName: input.activeSourceSave?.basename ?? null,
      activeSourceDocumentKey: activeDocument?.key ?? null,
      showDemoBadge: !input.isApiMode && !input.isLoadingShared && !input.isSharedSession,
      linkedDocument: buildLinkedDocumentBadge(input),
      messagePickerInfo: buildMessagePickerInfo(input),
    },
    dialogs: {
      annotationsOutput: input.showExport ? input.getCurrentFeedbackPayload() : "",
    },
    overlays: {
      shouldShowLookAndFeelAnnouncement:
        input.showLookAndFeelAnnouncement && !input.isSharedSession,
    },
    documentActions: {
      onAskAI: input.canUseDocumentAskAI ? input.onAskAI : undefined,
    },
  };
}
