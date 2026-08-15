import { describe, expect, test } from 'bun:test';
import {
  parseChoiceQuestion,
  reconcileChoiceAnnotations,
  selectChoiceOption,
} from './choiceAnnotations';
import { AnnotationType, type Annotation, type ChoiceQuestionOption } from '../types';
import {
  createShortShareUrl,
  fromShareable,
  loadFromPasteId,
  toShareable,
} from './sharing';
import { parseMarkdownToBlocks } from './parser';

const options: ChoiceQuestionOption[] = [
  { label: 'A', text: 'Keep the current flow' },
  { label: 'B', text: 'Add the widget' },
];

const source = `Which approach should we take?

- Option A: Keep the current flow
- Option B: Add the widget

Recommendation: Option B.`;

const question = {
  question: 'Which approach should we take?',
  options,
  recommendedLabel: 'B',
  sourceText: source,
  sourceLineCount: 6,
};

const choiceQuestionsFromMarkdown = (markdown: string) => parseMarkdownToBlocks(markdown).flatMap(block => (
  block.type === 'choice-question'
    ? [{
        blockId: block.id,
        question: block.content,
        options: block.choiceOptions ?? [],
        recommendedLabel: block.recommendedChoiceLabel,
        sourceText: block.sourceText ?? block.content,
        sourceLineCount: block.sourceLineCount ?? 1,
      }]
    : []
));

const annotation = (
  overrides: Partial<Annotation> = {},
): Annotation => ({
  id: 'ann-choice-1',
  blockId: 'block-old',
  startOffset: 0,
  endOffset: options[1].text.length,
  type: AnnotationType.COMMENT,
  text: '👍 Selected Option',
  originalText: options[1].text,
  createdA: 1,
  choiceOptionLabel: 'B',
  choiceValidationEvidence: {
    question: question.question,
    options: question.options,
  },
  ...overrides,
});

describe('choiceAnnotations', () => {
  describe('parseChoiceQuestion', () => {
    test('parses a strict choice question without exposing parser cursor state', () => {
      expect(parseChoiceQuestion(source)).toEqual(question);
    });

    test('parses rich choice questions with multiline option text', () => {
      const richSource = `Pick one
Option A: Alpha

Details for alpha.

Option B: Beta

Details for beta.

Reccomendation: Option A, because it is best.`;

      expect(parseChoiceQuestion(richSource)).toEqual({
        question: 'Pick one',
        options: [
          { label: 'A', text: 'Alpha\n\nDetails for alpha.' },
          { label: 'B', text: 'Beta\n\nDetails for beta.' },
        ],
        recommendedLabel: 'A',
        sourceText: richSource,
        sourceLineCount: 10,
      });
    });

    test('returns null for incomplete choice-looking Markdown', () => {
      expect(parseChoiceQuestion('Pick one\n\n- Option A: Alpha')).toBeNull();
    });

    test('rejects duplicate option labels in strict syntax', () => {
      expect(parseChoiceQuestion(`Pick one

- Option A: Alpha
- Option A: Another alpha

Recommendation: Option A.`)).toBeNull();
    });

    test('rejects duplicate option labels in rich syntax', () => {
      expect(parseChoiceQuestion(`Pick one
Option A: Alpha

Option A: Another alpha

Recommendation: Option A.`)).toBeNull();
    });
  });

  describe('selectChoiceOption', () => {
    test('selects an option when no decision exists', () => {
      expect(selectChoiceOption(undefined, question, options[0])).toEqual({
        kind: 'selected',
        option: options[0],
        validationEvidence: {
          question: question.question,
          options: question.options,
        },
      });
    });

    test('replaces a different selected option', () => {
      expect(
        selectChoiceOption(
          { id: 'ann-choice-old', choiceOptionLabel: 'A' },
          question,
          options[1],
        ),
      ).toEqual({
        kind: 'selected',
        option: options[1],
        validationEvidence: {
          question: question.question,
          options: question.options,
        },
        replacedAnnotationId: 'ann-choice-old',
      });
    });

    test('clears the selected option when it is selected again', () => {
      expect(
        selectChoiceOption(
          { id: 'ann-choice-old', choiceOptionLabel: 'B' },
          question,
          options[1],
        ),
      ).toEqual({
        kind: 'cleared',
        removedAnnotationId: 'ann-choice-old',
      });
    });

    test('rejects an option that is not part of the question', () => {
      expect(
        selectChoiceOption(
          undefined,
          question,
          { label: 'C', text: 'Unknown' },
        ),
      ).toEqual({ kind: 'invalid' });
    });
  });

  describe('choice evidence persistence', () => {
    test('preserves validation evidence through the shareable envelope', () => {
      const original = annotation();
      const restored = fromShareable(
        toShareable([original]),
        null,
        null,
        [original.choiceValidationEvidence!],
        [original.choiceOptionLabel!],
      );

      expect(restored[0].id).toMatch(/^ann-choice-/);
      expect(restored[0].choiceOptionLabel).toBe(original.choiceOptionLabel);
      expect(restored[0].choiceValidationEvidence).toEqual(original.choiceValidationEvidence);
    });

    test('preserves choice metadata through a short-share payload', async () => {
      const originalFetch = globalThis.fetch;
      let ciphertext = '';
      globalThis.fetch = (async (_input, init) => {
        if (init?.method === 'POST') {
          ciphertext = (JSON.parse(String(init.body)) as { data: string }).data;
          return new Response(JSON.stringify({ id: 'short-choice' }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: ciphertext }), { status: 200 });
      }) as typeof fetch;

      try {
        const original = annotation();
        const result = await createShortShareUrl(
          source,
          [original],
          [],
          { pasteApiUrl: 'https://paste.test', shareBaseUrl: 'https://share.test' },
        );
        expect(result?.id).toBe('short-choice');

        const fragment = new URL(result!.shortUrl).hash.slice(1);
        const key = new URLSearchParams(fragment).get('key');
        const payload = await loadFromPasteId('short-choice', 'https://paste.test', key ?? undefined);
        expect(payload?.cv?.[0]).toEqual(original.choiceValidationEvidence);
        expect(payload?.co?.[0]).toBe(original.choiceOptionLabel);

        const restored = fromShareable(payload!.a, payload!.d, payload!.s, payload!.cv, payload!.co);
        expect(restored[0].id).toMatch(/^ann-choice-/);
        expect(restored[0].choiceOptionLabel).toBe('B');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('document integration', () => {
    test('reconciles parsed document versions and remaps the rendering anchor', () => {
      const oldQuestion = choiceQuestionsFromMarkdown(source)[0];
      const updatedSource = `# Context\n\n${source.replace(
        'Recommendation: Option B.',
        'Recommendation: Option A.',
      )}`;
      const newQuestion = choiceQuestionsFromMarkdown(updatedSource)[0];
      const ordinary = annotation({
        id: 'ann-comment-1',
        blockId: 'block-ordinary',
        choiceOptionLabel: undefined,
        choiceValidationEvidence: undefined,
      });

      const result = reconcileChoiceAnnotations(
        [annotation({ blockId: oldQuestion.blockId }), ordinary],
        [newQuestion],
      );

      expect(result.invalidatedIds).toEqual([]);
      expect(result.retained).toEqual([
        expect.objectContaining({ id: 'ann-choice-1', blockId: newQuestion.blockId }),
        ordinary,
      ]);
    });

    test('invalidates a decision when the updated source no longer parses as a choice', () => {
      const failedSource = source.replace('- Option B: Add the widget', '- Variant B: Add the widget');
      expect(choiceQuestionsFromMarkdown(failedSource)).toEqual([]);

      const result = reconcileChoiceAnnotations(
        [annotation()],
        choiceQuestionsFromMarkdown(failedSource),
      );

      expect(result.retained).toEqual([]);
      expect(result.invalidatedIds).toEqual(['ann-choice-1']);
    });

    test('invalidates a decision when parsed questions are duplicated', () => {
      const duplicateSource = `${source}\n\n${source}`;
      const duplicateQuestions = choiceQuestionsFromMarkdown(duplicateSource);
      expect(duplicateQuestions).toHaveLength(2);

      const result = reconcileChoiceAnnotations([annotation()], duplicateQuestions);

      expect(result.retained).toEqual([]);
      expect(result.invalidatedIds).toEqual(['ann-choice-1']);
    });

    test('retains ordinary annotations and removes legacy choice records together', () => {
      const ordinary = annotation({
        id: 'ann-comment-1',
        blockId: 'block-ordinary',
        choiceOptionLabel: undefined,
        choiceValidationEvidence: undefined,
      });
      const legacy = annotation({
        id: 'ann-choice-legacy',
        choiceValidationEvidence: undefined,
      });

      const result = reconcileChoiceAnnotations(
        [ordinary, legacy],
        choiceQuestionsFromMarkdown(source),
      );

      expect(result.retained).toEqual([ordinary]);
      expect(result.invalidatedIds).toEqual(['ann-choice-legacy']);
    });
  });

  describe('reconcileChoiceAnnotations', () => {
    test('retains a uniquely matching decision and remaps its rendering anchor', () => {
      const ordinary = annotation({
        id: 'ann-comment-1',
        blockId: 'block-ordinary',
        choiceOptionLabel: undefined,
        choiceValidationEvidence: undefined,
      });
      const result = reconcileChoiceAnnotations(
        [ordinary, annotation()],
        [{ ...question, blockId: 'block-new' }],
      );

      expect(result.invalidatedIds).toEqual([]);
      expect(result.retained).toEqual([
        ordinary,
        expect.objectContaining({ id: 'ann-choice-1', blockId: 'block-new' }),
      ]);
    });

    test('normalizes line endings when comparing evidence', () => {
      const stored = annotation({
        originalText: 'Add the\r\nwidget',
        choiceValidationEvidence: {
          question: 'Which approach\r\nshould we take?',
          options: [
            { label: 'A', text: 'Keep the current\r\nflow' },
            { label: 'B', text: 'Add the\r\nwidget' },
          ],
        },
      });

      const result = reconcileChoiceAnnotations(
        [stored],
        [{
          ...question,
          question: 'Which approach\nshould we take?',
          options: [
            { label: 'A', text: 'Keep the current\nflow' },
            { label: 'B', text: 'Add the\nwidget' },
          ],
          blockId: 'block-new',
        }],
      );

      expect(result.invalidatedIds).toEqual([]);
      expect(result.retained[0]).toEqual(expect.objectContaining({ blockId: 'block-new' }));
    });

    test.each([
      ['question changes', { question: 'A different question' }],
      ['option text changes', { options: [{ label: 'A', text: 'Changed' }, options[1]] }],
      ['option order changes', { options: [options[1], options[0]] }],
    ])('invalidates decisions when %s', (_reason, change) => {
      const result = reconcileChoiceAnnotations(
        [annotation()],
        [{ ...question, ...change, blockId: 'block-new' }],
      );

      expect(result.retained).toEqual([]);
      expect(result.invalidatedIds).toEqual(['ann-choice-1']);
    });

    test('does not invalidate a decision when only the recommendation changes', () => {
      const result = reconcileChoiceAnnotations(
        [annotation()],
        [{ ...question, recommendedLabel: 'A', blockId: 'block-new' }],
      );

      expect(result.invalidatedIds).toEqual([]);
      expect(result.retained[0]).toEqual(expect.objectContaining({ blockId: 'block-new' }));
    });

    test('invalidates legacy decisions without validation evidence', () => {
      const result = reconcileChoiceAnnotations(
        [annotation({ choiceValidationEvidence: undefined })],
        [{ ...question, blockId: 'block-new' }],
      );

      expect(result.retained).toEqual([]);
      expect(result.invalidatedIds).toEqual(['ann-choice-1']);
    });

    test('discards malformed validation evidence instead of throwing', () => {
      const malformedEvidence = {
        question: 42,
        options: null,
      } as unknown as Annotation['choiceValidationEvidence'];
      const result = reconcileChoiceAnnotations(
        [annotation({ choiceValidationEvidence: malformedEvidence })],
        [{ ...question, blockId: 'block-new' }],
      );

      expect(result.retained).toEqual([]);
      expect(result.invalidatedIds).toEqual(['ann-choice-1']);
    });

    test('invalidates decisions when duplicate questions make the match ambiguous', () => {
      const result = reconcileChoiceAnnotations(
        [annotation()],
        [
          { ...question, blockId: 'block-one' },
          { ...question, blockId: 'block-two' },
        ],
      );

      expect(result.retained).toEqual([]);
      expect(result.invalidatedIds).toEqual(['ann-choice-1']);
    });

    test('invalidates decisions when the selected option no longer exists', () => {
      const result = reconcileChoiceAnnotations(
        [annotation()],
        [{ ...question, options: [options[0]], blockId: 'block-new' }],
      );

      expect(result.retained).toEqual([]);
      expect(result.invalidatedIds).toEqual(['ann-choice-1']);
    });

    test('does not mutate annotations or current questions', () => {
      const input = [annotation()];
      const current = [{ ...question, blockId: 'block-new' }];
      const inputBefore = structuredClone(input);
      const currentBefore = structuredClone(current);

      reconcileChoiceAnnotations(input, current);

      expect(input).toEqual(inputBefore);
      expect(current).toEqual(currentBefore);
    });
  });
});
