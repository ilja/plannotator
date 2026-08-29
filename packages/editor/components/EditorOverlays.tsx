import {
  type CodeFileAnnotationInput,
  CodeFilePopout,
} from "@plannotator/ui/components/CodeFilePopout";
import { CompletionOverlay } from "@plannotator/ui/components/CompletionOverlay";
import { ImageAnnotator } from "@plannotator/ui/components/ImageAnnotator";
import { LookAndFeelAnnouncementDialog } from "@plannotator/ui/components/LookAndFeelAnnouncementDialog";
import type { UseCodeFilePopoutReturn } from "@plannotator/ui/hooks/useCodeFilePopout";
import type { CodeAnnotation } from "@plannotator/ui/types";
import {
  buildCompletionSubtitle,
  buildCompletionTitle,
  type AnnotateSource,
  type SubmissionStatus,
} from "../appPresentation";

/** Pending pasted image data shown by the image annotation overlay. */
export interface PendingPasteImage {
  readonly file: File;
  readonly blobUrl: string;
  readonly initialName: string;
}

/** Read-only display data for the editor's non-dialog overlays. */
export interface EditorOverlaysModel {
  readonly codeFilePopoutProps: UseCodeFilePopoutReturn["popoutProps"];
  readonly codeAnnotations: readonly CodeAnnotation[];
  readonly selectedCodeAnnotationId: string | null;
  readonly submitted: SubmissionStatus;
  readonly agentName: string;
  readonly annotateSource: AnnotateSource;
  readonly shouldShowLookAndFeelAnnouncement: boolean;
  readonly gridEnabled: boolean;
  readonly pendingPasteImage: PendingPasteImage | null;
}

/** Overlay actions retained by App, which owns selection and image-upload state. */
export interface EditorOverlaysActions {
  readonly onAddCodeAnnotation: (annotation: CodeFileAnnotationInput) => void;
  readonly onEditCodeAnnotation: (id: string, updates: Partial<CodeAnnotation>) => void;
  readonly onDeleteCodeAnnotation: (id: string) => void;
  readonly onSelectCodeAnnotation: (annotationId: string | null) => void;
  readonly onToggleGrid: (enabled: boolean) => void;
  readonly onDismissLookAndFeelAnnouncement: () => void;
  readonly onAcceptPasteImage: (blob: Blob, hasDrawings: boolean, name: string) => void;
  readonly onClosePasteImage: () => void;
}

/** Renders the editor's code, completion, announcement, and image overlays. */
export function EditorOverlays({
  model,
  actions,
}: {
  readonly model: EditorOverlaysModel;
  readonly actions: EditorOverlaysActions;
}) {
  return (
    <>
      <CodeFileOverlay model={model} actions={actions} />
      <CompletionOverlay
        submitted={model.submitted}
        title={buildCompletionTitle(model.submitted)}
        subtitle={buildCompletionSubtitle(model.submitted, model.agentName, model.annotateSource)}
        agentLabel={model.agentName}
      />
      <LookAndFeelAnnouncementDialog
        isOpen={model.shouldShowLookAndFeelAnnouncement}
        gridEnabled={model.gridEnabled}
        onToggleGrid={actions.onToggleGrid}
        onDismiss={actions.onDismissLookAndFeelAnnouncement}
      />
      <ImageAnnotator
        isOpen={model.pendingPasteImage !== null}
        imageSrc={model.pendingPasteImage?.blobUrl ?? ""}
        initialName={model.pendingPasteImage?.initialName}
        onAccept={actions.onAcceptPasteImage}
        onClose={actions.onClosePasteImage}
      />
    </>
  );
}

function CodeFileOverlay({
  model,
  actions,
}: {
  readonly model: EditorOverlaysModel;
  readonly actions: EditorOverlaysActions;
}) {
  if (model.codeFilePopoutProps === null) return null;

  const codeFilePopoutProps = model.codeFilePopoutProps;
  return (
    <CodeFilePopout
      {...codeFilePopoutProps}
      annotations={model.codeAnnotations.filter(
        (annotation) => annotation.filePath === codeFilePopoutProps.filepath,
      )}
      selectedAnnotationId={model.selectedCodeAnnotationId}
      onAddAnnotation={actions.onAddCodeAnnotation}
      onEditAnnotation={actions.onEditCodeAnnotation}
      onDeleteAnnotation={actions.onDeleteCodeAnnotation}
      onSelectAnnotation={actions.onSelectCodeAnnotation}
    />
  );
}
