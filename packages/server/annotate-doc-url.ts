import { dirname } from "path";

export interface AnnotateDocSessionParamsResult {
  url: string;
  changed: boolean;
}

export function applyAnnotateDocSessionParams(
  requestUrl: string,
  sourceFilePath: string,
  convertHtml: boolean,
): AnnotateDocSessionParamsResult {
  const docUrl = new URL(requestUrl);
  let changed = false;

  if (!docUrl.searchParams.has("base") && !/^https?:\/\//i.test(sourceFilePath)) {
    docUrl.searchParams.set("base", dirname(sourceFilePath));
    changed = true;
  }

  if (convertHtml && !docUrl.searchParams.has("convert")) {
    docUrl.searchParams.set("convert", "1");
    changed = true;
  }

  return { url: docUrl.toString(), changed };
}
