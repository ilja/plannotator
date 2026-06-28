import { loadConfig, type PlannotatorConfig, type PromptRuntime } from "./config";

// ─── Template engine ─────────────────────────────────────────────────────────

export function resolveTemplate(
  template: string,
  vars: Record<string, string | undefined>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = vars[key];
    return val !== undefined ? val : match;
  });
}

// ─── Default constants ───────────────────────────────────────────────────────

export const DEFAULT_REVIEW_APPROVED_PROMPT = "# Code Review\n\nCode review completed — no changes requested.";

export const DEFAULT_REVIEW_DENIED_SUFFIX = "\n\nThis feedback came from review. Please triage it and verify it against the code and then come back to me with your thoughts on the findings. Do not change any code until we've discussed the findings.";

export const DEFAULT_ANNOTATE_FILE_FEEDBACK_PROMPT =
  "# Markdown Annotations\n\n{{fileHeader}}: {{filePath}}\n\n{{feedback}}\n\nPlease address the annotation feedback above.";

export const DEFAULT_ANNOTATE_MESSAGE_FEEDBACK_PROMPT =
  "# Message Annotations\n\n{{feedback}}\n\nPlease address the annotation feedback above.";

export const DEFAULT_ANNOTATE_APPROVED_PROMPT = "The user approved.";

// ─── Core resolver ───────────────────────────────────────────────────────────

type PromptSection = "review" | "annotate";
type PromptKey = "approved" | "approvedWithNotes" | "autoApproved" | "denied"
  | "fileFeedback" | "messageFeedback";

interface PromptLookupOptions {
  section: PromptSection;
  key: PromptKey;
  runtime?: PromptRuntime | null;
  config?: PlannotatorConfig;
  fallback: string;
  runtimeFallbacks?: Partial<Record<PromptRuntime, string>>;
}

function normalizePrompt(prompt: unknown): string | undefined {
  if (typeof prompt !== "string") return undefined;
  return prompt.trim() ? prompt : undefined;
}

export function getConfiguredPrompt(options: PromptLookupOptions): string {
  const resolvedConfig = options.config ?? loadConfig();
  const section = resolvedConfig.prompts?.[options.section];
  const runtimePrompt = options.runtime
    ? normalizePrompt(section?.runtimes?.[options.runtime]?.[options.key])
    : undefined;
  const genericPrompt = normalizePrompt(section?.[options.key]);
  const runtimeFallback = options.runtime
    ? options.runtimeFallbacks?.[options.runtime]
    : undefined;

  return runtimePrompt ?? genericPrompt ?? runtimeFallback ?? options.fallback;
}

type FeedbackVars = Record<string, string | undefined>;

// ─── Review wrappers ─────────────────────────────────────────────────────────

export function getReviewApprovedPrompt(
  runtime?: PromptRuntime | null,
  config?: PlannotatorConfig,
): string {
  return getConfiguredPrompt({
    section: "review",
    key: "approved",
    runtime,
    config,
    fallback: DEFAULT_REVIEW_APPROVED_PROMPT,
  });
}

export function getReviewDeniedSuffix(
  runtime?: PromptRuntime | null,
  config?: PlannotatorConfig,
): string {
  // Intentionally no per-runtime defaults: every agent gets the same
  // triage-first instruction so none of them start coding off raw review
  // feedback. Per-runtime customization stays available via config
  // (prompts.review.runtimes.<runtime>.denied).
  return getConfiguredPrompt({
    section: "review",
    key: "denied",
    runtime,
    config,
    fallback: DEFAULT_REVIEW_DENIED_SUFFIX,
  });
}

// ─── Annotate wrappers ──────────────────────────────────────────────────────

export function getAnnotateFileFeedbackPrompt(
  runtime?: PromptRuntime | null,
  config?: PlannotatorConfig,
  vars?: FeedbackVars,
): string {
  const template = getConfiguredPrompt({
    section: "annotate",
    key: "fileFeedback",
    runtime,
    config,
    fallback: DEFAULT_ANNOTATE_FILE_FEEDBACK_PROMPT,
  });
  return resolveTemplate(template, vars ?? {});
}

export function getAnnotateMessageFeedbackPrompt(
  runtime?: PromptRuntime | null,
  config?: PlannotatorConfig,
  vars?: FeedbackVars,
): string {
  const template = getConfiguredPrompt({
    section: "annotate",
    key: "messageFeedback",
    runtime,
    config,
    fallback: DEFAULT_ANNOTATE_MESSAGE_FEEDBACK_PROMPT,
  });
  return resolveTemplate(template, vars ?? {});
}

export function getAnnotateApprovedPrompt(
  runtime?: PromptRuntime | null,
  config?: PlannotatorConfig,
): string {
  return getConfiguredPrompt({
    section: "annotate",
    key: "approved",
    runtime,
    config,
    fallback: DEFAULT_ANNOTATE_APPROVED_PROMPT,
  });
}
