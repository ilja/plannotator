import React from 'react';
import type { Origin } from '@plannotator/shared/agents';
import { FeedbackButton, ApproveButton, ExitButton } from '@plannotator/ui/components/ToolbarButtons';
import { Settings } from '@plannotator/ui/components/Settings';
import { PlanHeaderMenu } from '@plannotator/ui/components/PlanHeaderMenu';
import type { CallbackConfig } from '@plannotator/ui/utils/callback';
import type { UIPreferences } from '@plannotator/ui/utils/uiPreferences';
import { SparklesIcon } from '@plannotator/ui/components/SparklesIcon';

interface AppHeaderProps {
  /** HTML annotate surface: show a Hide/Show annotation-tools toggle in the header,
   *  so hiding leaves the rendered HTML completely free of overlay controls. */
  htmlSurface?: boolean;
  htmlToolsHidden?: boolean;
  onToggleHtmlTools?: () => void;
  // Mode flags (stable after mount)
  isApiMode: boolean;
  annotateMode: boolean;
  gate: boolean;
  isSharedSession: boolean;
  origin: Origin | null;

  // Dynamic state
  isSubmitting: boolean;
  isExiting: boolean;
  isPanelOpen: boolean;
  aiAvailable: boolean;
  isAIChatOpen: boolean;
  aiHasMessages: boolean;
  hasAnyAnnotations: boolean;
  linkedDocIsActive: boolean;
  callbackShareUrlReady: boolean;
  canShareCurrentSession: boolean;

  // Callback config (null when no bot callback)
  callbackConfig: CallbackConfig | null;

  // Settings props
  mobileSettingsOpen: boolean;
  gitUser: string | undefined;

  // Handlers — App owns all decision logic, header just calls these
  onCallbackFeedback: () => void;
  onCallbackApprove: () => void;
  onAnnotateExit: () => void;
  onAnnotateFeedback: () => void;
  onAnnotateApprove: () => void;
  onAnnotationPanelToggle: () => void;
  onAIChatToggle: () => void;
  onIdentityChange: (oldId: string, newId: string) => void;
  onUIPreferencesChange: (prefs: UIPreferences) => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onOpenExport: () => void;
  onCopyAgentInstructions: () => void;
  onDownloadAnnotations: () => void;
  onPrint: () => void;
  onCopyShareLink: () => void;
  onOpenImport: () => void;
  onSaveToObsidian: () => void;
  onSaveToBear: () => void;
  onSaveToOctarine: () => void;

  // PlanHeaderMenu config
  appVersion: string;
  agentInstructionsEnabled: boolean;
  obsidianConfigured: boolean;
  bearConfigured: boolean;
  octarineConfigured: boolean;
}

export const AppHeader = React.memo<AppHeaderProps>(({
  htmlSurface,
  htmlToolsHidden,
  onToggleHtmlTools,
  isApiMode,
  annotateMode,
  gate,
  isSharedSession,
  origin,
  isSubmitting,
  isExiting,
  isPanelOpen,
  aiAvailable,
  isAIChatOpen,
  aiHasMessages,
  hasAnyAnnotations,
  linkedDocIsActive,
  callbackShareUrlReady,
  canShareCurrentSession,
  callbackConfig,
  mobileSettingsOpen,
  gitUser,
  onCallbackFeedback,
  onCallbackApprove,
  onAnnotateExit,
  onAnnotateFeedback,
  onAnnotateApprove,
  onAnnotationPanelToggle,
  onAIChatToggle,
  onIdentityChange,
  onUIPreferencesChange,
  onOpenSettings,
  onCloseSettings,
  onOpenExport,
  onCopyAgentInstructions,
  onDownloadAnnotations,
  onPrint,
  onCopyShareLink,
  onOpenImport,
  onSaveToObsidian,
  onSaveToBear,
  onSaveToOctarine,
  appVersion,
  agentInstructionsEnabled,
  obsidianConfigured,
  bearConfigured,
  octarineConfigured,
}) => {
  return (
    <header data-app-header="true" className="h-12 flex items-center justify-between px-2 md:px-4 border-b border-border/50 bg-card/50 backdrop-blur-xl sticky top-0 z-[50]">
      <div className="flex items-center gap-2">
        <AppHeaderLogo />
        {htmlSurface && onToggleHtmlTools && (
          <button
            type="button"
            onClick={onToggleHtmlTools}
            className="ml-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded cursor-pointer"
            title={htmlToolsHidden ? 'Show annotation tools' : 'Hide annotation tools'}
          >
            {htmlToolsHidden ? 'Show tools' : 'Hide tools'}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 md:gap-2">
        {/* Bot callback buttons — only shown when ?cb=&ct= params are present */}
        {callbackConfig && !isApiMode && isSharedSession && (
          <>
            <div className="w-px h-5 bg-border/50 mx-1 hidden md:block" />
            <FeedbackButton
              onClick={onCallbackFeedback}
              disabled={isSubmitting || !callbackShareUrlReady}
              isLoading={isSubmitting}
              title="Send feedback to bot"
            />
            <ApproveButton
              onClick={onCallbackApprove}
              disabled={isSubmitting || !callbackShareUrlReady}
              isLoading={isSubmitting}
              title="Approve design and notify bot"
            />
          </>
        )}

        {isApiMode && (!linkedDocIsActive || annotateMode) && (
          <>
            {annotateMode && (
              <>
                <ExitButton
                  onClick={onAnnotateExit}
                  disabled={isSubmitting || isExiting}
                  isLoading={isExiting}
                />
                {hasAnyAnnotations && (
                  <FeedbackButton
                    onClick={onAnnotateFeedback}
                    disabled={isSubmitting || isExiting}
                    isLoading={isSubmitting}
                    label="Send Feedback"
                    title="Send Feedback"
                  />
                )}
                {gate && (
                  <ApproveButton
                    onClick={onAnnotateApprove}
                    disabled={isSubmitting || isExiting}
                    isLoading={isSubmitting}
                    title="Approve — no changes requested"
                  />
                )}
              </>
            )}
            <div className="w-px h-5 bg-border/50 mx-1 hidden md:block" />
          </>
        )}

        {/* Annotations panel toggle */}
        <button
          onClick={onAnnotationPanelToggle}
          className={`p-1.5 rounded-md text-xs font-medium transition-all ${
            isPanelOpen
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          title={isPanelOpen ? 'Hide annotations' : 'Show annotations'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        </button>
        {aiAvailable && (
          <button
            onClick={onAIChatToggle}
            className={`relative p-1.5 rounded-md text-xs font-medium transition-all ${
              isAIChatOpen
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            title={isAIChatOpen ? 'Hide AI chat' : 'Show AI chat'}
            aria-label={isAIChatOpen ? 'Hide AI chat' : 'Show AI chat'}
          >
            <SparklesIcon className="w-4 h-4" />
            {aiHasMessages && !isAIChatOpen && (
              <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </button>
        )}

        {/* Settings dialog (controlled, button hidden — opened from PlanHeaderMenu) */}
        <div className="hidden">
          <Settings
            onIdentityChange={onIdentityChange}
            origin={origin}
            onUIPreferencesChange={onUIPreferencesChange}
            externalOpen={mobileSettingsOpen}
            onExternalClose={onCloseSettings}
            gitUser={gitUser}
          />
        </div>

        <PlanHeaderMenu
          appVersion={appVersion}
          onOpenSettings={onOpenSettings}
          onOpenExport={onOpenExport}
          onCopyAgentInstructions={onCopyAgentInstructions}
          onDownloadAnnotations={onDownloadAnnotations}
          onPrint={onPrint}
          onCopyShareLink={onCopyShareLink}
          onOpenImport={onOpenImport}
          onSaveToObsidian={onSaveToObsidian}
          onSaveToBear={onSaveToBear}
          onSaveToOctarine={onSaveToOctarine}
          sharingEnabled={canShareCurrentSession}
          isApiMode={isApiMode}
          agentInstructionsEnabled={agentInstructionsEnabled}
          obsidianConfigured={obsidianConfigured}
          bearConfigured={bearConfigured}
          octarineConfigured={octarineConfigured}
        />
      </div>
    </header>
  );
});

const AppHeaderLogo = () => (
  <div className="flex items-center gap-2 md:gap-3">
    <a
      href="https://plannotator.ai"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 md:gap-2 hover:opacity-80 transition-opacity"
    >
      <span className="text-sm font-semibold tracking-tight">Plannotator</span>
    </a>
  </div>
);
