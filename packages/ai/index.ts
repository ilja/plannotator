/**
 * @plannotator/ai — AI provider layer for Plannotator.
 *
 * This package provides the backbone for AI-powered features (inline chat,
 * code review assistance, and document annotation assistance) across retained
 * Plannotator surfaces.
 *
 * Architecture:
 *
 *   ┌─────────────────┐     ┌──────────────┐
 *   │ Code Review UI  │────▶│              │
 *   ├─────────────────┤     │  AI Endpoints │──▶ SSE stream
 *   │  Annotate UI    │────▶│  (HTTP)      │
 *   └─────────────────┘     └──────┬───────┘
 *                                  │
 *                                  ▼
 *                         ┌────────────────┐
 *                         │ Session Manager │
 *                         └────────┬───────┘
 *                                  │
 *                         ┌────────▼───────┐
 *                         │  AIProvider     │ (abstract)
 *                         └────────┬───────┘
 *                                  │
 *                                  ▼
 *                          ┌─────────────┐
 *                          │ Pi SDK      │
 *                          │ Provider    │
 *                          └─────────────┘
 *
 * Quick start:
 *
 * ```ts
 * import "@plannotator/ai/providers/pi-sdk";
 * import { ProviderRegistry, createProvider, createAIEndpoints, SessionManager } from "@plannotator/ai";
 *
 * // 1. Create a registry and provider
 * const registry = new ProviderRegistry();
 * const provider = await createProvider({ type: "pi-sdk", cwd: process.cwd(), piExecutablePath: "pi" });
 * registry.register(provider);
 *
 * // 2. Create endpoints and session manager
 * const sessionManager = new SessionManager();
 * const aiEndpoints = createAIEndpoints({ registry, sessionManager });
 *
 * // 3. Mount endpoints in your Bun server
 * // aiEndpoints["/api/ai/query"](request) → SSE Response
 * ```
 */

// Types
export type {
  AIProvider,
  AIProviderCapabilities,
  AIProviderConfig,
  AISession,
  AIMessage,
  AITextMessage,
  AITextDeltaMessage,
  AIToolUseMessage,
  AIToolResultMessage,
  AIErrorMessage,
  AIResultMessage,
  AIPermissionRequestMessage,
  AIUnknownMessage,
  AIContext,
  AIContextMode,
  PlanContext,
  CodeReviewContext,
  AnnotateContext,
  ParentSession,
  CreateSessionOptions,
  PiSDKConfig,
} from "./types.ts";

// Provider registry
export {
  ProviderRegistry,
  registerProviderFactory,
  createProvider,
} from "./provider.ts";

// Context builders
export { buildSystemPrompt, buildForkPreamble, buildEffectivePrompt } from "./context.ts";

// Base session
export { BaseSession } from "./base-session.ts";

// Session manager
export { SessionManager } from "./session-manager.ts";
export type { SessionEntry, SessionManagerOptions } from "./session-manager.ts";

// HTTP endpoints
export { createAIEndpoints } from "./endpoints.ts";
export type {
  AIEndpoints,
  AIEndpointDeps,
  CreateSessionRequest,
  QueryRequest,
  AbortRequest,
} from "./endpoints.ts";
