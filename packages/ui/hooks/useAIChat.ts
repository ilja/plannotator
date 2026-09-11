import { useCallback, useEffect, useRef, useState } from "react";
import type { AIContext, AIJsonObject } from "@plannotator/ai";
import type { AIQuestion, AIResponse } from "../types";
import { generateId } from "../utils/generateId";
import {
  decodeAIChatError,
  decodeAIChatSessionId,
  decodeAIChatStreamMessage,
} from "./aiChatStreamMessages";

export interface AIChatEntry {
  question: AIQuestion;
  response: AIResponse;
}

export interface PendingPermission {
  requestId: string;
  toolName: string;
  toolInput: AIJsonObject;
  title?: string;
  displayName?: string;
  description?: string;
  toolUseId: string;
  decided?: "allow" | "deny";
}

export interface AIChatThread {
  id: string;
  title: string;
  sessionId: string | null;
  messages: AIChatEntry[];
  permissionRequests: PendingPermission[];
}

export interface AskAIParams {
  prompt: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  side?: "old" | "new";
  selectedCode?: string;
  scope?: AIQuestion["scope"];
  contextUpdate?: string;
}

interface UseAIChatOptions {
  context: AIContext | null;
  providerId?: string | null;
  model?: string | null;
  reasoningEffort?: string | null;
  buildPrompt?: (params: AskAIParams) => string;
  threadTitle?: string;
}

export function buildDefaultPrompt(params: AskAIParams): string {
  if (params.filePath && params.lineStart != null && params.lineEnd != null) {
    const lineRef =
      params.lineStart === params.lineEnd
        ? `line ${params.lineStart}`
        : `lines ${params.lineStart}-${params.lineEnd}`;

    const sideLabel = params.side === "new" ? "new (added)" : "old (removed)";
    const codeBlock = params.selectedCode ? `\n\`\`\`\n${params.selectedCode}\n\`\`\`\n` : "";

    return `Re: ${params.filePath}, ${lineRef} (${sideLabel} side)${codeBlock}\n${params.prompt}`;
  }

  if (params.filePath) {
    return `Re: ${params.filePath} (entire file)\n\n${params.prompt}`;
  }

  if (params.scope?.kind === "selection") {
    const label = params.scope.label ? `Re: ${params.scope.label}` : "Re: selected text";
    const source = params.scope.sourcePath ? `\nSource: ${params.scope.sourcePath}` : "";

    const selection = params.scope.text
      ? `\n\nSelected text:\n\`\`\`\n${params.scope.text}\n\`\`\``
      : "";

    return `${label}${source}${selection}\n\n${params.prompt}`;
  }

  return params.prompt;
}

function createThread(title = "Chat"): AIChatThread {
  return {
    id: generateId("ai-thread"),
    title,
    sessionId: null,
    messages: [],
    permissionRequests: [],
  };
}

function createAbortError(message: string): Error {
  if (globalThis.DOMException !== undefined) {
    return new DOMException(message, "AbortError");
  }

  const err = new Error(message);
  err.name = "AbortError";

  return err;
}

interface ResponseUpdate {
  messages: AIChatEntry[];
  questionId: string;
  updateResponse: (response: AIResponse) => AIResponse;
}

function updateResponseForQuestion({
  messages,
  questionId,
  updateResponse,
}: ResponseUpdate): AIChatEntry[] {
  return messages.map((message) =>
    message.question.id === questionId
      ? { ...message, response: updateResponse(message.response) }
      : message,
  );
}

type StreamMessageUpdater = (updater: (messages: AIChatEntry[]) => AIChatEntry[]) => void;

type PermissionUpdater = (
  updater: (permissions: PendingPermission[]) => PendingPermission[],
) => void;

interface StreamMessageHandlers {
  questionId: string;
  updateMessages: StreamMessageUpdater;
  updatePermissions: PermissionUpdater;
  setError: (error: string) => void;
}

function handleAIChatStreamMessage(
  message: ReturnType<typeof decodeAIChatStreamMessage>,
  { questionId, updateMessages, updatePermissions, setError }: StreamMessageHandlers,
): void {
  if (!message) return;

  if (message.type === "text_delta") {
    updateMessages((messages) =>
      updateResponseForQuestion({
        messages,
        questionId,
        updateResponse: (response) => ({
          ...response,
          text: response.text + message.delta,
        }),
      }),
    );

    return;
  }

  if (message.type === "text") {
    updateMessages((messages) =>
      updateResponseForQuestion({
        messages,
        questionId,
        updateResponse: (response) =>
          response.text ? response : { ...response, text: message.text },
      }),
    );

    return;
  }

  if (message.type === "permission_request") {
    updatePermissions((permissions) => [
      ...permissions,
      {
        requestId: message.requestId,
        toolName: message.toolName,
        toolInput: message.toolInput,
        title: message.title,
        displayName: message.displayName,
        description: message.description,
        toolUseId: message.toolUseId,
      },
    ]);

    return;
  }

  if (message.type === "error") {
    updateMessages((messages) =>
      updateResponseForQuestion({
        messages,
        questionId,
        updateResponse: (response) => ({
          ...response,
          error: message.error,
          isStreaming: false,
        }),
      }),
    );
    setError(message.error);

    return;
  }

  if (message.type === "result") {
    updateMessages((messages) =>
      updateResponseForQuestion({
        messages,
        questionId,
        updateResponse: (response) => ({
          ...response,
          text: response.text || message.result || "",
          isStreaming: false,
        }),
      }),
    );
  }
}

async function processAIChatStream(
  response: Response,
  handlers: StreamMessageHandlers,
): Promise<void> {
  const reader = response.body?.getReader();

  if (!reader) throw new Error(`HTTP ${response.status}`);

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ") || line.slice(6) === "[DONE]") continue;

      try {
        handleAIChatStreamMessage(decodeAIChatStreamMessage(JSON.parse(line.slice(6))), handlers);
      } catch {
        // Ignore malformed SSE lines.
      }
    }
  }
}

export function useAIChat({
  context,
  providerId,
  model,
  reasoningEffort,
  buildPrompt = buildDefaultPrompt,
  threadTitle = "Chat",
}: UseAIChatOptions) {
  const [thread, setThread] = useState<AIChatThread>(() => createThread(threadTitle));
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const sessionEpochRef = useRef(0);
  const createRequestRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = thread.sessionId;

  const updateMessages = useCallback((updater: (messages: AIChatEntry[]) => AIChatEntry[]) => {
    setThread((prev) => ({ ...prev, messages: updater(prev.messages) }));
  }, []);

  const updatePermissions = useCallback(
    (updater: (permissions: PendingPermission[]) => PendingPermission[]) => {
      setThread((prev) => ({ ...prev, permissionRequests: updater(prev.permissionRequests) }));
    },
    [],
  );

  const setSessionId = useCallback((sessionId: string | null) => {
    setThread((prev) => ({ ...prev, sessionId }));
  }, []);

  const createSession = useCallback(
    async (signal: AbortSignal, epoch: number): Promise<string> => {
      if (!context) {
        throw new Error("AI context is unavailable");
      }

      const requestId = ++createRequestRef.current;
      setIsCreatingSession(true);

      try {
        const res = await fetch("/api/ai/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context,
            ...(providerId && { providerId }),
            ...(model && { model }),
            ...(reasoningEffort && { reasoningEffort }),
          }),
          signal,
        });

        if (!res.ok) {
          const error = decodeAIChatError(await res.json().catch(() => null));
          throw new Error(error ?? `HTTP ${res.status}`);
        }

        const sessionId = decodeAIChatSessionId(await res.json());

        if (!sessionId) throw new Error("AI session response was malformed");

        if (signal.aborted || epoch !== sessionEpochRef.current) {
          fetch("/api/ai/abort", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          }).catch(() => {});
          throw createAbortError("AI session creation was superseded");
        }

        setSessionId(sessionId);

        return sessionId;
      } finally {
        if (createRequestRef.current === requestId) {
          setIsCreatingSession(false);
        }
      }
    },
    [context, model, providerId, reasoningEffort, setSessionId],
  );

  const ask = useCallback(
    async (params: AskAIParams) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const epoch = sessionEpochRef.current;
      setError(null);

      const questionId = generateId("ai-question");

      const question: AIQuestion = {
        id: questionId,
        prompt: params.prompt,
        scope: params.scope,
        filePath: params.filePath,
        lineStart: params.lineStart,
        lineEnd: params.lineEnd,
        side: params.side,
        selectedCode: params.selectedCode,
        createdAt: Date.now(),
      };

      const response: AIResponse = {
        questionId,
        text: "",
        isStreaming: true,
        createdAt: Date.now(),
      };

      updateMessages((prev) => [...prev, { question, response }]);
      setIsStreaming(true);

      try {
        let sid = sessionIdRef.current;

        if (!sid) {
          sid = await createSession(controller.signal, epoch);
        }

        if (controller.signal.aborted || epoch !== sessionEpochRef.current) {
          throw createAbortError("AI question was superseded");
        }

        const fullPrompt = buildPrompt(params);

        const res = await fetch("/api/ai/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            prompt: fullPrompt,
            ...(params.contextUpdate && { contextUpdate: params.contextUpdate }),
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const error = decodeAIChatError(await res.json().catch(() => null));
          throw new Error(error ?? `HTTP ${res.status}`);
        }

        await processAIChatStream(res, {
          questionId,
          updateMessages,
          updatePermissions,
          setError,
        });

        updateMessages((prev) =>
          updateResponseForQuestion({
            messages: prev,
            questionId,
            updateResponse: (response) =>
              response.isStreaming ? { ...response, isStreaming: false } : response,
          }),
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          updateMessages((prev) =>
            updateResponseForQuestion({
              messages: prev,
              questionId,
              updateResponse: (response) => ({
                ...response,
                isStreaming: false,
              }),
            }),
          );

          return;
        }

        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        updateMessages((prev) =>
          updateResponseForQuestion({
            messages: prev,
            questionId,
            updateResponse: (response) => ({
              ...response,
              error: message,
              isStreaming: false,
            }),
          }),
        );
      } finally {
        if (abortRef.current === controller) {
          setIsStreaming(false);
          abortRef.current = null;
        }
      }
    },
    [buildPrompt, createSession, updateMessages, updatePermissions],
  );

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsStreaming(false);
    }

    if (sessionIdRef.current) {
      fetch("/api/ai/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      }).catch(() => {});
    }
  }, []);

  const respondToPermission = useCallback(
    (requestId: string, allow: boolean) => {
      if (!sessionIdRef.current) return;

      updatePermissions((prev) =>
        prev.map((p) =>
          p.requestId === requestId ? { ...p, decided: allow ? "allow" : "deny" } : p,
        ),
      );

      fetch("/api/ai/permission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          requestId,
          allow,
        }),
      }).catch(() => {});
    },
    [updatePermissions],
  );

  const resetSession = useCallback(() => {
    sessionEpochRef.current += 1;
    createRequestRef.current += 1;

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    setSessionId(null);
    setIsCreatingSession(false);
    setIsStreaming(false);
  }, [setSessionId]);

  const resetThread = useCallback(() => {
    sessionEpochRef.current += 1;
    createRequestRef.current += 1;

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    setThread(createThread(threadTitle));
    setIsCreatingSession(false);
    setIsStreaming(false);
    setError(null);
  }, [threadTitle]);

  useEffect(() => {
    return () => {
      sessionEpochRef.current += 1;
      createRequestRef.current += 1;

      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return {
    thread,
    messages: thread.messages,
    isCreatingSession,
    isStreaming,
    error,
    permissionRequests: thread.permissionRequests,
    respondToPermission,
    ask,
    abort,
    resetSession,
    resetThread,
    sessionId: thread.sessionId,
  };
}
