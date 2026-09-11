import { ResizeHandle } from "@plannotator/ui/components/ResizeHandle";
import { SidebarContainer } from "@plannotator/ui/components/sidebar/SidebarContainer";
import { type FileEditStatus } from "@plannotator/ui/components/sidebar/FileBrowser";
import { type PickerMessage } from "@plannotator/ui/components/sidebar/MessagesBrowser";
import { SidebarTabs } from "@plannotator/ui/components/sidebar/SidebarTabs";
import type { Annotation, Block } from "@plannotator/ui/types";
import type { DirState, UseFileBrowserReturn } from "@plannotator/ui/hooks/useFileBrowser";
import type { SidebarTab } from "@plannotator/ui/hooks/useSidebar";
import type { CSSProperties, PointerEvent } from "react";

/** Read-only data for the editor navigation sidebar. */
export interface EditorLeftSidebarModel {
  readonly isWideMode: boolean;
  readonly isOpen: boolean;
  readonly activeTab: SidebarTab;
  readonly width: number;
  readonly isResizeDragging: boolean;
  readonly resizeHandleStyle: CSSProperties;
  readonly showFilesTab: boolean;
  readonly showMessagesTab: boolean;
  readonly showAgentTerminalControls: boolean;
  readonly isAgentTerminalOpen: boolean;
  readonly isAgentTerminalRunning: boolean;
  readonly hasMessageAnnotations: boolean;
  readonly hasFileAnnotations: boolean;
  readonly blocks: Block[];
  readonly annotations: Annotation[];
  readonly activeSection: string | null;
  readonly isLinkedDocumentActive: boolean;
  readonly linkedDocumentFilepath: string | null;
  readonly backLabel: string;
  readonly fileAnnotationCounts: Map<string, number>;
  readonly highlightedFiles: Set<string> | undefined;
  readonly fileEditStatuses: Map<string, FileEditStatus>;
  readonly fileBrowserDirectories: DirState[];
  readonly expandedFolders: Set<string>;
  readonly collapsedDirectories: Set<string>;
  readonly activeFile: string | null;
  readonly messages: PickerMessage[];
  readonly selectedMessageId: string | null;
  readonly messageAnnotationCounts: Map<string, number>;
}

/** User actions exposed by the editor navigation sidebar. */
export interface EditorLeftSidebarActions {
  readonly onToggleTab: (tab: SidebarTab) => void;
  readonly onClose: () => void;
  readonly onToggleAgentTerminal: () => void;
  readonly onResizePointerDown: (event: PointerEvent) => void;
  readonly onResizeDoubleClick: () => void;
  readonly onTocNavigate: (blockId: string) => void;
  readonly onLinkedDocumentBack: () => void;
  readonly onSelectFile: (absolutePath: string, dirPath: string) => void;
  readonly onFetchAllFiles: () => void;
  readonly onRetryVaultDirectory: (vaultPath: string) => void;
  readonly onToggleFolder: (key: string) => void;
  readonly onToggleDirectoryCollapse: (path: string) => void;
  readonly onFetchFileTree: (path: string, options?: { quiet?: boolean }) => void;
  readonly onClearVaultDirectories: () => void;
  readonly onSetActiveFile: (path: string | null) => void;
  readonly onSelectMessage: (messageId: string) => void;
}

/** Renders the collapsed and expanded navigation sidebar for an editor workspace. */
export function EditorLeftSidebarPane({
  model,
  actions,
}: {
  readonly model: EditorLeftSidebarModel;
  readonly actions: EditorLeftSidebarActions;
}) {
  if (model.isWideMode) return null;

  const fileBrowser: UseFileBrowserReturn = {
    dirs: model.fileBrowserDirectories,
    expandedFolders: model.expandedFolders,
    toggleFolder: actions.onToggleFolder,
    collapsedDirs: model.collapsedDirectories,
    toggleCollapse: actions.onToggleDirectoryCollapse,
    fetchTree: actions.onFetchFileTree,
    fetchAll: actions.onFetchAllFiles,
    addVaultDir: actions.onRetryVaultDirectory,
    clearVaultDirs: actions.onClearVaultDirectories,
    activeFile: model.activeFile,
    activeDirPath: null,
    setActiveFile: actions.onSetActiveFile,
  };

  return (
    <>
      {!model.isOpen && !model.isAgentTerminalOpen && (
        <SidebarTabs
          activeTab={model.activeTab}
          onToggleTab={actions.onToggleTab}
          showFilesTab={model.showFilesTab}
          showMessagesTab={model.showMessagesTab}
          showAgentTerminalTab={model.showAgentTerminalControls}
          isAgentTerminalOpen={model.isAgentTerminalOpen}
          isAgentTerminalRunning={model.isAgentTerminalRunning}
          onToggleAgentTerminal={actions.onToggleAgentTerminal}
          hasMessageAnnotations={model.hasMessageAnnotations}
          hasFileAnnotations={model.hasFileAnnotations}
          className="hidden lg:flex absolute left-0 top-0 z-20"
        />
      )}
      {model.isOpen && (
        <div className="contents group/sidebar">
          <SidebarContainer
            activeTab={model.activeTab}
            onTabChange={actions.onToggleTab}
            onClose={actions.onClose}
            width={`var(--toc-w, ${model.width}px)`}
            showAgentTerminalButton={model.showAgentTerminalControls}
            isAgentTerminalOpen={model.isAgentTerminalOpen}
            isAgentTerminalRunning={model.isAgentTerminalRunning}
            onToggleAgentTerminal={actions.onToggleAgentTerminal}
            blocks={model.blocks}
            annotations={model.annotations}
            activeSection={model.activeSection}
            onTocNavigate={actions.onTocNavigate}
            linkedDocFilepath={model.linkedDocumentFilepath}
            onLinkedDocBack={
              model.isLinkedDocumentActive ? actions.onLinkedDocumentBack : undefined
            }
            backLabel={model.backLabel}
            showFilesTab={model.showFilesTab}
            fileAnnotationCounts={model.fileAnnotationCounts}
            highlightedFiles={model.highlightedFiles}
            fileEditStatuses={model.fileEditStatuses}
            fileBrowser={fileBrowser}
            onFilesSelectFile={actions.onSelectFile}
            onFilesFetchAll={actions.onFetchAllFiles}
            onFilesRetryVaultDir={actions.onRetryVaultDirectory}
            hasFileAnnotations={model.hasFileAnnotations}
            showMessagesTab={model.showMessagesTab}
            messages={model.messages}
            selectedMessageId={model.selectedMessageId}
            onSelectMessage={actions.onSelectMessage}
            messageAnnotationCounts={model.messageAnnotationCounts}
          />
          <ResizeHandle
            isDragging={model.isResizeDragging}
            onPointerDown={actions.onResizePointerDown}
            onDoubleClick={actions.onResizeDoubleClick}
            style={model.resizeHandleStyle}
            className="hidden lg:block z-[55]"
            side="left"
            onCollapse={actions.onClose}
          />
        </div>
      )}
    </>
  );
}
