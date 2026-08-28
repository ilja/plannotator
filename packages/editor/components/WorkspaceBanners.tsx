type WorkspaceBannersProps = {
  linkedDocumentError: string | null;
  onDismissLinkedDocumentError: () => void;
  hasDiskConflict: boolean;
  conflictedFileName: string;
  hasMissingSourceFile: boolean;
  missingFileName: string;
  isEditingMarkdown: boolean;
  canOverwriteDiskConflict: boolean;
  isSavingSourceFile: boolean;
  onOverwriteDiskConflict: () => void;
  onReloadDiskConflict: () => void;
  onSaveMissingSourceFile: () => void;
  showAgentTerminalDeliveryStatus: boolean;
};

export function WorkspaceBanners({
  linkedDocumentError,
  onDismissLinkedDocumentError,
  hasDiskConflict,
  conflictedFileName,
  hasMissingSourceFile,
  missingFileName,
  isEditingMarkdown,
  canOverwriteDiskConflict,
  isSavingSourceFile,
  onOverwriteDiskConflict,
  onReloadDiskConflict,
  onSaveMissingSourceFile,
  showAgentTerminalDeliveryStatus,
}: WorkspaceBannersProps) {
  return (
    <>
      {linkedDocumentError && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-destructive">{linkedDocumentError}</span>
          <button
            onClick={onDismissLinkedDocumentError}
            className="ml-auto text-xs text-destructive/60 hover:text-destructive"
          >
            dismiss
          </button>
        </div>
      )}

      {hasDiskConflict && (
        <div className="bg-warning/10 border-b border-warning/25 px-4 py-2 flex items-center gap-3 flex-shrink-0">
          <span className="min-w-0 flex-1 text-xs text-warning-foreground">
            {conflictedFileName} changed on disk{isEditingMarkdown ? " while you were editing" : ""}.
          </span>
          {canOverwriteDiskConflict && (
            <button
              type="button"
              onClick={onOverwriteDiskConflict}
              className="text-xs font-medium text-primary hover:text-primary/80"
            >
              Overwrite disk
            </button>
          )}
          <button
            type="button"
            onClick={onReloadDiskConflict}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Reload from disk
          </button>
        </div>
      )}

      {hasMissingSourceFile && (
        <div className="bg-warning/10 border-b border-warning/25 px-4 py-2 flex items-center gap-3 flex-shrink-0">
          <span className="min-w-0 flex-1 text-xs text-warning-foreground">
            {missingFileName} no longer exists on disk. Save to recreate it.
          </span>
          <button
            type="button"
            onClick={onSaveMissingSourceFile}
            disabled={isSavingSourceFile}
            className="text-xs font-medium text-primary hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}

      {showAgentTerminalDeliveryStatus && (
        <div className="border-b border-primary/20 bg-primary/5 px-4 py-2 text-xs text-muted-foreground flex-shrink-0">
          <span className="font-medium text-foreground">Sent to agent.</span> Keep this window open
          while it runs. Close Plannotator when you're done.
        </div>
      )}
    </>
  );
}
