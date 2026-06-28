import {
  annotationPanelShortcuts,
  annotationToolbarShortcuts,
  commentPopoverShortcuts,
  createShortcutRegistry,
  createShortcutScopeHook,
  defineShortcutScope,
  imageAnnotatorShortcuts,
  inputMethodShortcuts,
  viewerShortcuts,
  type ShortcutSurface,
} from '@plannotator/ui/shortcuts';

export const annotationEditorShortcuts = defineShortcutScope({
  id: 'annotation-editor',
  title: 'Annotation Editor',
  shortcuts: {
    submitAnnotations: {
      description: 'Send annotations',
      bindings: ['Mod+Enter'],
      section: 'Actions',
      displayOrder: 10,
    },
    quickSave: {
      description: 'Save to notes app',
      bindings: ['Mod+S'],
      section: 'Actions',
      hint: 'Opens Export if no default notes app is configured.',
      displayOrder: 20,
    },
    printPlan: {
      description: 'Print',
      bindings: ['Mod+P'],
      section: 'Actions',
      hint: 'Opens the browser print dialog for the current document.',
      displayOrder: 40,
    },
  },
});

export const useAnnotationEditorShortcuts = createShortcutScopeHook(annotationEditorShortcuts);

const annotateEditorSettingsShortcuts = defineShortcutScope({
  id: 'annotation-editor-settings',
  title: 'Annotation Editor',
  shortcuts: {
    submitAnnotations: annotationEditorShortcuts.shortcuts.submitAnnotations,
    quickSave: annotationEditorShortcuts.shortcuts.quickSave,
    printPlan: annotationEditorShortcuts.shortcuts.printPlan,
  },
});

const sharedPlanSurfaceShortcuts = [
  inputMethodShortcuts,
  annotationToolbarShortcuts,
  viewerShortcuts,
  commentPopoverShortcuts,
  annotationPanelShortcuts,
  imageAnnotatorShortcuts,
] as const;

export const annotateSettingsShortcutRegistry = createShortcutRegistry([
  annotateEditorSettingsShortcuts,
  ...sharedPlanSurfaceShortcuts,
] as const);

export const annotateSurface: ShortcutSurface = {
  slug: 'annotation-editor',
  title: 'Annotation editor',
  description: 'Shortcuts surfaced by the document annotation UI.',
  registry: annotateSettingsShortcutRegistry,
};
