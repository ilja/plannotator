import type { Annotation } from '../types';

const CHOICE_ANNOTATION_PREFIX = 'ann-choice-';
let choiceAnnotationSequence = 0;

export const nextChoiceAnnotationId = () => {
  choiceAnnotationSequence += 1;
  return `${CHOICE_ANNOTATION_PREFIX}${Date.now()}-${choiceAnnotationSequence}`;
};

export const isChoiceAnnotation = (ann: Pick<Annotation, 'id'>) =>
  ann.id.startsWith(CHOICE_ANNOTATION_PREFIX);

export const isChoiceAnnotationForBlock = (
  ann: Pick<Annotation, 'id' | 'blockId'>,
  blockId: string,
) => isChoiceAnnotation(ann) && ann.blockId === blockId;
