import { describe, expect, test } from "bun:test";
import React, { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  decodeHtmlBridgeMessage,
  useHtmlAnnotation,
  type UseHtmlAnnotationOptions,
} from "./useHtmlAnnotation";
import { HtmlViewer } from "./HtmlViewer";

const hasDom = globalThis.document !== undefined;

type HookResult = ReturnType<typeof useHtmlAnnotation>;
type DecodedBridgeMessage = NonNullable<ReturnType<typeof decodeHtmlBridgeMessage>>;

interface HookResultRef {
  current: HookResult | null;
}

interface HarnessProps {
  resultRef: HookResultRef;
  options?: Partial<
    Omit<UseHtmlAnnotationOptions, "iframeRef" | "annotations" | "selectedAnnotationId" | "mode">
  >;
}

function Harness({ resultRef, options }: HarnessProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  resultRef.current = useHtmlAnnotation({
    iframeRef,
    annotations: [],
    selectedAnnotationId: null,
    mode: "selection",
    ...options,
  });
  return <iframe ref={iframeRef} title="bridge test" />;
}

interface MountedHook {
  iframe: HTMLIFrameElement;
  result: HookResultRef;
  unmount: () => Promise<void>;
}

async function mountHook(options?: HarnessProps["options"]): Promise<MountedHook> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  const result: HookResultRef = { current: null };
  await act(async () => {
    root.render(<Harness resultRef={result} options={options} />);
  });
  const iframe = host.querySelector("iframe");
  if (!iframe) throw new Error("HTML bridge test iframe did not mount");
  return {
    iframe,
    result,
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

async function dispatchBridgeMessage<Input>(
  source: MessageEventSource,
  data: Input,
): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new MessageEvent("message", { source, data }));
  });
}

describe("decodeHtmlBridgeMessage", () => {
  test("decodes a valid selection message", () => {
    expect(
      decodeHtmlBridgeMessage({
        type: "plannotator-bridge-selection",
        text: "selected text",
        rect: { top: 1, left: 2, width: 3, height: 4 },
      }),
    ).toEqual({
      type: "plannotator-bridge-selection",
      text: "selected text",
      rect: { top: 1, left: 2, width: 3, height: 4 },
    });
  });

  test("decodes every supported bridge message variant", () => {
    const messages: DecodedBridgeMessage[] = [
      { type: "plannotator-bridge-selection-clear" },
      {
        type: "plannotator-bridge-selection-rect",
        rect: { top: 5, left: 6, width: 7, height: 8 },
      },
      { type: "plannotator-bridge-keytype", key: "a" },
      { type: "plannotator-bridge-mark-click", id: "annotation-1" },
      { type: "plannotator-bridge-resize", height: 640 },
    ];

    for (const message of messages) {
      expect(decodeHtmlBridgeMessage(message)).toEqual(message);
    }
  });

  test("rejects unknown types and malformed nested payloads", () => {
    const invalidMessages = [
      { type: "plannotator-bridge-ready" },
      { type: "plannotator-bridge-selection", text: "selected text" },
      {
        type: "plannotator-bridge-selection",
        text: "selected text",
        rect: { top: Number.NaN, left: 2, width: 3, height: 4 },
      },
      { type: "plannotator-bridge-selection-rect", rect: { top: 1 } },
      { type: "plannotator-bridge-keytype", key: 1 },
      { type: "plannotator-bridge-mark-click", id: null },
      { type: "plannotator-bridge-resize", height: Number.POSITIVE_INFINITY },
    ];

    for (const message of invalidMessages) {
      expect(decodeHtmlBridgeMessage(message)).toBeNull();
    }
  });
});

describe("useHtmlAnnotation bridge messages", () => {
  test.skipIf(!hasDom)("handles selection, reposition, keytype, and clear messages", async () => {
    const mounted = await mountHook();

    try {
      if (!mounted.iframe.contentWindow) {
        throw new Error("HTML bridge test iframe has no contentWindow");
      }
      const source = mounted.iframe.contentWindow;
      await dispatchBridgeMessage(source, {
        type: "plannotator-bridge-selection",
        text: "selected text",
        rect: { top: 1, left: 2, width: 4, height: 5 },
      });
      expect(mounted.result.current?.toolbarState?.selectionText).toBe("selected text");
      expect(mounted.result.current?.toolbarState?.element.style.top).toBe("1px");
      expect(mounted.result.current?.toolbarState?.element.style.left).toBe("4px");

      await dispatchBridgeMessage(source, {
        type: "plannotator-bridge-selection-rect",
        rect: { top: 10, left: 20, width: 6, height: 7 },
      });
      expect(mounted.result.current?.toolbarState?.element.style.top).toBe("10px");
      expect(mounted.result.current?.toolbarState?.element.style.left).toBe("23px");

      await dispatchBridgeMessage(source, {
        type: "plannotator-bridge-keytype",
        key: "x",
      });
      expect(mounted.result.current?.toolbarState).toBeNull();
      expect(mounted.result.current?.commentPopover?.initialText).toBe("x");

      act(() => mounted.result.current?.handleCommentClose());
      await dispatchBridgeMessage(source, {
        type: "plannotator-bridge-selection",
        text: "another selection",
        rect: { top: 1, left: 2, width: 4, height: 5 },
      });
      expect(mounted.result.current?.toolbarState).not.toBeNull();
      await dispatchBridgeMessage(source, { type: "plannotator-bridge-selection-clear" });
      expect(mounted.result.current?.toolbarState).toBeNull();
    } finally {
      await mounted.unmount();
    }
  });

  test.skipIf(!hasDom)("handles mark clicks and finite resize messages", async () => {
    const selectedIds: (string | null)[] = [];
    const heights: number[] = [];
    const mounted = await mountHook({
      onSelectAnnotation: (id) => selectedIds.push(id),
      onResize: (height) => heights.push(height),
    });

    try {
      if (!mounted.iframe.contentWindow) {
        throw new Error("HTML bridge test iframe has no contentWindow");
      }
      const source = mounted.iframe.contentWindow;
      await dispatchBridgeMessage(source, {
        type: "plannotator-bridge-mark-click",
        id: "annotation-1",
      });
      await dispatchBridgeMessage(source, {
        type: "plannotator-bridge-resize",
        height: 640,
      });
      await dispatchBridgeMessage(source, {
        type: "plannotator-bridge-mark-click",
        id: null,
      });
      await dispatchBridgeMessage(source, {
        type: "plannotator-bridge-resize",
        height: Number.POSITIVE_INFINITY,
      });

      expect(selectedIds).toEqual(["annotation-1"]);
      expect(heights).toEqual([640]);
    } finally {
      await mounted.unmount();
    }
  });

  test.skipIf(!hasDom)("ignores valid messages from another window", async () => {
    const heights: number[] = [];
    const mounted = await mountHook({ onResize: (height) => heights.push(height) });
    const otherIframe = document.createElement("iframe");
    document.body.appendChild(otherIframe);

    try {
      if (!mounted.iframe.contentWindow || !otherIframe.contentWindow) {
        throw new Error("HTML bridge test iframe has no contentWindow");
      }
      const message = { type: "plannotator-bridge-resize", height: 640 };
      await dispatchBridgeMessage(otherIframe.contentWindow, message);
      expect(heights).toEqual([]);

      await dispatchBridgeMessage(mounted.iframe.contentWindow, message);
      expect(heights).toEqual([640]);
    } finally {
      otherIframe.remove();
      await mounted.unmount();
    }
  });
});

describe("HtmlViewer ready messages", () => {
  test.skipIf(!hasDom)("ignores ready messages from another window", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const otherIframe = document.createElement("iframe");
    document.body.appendChild(otherIframe);

    try {
      await act(async () => {
        root.render(
          <HtmlViewer
            rawHtml="<p>Plan</p>"
            annotations={[]}
            onAddAnnotation={() => {}}
            onSelectAnnotation={() => {}}
            selectedAnnotationId={null}
            mode="selection"
            inputMethod="drag"
          />,
        );
      });
      const iframe = host.querySelector("iframe");
      if (!iframe?.contentWindow || !otherIframe.contentWindow) {
        throw new Error("HTML viewer test iframe has no contentWindow");
      }

      let outboundMessageCount = 0;
      iframe.contentWindow.postMessage = () => {
        outboundMessageCount++;
      };
      const ready = { type: "plannotator-bridge-ready" };
      await dispatchBridgeMessage(otherIframe.contentWindow, ready);
      expect(outboundMessageCount).toBe(0);

      await dispatchBridgeMessage(iframe.contentWindow, ready);
      expect(outboundMessageCount).toBeGreaterThan(0);
    } finally {
      await act(async () => root.unmount());
      otherIframe.remove();
      host.remove();
    }
  });
});
