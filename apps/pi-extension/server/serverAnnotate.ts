import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, resolve as resolvePath } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { contentHash, deleteDraft } from "../generated/draft.js";
import {
  ConfigPatch,
  saveConfig,
  detectGitUser,
  getServerConfig,
  loadConfig,
  resolveSharingEnabled,
} from "../generated/config.js";
import { disabledSourceSave } from "../generated/source-save.js";
import { getAnnotateReferenceRootPaths } from "../generated/annotate-reference-roots-node.js";
import {
  createSourceSaveCapability,
  createSourceSaveCapabilityFromText,
  readSourceFileSnapshot,
  resolveFolderSourceFile,
  resolveFolderSourceFileForSave,
  saveSourceFileAtomic,
} from "../generated/source-save-node.js";

import { Option, Schema } from "effect";
import {
  handleDraftRequest,
  handleFavicon,
  handleImageRequest,
  readDraftGenerationFromUrl,
  handleSaveNotesRequest,
  handleUploadRequest,
} from "./handlers.js";
import { html, json, parseBody, requestUrl } from "./helpers.js";
import { decodeFeedbackRequest, OpenInRequestSchema } from "./request-schemas.js";
import { createPiAIRuntime, handlePiAIRequest } from "./ai-runtime.js";

import { isRemoteSession, listenOnPort } from "./network.js";
import { getAvailableOpenInApps, openFileInApp } from "./open-in-apps.js";

import { getRepoInfo } from "./project.js";
import {
  handleDocRequest,
  handleDocExistsRequest,
  handleFileBrowserRequest,
  handleObsidianVaultsRequest,
  handleObsidianFilesRequest,
  handleObsidianDocRequest,
} from "./reference.js";
import { handleFileBrowserStreamRequest } from "./file-browser-watch.js";
import { resolveUserPath, warmFileListCache } from "../generated/resolve-file.js";
import { createExternalAnnotationHandler } from "./external-annotations.js";
import { createNodeAgentTerminalBridge } from "./agent-terminal.js";
import {
  HTML_ASSET_ROUTE_PREFIX,
  encodeHtmlAssetPath,
  htmlAssetContentType,
  normalizeHtmlAssetRoutePath,
  rewriteHtmlAssetReferences,
} from "../generated/html-assets.js";
import {
  inlineHtmlLocalAssets,
  isWithinDirectory,
  MAX_HTML_ASSET_BYTES,
  resolveOpenInTarget,
} from "../generated/html-assets-node.js";
import {
  supportsAnnotateAgentTerminalMode,
  type AgentTerminalCapability,
} from "../generated/agent-terminal.js";

export interface AnnotateServerResult {
  port: number;
  portSource: "env" | "remote-default" | "random";
  url: string;
  waitForDecision: () => Promise<AnnotateDecision>;
  stop: () => void;
}

interface AnnotateServerOptions {
  markdown: string;
  filePath: string;
  htmlContent: string;
  origin?: string;
  mode?: string;
  folderPath?: string;
  recentMessages?: { messageId: string; text: string; timestamp?: string }[];
  sharingEnabled?: boolean;
  shareBaseUrl?: string;
  pasteApiUrl?: string;
  sourceInfo?: string;
  sourceConverted?: boolean;
  gate?: boolean;
  rawHtml?: string;
  renderHtml?: boolean;
  convertHtml?: boolean;
  agentCwd?: string;
}

interface AnnotateDecision {
  feedback: string;
  annotations: readonly unknown[];
  exit?: boolean;
  approved?: boolean;
  selectedMessageId?: string;
  feedbackScope?: "message" | "messages";
}

interface AnnotateDecisionState {
  promise: Promise<AnnotateDecision>;
  resolve: (result: AnnotateDecision) => void;
}

interface HtmlAssetRegistry {
  rewriteHtml: (htmlContent: string, htmlFilePath: string) => string;
  inlineHtml: (htmlContent: string, htmlFilePath: string) => string;
  handle: (res: ServerResponse, url: URL) => boolean;
}

interface SourceSaveState {
  getPrimarySource: () => {
    plan: string;
    sourceSave:
      | ReturnType<typeof disabledSourceSave>
      | ReturnType<typeof createSourceSaveCapability>;
  };
  getReferenceRootPaths: () => string[];
  initialSingleFileSourcePath: string | null;
  openedSourceFilePaths: Set<string>;
  singleFileSourceSaveEligible: boolean;
}

type AnnotateRouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) => Promise<boolean> | boolean;

const SourceSaveRequestSchema = Schema.Struct({
  path: Schema.optionalKey(Schema.String),
  text: Schema.String,
  baseHash: Schema.String,
  baseMtimeMs: Schema.optionalKey(Schema.Number),
  baseEol: Schema.optionalKey(Schema.Literals(["lf", "crlf", "mixed", "none"])),
  allowMissingBase: Schema.optionalKey(Schema.Boolean),
});

type SourceSaveRequest = Schema.Schema.Type<typeof SourceSaveRequestSchema>;

function createDecisionState(): AnnotateDecisionState {
  let resolvePromise: (result: AnnotateDecision) => void = () => undefined;

  const promise = new Promise<AnnotateDecision>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (result) => resolvePromise(result),
  };
}

function createHtmlAssetRegistry(): HtmlAssetRegistry {
  const rootsByToken = new Map<string, string>();
  const tokensByRoot = new Map<string, string>();

  function register(baseDir: string): string {
    const root = resolvePath(baseDir);
    const existing = tokensByRoot.get(root);

    if (existing) return existing;
    const token = randomUUID().replace(/-/g, "").slice(0, 16);
    tokensByRoot.set(root, token);
    rootsByToken.set(token, root);

    return token;
  }

  function rewriteHtml(htmlContent: string, htmlFilePath: string): string {
    if (/^https?:\/\//i.test(htmlFilePath)) return htmlContent;

    try {
      const token = register(dirname(resolvePath(htmlFilePath)));

      return rewriteHtmlAssetReferences(
        htmlContent,
        (assetPath) => `${HTML_ASSET_ROUTE_PREFIX}/${token}/${encodeHtmlAssetPath(assetPath)}`,
      );
    } catch {
      return htmlContent;
    }
  }

  function inlineHtml(htmlContent: string, htmlFilePath: string): string {
    return inlineHtmlLocalAssets(htmlContent, htmlFilePath);
  }

  function handle(res: ServerResponse, url: URL): boolean {
    const prefix = `${HTML_ASSET_ROUTE_PREFIX}/`;

    if (!url.pathname.startsWith(prefix)) return false;

    const rest = url.pathname.slice(prefix.length);
    const slash = rest.indexOf("/");

    if (slash <= 0) {
      json(res, { error: "Missing asset token or path" }, 404);

      return true;
    }

    const token = rest.slice(0, slash);
    const root = rootsByToken.get(token);

    if (!root) {
      json(res, { error: "Unknown asset root" }, 404);

      return true;
    }

    const assetPath = normalizeHtmlAssetRoutePath(rest.slice(slash + 1));

    if (!assetPath) {
      json(res, { error: "Invalid asset path" }, 400);

      return true;
    }

    const contentType = htmlAssetContentType(assetPath);

    if (!contentType) {
      json(res, { error: "Unsupported asset type" }, 415);

      return true;
    }

    const resolved = resolvePath(root, assetPath);

    if (!isWithinDirectory(resolved, root)) {
      json(res, { error: "Access denied" }, 403);

      return true;
    }

    try {
      if (!existsSync(resolved)) {
        json(res, { error: "Asset not found" }, 404);

        return true;
      }

      const stat = statSync(resolved);

      if (stat.size > MAX_HTML_ASSET_BYTES) {
        json(res, { error: "Asset too large" }, 413);

        return true;
      }

      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(readFileSync(resolved));
    } catch {
      json(res, { error: "Failed to read asset" }, 500);
    }

    return true;
  }

  return { rewriteHtml, inlineHtml, handle };
}

function createDraftKey(options: AnnotateServerOptions): string {
  const draftSource =
    options.mode === "annotate-folder" && options.folderPath
      ? `folder:${resolvePath(options.folderPath)}`
      : options.renderHtml && options.rawHtml
        ? options.rawHtml
        : options.markdown;

  return contentHash(draftSource);
}

function createSourceSaveState(options: AnnotateServerOptions): SourceSaveState {
  const sourceMode = options.mode || "annotate";

  const singleFileSourceSaveEligible =
    sourceMode === "annotate" &&
    !options.sourceConverted &&
    !(options.renderHtml && options.rawHtml) &&
    !/^https?:\/\//i.test(options.filePath);

  const initialSingleFileSourceSave = singleFileSourceSaveEligible
    ? createSourceSaveCapability("single-file", options.filePath)
    : null;

  const initialSingleFileSourcePath = singleFileSourceSaveEligible
    ? initialSingleFileSourceSave?.enabled
      ? initialSingleFileSourceSave.path
      : resolveUserPath(options.filePath)
    : null;

  const openedSourceFilePaths = new Set<string>();

  if (initialSingleFileSourcePath) openedSourceFilePaths.add(initialSingleFileSourcePath);

  function getPrimarySource() {
    const mode = options.mode || "annotate";

    if (mode === "annotate-last") {
      return { plan: options.markdown, sourceSave: disabledSourceSave("message-mode") };
    }

    if (mode === "annotate-folder") {
      return { plan: options.markdown, sourceSave: disabledSourceSave("folder-mode") };
    }

    if (options.renderHtml && options.rawHtml) {
      return { plan: options.markdown, sourceSave: disabledSourceSave("html-render") };
    }

    if (options.sourceConverted) {
      return { plan: options.markdown, sourceSave: disabledSourceSave("converted-source") };
    }

    if (/^https?:\/\//i.test(options.filePath)) {
      return { plan: options.markdown, sourceSave: disabledSourceSave("not-local-file") };
    }

    const sourceSave = createSourceSaveCapability(
      "single-file",
      initialSingleFileSourcePath ?? options.filePath,
    );

    if (!sourceSave.enabled) {
      if (sourceSave.reason === "missing-file" && initialSingleFileSourcePath) {
        const missingSourceSave = createSourceSaveCapabilityFromText(
          "single-file",
          initialSingleFileSourcePath,
          options.markdown,
        );

        if (missingSourceSave.enabled) {
          return { plan: options.markdown, sourceSave: missingSourceSave };
        }
      }

      return { plan: options.markdown, sourceSave };
    }

    try {
      const snapshot = readSourceFileSnapshot(sourceSave.path);

      return {
        plan: snapshot.text,
        sourceSave: {
          ...sourceSave,
          hash: snapshot.hash,
          mtimeMs: snapshot.mtimeMs,
          size: snapshot.size,
          eol: snapshot.eol,
        },
      };
    } catch {
      return { plan: options.markdown, sourceSave: disabledSourceSave("unreadable-file") };
    }
  }

  return {
    getPrimarySource,
    getReferenceRootPaths: () =>
      getAnnotateReferenceRootPaths({
        mode: options.mode || "annotate",
        filePath: options.filePath,
        folderPath: options.folderPath,
        initialSingleFileSourcePath,
      }),
    initialSingleFileSourcePath,
    openedSourceFilePaths,
    singleFileSourceSaveEligible,
  };
}

function resolveSourceSaveTarget(
  options: AnnotateServerOptions,
  sourceSaveState: SourceSaveState,
  body: SourceSaveRequest,
): string | null {
  if (sourceSaveState.singleFileSourceSaveEligible) {
    const capability = createSourceSaveCapability(
      "single-file",
      sourceSaveState.initialSingleFileSourcePath ?? options.filePath,
    );

    return capability.enabled ? capability.path : sourceSaveState.initialSingleFileSourcePath;
  }

  if (options.mode !== "annotate-folder" || !options.folderPath || body.path === undefined) {
    return null;
  }

  const targetPath = body.allowMissingBase
    ? resolveFolderSourceFileForSave(body.path, options.folderPath)
    : resolveFolderSourceFile(body.path, options.folderPath);

  if (
    body.allowMissingBase &&
    targetPath &&
    !existsSync(targetPath) &&
    !sourceSaveState.openedSourceFilePaths.has(targetPath)
  ) {
    return null;
  }

  return targetPath;
}

function sourceSaveStatus(result: ReturnType<typeof saveSourceFileAtomic>): number {
  if (result.ok) return 200;

  if (result.code === "conflict") return 409;

  if (result.code === "invalid-request") return 400;

  if (result.code === "not-writable") return 403;

  return 500;
}

function isAllowedHtmlSharePath(options: AnnotateServerOptions, targetPath: string): boolean {
  const roots = new Set<string>([process.cwd()]);

  if (options.folderPath) roots.add(options.folderPath);

  if (!/^https?:\/\//i.test(options.filePath)) roots.add(dirname(options.filePath));

  for (const root of roots) {
    if (isWithinDirectory(targetPath, root)) return true;
  }

  return false;
}

function handleShareHtml(
  options: AnnotateServerOptions,
  htmlAssets: HtmlAssetRegistry,
  res: ServerResponse,
  url: URL,
): void {
  if (/^https?:\/\//i.test(options.filePath)) {
    json(res, { error: "Raw HTML sharing is unavailable for URL annotations" }, 400);

    return;
  }

  const sourcePath = resolvePath(options.filePath);
  const requestedPathParameter = url.searchParams.get("path");
  const requestedPath = requestedPathParameter ? resolvePath(requestedPathParameter) : sourcePath;

  if (!/\.html?$/i.test(requestedPath)) {
    json(res, { error: "Share HTML is only available for HTML documents" }, 400);

    return;
  }

  if (!isAllowedHtmlSharePath(options, requestedPath)) {
    json(res, { error: "Access denied" }, 403);

    return;
  }

  try {
    const htmlContent =
      options.renderHtml && options.rawHtml && requestedPath === sourcePath
        ? options.rawHtml
        : readFileSync(requestedPath, "utf-8");

    json(res, { shareHtml: htmlAssets.inlineHtml(htmlContent, requestedPath) });
  } catch {
    json(res, { error: "Failed to prepare share HTML" }, 500);
  }
}

function createAnnotateRouteHandlers(
  options: AnnotateServerOptions,
  draftKey: string,
  gitUser: ReturnType<typeof detectGitUser>,
  sharingEnabled: boolean,
  shareBaseUrl: string | undefined,
  pasteApiUrl: string | undefined,
  repoInfo: ReturnType<typeof getRepoInfo>,
  externalAnnotations: ReturnType<typeof createExternalAnnotationHandler>,
  aiRuntime: Awaited<ReturnType<typeof createPiAIRuntime>>,
  htmlAssets: HtmlAssetRegistry,
  sourceSaveState: SourceSaveState,
  resolveDecision: (result: AnnotateDecision) => void,
  getAgentTerminalCapability: () => AgentTerminalCapability,
): readonly AnnotateRouteHandler[] {
  return [
    async (req, res, url) => externalAnnotations.handle(req, res, url),
    async (req, res, url) =>
      url.pathname.startsWith("/api/ai/") && (await handlePiAIRequest(req, res, url, aiRuntime)),
    (_req, res, url) => {
      if (url.pathname !== "/api/plan" || _req.method !== "GET") return false;

      const displayRawHtml =
        options.renderHtml && options.rawHtml
          ? htmlAssets.rewriteHtml(options.rawHtml, options.filePath)
          : undefined;

      const primarySource = sourceSaveState.getPrimarySource();

      const planResponse = {
        plan: primarySource.plan,
        origin: options.origin ?? "pi",
        mode: options.mode || "annotate",
        filePath: options.filePath,
        sourceInfo: options.sourceInfo,
        sourceConverted: options.sourceConverted ?? false,
        sourceSave: primarySource.sourceSave,
        gate: options.gate ?? false,
        renderAs: displayRawHtml ? "html" : "markdown",
        convertHtml: options.convertHtml ?? false,
        sharingEnabled,
        shareBaseUrl,
        pasteApiUrl,
        repoInfo,
        projectRoot: options.folderPath || process.cwd(),
        serverConfig: getServerConfig(gitUser),
        agentTerminal: getAgentTerminalCapability(),
      };

      if (displayRawHtml) Object.assign(planResponse, { rawHtml: displayRawHtml });

      if (options.recentMessages)
        Object.assign(planResponse, { recentMessages: options.recentMessages });
      json(res, planResponse);

      return true;
    },
    (_req, res, url) => {
      if (url.pathname !== "/api/share-html" || _req.method !== "GET") return false;
      handleShareHtml(options, htmlAssets, res, url);

      return true;
    },
    async (req, res, url) => {
      if (url.pathname !== "/api/config" || req.method !== "POST") return false;

      try {
        const parsedBody = await parseBody(req);

        if (!parsedBody.ok) {
          json(res, { error: "Malformed JSON body" }, 400);

          return true;
        }

        const body = Schema.decodeUnknownSync(ConfigPatch)(parsedBody.value);

        if (Object.keys(body).length > 0) saveConfig(body);
        json(res, { ok: true });
      } catch {
        json(res, { error: "Invalid request" }, 400);
      }

      return true;
    },
    (_req, res, url) => {
      if (url.pathname === "/api/image") {
        handleImageRequest(res, url);

        return true;
      }

      return false;
    },
    (_req, res, url) => htmlAssets.handle(res, url),
    async (req, res, url) => {
      if (url.pathname !== "/api/upload" || req.method !== "POST") return false;
      await handleUploadRequest(req, res);

      return true;
    },
    (_req, res, url) => {
      if (url.pathname !== "/api/open-in/apps" || _req.method !== "GET") return false;
      const urlSource = /^https?:\/\//i.test(options.filePath);

      if (isRemoteSession() || urlSource) {
        json(res, { available: false, apps: [] });

        return true;
      }

      json(res, { available: true, apps: getAvailableOpenInApps() });

      return true;
    },
    async (req, res, url) => {
      if (url.pathname !== "/api/open-in" || req.method !== "POST") return false;

      if (isRemoteSession() || /^https?:\/\//i.test(options.filePath)) {
        json(res, { ok: false, error: "Open in app is unavailable for this source" }, 400);

        return true;
      }

      try {
        const parsedBody = await parseBody(req);

        if (!parsedBody.ok) {
          json(res, { error: "Malformed JSON body" }, 400);

          return true;
        }

        const body = Option.getOrUndefined(
          Schema.decodeUnknownOption(OpenInRequestSchema)(parsedBody.value),
        );

        if (!body) {
          json(res, { ok: false, error: "Missing filePath" }, 400);

          return true;
        }

        const abs = resolveOpenInTarget(body.filePath, null, sourceSaveState.getReferenceRootPaths);

        if (abs == null) {
          json(res, { ok: false, error: "Path is outside the allowed directory" }, 403);

          return true;
        }

        const result = await openFileInApp(abs, body.appId);
        json(res, result, 200);
      } catch (err) {
        json(
          res,
          { ok: false, error: err instanceof Error ? err.message : "Failed to open file" },
          500,
        );
      }

      return true;
    },
    async (req, res, url) => {
      if (url.pathname !== "/api/draft") return false;
      await handleDraftRequest(req, res, draftKey);

      return true;
    },
    async (req, res, url) => {
      if (url.pathname !== "/api/doc" || req.method !== "GET") return false;

      if (
        !url.searchParams.has("base") &&
        options.filePath &&
        !/^https?:\/\//i.test(options.filePath)
      ) {
        url.searchParams.set(
          "base",
          options.mode === "annotate-folder" && options.folderPath
            ? options.folderPath
            : dirname(resolvePath(options.filePath)),
        );
      }

      if (options.convertHtml && !url.searchParams.has("convert")) {
        url.searchParams.set("convert", "1");
      }

      await handleDocRequest(res, url, {
        rewriteHtml: htmlAssets.rewriteHtml,
        sourceSaveFilePath: sourceSaveState.singleFileSourceSaveEligible
          ? (sourceSaveState.initialSingleFileSourcePath ?? options.filePath)
          : undefined,
        sourceSaveFolderPath: options.mode === "annotate-folder" ? options.folderPath : undefined,
        onSourceDocumentServed: (path) => sourceSaveState.openedSourceFilePaths.add(path),
        rootPaths: sourceSaveState.getReferenceRootPaths(),
      });

      return true;
    },
    async (req, res, url) => {
      if (url.pathname !== "/api/source/save" || req.method !== "POST") return false;

      const parsedBody = await parseBody(req);

      if (!parsedBody.ok) {
        json(res, { error: "Malformed JSON body" }, 400);

        return true;
      }

      const body = Option.getOrUndefined(
        Schema.decodeUnknownOption(SourceSaveRequestSchema)(parsedBody.value),
      );

      if (!body) {
        json(res, { ok: false, code: "invalid-request", message: "Invalid JSON body." }, 400);

        return true;
      }

      const targetPath = resolveSourceSaveTarget(options, sourceSaveState, body);

      if (!targetPath) {
        json(
          res,
          { ok: false, code: "not-writable", message: "This document cannot be saved to a file." },
          403,
        );

        return true;
      }

      const result = saveSourceFileAtomic(targetPath, body.text, body.baseHash, {
        allowMissingBase: body.allowMissingBase === true,
        missingBaseEol: body.baseEol,
        allowedRoot: options.mode === "annotate-folder" ? options.folderPath : undefined,
      });

      json(res, result, sourceSaveStatus(result));

      return true;
    },
    async (req, res, url) => {
      if (url.pathname !== "/api/doc/exists" || req.method !== "POST") return false;
      await handleDocExistsRequest(res, req, {
        rootPaths: sourceSaveState.getReferenceRootPaths(),
      });

      return true;
    },
    (_req, res, url) => {
      if (url.pathname === "/api/obsidian/vaults") {
        handleObsidianVaultsRequest(res);

        return true;
      }

      return false;
    },
    (_req, res, url) => {
      if (url.pathname !== "/api/reference/obsidian/files" || _req.method !== "GET") return false;
      handleObsidianFilesRequest(res, url);

      return true;
    },
    (_req, res, url) => {
      if (url.pathname !== "/api/reference/obsidian/doc" || _req.method !== "GET") return false;
      handleObsidianDocRequest(res, url);

      return true;
    },
    async (_req, res, url) => {
      if (url.pathname !== "/api/reference/files" || _req.method !== "GET") return false;
      await handleFileBrowserRequest(res, url);

      return true;
    },
    (req, res, url) => {
      if (url.pathname !== "/api/reference/files/stream" || req.method !== "GET") return false;
      handleFileBrowserStreamRequest(req, res, url);

      return true;
    },
    (_req, res, url) => {
      if (url.pathname === "/favicon.svg") {
        handleFavicon(res);

        return true;
      }

      return false;
    },
    (req, res, url) => {
      if (url.pathname !== "/api/exit" || req.method !== "POST") return false;
      deleteDraft(draftKey, readDraftGenerationFromUrl(req));
      resolveDecision({ feedback: "", annotations: [], exit: true });
      json(res, { ok: true });

      return true;
    },
    (req, res, url) => {
      if (url.pathname !== "/api/approve" || req.method !== "POST") return false;
      deleteDraft(draftKey, readDraftGenerationFromUrl(req));
      resolveDecision({ feedback: "", annotations: [], approved: true });
      json(res, { ok: true });

      return true;
    },
    async (req, res, url) => {
      if (url.pathname !== "/api/feedback" || req.method !== "POST") return false;

      try {
        const parsedBody = await parseBody(req);

        if (!parsedBody.ok) {
          json(res, { error: "Malformed JSON body" }, 400);

          return true;
        }

        const request = decodeFeedbackRequest(parsedBody.value);

        if (!request) {
          json(res, { error: "Invalid request" }, 400);

          return true;
        }

        deleteDraft(draftKey, request.draftGeneration);
        resolveDecision({
          feedback: request.feedback ?? "",
          annotations: request.annotations ?? [],
          selectedMessageId: request.selectedMessageId,
          feedbackScope: request.feedbackScope,
        });
        json(res, { ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to process feedback";
        json(res, { error: message }, 500);
      }

      return true;
    },
    async (req, res, url) => {
      if (url.pathname !== "/api/save-notes" || req.method !== "POST") return false;
      await handleSaveNotesRequest(req, res);

      return true;
    },
  ];
}

async function handleAnnotateRequest(
  handlers: readonly AnnotateRouteHandler[],
  fallbackHtml: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = requestUrl(req);

  for (const handler of handlers) {
    if (await handler(req, res, url)) return;
  }

  html(res, fallbackHtml);
}

export async function startAnnotateServer(
  options: AnnotateServerOptions,
): Promise<AnnotateServerResult> {
  // Side-channel pre-warm so /api/doc/exists POSTs land on warm cache.
  void warmFileListCache(process.cwd(), "code");
  const gitUser = detectGitUser();
  const sharingEnabled = options.sharingEnabled ?? resolveSharingEnabled(loadConfig());
  const shareBaseUrl = (options.shareBaseUrl ?? process.env.PLANNOTATOR_SHARE_URL) || undefined;
  const pasteApiUrl = (options.pasteApiUrl ?? process.env.PLANNOTATOR_PASTE_URL) || undefined;
  const decisionState = createDecisionState();
  const draftKey = createDraftKey(options);
  const repoInfo = getRepoInfo();
  const externalAnnotations = createExternalAnnotationHandler("plan");
  const aiRuntime = await createPiAIRuntime();
  const htmlAssets = createHtmlAssetRegistry();
  const sourceSaveState = createSourceSaveState(options);

  let agentTerminalCapability: AgentTerminalCapability = {
    enabled: false,
    reason: "unsupported-runtime",
  };

  const handlers = createAnnotateRouteHandlers(
    options,
    draftKey,
    gitUser,
    sharingEnabled,
    shareBaseUrl,
    pasteApiUrl,
    repoInfo,
    externalAnnotations,
    aiRuntime,
    htmlAssets,
    sourceSaveState,
    decisionState.resolve,
    () => agentTerminalCapability,
  );

  const server = createServer((req, res) =>
    handleAnnotateRequest(handlers, options.htmlContent, req, res),
  );

  const agentTerminal = await createNodeAgentTerminalBridge({
    enabled: supportsAnnotateAgentTerminalMode(options.mode || "annotate"),
    cwd: options.agentCwd ?? process.cwd(),
    server,
  });

  agentTerminalCapability = agentTerminal.capability;

  const { port, portSource } = await listenOnPort(server);

  return {
    port,
    portSource,
    url: `http://localhost:${port}`,
    waitForDecision: () => decisionState.promise,
    stop: () => {
      aiRuntime?.dispose();
      agentTerminal.dispose();
      server.close();
    },
  };
}
