import type { CSSProperties } from "react";
import { Toaster } from "sonner";
import { ThemeProvider } from "@plannotator/ui/components/ThemeProvider";
import { TooltipProvider } from "@plannotator/ui/components/Tooltip";
import { AppHeader, type AppHeaderActions, type AppHeaderDisplayModel } from "./AppHeader";
import { WorkspaceBanners } from "./WorkspaceBanners";
import {
  EditorWorkspace,
  type EditorWorkspaceActions,
  type EditorWorkspaceModel,
} from "./EditorWorkspace";
import { EditorDialogs, type EditorDialogsActions, type EditorDialogsModel } from "./EditorDialogs";
import {
  EditorOverlays,
  type EditorOverlaysActions,
  type EditorOverlaysModel,
} from "./EditorOverlays";

/** Read-only display state for workspace banners. */
export interface EditorAppScreenBannersModel {
  readonly linkedDocumentError: string | null;
  readonly hasDiskConflict: boolean;
  readonly conflictedFileName: string;
  readonly hasMissingSourceFile: boolean;
  readonly missingFileName: string;
  readonly isEditingMarkdown: boolean;
  readonly canOverwriteDiskConflict: boolean;
  readonly isSavingSourceFile: boolean;
  readonly showAgentTerminalDeliveryStatus: boolean;
}

/** Banner interactions retained by App. */
export interface EditorAppScreenBannersActions {
  readonly onDismissLinkedDocumentError: () => void;
  readonly onOverwriteDiskConflict: () => void;
  readonly onReloadDiskConflict: () => void;
  readonly onSaveMissingSourceFile: () => void;
}

/** Read-only display models required to render the editor screen. */
export interface EditorAppScreenModel {
  readonly isLoading: boolean;
  readonly isSharedSession: boolean;
  readonly header: AppHeaderDisplayModel;
  readonly banners: EditorAppScreenBannersModel;
  readonly workspace: EditorWorkspaceModel;
  readonly dialogs: EditorDialogsModel;
  readonly overlays: EditorOverlaysModel;
  readonly toastStyle: CSSProperties;
}

/** Screen interactions retained by App, which owns state and side effects. */
export interface EditorAppScreenActions {
  readonly header: AppHeaderActions;
  readonly banners: EditorAppScreenBannersActions;
  readonly workspace: EditorWorkspaceActions;
  readonly dialogs: EditorDialogsActions;
  readonly overlays: EditorOverlaysActions;
}

/** Composes the provider, header, workspace, dialogs, overlays, and notifications. */
export function EditorAppScreen({
  model,
  actions,
}: {
  readonly model: EditorAppScreenModel;
  readonly actions: EditorAppScreenActions;
}) {
  if (model.isLoading && !model.isSharedSession) {
    return (
      <ThemeProvider defaultTheme="dark">
        <div className="h-screen bg-background" />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider delayDuration={900} skipDelayDuration={200} disableHoverableContent>
        <div
          data-print-region="root"
          className="h-screen flex flex-col bg-background overflow-hidden"
        >
          <AppHeader {...model.header} {...actions.header} />
          <WorkspaceBanners {...model.banners} {...actions.banners} />
          <EditorWorkspace model={model.workspace} actions={actions.workspace} />
          <EditorDialogs model={model.dialogs} actions={actions.dialogs} />
          <Toaster position="top-right" offset={64} toastOptions={{ style: model.toastStyle }} />
          <EditorOverlays model={model.overlays} actions={actions.overlays} />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}
