import type { Origin } from "@plannotator/shared/agents";
import { getAgentName } from "@plannotator/shared/agents";
import { CompletionOverlay } from "@plannotator/ui/components/CompletionOverlay";
import { PRSwitchOverlay } from "./PRSwitchOverlay";

/** Terminal state for a submitted review session. */
export type ReviewSubmissionStatus = "approved" | "feedback" | "exited" | false;

/** Read-only display data for review overlays. */
export interface ReviewOverlaysModel {
  readonly isSwitchingPRScope: boolean;
  readonly isExportOpen: boolean;
  readonly annotationCount: number;
  readonly feedbackMarkdown: string;
  readonly submitted: ReviewSubmissionStatus;
  readonly origin: Origin | null;
  readonly platformMode: boolean;
}

/** Overlay actions retained by ReviewApp, which owns review state transitions. */
export interface ReviewOverlaysActions {
  readonly onCloseExport: () => void;
  readonly onCopyExportFeedback: () => Promise<void>;
}

/** Renders review loading, export, and completion overlays from App-owned state. */
export function ReviewOverlays({
  model,
  actions,
}: {
  readonly model: ReviewOverlaysModel;
  readonly actions: ReviewOverlaysActions;
}) {
  return (
    <>
      <PRScopeSwitchOverlay isSwitching={model.isSwitchingPRScope} />
      <ReviewExportOverlay model={model} actions={actions} />
      <ReviewCompletionOverlay model={model} />
    </>
  );
}

function PRScopeSwitchOverlay({ isSwitching }: { readonly isSwitching: boolean }) {
  if (!isSwitching) return null;

  return <PRSwitchOverlay />;
}

function ReviewExportOverlay({
  model,
  actions,
}: {
  readonly model: ReviewOverlaysModel;
  readonly actions: ReviewOverlaysActions;
}) {
  if (!model.isExportOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl flex flex-col max-h-[80vh] shadow-2xl">
        <ReviewExportHeader onClose={actions.onCloseExport} />
        <div className="flex-1 overflow-auto p-4">
          <div className="text-xs text-muted-foreground mb-2">
            {model.annotationCount} annotation{model.annotationCount !== 1 ? "s" : ""}
          </div>
          <pre className="export-code-block whitespace-pre-wrap">{model.feedbackMarkdown}</pre>
        </div>
        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={actions.onCopyExportFeedback}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-colors"
          >
            Copy to Clipboard
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewExportHeader({ onClose }: { readonly onClose: () => void }) {
  return (
    <div className="p-4 border-b border-border flex justify-between items-center">
      <h3 className="font-semibold text-sm">Export Review Feedback</h3>
      <button
        onClick={onClose}
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      >
        <ReviewExportCloseIcon />
      </button>
    </div>
  );
}

function ReviewExportCloseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ReviewCompletionOverlay({ model }: { readonly model: ReviewOverlaysModel }) {
  const agentName = getAgentName(model.origin);
  return (
    <CompletionOverlay
      submitted={model.submitted}
      title={getReviewCompletionTitle(model.submitted)}
      subtitle={getReviewCompletionSubtitle(model.submitted, model.platformMode, agentName)}
      agentLabel={agentName}
    />
  );
}

function getReviewCompletionTitle(submitted: ReviewSubmissionStatus): string {
  if (submitted === "approved") return "Changes Approved";
  if (submitted === "exited") return "Session Closed";
  return "Feedback Sent";
}

function getReviewCompletionSubtitle(
  submitted: ReviewSubmissionStatus,
  platformMode: boolean,
  agentName: string,
): string {
  if (submitted === "exited") return "Review session closed without feedback.";
  if (platformMode) {
    return submitted === "approved"
      ? "Your approval was submitted to GitHub."
      : "Your feedback was submitted to GitHub.";
  }
  return submitted === "approved"
    ? `${agentName} will proceed with the changes.`
    : `${agentName} will address your review feedback.`;
}
