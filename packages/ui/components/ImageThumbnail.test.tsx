import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ImageThumbnail } from "./ImageThumbnail";

const hasDom = globalThis.document !== undefined;

const roots: Root[] = [];

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * Mounts the thumbnail with its synthetic resource error gated.
 *
 * happy-dom fires a resource `error` for every image (no network), so ungated
 * the component lands in `failed` during commit and the loading/loaded arms
 * are unobservable. The gate is a capture listener scoped to the mounted host
 * that swallows that synthetic error before React's container listener sees
 * it. Callers ungate and then drive `loaded`/`failed` with manual dispatches.
 */
async function mountThumbnail(): Promise<{ host: HTMLDivElement; ungate: () => void }> {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const gate = (event: Event): void => {
    if (event.target instanceof HTMLImageElement && host.contains(event.target)) {
      event.stopPropagation();
    }
  };

  document.addEventListener("error", gate, true);

  const ungate = (): void => document.removeEventListener("error", gate, true);

  const root = createRoot(host);
  roots.push(root);

  try {
    await act(async () => {
      root.render(<ImageThumbnail path="foo.png" showRemove={false} />);
      await flushAsyncWork();
    });
  } catch (error) {
    ungate();

    throw error;
  }

  return { host, ungate };
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }

  if (hasDom) document.body.innerHTML = "";
});

describe("ImageThumbnail load lifecycle", () => {
  test.skipIf(!hasDom)("shows a skeleton while loading", async () => {
    const { host, ungate } = await mountThumbnail();

    try {
      expect(host.querySelector(".animate-pulse")).not.toBeNull();
      expect(host.querySelector("img")).not.toBeNull();
    } finally {
      ungate();
    }
  });

  test.skipIf(!hasDom)("keeps the image once loaded", async () => {
    const { host, ungate } = await mountThumbnail();

    try {
      const img = host.querySelector("img");

      if (!(img instanceof HTMLImageElement)) throw new Error("img did not render");

      await act(async () => {
        img.dispatchEvent(new Event("load"));
      });

      expect(host.querySelector(".animate-pulse")).toBeNull();
      expect(host.querySelector("img")).not.toBeNull();
    } finally {
      ungate();
    }
  });

  test.skipIf(!hasDom)("shows the fallback when loading fails", async () => {
    const { host, ungate } = await mountThumbnail();
    const img = host.querySelector("img");

    ungate();

    if (!(img instanceof HTMLImageElement)) throw new Error("img did not render");

    await act(async () => {
      img.dispatchEvent(new Event("error"));
    });

    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector(".animate-pulse")).toBeNull();
    expect(host.querySelector("svg")).not.toBeNull();
  });
});
