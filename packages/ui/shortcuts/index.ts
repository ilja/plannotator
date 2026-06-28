export * from './core';
export * from './runtime';

// annotation editor scopes
export { annotationToolbarShortcuts, useAnnotationToolbarShortcuts } from './annotation-editor/annotationToolbar.shortcuts';
export { annotationPanelShortcuts, useAnnotationPanelShortcuts } from './annotation-editor/annotationPanel.shortcuts';
export { commentPopoverShortcuts } from './annotation-editor/commentPopover.shortcuts';
export { imageAnnotatorShortcuts, useImageAnnotatorShortcuts } from './annotation-editor/imageAnnotator.shortcuts';
export { inputMethodShortcuts } from './annotation-editor/inputMethod.shortcuts';
export { viewerShortcuts, useViewerShortcuts } from './annotation-editor/viewer.shortcuts';

// code-review scopes
export { reviewAnnotationToolbarShortcuts, useReviewAnnotationToolbarShortcuts } from './code-review/annotationToolbar.shortcuts';
export { reviewFileTreeShortcuts, useReviewFileTreeShortcuts } from './code-review/fileTree.shortcuts';
export { reviewPrCommentsShortcuts, useReviewPrCommentsShortcuts } from './code-review/prComments.shortcuts';
export { reviewAllFilesDiffShortcuts, useReviewAllFilesDiffShortcuts } from './code-review/allFilesDiff.shortcuts';
export { reviewAiShortcuts, useReviewAiShortcuts } from './code-review/ai.shortcuts';
export { reviewSuggestionModalShortcuts, useReviewSuggestionModalShortcuts } from './code-review/suggestionModal.shortcuts';
