import { afterEach, describe, expect, test } from "bun:test";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ComponentProps } from "react";
import type { DiffViewer } from "./DiffViewer";
import type { AllFilesCodeView } from "./AllFilesCodeView";
import type { DiffFile } from "../types";

const hasDom = globalThis.document !== undefined;

const realFetch = globalThis.fetch;

const roots: Root[] = [];

function patchFor(filePath: string): string {
  return [
    `diff --git a/${filePath} b/${filePath}`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    "@@ -2,1 +2,1 @@",
    "-changed",
    "+changed-new",
  ].join("\n");
}

const patch = patchFor("src/example.ts");

const malformedOldContent = "before\nchanged\nmalformed-full-only";

const oldContent = "before\nchanged\nafter\nvalid-full-only";

const newContent = "before\nchanged-new\nafter\nvalid-full-only";

function collectTextIncludingShadowRoots(root: Node): string {
  let text = "";

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";

      return;
    }

    if (node instanceof Element && node.shadowRoot) {
      visit(node.shadowRoot);

      return;
    }

    node.childNodes.forEach(visit);
  };

  visit(root);

  return text;
}

function installFetch(responses: (path: string) => Response): void {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL): Promise<Response> => {
      const url = new URL(String(input), "http://localhost");

      return responses(url.searchParams.get("path") ?? "");
    },
    { preconnect: (): void => {} },
  );
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function diffViewerProps(): ComponentProps<typeof DiffViewer> {
  return {
    patch,
    filePath: "src/example.ts",
    diffStyle: "unified",
    expandUnchanged: true,
    annotations: [],
    selectedAnnotationId: null,
    scrollTargetAnnotation: null,
    pendingSelection: null,
    onLineSelection: () => {},
    onAddAnnotation: () => {},
    onAddFileComment: () => {},
    onEditAnnotation: () => {},
    onSelectAnnotation: () => {},
    onDeleteAnnotation: () => {},
  };
}

function allFilesProps(files: DiffFile[]): ComponentProps<typeof AllFilesCodeView> {
  return {
    files,
    diffStyle: "unified",
    expandUnchanged: true,
    annotations: [],
    selectedAnnotationId: null,
    scrollTargetAnnotation: null,
    pendingSelection: null,
    onLineSelection: () => {},
    onAddAnnotationForFile: () => {},
    onEditAnnotation: () => {},
    onSelectAnnotation: () => {},
    onDeleteAnnotation: () => {},
  };
}

async function mount(element: React.ReactElement): Promise<HTMLDivElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(element);
    await flushAsyncWork();
  });

  return host;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }

  globalThis.fetch = realFetch;

  if (hasDom) document.body.innerHTML = "";
});

describe("file-content response consumers", () => {
  test.skipIf(!hasDom)("DiffViewer keeps the raw patch for a malformed response", async () => {
    installFetch(
      () => new Response(JSON.stringify({ oldContent: malformedOldContent }), { status: 200 }),
    );
    await mount(React.createElement((await import("./DiffViewer")).DiffViewer, diffViewerProps()));
    await act(async () => {
      await flushAsyncWork();
    });

    const text = collectTextIncludingShadowRoots(document.body);
    expect(text).toContain("changed-new");
    expect(text).not.toContain("malformed-full-only");
  });

  test.skipIf(!hasDom)(
    "AllFilesCodeView isolates malformed augmentation from a valid sibling",
    async () => {
      const files: DiffFile[] = [
        {
          path: "src/malformed.ts",
          patch: patchFor("src/malformed.ts"),
          additions: 1,
          deletions: 1,
          status: "modified",
        },
        {
          path: "src/valid.ts",
          patch: patchFor("src/valid.ts"),
          additions: 1,
          deletions: 1,
          status: "modified",
        },
      ];

      installFetch((path) =>
        path === "src/malformed.ts"
          ? new Response(JSON.stringify({ oldContent: malformedOldContent }), { status: 200 })
          : new Response(JSON.stringify({ oldContent, newContent }), { status: 200 }),
      );

      await mount(
        React.createElement(
          (await import("./AllFilesCodeView")).AllFilesCodeView,
          allFilesProps(files),
        ),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        await flushAsyncWork();
      });

      const text = collectTextIncludingShadowRoots(document.body);
      expect(text).not.toContain("malformed-full-only");
      expect(text).toContain("valid-full-only");
      expect(text).toContain("changed-new");
    },
  );
});
