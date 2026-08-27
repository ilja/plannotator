import { describe, expect, test } from "bun:test";
describe("Framer Light Shiki theme", () => {
  test("loads the upstream TypeScript token colors in an isolated highlighter", async () => {
    const themeModule = new URL("./framerLightSyntax.ts", import.meta.url).href;
    const script = `
      import { getSharedHighlighter } from "@pierre/diffs";
      import { FRAMER_LIGHT_SYNTAX_THEME_NAME } from ${JSON.stringify(themeModule)};

      const highlighter = await getSharedHighlighter({
        themes: [FRAMER_LIGHT_SYNTAX_THEME_NAME],
        langs: ["typescript"],
      });
      console.log(highlighter.codeToHtml(
        \`const enabled = true;
if (enabled) {
  const message = "hello";
  console.log(message);
}
function getAnswer() {
  return 42;
}\`,
        { lang: "typescript", theme: FRAMER_LIGHT_SYNTAX_THEME_NAME },
      ));
    `;
    const child = Bun.spawn(["bun", "-e", script], {
      cwd: import.meta.dir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("#0099FF");
    expect(stdout).toContain("#00BBCC");
    expect(stdout).toContain("#FF8866");
    expect(stdout).toContain("#8855FF");
    expect(stdout).toContain("#FFAA00");
  });
});
