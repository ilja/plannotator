import type {
  Annotation,
  ChoiceQuestionOption,
  ChoiceValidationEvidence,
} from '../types';

const CHOICE_ANNOTATION_PREFIX = 'ann-choice-';
let choiceAnnotationSequence = 0;

export interface ChoiceQuestion {
  question: string;
  options: ChoiceQuestionOption[];
  recommendedLabel?: string;
  sourceText: string;
  sourceLineCount: number;
}

type ChoiceQuestionIdentity = Pick<ChoiceQuestion, 'question' | 'options'>;

export type ChoiceSelectionOutcome =
  | {
      kind: 'selected';
      option: ChoiceQuestionOption;
      validationEvidence: ChoiceValidationEvidence;
      replacedAnnotationId?: string;
    }
  | {
      kind: 'cleared';
      removedAnnotationId: string;
    }
  | {
      kind: 'invalid';
    };

export interface ChoiceReconciliationResult {
  retained: Annotation[];
  invalidatedIds: string[];
}

const OPTION_RE = /^(\s*)-\s+Option\s+([^:]+):\s+(.+)\s*$/;
const RICH_OPTION_RE = /^(\s*)(?:-\s+)?Option\s+([^:]+):\s+(.+)\s*$/;
const RECOMMENDATION_RE = /^\s*Rec(?:ommendation|comendation):\s+(.+?)\s*$/i;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeLineEndings = (value: string): string => value.replace(/\r\n?/g, '\n');

const isChoiceOption = (value: unknown): value is ChoiceQuestionOption => (
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ChoiceQuestionOption).label === 'string' &&
  typeof (value as ChoiceQuestionOption).text === 'string'
);

const hasUniqueOptionLabels = (options: readonly ChoiceQuestionOption[]): boolean => {
  const labels = new Set(options.map(option => option.label));
  return labels.size === options.length;
};

const isChoiceQuestionIdentity = (value: unknown): value is ChoiceQuestionIdentity => (
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ChoiceQuestionIdentity).question === 'string' &&
  Array.isArray((value as ChoiceQuestionIdentity).options) &&
  (value as ChoiceQuestionIdentity).options.every(isChoiceOption) &&
  hasUniqueOptionLabels((value as ChoiceQuestionIdentity).options)
);

const isParsedChoiceQuestion = (value: unknown): value is ChoiceQuestion & { blockId: string } => (
  isChoiceQuestionIdentity(value) &&
  typeof (value as ChoiceQuestion & { blockId: string }).blockId === 'string' &&
  typeof (value as ChoiceQuestion).sourceText === 'string' &&
  typeof (value as ChoiceQuestion).sourceLineCount === 'number'
);

const isChoiceValidationEvidence = (value: unknown): value is ChoiceValidationEvidence => (
  isChoiceQuestionIdentity(value) &&
  value.options.every(isChoiceOption)
);

const matchesRecommendedLabel = (text: string, label: string): boolean => {
  if (!/\bOptions?\b/.test(text)) return false;

  return new RegExp(`\\b${escapeRegExp(label)}\\b`).test(text);
};

const findRecommendedLabel = (
  options: ChoiceQuestionOption[],
  recommendationLine: string | undefined,
): string | undefined => {
  const recommendationText = recommendationLine?.match(RECOMMENDATION_RE)?.[1].trim();
  const matchingLabels = recommendationText
    ? options
      .filter(option => matchesRecommendedLabel(recommendationText, option.label))
      .map(option => option.label)
    : [];

  return matchingLabels.length === 1 ? matchingLabels[0] : undefined;
};

const parseStrictChoiceQuestion = (
  lines: string[],
  paragraphLines: string[],
  nextIndex: number,
): ChoiceQuestion | null => {
  const options: ChoiceQuestionOption[] = [];
  let i = nextIndex + 1;
  let optionIndent: number | undefined;

  while (i < lines.length) {
    const match = lines[i].match(OPTION_RE);
    if (!match) break;

    const currentIndent = match[1].length;
    optionIndent ??= currentIndent;
    if (currentIndent !== optionIndent) break;

    const optionTextLines = [match[3].trim()];
    i += 1;

    while (i < lines.length) {
      const nextOptionMatch = lines[i].match(OPTION_RE);
      if (nextOptionMatch && nextOptionMatch[1].length === optionIndent) break;
      if (lines[i].trim() === '') break;
      if ((lines[i].match(/^\s*/)?.[0].length ?? 0) <= optionIndent) break;

      optionTextLines.push(lines[i].trim());
      i += 1;
    }

    options.push({ label: match[2].trim(), text: optionTextLines.join('\n') });
  }

  if (options.length < 2) return null;
  if (i < lines.length && lines[i]?.trim() !== '') return null;

  const recommendationLine = i < lines.length ? lines[i + 1] : undefined;
  const recommendationMatch = recommendationLine?.match(RECOMMENDATION_RE);
  const endIndex = recommendationMatch ? i + 1 : i - 1;

  return {
    question: paragraphLines.join('\n'),
    options,
    recommendedLabel: findRecommendedLabel(options, recommendationLine),
    sourceText: lines.slice(0, endIndex + 1).join('\n'),
    sourceLineCount: endIndex + 1,
  };
};

const parseRichChoiceQuestion = (
  lines: string[],
  paragraphLines: string[],
  nextIndex: number,
): ChoiceQuestion | null => {
  const optionOffset = paragraphLines.findIndex((line, index) => (
    index > 0 && RICH_OPTION_RE.test(line)
  ));
  const optionStartIndex = optionOffset >= 0 ? optionOffset : nextIndex + 1;
  const firstOptionMatch = lines[optionStartIndex]?.match(RICH_OPTION_RE);
  if (!firstOptionMatch) return null;

  const questionLines = optionOffset >= 0
    ? paragraphLines.slice(0, optionOffset)
    : paragraphLines;
  let recommendationIndex = -1;

  for (let i = optionStartIndex + 1; i < lines.length; i += 1) {
    if (/^#{1,6}(?:\s|$)/.test(lines[i].trim())) return null;
    if (RECOMMENDATION_RE.test(lines[i])) {
      recommendationIndex = i;
      break;
    }
  }
  if (recommendationIndex < 0) return null;

  const optionIndent = firstOptionMatch[1].length;
  const optionHeaders: Array<{ index: number; match: RegExpMatchArray }> = [];
  for (let i = optionStartIndex; i < recommendationIndex; i += 1) {
    const match = lines[i].match(RICH_OPTION_RE);
    if (match && match[1].length === optionIndent) {
      optionHeaders.push({ index: i, match });
    }
  }
  if (optionHeaders.length < 2) return null;

  const options = optionHeaders.map(({ index, match }, optionIndex) => {
    const nextHeaderIndex = optionHeaders[optionIndex + 1]?.index ?? recommendationIndex;
    const textLines = [match[3].trim(), ...lines.slice(index + 1, nextHeaderIndex)];
    while (textLines.at(-1)?.trim() === '') textLines.pop();

    return {
      label: match[2].trim(),
      text: textLines.map(line => line.trim()).join('\n'),
    };
  });

  return {
    question: questionLines.join('\n'),
    options,
    recommendedLabel: findRecommendedLabel(options, lines[recommendationIndex]),
    sourceText: lines.slice(0, recommendationIndex + 1).join('\n'),
    sourceLineCount: recommendationIndex + 1,
  };
};

/** Parse one candidate choice-question source segment without parser cursor state. */
export const parseChoiceQuestion = (sourceText: string): ChoiceQuestion | null => {
  const lines = normalizeLineEndings(sourceText).split('\n');
  const nextIndex = lines.findIndex(line => line.trim() === '');
  if (nextIndex <= 0) return null;

  const paragraphLines = lines.slice(0, nextIndex);
  const choice = parseStrictChoiceQuestion(lines, paragraphLines, nextIndex)
    ?? parseRichChoiceQuestion(lines, paragraphLines, nextIndex);
  if (!choice) return null;

  return hasUniqueOptionLabels(choice.options) ? choice : null;
};

export const nextChoiceAnnotationId = () => {
  choiceAnnotationSequence += 1;
  return `${CHOICE_ANNOTATION_PREFIX}${Date.now()}-${choiceAnnotationSequence}`;
};

export const isChoiceAnnotation = (ann: Pick<Annotation, 'id'>) =>
  typeof ann === 'object' &&
  ann !== null &&
  typeof ann.id === 'string' &&
  ann.id.startsWith(CHOICE_ANNOTATION_PREFIX);

export const isChoiceAnnotationForBlock = (
  ann: Pick<Annotation, 'id' | 'blockId'>,
  blockId: string,
) => isChoiceAnnotation(ann) && ann.blockId === blockId;

export const selectChoiceOption = (
  current: Pick<Annotation, 'id' | 'choiceOptionLabel'> | undefined,
  question: ChoiceQuestionIdentity,
  option: ChoiceQuestionOption,
): ChoiceSelectionOutcome => {
  if (!isChoiceQuestionIdentity(question) || !isChoiceOption(option)) {
    return { kind: 'invalid' };
  }
  const matchingOption = question.options.find(currentOption => (
    currentOption.label === option.label && currentOption.text === option.text
  ));
  if (!matchingOption) return { kind: 'invalid' };
  if (current && (
    typeof current.id !== 'string' ||
    (current.choiceOptionLabel !== undefined && (
      typeof current.choiceOptionLabel !== 'string' ||
      !question.options.some(currentOption => currentOption.label === current.choiceOptionLabel)
    ))
  )) {
    return { kind: 'invalid' };
  }
  if (current?.choiceOptionLabel === option.label) {
    return {
      kind: 'cleared',
      removedAnnotationId: current.id,
    };
  }

  return {
    kind: 'selected',
    option: matchingOption,
    validationEvidence: {
      question: question.question,
      options: question.options.map(currentOption => ({ ...currentOption })),
    },
    replacedAnnotationId: current?.id,
  };
};

const optionsMatch = (
  left: readonly ChoiceQuestionOption[],
  right: readonly ChoiceQuestionOption[],
): boolean => (
  left.length === right.length &&
  left.every((option, index) => (
    normalizeLineEndings(option.label) === normalizeLineEndings(right[index].label) &&
    normalizeLineEndings(option.text) === normalizeLineEndings(right[index].text)
  ))
);

const evidenceMatchesQuestion = (
  evidence: ChoiceValidationEvidence,
  question: ChoiceQuestionIdentity,
): boolean => (
  normalizeLineEndings(evidence.question) === normalizeLineEndings(question.question) &&
  optionsMatch(evidence.options, question.options)
);

export const reconcileChoiceAnnotations = (
  annotations: readonly Annotation[],
  questions: ReadonlyArray<ChoiceQuestion & { blockId: string }>,
): ChoiceReconciliationResult => {
  const invalidatedIds: string[] = [];
  const retained: Annotation[] = [];
  const validQuestions = Array.isArray(questions) ? questions.filter(isParsedChoiceQuestion) : [];
  if (!Array.isArray(annotations)) return { retained, invalidatedIds };

  for (const annotation of annotations) {
    if (!isChoiceAnnotation(annotation)) {
      retained.push(annotation);
      continue;
    }

    const evidence = annotation.choiceValidationEvidence;
    if (
      !isChoiceValidationEvidence(evidence) ||
      typeof annotation.choiceOptionLabel !== 'string' ||
      typeof annotation.originalText !== 'string'
    ) {
      invalidatedIds.push(annotation.id);
      continue;
    }

    const matches = validQuestions.filter(question => evidenceMatchesQuestion(evidence, question));
    if (matches.length !== 1) {
      invalidatedIds.push(annotation.id);
      continue;
    }

    const question = matches[0];
    const selectedOption = question.options.find(option => (
      normalizeLineEndings(option.label) === normalizeLineEndings(annotation.choiceOptionLabel!)
    ));
    if (!selectedOption || normalizeLineEndings(selectedOption.text) !== normalizeLineEndings(annotation.originalText)) {
      invalidatedIds.push(annotation.id);
      continue;
    }

    retained.push({
      ...annotation,
      blockId: question.blockId,
      startMeta: undefined,
      endMeta: undefined,
    });
  }

  return { retained, invalidatedIds };
};
