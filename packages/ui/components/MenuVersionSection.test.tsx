import { afterEach, describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MenuVersionSection } from "./MenuVersionSection";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "__EFFECT_VERSION__");
});

describe("MenuVersionSection", () => {
  test("identifies the app and Effect versions", () => {
    Object.defineProperty(globalThis, "__EFFECT_VERSION__", {
      value: "4.0.0-test",
      configurable: true,
    });

    const markup = renderToStaticMarkup(
      <MenuVersionSection appVersion="1.2.3-test" closeMenu={() => {}} />,
    );

    expect(markup).toContain("v1.2.3-test · Effect v4.0.0-test");
  });
});
