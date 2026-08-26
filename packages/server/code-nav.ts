/**
 * Code navigation — Bun runtime adapter and request handler.
 */

import {
  decodeCodeNavRequest,
  type CodeNavRequest,
  type CodeNavResolveRequest,
  type CodeNavRuntime,
  type CodeNavResponse,
  resolveCodeNav,
  validateCodeNavRequest,
  extractChangedFiles,
} from "@plannotator/shared/code-nav";
import { Option, Predicate, Schema } from "effect";

export type { CodeNavRequest, CodeNavResponse };

const bunCodeNavRuntime: CodeNavRuntime = {
  async runCommand(command, args, options) {
    let proc;
    try {
      proc = Bun.spawn([command, ...args], {
        cwd: options?.cwd,
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch {
      return { stdout: "", stderr: "command not found", exitCode: 1 };
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (options?.timeoutMs) {
      timer = setTimeout(() => proc.kill(), options.timeoutMs);
    }

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (timer) clearTimeout(timer);
    return { stdout, stderr, exitCode };
  },
};

export async function handleCodeNavResolve(
  req: Request,
  cwd: string,
  changedFiles: string[],
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const decodedRequest = Option.getOrUndefined(decodeCodeNavRequest(body));
  if (!decodedRequest) {
    const error = Predicate.isObject(body) ? validateCodeNavRequest(body) : "Invalid request body";
    return Response.json({ error: error ?? "Invalid request body" }, { status: 400 });
  }

  const language = Option.getOrUndefined(
    Schema.decodeUnknownOption(Schema.String)(decodedRequest.language),
  );
  const resolveRequest: CodeNavResolveRequest =
    language === undefined
      ? {
          symbol: decodedRequest.symbol,
          filePath: decodedRequest.filePath,
          side: decodedRequest.side,
        }
      : {
          symbol: decodedRequest.symbol,
          filePath: decodedRequest.filePath,
          side: decodedRequest.side,
          language,
        };

  try {
    const result = await resolveCodeNav(bunCodeNavRuntime, resolveRequest, cwd, changedFiles);

    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Code navigation failed" },
      { status: 500 },
    );
  }
}

export { extractChangedFiles };
