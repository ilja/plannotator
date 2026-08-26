import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { storage } from "../utils/storage";
import { ThemeProvider, useTheme } from "./ThemeProvider";

const hasDom = process.env.DOM_TESTS === "1";
const MODE_STORAGE_KEY = "theme-provider-test-mode";
const COLOR_STORAGE_KEY = "theme-provider-test-color";
const roots: Root[] = [];
const containers: HTMLDivElement[] = [];
const storedValues = new Map<string, string>();
const realStorageMethods = {
  getItem: storage.getItem,
  setItem: storage.setItem,
  removeItem: storage.removeItem,
};

function ThemeModeProbe({ onMode }: { onMode: (mode: "dark" | "light") => void }) {
  onMode(useTheme().resolvedMode);
  return null;
}

function ThemeStateProbe({
  onState,
}: {
  onState: (state: { mode: string; colorTheme: string }) => void;
}) {
  const { mode, colorTheme } = useTheme();
  onState({ mode, colorTheme });
  return null;
}

async function renderTheme(defaultTheme: "dark" | "light", defaultColorTheme: string) {
  const container = document.createElement("div");
  const root = createRoot(container);
  let resolvedMode: "dark" | "light" | undefined;

  containers.push(container);
  roots.push(root);
  document.body.appendChild(container);

  await act(async () => {
    root.render(
      <ThemeProvider
        defaultTheme={defaultTheme}
        defaultColorTheme={defaultColorTheme}
        storageKey={MODE_STORAGE_KEY}
        colorThemeStorageKey={COLOR_STORAGE_KEY}
      >
        <ThemeModeProbe
          onMode={(mode) => {
            resolvedMode = mode;
          }}
        />
      </ThemeProvider>,
    );
  });

  return resolvedMode;
}

async function renderStoredTheme(
  storedMode: string,
  storedColorTheme: string,
  defaultTheme: "dark" | "light" = "dark",
  defaultColorTheme = "plannotator",
) {
  storage.getItem = (key) => storedValues.get(key) ?? null;
  storage.setItem = (key, value) => {
    storedValues.set(key, value);
  };
  storage.removeItem = (key) => {
    storedValues.delete(key);
  };
  storage.setItem(MODE_STORAGE_KEY, storedMode);
  storage.setItem(COLOR_STORAGE_KEY, storedColorTheme);

  const container = document.createElement("div");
  const root = createRoot(container);
  let state: { mode: string; colorTheme: string } | undefined;

  containers.push(container);
  roots.push(root);
  document.body.appendChild(container);

  await act(async () => {
    root.render(
      <ThemeProvider
        defaultTheme={defaultTheme}
        defaultColorTheme={defaultColorTheme}
        storageKey={MODE_STORAGE_KEY}
        colorThemeStorageKey={COLOR_STORAGE_KEY}
      >
        <ThemeStateProbe
          onState={(nextState) => {
            state = nextState;
          }}
        />
      </ThemeProvider>,
    );
  });

  return state;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  for (const container of containers.splice(0)) container.remove();

  storedValues.clear();
  storage.getItem = realStorageMethods.getItem;
  storage.setItem = realStorageMethods.setItem;
  storage.removeItem = realStorageMethods.removeItem;
  storage.removeItem(MODE_STORAGE_KEY);
  storage.removeItem(COLOR_STORAGE_KEY);
  document.documentElement.className = "";
});

describe("ThemeProvider stored settings", () => {
  test.skipIf(!hasDom)("accepts valid stored mode and color theme values", async () => {
    const state = await renderStoredTheme("light", "simple");

    expect(state).toEqual({ mode: "light", colorTheme: "simple" });
  });

  test.skipIf(!hasDom)(
    "falls back independently for malformed stored values without rewriting them",
    async () => {
      const state = await renderStoredTheme("not-a-mode", "not-a-theme", "light", "simple");

      expect(state).toEqual({ mode: "light", colorTheme: "simple" });
      expect(storage.getItem(MODE_STORAGE_KEY)).toBe("not-a-mode");
      expect(storage.getItem(COLOR_STORAGE_KEY)).toBe("not-a-theme");
    },
  );

  test.skipIf(!hasDom)("uses the color default without changing a valid stored mode", async () => {
    const state = await renderStoredTheme("light", "not-a-theme", "dark", "simple");

    expect(state).toEqual({ mode: "light", colorTheme: "simple" });
    expect(storage.getItem(MODE_STORAGE_KEY)).toBe("light");
    expect(storage.getItem(COLOR_STORAGE_KEY)).toBe("not-a-theme");
  });

  test.skipIf(!hasDom)(
    "uses the mode default without changing a valid stored color theme",
    async () => {
      const state = await renderStoredTheme("not-a-mode", "simple", "light", "plannotator");

      expect(state).toEqual({ mode: "light", colorTheme: "simple" });
      expect(storage.getItem(MODE_STORAGE_KEY)).toBe("not-a-mode");
      expect(storage.getItem(COLOR_STORAGE_KEY)).toBe("simple");
    },
  );

  test.skipIf(!hasDom)("uses each default for an empty stored value independently", async () => {
    const state = await renderStoredTheme("", "", "light", "simple");

    expect(state).toEqual({ mode: "light", colorTheme: "simple" });
  });
});

describe("ThemeProvider applied palette mode", () => {
  test.skipIf(!hasDom)(
    "applies a light-only palette without changing the resolved mode",
    async () => {
      const resolvedMode = await renderTheme("dark", "framer-light");

      expect(resolvedMode).toBe("dark");
      expect(document.documentElement.classList.contains("theme-framer-light")).toBeTrue();
      expect(document.documentElement.classList.contains("light")).toBeTrue();
    },
  );

  test.skipIf(!hasDom)(
    "applies a dark-only palette without changing the resolved mode",
    async () => {
      const resolvedMode = await renderTheme("light", "dracula");

      expect(resolvedMode).toBe("light");
      expect(document.documentElement.classList.contains("theme-dracula")).toBeTrue();
      expect(document.documentElement.classList.contains("light")).toBeFalse();
    },
  );
});
