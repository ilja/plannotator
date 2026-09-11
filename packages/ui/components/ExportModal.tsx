/**
 * Export Modal with tabs for Share, Annotations, and Notes
 *
 * Share tab (default): Shows shareable URL with copy button
 * Annotations tab: Shows human-readable annotations output with copy/download
 * Notes tab: Save plan to Obsidian without approving
 */

import { Result } from "effect";
import React, { useState, useEffect } from "react";
import { getObsidianSettings, getEffectiveVaultPath } from "../utils/obsidian";
import { wrapFeedbackForAgent } from "../utils/parser";
import { decodeSaveNotesResponse } from "../utils/saveNotesResponse";
import { OverlayScrollArea } from "./OverlayScrollArea";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
  shareUrlSize: string;
  /** Short share URL from the paste service (empty string when unavailable) */
  shortShareUrl?: string;
  /** Whether the short URL is currently being generated */
  isGeneratingShortUrl?: boolean;
  /** Error from the last short URL generation attempt (empty string = no error) */
  shortUrlError?: string;
  /** Generate a short URL on demand (user clicks "Create short link") */
  onGenerateShortUrl?: () => void | Promise<void>;
  annotationsOutput: string;
  annotationCount: number;
  sharingEnabled?: boolean;
  markdown?: string;
  isApiMode?: boolean;
  initialTab?: Tab;
}

type Tab = "share" | "annotations" | "notes";

type CopyTarget = "short" | "full" | "annotations";

type SaveStatus = "idle" | "saving" | "success" | "error";

interface TabStripProps {
  activeTab: Tab;
  sharingEnabled: boolean;
  showNotesTab: boolean;
  onSelectShare: () => void;
  onSelectAnnotations: () => void;
  onSelectNotes: () => void;
}

const TabStrip: React.FC<TabStripProps> = ({
  activeTab,
  sharingEnabled,
  showNotesTab,
  onSelectShare,
  onSelectAnnotations,
  onSelectNotes,
}) => (
  <div className="flex gap-1 bg-muted rounded-lg p-1 mb-4">
    {sharingEnabled && (
      <button
        onClick={onSelectShare}
        className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
          activeTab === "share"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Share
      </button>
    )}
    <button
      onClick={onSelectAnnotations}
      className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
        activeTab === "annotations"
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      Annotations
    </button>
    {showNotesTab && (
      <button
        onClick={onSelectNotes}
        className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
          activeTab === "notes"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Notes
      </button>
    )}
  </div>
);

interface ShareBodyProps {
  shareUrl: string;
  shareUrlSize: string;
  shortShareUrl: string;
  isGeneratingShortUrl: boolean;
  shortUrlError: string;
  onGenerateShortUrl?: () => void | Promise<void>;
  copied: CopyTarget | false;
  onCopyShort: () => void;
  onCopyFull: () => void;
}

const ShareBody: React.FC<ShareBodyProps> = ({
  shareUrl,
  shareUrlSize,
  shortShareUrl,
  isGeneratingShortUrl,
  shortUrlError,
  onGenerateShortUrl,
  copied,
  onCopyShort,
  onCopyFull,
}) => {
  const urlIsLarge = shareUrl.length > 2048;
  const hashUnavailable = !shareUrl && !!onGenerateShortUrl;

  return (
    <div className="space-y-4">
      {shortShareUrl ? (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">Share Link</label>
          <div className="relative group">
            <input
              readOnly
              value={shortShareUrl}
              className="w-full bg-muted rounded-lg p-3 pr-20 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/50"
              onClick={(event) => event.currentTarget.select()}
            />
            <button
              onClick={onCopyShort}
              className="absolute top-1.5 right-2 px-2 py-1 rounded text-xs font-medium bg-background/80 hover:bg-background border border-border/50 transition-colors flex items-center gap-1"
            >
              {copied === "short" ? (
                <>
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Encrypted short link. Your plan is end-to-end encrypted before it leaves your browser —
            not even the server can read it.
          </p>
        </div>
      ) : isGeneratingShortUrl ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 bg-muted rounded-lg">
          <svg
            className="w-3 h-3 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4m-3.93 7.07l-2.83-2.83M7.76 7.76L4.93 4.93" />
          </svg>
          Generating short link...
        </div>
      ) : (urlIsLarge || hashUnavailable) && onGenerateShortUrl ? (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          {!hashUnavailable && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
              This URL may be too long for some messaging apps.
            </p>
          )}
          <button
            onClick={onGenerateShortUrl}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Create short link
          </button>
          {shortUrlError && <p className="text-[10px] text-amber-500 mt-1">({shortUrlError})</p>}
        </div>
      ) : null}

      {!hashUnavailable && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">
            {shortShareUrl ? "Full URL (backup)" : "Shareable URL"}
          </label>
          <div className="relative group">
            <textarea
              readOnly
              value={shareUrl}
              className="w-full h-24 bg-muted rounded-lg p-3 pr-20 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
              onClick={(event) => event.currentTarget.select()}
            />
            <button
              onClick={onCopyFull}
              className="absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium bg-background/80 hover:bg-background border border-border/50 transition-colors flex items-center gap-1"
            >
              {copied === "full" ? (
                <>
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy
                </>
              )}
            </button>
            <div className="absolute bottom-2 right-2 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {shareUrlSize}
            </div>
          </div>
          {!shortShareUrl && !isGeneratingShortUrl && !urlIsLarge && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Your plan is encoded entirely in the URL — it never touches a server.
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Only someone with this exact link can view your plan. Short links are end-to-end encrypted —
        the decryption key is in the URL and never sent to the server.
      </p>
    </div>
  );
};

interface NotesBodyProps {
  isObsidianReady: boolean;
  effectiveVaultPath: string;
  obsidianFolder: string;
  saveStatus: SaveStatus;
  saveError?: string;
  onSaveToNotes: () => void;
}

const NotesBody: React.FC<NotesBodyProps> = ({
  isObsidianReady,
  effectiveVaultPath,
  obsidianFolder,
  saveStatus,
  saveError,
  onSaveToNotes,
}) => (
  <div className="space-y-4">
    <p className="text-xs text-muted-foreground">
      Save this plan to your notes app without approving or denying.
    </p>

    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${isObsidianReady ? "bg-success" : "bg-muted-foreground/30"}`}
          />
          <span className="text-sm font-medium">Obsidian</span>
        </div>
        {isObsidianReady ? (
          <button
            onClick={onSaveToNotes}
            disabled={saveStatus === "saving"}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              saveStatus === "success"
                ? "bg-success/15 text-success"
                : saveStatus === "error"
                  ? "bg-destructive/15 text-destructive"
                  : saveStatus === "saving"
                    ? "bg-muted text-muted-foreground opacity-50"
                    : "bg-primary text-primary-foreground hover:opacity-90"
            }`}
          >
            {saveStatus === "saving"
              ? "Saving..."
              : saveStatus === "success"
                ? "Saved"
                : saveStatus === "error"
                  ? "Failed"
                  : "Save"}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">Not configured</span>
        )}
      </div>
      {isObsidianReady && (
        <div className="text-[10px] text-muted-foreground/70">
          {effectiveVaultPath}/{obsidianFolder}/
        </div>
      )}
      {!isObsidianReady && (
        <div className="text-[10px] text-muted-foreground/70">
          Enable in Settings &gt; Saving &gt; Obsidian
        </div>
      )}
      {saveError && <div className="text-[10px] text-destructive">{saveError}</div>}
    </div>
  </div>
);

interface FooterProps {
  copied: CopyTarget | false;
  onCopyAnnotations: () => void;
  onDownloadAnnotations: () => void;
}

const Footer: React.FC<FooterProps> = ({ copied, onCopyAnnotations, onDownloadAnnotations }) => (
  <div className="p-4 border-t border-border flex justify-end gap-2">
    <button
      onClick={onCopyAnnotations}
      className="px-3 py-1.5 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 transition-colors"
    >
      {copied === "annotations" ? "Copied!" : "Copy"}
    </button>
    <button
      onClick={onDownloadAnnotations}
      className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
    >
      Download Annotations
    </button>
  </div>
);

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  shareUrl,
  shareUrlSize,
  shortShareUrl = "",
  isGeneratingShortUrl = false,
  shortUrlError = "",
  onGenerateShortUrl,
  annotationsOutput,
  annotationCount,
  sharingEnabled = true,
  markdown,
  isApiMode = false,
  initialTab,
}) => {
  const defaultTab = initialTab || (sharingEnabled ? "share" : "annotations");
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [copied, setCopied] = useState<CopyTarget | false>(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || (sharingEnabled ? "share" : "annotations"));
    }
  }, [isOpen, initialTab, sharingEnabled]);

  useEffect(() => {
    if (isOpen) {
      setSaveStatus("idle");
      setSaveErrors({});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const showNotesTab = isApiMode && !!markdown;
  const obsidianSettings = getObsidianSettings();
  const effectiveVaultPath = getEffectiveVaultPath(obsidianSettings);
  const isObsidianReady = obsidianSettings.enabled && effectiveVaultPath.trim().length > 0;

  const handleCopy = async (text: string, which: CopyTarget) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleSelectShareTab = () => setActiveTab("share");
  const handleSelectAnnotationsTab = () => setActiveTab("annotations");
  const handleSelectNotesTab = () => setActiveTab("notes");
  const handleCopyShort = () => handleCopy(shortShareUrl, "short");
  const handleCopyFull = () => handleCopy(shareUrl, "full");

  const handleCopyAnnotations = () =>
    handleCopy(wrapFeedbackForAgent(annotationsOutput), "annotations");

  const handleDownloadAnnotations = () => {
    const blob = new Blob([annotationsOutput], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "annotations.md";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveToNotes = async () => {
    if (!markdown) return;

    setSaveStatus("saving");
    setSaveErrors((previousErrors) => {
      const nextErrors = { ...previousErrors };
      delete nextErrors.obsidian;

      return nextErrors;
    });

    interface ExportBody {
      obsidian?: object;
    }

    const body: ExportBody = {
      obsidian: {
        vaultPath: effectiveVaultPath,
        folder: obsidianSettings.folder || "plannotator",
        plan: markdown,
        ...(obsidianSettings.filenameFormat && { filenameFormat: obsidianSettings.filenameFormat }),
        ...(obsidianSettings.filenameSeparator &&
          obsidianSettings.filenameSeparator !== "space" && {
            filenameSeparator: obsidianSettings.filenameSeparator,
          }),
      },
    };

    try {
      const response = await fetch("/api/save-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: unknown = await response.json();
      const decoded = decodeSaveNotesResponse(data);
      const result = Result.isSuccess(decoded) ? decoded.success.obsidian : undefined;

      if (result?.success) {
        setSaveStatus("success");
      } else {
        setSaveStatus("error");
        setSaveErrors((previousErrors) => ({
          ...previousErrors,
          obsidian: result?.error || "Save failed",
        }));
      }
    } catch {
      setSaveStatus("error");
      setSaveErrors((previousErrors) => ({ ...previousErrors, obsidian: "Save failed" }));
    }
  };

  const showTabs = sharingEnabled || showNotesTab;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div
        className="bg-card border border-border rounded-xl w-full max-w-2xl flex flex-col max-h-[80vh] shadow-2xl relative"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-4 border-b border-border">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-sm">Export</h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {annotationCount} annotation{annotationCount !== 1 ? "s" : ""}
              </span>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <OverlayScrollArea className="flex-1 min-h-0">
          <div className="p-4">
            {showTabs && (
              <TabStrip
                activeTab={activeTab}
                sharingEnabled={sharingEnabled}
                showNotesTab={showNotesTab}
                onSelectShare={handleSelectShareTab}
                onSelectAnnotations={handleSelectAnnotationsTab}
                onSelectNotes={handleSelectNotesTab}
              />
            )}

            {activeTab === "share" && sharingEnabled ? (
              <ShareBody
                shareUrl={shareUrl}
                shareUrlSize={shareUrlSize}
                shortShareUrl={shortShareUrl}
                isGeneratingShortUrl={isGeneratingShortUrl}
                shortUrlError={shortUrlError}
                onGenerateShortUrl={onGenerateShortUrl}
                copied={copied}
                onCopyShort={handleCopyShort}
                onCopyFull={handleCopyFull}
              />
            ) : activeTab === "notes" && showNotesTab ? (
              <NotesBody
                isObsidianReady={isObsidianReady}
                effectiveVaultPath={effectiveVaultPath}
                obsidianFolder={obsidianSettings.folder || "plannotator"}
                saveStatus={saveStatus}
                saveError={saveErrors.obsidian}
                onSaveToNotes={handleSaveToNotes}
              />
            ) : (
              <pre className="bg-muted rounded-lg p-4 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">
                {annotationsOutput}
              </pre>
            )}
          </div>
        </OverlayScrollArea>

        {activeTab === "annotations" && (
          <Footer
            copied={copied}
            onCopyAnnotations={handleCopyAnnotations}
            onDownloadAnnotations={handleDownloadAnnotations}
          />
        )}
      </div>
    </div>
  );
};
