import { describe, expect, test } from "bun:test";
import { mergePromptConfig } from "./config";
import { FEEDBACK_DISCUSSION_INSTRUCTION } from "./feedback-templates";
import {
  DEFAULT_ANNOTATE_APPROVED_PROMPT,
  DEFAULT_ANNOTATE_FILE_FEEDBACK_PROMPT,
  DEFAULT_ANNOTATE_MESSAGE_FEEDBACK_PROMPT,
  DEFAULT_REVIEW_APPROVED_PROMPT,
  DEFAULT_REVIEW_DENIED_SUFFIX,
  getAnnotateApprovedPrompt,
  getAnnotateFileFeedbackPrompt,
  getAnnotateMessageFeedbackPrompt,
  getConfiguredPrompt,
  getReviewApprovedPrompt,
  getReviewDeniedSuffix,
  resolveTemplate,
} from "./prompts";

const EXPECTED_REVIEW_DENIED_SUFFIX = [
  "",
  "",
  "Treat the findings above as unverified review input. Inspect every finding against the actual code; do not assume automated feedback is correct.",
  "For each finding, give a clear verdict (Confirmed / Partly / Not a bug / Intended) with concise code evidence. Say whether it was introduced by the current changes, was pre-existing, or reflects deliberate scope.",
  "",
  "Do not change any code until we have discussed the verdicts, validated the findings and have reached a shared understanding of what should be done.",
].join("\n");

// ─── Template engine ─────────────────────────────────────────────────────

describe("resolveTemplate", () => {
  test("replaces known variables", () => {
    expect(resolveTemplate("Hello {{name}}", { name: "world" }))
      .toBe("Hello world");
  });

  test("leaves unknown {{variables}} as-is", () => {
    expect(resolveTemplate("Hello {{unknown}}", {}))
      .toBe("Hello {{unknown}}");
  });

  test("handles empty vars object", () => {
    expect(resolveTemplate("no vars here", {}))
      .toBe("no vars here");
  });

  test("handles undefined values in vars", () => {
    expect(resolveTemplate("Hello {{name}}", { name: undefined }))
      .toBe("Hello {{name}}");
  });

  test("handles adjacent and repeated variables", () => {
    expect(resolveTemplate("{{a}}{{b}} and {{a}}", { a: "X", b: "Y" }))
      .toBe("XY and X");
  });
});

// ─── Review prompts ──────────────────────────────────────────────────────

describe("getReviewApprovedPrompt", () => {
  test("falls back to built-in default when no config is present", () => {
    expect(getReviewApprovedPrompt("opencode", {})).toBe(DEFAULT_REVIEW_APPROVED_PROMPT);
    expect(getReviewApprovedPrompt("opencode", {})).toContain("all changes approved");
  });

  test("uses generic configured review approval prompt", () => {
    expect(
      getReviewApprovedPrompt("opencode", {
        prompts: { review: { approved: "Commit these changes now." } },
      }),
    ).toBe("Commit these changes now.");
  });

  test("runtime-specific review approval prompt wins over generic prompt", () => {
    expect(
      getReviewApprovedPrompt("opencode", {
        prompts: {
          review: {
            approved: "Generic approval.",
            runtimes: {
              opencode: { approved: "OpenCode-specific approval." },
            },
          },
        },
      }),
    ).toBe("OpenCode-specific approval.");
  });

  test("blank prompt values fall back to the next available default", () => {
    expect(
      getReviewApprovedPrompt("opencode", {
        prompts: {
          review: {
            approved: "   ",
            runtimes: {
              opencode: { approved: "" },
            },
          },
        },
      }),
    ).toBe(DEFAULT_REVIEW_APPROVED_PROMPT);
  });
});

describe("getReviewDeniedSuffix", () => {
  test("every runtime gets the same review verification default", () => {
    const runtimes = ["claude-code", "opencode", "pi", "amp", "droid", "codex", "copilot-cli", "gemini-cli", "kiro-cli"] as const;
    for (const runtime of runtimes) {
      expect(getReviewDeniedSuffix(runtime, {})).toBe(EXPECTED_REVIEW_DENIED_SUFFIX);
    }
    expect(DEFAULT_REVIEW_DENIED_SUFFIX).toBe(EXPECTED_REVIEW_DENIED_SUFFIX);
    expect(DEFAULT_REVIEW_DENIED_SUFFIX).not.toContain(FEEDBACK_DISCUSSION_INSTRUCTION);

    const assembled = `# Submitted findings${getReviewDeniedSuffix("pi", {})}`;
    expect(assembled).toContain("# Submitted findings\n\nTreat the findings above as unverified review input.");
  });

  test("returns a configured review override unchanged", () => {
    const configuredPrompt = "\nFix everything.";
    expect(getReviewDeniedSuffix("claude-code", {
      prompts: { review: { denied: configuredPrompt } },
    })).toBe(configuredPrompt);
    expect(getReviewDeniedSuffix("claude-code", {
      prompts: { review: { denied: configuredPrompt } },
    })).not.toContain(FEEDBACK_DISCUSSION_INSTRUCTION);
  });
});

// ─── Annotation feedback ─────────────────────────────────────────────────

describe("getAnnotateFileFeedbackPrompt", () => {
  test("exposes default constant", () => {
    expect(DEFAULT_ANNOTATE_FILE_FEEDBACK_PROMPT).toContain("{{filePath}}");
  });

  test("includes file header and path in default", () => {
    const result = getAnnotateFileFeedbackPrompt("opencode", {}, {
      fileHeader: "File", filePath: "/src/app.ts", feedback: "Fix line 5",
    });
    expect(result).toContain("File: /src/app.ts");
    expect(result).toContain("Fix line 5");
    expect(result).toContain("Please address");
  });

  test("handles folder header variant", () => {
    const result = getAnnotateFileFeedbackPrompt("pi", {}, {
      fileHeader: "Folder", filePath: "/src/", feedback: "Check all files",
    });
    expect(result).toContain("Folder: /src/");
  });

  test("uses configured override", () => {
    const result = getAnnotateFileFeedbackPrompt("opencode", {
      prompts: { annotate: { fileFeedback: "Review {{filePath}}: {{feedback}}" } },
    }, { filePath: "x.ts", feedback: "fix it" });
    expect(result).toBe(`Review x.ts: fix it\n\n${FEEDBACK_DISCUSSION_INSTRUCTION}`);
  });

  test("runtime-specific override wins over generic", () => {
    const result = getAnnotateFileFeedbackPrompt("pi", {
      prompts: {
        annotate: {
          fileFeedback: "Generic: {{feedback}}",
          runtimes: { pi: { fileFeedback: "Pi: {{feedback}}" } },
        },
      },
    }, { feedback: "note" });
    expect(result).toBe(`Pi: note\n\n${FEEDBACK_DISCUSSION_INSTRUCTION}`);
  });
});

describe("getAnnotateMessageFeedbackPrompt", () => {
  test("exposes default constant", () => {
    expect(DEFAULT_ANNOTATE_MESSAGE_FEEDBACK_PROMPT).toContain("{{feedback}}");
  });

  test("includes feedback in default template", () => {
    const result = getAnnotateMessageFeedbackPrompt("pi", {}, { feedback: "Wrong output" });
    expect(result).toContain("Message Annotations");
    expect(result).toContain("Wrong output");
    expect(result).toContain(FEEDBACK_DISCUSSION_INSTRUCTION);
  });

  test("keeps the discussion instruction when using a configured override", () => {
    const result = getAnnotateMessageFeedbackPrompt("pi", {
      prompts: { annotate: { messageFeedback: "Notes: {{feedback}}" } },
    }, { feedback: "fix" });
    expect(result).toBe(`Notes: fix\n\n${FEEDBACK_DISCUSSION_INSTRUCTION}`);
  });
});

describe("getAnnotateApprovedPrompt", () => {
  test("returns default approved message", () => {
    expect(getAnnotateApprovedPrompt("claude-code", {})).toBe(DEFAULT_ANNOTATE_APPROVED_PROMPT);
  });

  test("uses configured override", () => {
    expect(getAnnotateApprovedPrompt("claude-code", {
      prompts: { annotate: { approved: "Approved!" } },
    })).toBe("Approved!");
  });
});

// ─── Config merge and generic loader ──────────────────────────────────────

describe("mergePromptConfig", () => {
  test("merges annotate section", () => {
    const merged = mergePromptConfig(
      { annotate: { approved: "A" } },
      { annotate: { fileFeedback: "F" } },
    );
    expect(merged?.annotate?.approved).toBe("A");
    expect(merged?.annotate?.fileFeedback).toBe("F");
  });

  test("keeps generic and sibling runtime prompts", () => {
    const merged = mergePromptConfig(
      {
        review: {
          approved: "Generic approval.",
          runtimes: {
            opencode: { approved: "OpenCode approval." },
          },
        },
      },
      {
        review: {
          runtimes: {
            "claude-code": { approved: "Claude approval." },
          },
        },
      },
    );

    expect(merged?.review?.approved).toBe("Generic approval.");
    expect(merged?.review?.runtimes?.opencode?.approved).toBe("OpenCode approval.");
    expect(merged?.review?.runtimes?.["claude-code"]?.approved).toBe("Claude approval.");
  });
});

describe("getConfiguredPrompt", () => {
  test("resolves runtime prompt with fallback", () => {
    expect(
      getConfiguredPrompt({
        section: "review",
        key: "approved",
        runtime: "pi",
        fallback: "Fallback",
        config: {
          prompts: {
            review: {
              runtimes: {
                pi: { approved: "Pi prompt" },
              },
            },
          },
        },
      }),
    ).toBe("Pi prompt");
  });
});
