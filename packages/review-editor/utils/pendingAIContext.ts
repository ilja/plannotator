import type { AnnotationSide } from '@pierre/diffs';
import type { DiffFile } from '../types';
import { extractLinesFromPatch } from './patchParser';

export interface PendingAIContext {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  side: 'old' | 'new';
  selectedCode?: string;
}

export function buildPendingAIContext(
  file: Pick<DiffFile, 'path' | 'patch'>,
  lineNumber: number,
  side: AnnotationSide,
): PendingAIContext {
  const questionSide = side === 'additions' ? 'new' : 'old';
  const selectedCode = extractLinesFromPatch(
    file.patch,
    lineNumber,
    lineNumber,
    questionSide,
  );

  return {
    filePath: file.path,
    lineStart: lineNumber,
    lineEnd: lineNumber,
    side: questionSide,
    ...(selectedCode && { selectedCode }),
  };
}
