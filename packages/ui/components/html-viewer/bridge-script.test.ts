import { describe, expect, test } from "bun:test";
import { BRIDGE_SCRIPT } from "./bridge-script";

interface BridgeParent {
  postMessage: (message: any) => void;
}

interface BridgeMessageEvent {
  source: BridgeParent | null;
  data: any;
}

interface BridgeWindow {
  addEventListener: (type: string, listener: (event: BridgeMessageEvent) => void) => void;
  dispatchMessage: (data: any, source?: BridgeParent | null) => void;
  innerHeight: number;
  requestAnimationFrame: (callback: () => void) => number;
}

interface BridgeElement {
  className: string;
  style: { cssText: string; display: string; top: string; left: string };
  classList: { add: (...classes: string[]) => void; remove: (...classes: string[]) => void };
  scrollIntoView: () => void;
  firstChild: null;
  parentNode: { insertBefore: () => void; removeChild: () => void; normalize: () => void };
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  nodeType?: number;
  tagName?: string;
  textContent?: string;
  parentElement?: null;
  ownerSVGElement?: null;
  getBoundingClientRect?: () => { top: number; left: number; width: number; height: number };
}

interface BridgeDocument {
  body: { scrollHeight: number; appendChild: (element: BridgeElement) => void };
  documentElement: {
    style: {
      setProperty: (key: string, value: string) => void;
      getPropertyValue: (key: string) => string;
    };
    classList: {
      add: (...classes: string[]) => void;
      remove: (...classes: string[]) => void;
    };
  };
  readyState: string;
  addEventListener: (type: string, listener: (event: any) => void) => void;
  querySelector: () => BridgeElement | null;
  querySelectorAll: () => BridgeElement[];
  createTreeWalker: () => {
    currentNode: { textContent: string; length: number };
    nextNode: () => boolean;
  };
  createRange: () => {
    setStart: () => void;
    setEnd: () => void;
    surroundContents: (mark: BridgeElement) => void;
  };
  createElement: () => BridgeElement;
  dispatchEvent: (type: string, event: any) => void;
}

function createBridgeRuntime() {
  const messageListeners: Array<(event: BridgeMessageEvent) => void> = [];
  const documentListeners = new Map<string, Array<(event: any) => void>>();
  const styleValues = new Map<string, string>();
  const marks: BridgeElement[] = [];
  const createdMarks: BridgeElement[] = [];
  let scrollCount = 0;
  let focused = false;
  let removedCount = 0;
  const parentMessages: any[] = [];

  const parent: BridgeParent = {
    postMessage: (message: any) => {
      parentMessages.push(message);
    },
  };

  const bridgeWindow: BridgeWindow = {
    addEventListener: (type, listener) => {
      if (type === "message") messageListeners.push(listener);
    },
    dispatchMessage: (data, source = parent) => {
      for (const listener of messageListeners) listener({ data, source });
    },
    innerHeight: 800,
    requestAnimationFrame: (callback) => {
      callback();

      return 1;
    },
  };

  const createMark = (): BridgeElement => {
    const attributes = new Map<string, string>();
    let className = "";

    return {
      style: { cssText: "", display: "", top: "", left: "" },
      get className() {
        return className;
      },
      set className(value: string) {
        className = value;
      },
      classList: {
        add: (...classes) => {
          className = `${className} ${classes.join(" ")}`.trim();

          if (classes.includes("focused")) focused = true;
        },
        remove: (...classes) => {
          className = className
            .split(" ")
            .filter((value) => !classes.includes(value))
            .join(" ");

          if (classes.includes("focused")) focused = false;
        },
      },
      scrollIntoView: () => {
        scrollCount += 1;
      },
      firstChild: null,
      parentNode: {
        insertBefore: () => {},
        removeChild: () => {
          removedCount += 1;
        },
        normalize: () => {},
      },
      setAttribute: (name, value) => {
        attributes.set(name, value);
      },
      getAttribute: (name) => attributes.get(name) ?? null,
    };
  };

  const hoverElement = createMark();
  hoverElement.nodeType = 1;
  hoverElement.tagName = "P";
  hoverElement.textContent = "hover";
  hoverElement.parentElement = null;
  hoverElement.ownerSVGElement = null;
  hoverElement.getBoundingClientRect = () => ({ top: 100, left: 100, width: 50, height: 20 });

  const bridgeDocument: BridgeDocument = {
    body: { scrollHeight: 0, appendChild: () => {} },
    documentElement: {
      style: {
        setProperty: (key, value) => {
          styleValues.set(key, value);
        },
        getPropertyValue: (key) => styleValues.get(key) ?? "",
      },
      classList: { add: () => {}, remove: () => {} },
    },
    readyState: "complete",
    addEventListener: (type, listener) => {
      const listeners = documentListeners.get(type) ?? [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    },
    dispatchEvent: (type, event) => {
      for (const listener of documentListeners.get(type) ?? []) listener(event);
    },
    querySelector: () => marks[0] ?? null,
    querySelectorAll: () => marks,
    createTreeWalker: () => {
      let yielded = false;

      return {
        currentNode: { textContent: "text", length: 4 },
        nextNode: () => {
          if (yielded) return false;
          yielded = true;

          return true;
        },
      };
    },
    createRange: () => ({ setStart: () => {}, setEnd: () => {}, surroundContents: () => {} }),
    createElement: () => {
      const mark = createMark();
      createdMarks.push(mark);

      return mark;
    },
  };

  // SAFETY: the injected script is invoked with the exact mock globals declared above.
  const executeBridge = Function("window", "document", "parent", "NodeFilter", BRIDGE_SCRIPT) as (
    window: BridgeWindow,
    document: BridgeDocument,
    parent: BridgeParent,
    nodeFilter: { SHOW_TEXT: number },
  ) => void;

  executeBridge(bridgeWindow, bridgeDocument, parent, { SHOW_TEXT: 4 });
  marks.push(createMark());

  return {
    bridgeWindow,
    bridgeDocument,
    parent,
    parentMessages,
    marks,
    createdMarks,
    hoverElement,
    get scrollCount() {
      return scrollCount;
    },
    get focused() {
      return focused;
    },
    get removedCount() {
      return removedCount;
    },
  };
}

describe("BRIDGE_SCRIPT inbound message validation", () => {
  test("requires parent provenance and validates theme tokens", () => {
    const { bridgeWindow, bridgeDocument, parent } = createBridgeRuntime();
    bridgeDocument.documentElement.style.setProperty("--bridge-test", "initial");

    bridgeWindow.dispatchMessage(
      {
        type: "plannotator-bridge-theme",
        tokens: { "--bridge-test": "unsafe" },
        isLight: true,
      },
      null,
    );
    expect(bridgeDocument.documentElement.style.getPropertyValue("--bridge-test")).toBe("initial");

    bridgeWindow.dispatchMessage(
      {
        type: "plannotator-bridge-theme",
        tokens: { "--bridge-test": 42 },
        isLight: true,
      },
      parent,
    );
    expect(bridgeDocument.documentElement.style.getPropertyValue("--bridge-test")).toBe("initial");

    bridgeWindow.dispatchMessage(
      {
        type: "plannotator-bridge-theme",
        tokens: { "--bridge-test": "safe" },
        isLight: true,
      },
      parent,
    );
    expect(bridgeDocument.documentElement.style.getPropertyValue("--bridge-test")).toBe("safe");
  });

  test("ignores malformed and unknown messages without changing runtime state", () => {
    const runtime = createBridgeRuntime();
    const parentMessageCount = runtime.parentMessages.length;
    const createdMarkCount = runtime.createdMarks.length;
    const removedCount = runtime.removedCount;
    const scrollCount = runtime.scrollCount;
    const focused = runtime.focused;

    const malformedMessages: any[] = [
      { type: "plannotator-bridge-unknown" },
      { type: "plannotator-bridge-remove-mark", id: 42 },
      { type: "plannotator-bridge-scroll-to", id: "" },
      { type: "plannotator-bridge-focus-mark", id: 42 },
      { type: "plannotator-bridge-find-and-mark", id: "bad-text", originalText: 42 },
    ];

    for (const message of malformedMessages)
      runtime.bridgeWindow.dispatchMessage(message, runtime.parent);

    expect(runtime.parentMessages).toHaveLength(parentMessageCount);
    expect(runtime.createdMarks).toHaveLength(createdMarkCount);
    expect(runtime.removedCount).toBe(removedCount);
    expect(runtime.scrollCount).toBe(scrollCount);
    expect(runtime.focused).toBe(focused);
  });

  test("foreign find requests cannot create marks or responses", () => {
    const runtime = createBridgeRuntime();
    const parentMessageCount = runtime.parentMessages.length;
    runtime.bridgeWindow.dispatchMessage(
      {
        type: "plannotator-bridge-find-and-mark",
        id: "foreign",
        originalText: "text",
      },
      null,
    );

    expect(runtime.parentMessages).toHaveLength(parentMessageCount);
    expect(runtime.createdMarks).toHaveLength(0);
  });

  test("handles every mark variant, unknown messages, malformed values, and defaults", () => {
    const runtime = createBridgeRuntime();
    const { bridgeWindow, parentMessages, parent } = runtime;

    const messages: any[] = [
      { type: "plannotator-bridge-create-mark", id: "create-1" },
      { type: "plannotator-bridge-find-and-mark", id: "find-1", originalText: "text" },
      {
        type: "plannotator-bridge-find-and-mark",
        id: "find-deletion",
        originalText: "text",
        annotationType: "deletion",
      },
      {
        type: "plannotator-bridge-find-and-mark",
        id: "find-invalid-type",
        originalText: "text",
        annotationType: {},
      },
      { type: "plannotator-bridge-remove-mark", id: "missing" },
      { type: "plannotator-bridge-clear-marks" },
      { type: "plannotator-bridge-scroll-to", id: "missing" },
      { type: "plannotator-bridge-focus-mark", id: null },
      { type: "plannotator-bridge-focus-mark", id: "mark" },
      { type: "plannotator-bridge-set-input-method", method: "unknown" },
      { type: "plannotator-bridge-set-input-method", method: "pinpoint" },
      { type: "plannotator-bridge-unknown" },
      { type: "plannotator-bridge-remove-mark", id: "" },
      { type: "plannotator-bridge-find-and-mark", id: "bad-text", originalText: 42 },
    ];

    bridgeWindow.dispatchMessage(
      {
        type: "plannotator-bridge-find-and-mark",
        id: "foreign",
        originalText: "text",
      },
      null,
    );

    for (const message of messages) bridgeWindow.dispatchMessage(message, parent);
    runtime.bridgeDocument.dispatchEvent("mousemove", { target: runtime.hoverElement });
    expect(runtime.hoverElement.className).toContain("plannotator-pinpoint-hover");
    bridgeWindow.dispatchMessage(
      { type: "plannotator-bridge-set-input-method", method: "mouse" },
      parent,
    );
    expect(runtime.hoverElement.className).not.toContain("plannotator-pinpoint-hover");

    expect(runtime.createdMarks.map((mark) => mark.className).filter(Boolean)).toEqual([
      "annotation-highlight comment",
      "annotation-highlight deletion",
      "annotation-highlight comment",
    ]);
    expect(runtime.scrollCount).toBe(1);
    expect(runtime.focused).toBe(true);
    expect(runtime.removedCount).toBeGreaterThan(0);
    expect(parentMessages).not.toContainEqual(expect.objectContaining({ id: "foreign" }));
    expect(parentMessages).toContainEqual({
      type: "plannotator-bridge-mark-applied",
      id: "find-1",
      success: true,
    });
    expect(parentMessages).not.toContainEqual(expect.objectContaining({ id: "" }));
  });
});
