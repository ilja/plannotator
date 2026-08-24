import { Option, Result, Schema } from 'effect';
import { AGENT_ORIGINS, type Origin } from '@plannotator/shared/agents';
import type { DiffOptions, AnnotationOptions, CCLabelConfig } from '@plannotator/shared/config';
import type { DiffOption, GitContext } from '@plannotator/shared/types';
import type { PRDiffScope, PRMetadata, PRDiffScopeOption, PRStackInfo, PRStackNode, PRStackTree } from '@plannotator/shared/pr-types';
import type { SemanticDiffAdvert } from '@plannotator/shared/semantic-diff-types';

const SafeRecordSchema = Schema.Record(Schema.String, Schema.Unknown);

type SafeRecord = Schema.Schema.Type<typeof SafeRecordSchema>;

const DiffOptionSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
});

const WorktreeInfoSchema = Schema.Struct({
  path: Schema.String,
  branch: Schema.NullOr(Schema.String),
  head: Schema.String,
});

const CompareTargetPickerCopySchema = Schema.Struct({
  rowLabel: Schema.String,
  triggerLabel: Schema.String,
  triggerTitlePrefix: Schema.String,
  searchPlaceholder: Schema.String,
  emptyText: Schema.String,
  localGroupLabel: Schema.String,
  remoteGroupLabel: Schema.String,
});

const CompareTargetConfigSchema = Schema.Struct({
  diffTypes: Schema.optionalKey(Schema.Unknown),
  fallback: Schema.String,
  picker: Schema.Unknown,
});

const RepositoryContextSchema = Schema.Struct({
  displayFallback: Schema.optionalKey(Schema.Unknown),
});

const JjEvologSchema = Schema.Struct({
  commitId: Schema.String,
  description: Schema.String,
  age: Schema.optionalKey(Schema.Unknown),
});

const RecentCommitSchema = Schema.Struct({
  sha: Schema.String,
  shortSha: Schema.String,
  subject: Schema.String,
  relativeDate: Schema.String,
  author: Schema.String,
});

const GitContextFieldsSchema = Schema.Struct({
  currentBranch: Schema.String,
  defaultBranch: Schema.String,
  diffOptions: Schema.optionalKey(Schema.Unknown),
  worktrees: Schema.optionalKey(Schema.Unknown),
  availableBranches: Schema.optionalKey(Schema.Unknown),
  compareTarget: Schema.optionalKey(Schema.Unknown),
  repository: Schema.optionalKey(Schema.Unknown),
  cwd: Schema.optionalKey(Schema.Unknown),
  vcsType: Schema.optionalKey(Schema.Unknown),
  jjEvologs: Schema.optionalKey(Schema.Unknown),
  recentCommits: Schema.optionalKey(Schema.Unknown),
});

const AvailableBranchesFieldsSchema = Schema.Struct({
  local: Schema.optionalKey(Schema.Unknown),
  remote: Schema.optionalKey(Schema.Unknown),
});

const GithubPRMetadataSchema = Schema.Struct({
  platform: Schema.Literal('github'),
  host: Schema.String,
  owner: Schema.String,
  repo: Schema.String,
  number: Schema.Int,
  prNodeId: Schema.optionalKey(Schema.Unknown),
  title: Schema.String,
  author: Schema.String,
  baseBranch: Schema.String,
  headBranch: Schema.String,
  defaultBranch: Schema.optionalKey(Schema.Unknown),
  baseSha: Schema.String,
  headSha: Schema.String,
  mergeBaseSha: Schema.optionalKey(Schema.Unknown),
  url: Schema.String,
});

const GitlabMRMetadataSchema = Schema.Struct({
  platform: Schema.Literal('gitlab'),
  host: Schema.String,
  projectPath: Schema.String,
  iid: Schema.Int,
  title: Schema.String,
  author: Schema.String,
  baseBranch: Schema.String,
  headBranch: Schema.String,
  defaultBranch: Schema.optionalKey(Schema.Unknown),
  baseSha: Schema.String,
  headSha: Schema.String,
  mergeBaseSha: Schema.optionalKey(Schema.Unknown),
  url: Schema.String,
});

const PRMetadataSchema = Schema.Union([
  GithubPRMetadataSchema,
  GitlabMRMetadataSchema,
]);

const PRStackInfoSchema = Schema.Struct({
  isStacked: Schema.Boolean,
  baseBranch: Schema.String,
  defaultBranch: Schema.optionalKey(Schema.Unknown),
  label: Schema.String,
  source: Schema.Literals([
    'branch-inferred',
    'tree-discovered',
    'github-native',
    'gitlab-native',
    'graphite',
    'ghstack',
  ]),
});

const PRStackNodeSchema = Schema.Struct({
  branch: Schema.String,
  number: Schema.optionalKey(Schema.Unknown),
  title: Schema.optionalKey(Schema.Unknown),
  url: Schema.optionalKey(Schema.Unknown),
  isCurrent: Schema.Boolean,
  isDefaultBranch: Schema.Boolean,
  state: Schema.optionalKey(Schema.Unknown),
});

const PRStackTreeSchema = Schema.Struct({
  nodes: Schema.Unknown,
});

const PRDiffScopeSchema = Schema.Literals(['layer', 'full-stack']);

const PRDiffScopeOptionSchema = Schema.Struct({
  id: PRDiffScopeSchema,
  label: Schema.String,
  description: Schema.String,
  enabled: Schema.Boolean,
});

const SemanticDiffAdvertSchema = Schema.Struct({
  available: Schema.Boolean,
  semVersion: Schema.optionalKey(Schema.Unknown),
  semSource: Schema.optionalKey(Schema.Unknown),
});

const ConventionalLabelSchema = Schema.Struct({
  label: Schema.String,
  display: Schema.String,
  blocking: Schema.Boolean,
});

const ServerDiffOptionsFieldsSchema = Schema.Struct({
  diffStyle: Schema.optionalKey(Schema.Unknown),
  overflow: Schema.optionalKey(Schema.Unknown),
  diffIndicators: Schema.optionalKey(Schema.Unknown),
  lineDiffType: Schema.optionalKey(Schema.Unknown),
  showLineNumbers: Schema.optionalKey(Schema.Unknown),
  showDiffBackground: Schema.optionalKey(Schema.Unknown),
  fontFamily: Schema.optionalKey(Schema.Unknown),
  fontSize: Schema.optionalKey(Schema.Unknown),
  tabSize: Schema.optionalKey(Schema.Unknown),
  hideWhitespace: Schema.optionalKey(Schema.Unknown),
  expandUnchanged: Schema.optionalKey(Schema.Unknown),
  defaultDiffType: Schema.optionalKey(Schema.Unknown),
  lineBgIntensity: Schema.optionalKey(Schema.Unknown),
});

const ServerAnnotationOptionsFieldsSchema = Schema.Struct({
  proseFontFamily: Schema.optionalKey(Schema.Unknown),
  proseFontSize: Schema.optionalKey(Schema.Unknown),
  codeFontFamily: Schema.optionalKey(Schema.Unknown),
  codeFontSize: Schema.optionalKey(Schema.Unknown),
});

const ServerDiffStyleSchema = Schema.Literals(['split', 'unified']);
const ServerOverflowSchema = Schema.Literals(['scroll', 'wrap']);
const ServerDiffIndicatorsSchema = Schema.Literals(['bars', 'classic', 'none']);
const ServerLineDiffTypeSchema = Schema.Literals(['word-alt', 'word', 'char', 'none']);
const ServerDefaultDiffTypeSchema = Schema.Literals([
  'uncommitted',
  'unstaged',
  'staged',
  'merge-base',
  'all',
  'branch',
]);
const ServerLineBgIntensitySchema = Schema.Literals(['subtle', 'normal', 'strong']);

const ServerConfigFieldsSchema = Schema.Struct({
  displayName: Schema.optionalKey(Schema.Unknown),
  diffOptions: Schema.optionalKey(Schema.Unknown),
  annotationOptions: Schema.optionalKey(Schema.Unknown),
  gitUser: Schema.optionalKey(Schema.Unknown),
  conventionalComments: Schema.optionalKey(Schema.Unknown),
  conventionalLabels: Schema.optionalKey(Schema.Unknown),
});

const InitialDiffResponseRootSchema = Schema.Struct({
  rawPatch: Schema.String,
  gitRef: Schema.String,
  origin: Schema.optionalKey(Schema.Unknown),
  mode: Schema.optionalKey(Schema.Unknown),
  diffType: Schema.optionalKey(Schema.Unknown),
  base: Schema.optionalKey(Schema.Unknown),
  gitContext: Schema.optionalKey(Schema.Unknown),
  diffOptions: Schema.optionalKey(Schema.Unknown),
  agentCwd: Schema.optionalKey(Schema.Unknown),
  sharingEnabled: Schema.optionalKey(Schema.Unknown),
  repoInfo: Schema.optionalKey(Schema.Unknown),
  prMetadata: Schema.optionalKey(Schema.Unknown),
  prStackInfo: Schema.optionalKey(Schema.Unknown),
  prStackTree: Schema.optionalKey(Schema.Unknown),
  prDiffScope: Schema.optionalKey(Schema.Unknown),
  prDiffScopeOptions: Schema.optionalKey(Schema.Unknown),
  prPatchIncomplete: Schema.optionalKey(Schema.Unknown),
  prPatchUpgradeAvailable: Schema.optionalKey(Schema.Unknown),
  platformUser: Schema.optionalKey(Schema.Unknown),
  viewedFiles: Schema.optionalKey(Schema.Unknown),
  error: Schema.optionalKey(Schema.Unknown),
  semanticDiff: Schema.optionalKey(Schema.Unknown),
  serverConfig: Schema.optionalKey(Schema.Unknown),
});

interface InitialDiffServerConfig {
  displayName?: string;
  diffOptions?: DiffOptions;
  annotationOptions?: AnnotationOptions;
  gitUser?: string;
  conventionalComments?: boolean;
  conventionalLabels?: CCLabelConfig[] | null;
}

/** Decoded initial `/api/diff` data with independently validated optional fields. */
export interface InitialDiffResponse {
  rawPatch: string;
  gitRef: string;
  origin?: Origin;
  mode?: string;
  diffType?: string;
  base?: string;
  gitContext?: GitContext;
  diffOptions?: DiffOption[];
  agentCwd?: string | null;
  sharingEnabled?: boolean;
  repoInfo?: { display: string; branch?: string };
  prMetadata?: PRMetadata;
  prStackInfo?: PRStackInfo | null;
  prStackTree?: PRStackTree | null;
  prDiffScope?: PRDiffScope;
  prDiffScopeOptions?: PRDiffScopeOption[];
  prPatchIncomplete?: boolean;
  prPatchUpgradeAvailable?: boolean;
  platformUser?: string;
  viewedFiles?: string[];
  error?: string;
  semanticDiff?: SemanticDiffAdvert;
  serverConfig?: InitialDiffServerConfig;
}

const decodeRoot = Schema.decodeUnknownResult(InitialDiffResponseRootSchema);
const decodeSafeRecord = Schema.decodeUnknownOption(SafeRecordSchema);
const decodeString = Schema.decodeUnknownOption(Schema.String);
const decodeOrigin = Schema.decodeUnknownOption(Schema.Literals(AGENT_ORIGINS));
const decodeMode = Schema.decodeUnknownOption(Schema.String);
const decodeBoolean = Schema.decodeUnknownOption(Schema.Boolean);
const decodeNumber = Schema.decodeUnknownOption(Schema.Number);
const decodeNullableString = Schema.decodeUnknownOption(Schema.NullOr(Schema.String));
const decodeGitContextFields = Schema.decodeUnknownOption(GitContextFieldsSchema);
const decodeRepoInfoFields = Schema.decodeUnknownOption(Schema.Struct({
  display: Schema.String,
  branch: Schema.optionalKey(Schema.Unknown),
}));
const decodeAvailableBranchesFields = Schema.decodeUnknownOption(AvailableBranchesFieldsSchema);
const decodePRMetadataFields = Schema.decodeUnknownOption(PRMetadataSchema);
const decodePRStackInfoFields = Schema.decodeUnknownOption(Schema.NullOr(PRStackInfoSchema));
const decodePRStackTreeSchema = Schema.decodeUnknownOption(Schema.NullOr(PRStackTreeSchema));
const decodePRDiffScope = Schema.decodeUnknownOption(PRDiffScopeSchema);
const decodeSemanticDiffFields = Schema.decodeUnknownOption(SemanticDiffAdvertSchema);
const decodeServerConfigFields = Schema.decodeUnknownOption(ServerConfigFieldsSchema);
const decodeServerDiffOptionsFields = Schema.decodeUnknownOption(ServerDiffOptionsFieldsSchema);
const decodeServerAnnotationOptionsFields = Schema.decodeUnknownOption(ServerAnnotationOptionsFieldsSchema);
const decodeServerDiffStyle = Schema.decodeUnknownOption(ServerDiffStyleSchema);
const decodeServerOverflow = Schema.decodeUnknownOption(ServerOverflowSchema);
const decodeServerDiffIndicators = Schema.decodeUnknownOption(ServerDiffIndicatorsSchema);
const decodeServerLineDiffType = Schema.decodeUnknownOption(ServerLineDiffTypeSchema);
const decodeServerDefaultDiffType = Schema.decodeUnknownOption(ServerDefaultDiffTypeSchema);
const decodeServerLineBgIntensity = Schema.decodeUnknownOption(ServerLineBgIntensitySchema);
const decodeRecentCommitFields = Schema.decodeUnknownOption(RecentCommitSchema);
const decodeConventionalLabelFields = Schema.decodeUnknownOption(ConventionalLabelSchema);
const decodeNullableUnknownArray = Schema.decodeUnknownOption(Schema.NullOr(Schema.Array(Schema.Unknown)));
const decodeUnknownArray = Schema.decodeUnknownOption(Schema.Array(Schema.Unknown));

function decodeValidArrayItems<T>(
  value: Schema.Schema.Type<typeof Schema.Unknown>,
  decodeItem: (item: Schema.Schema.Type<typeof Schema.Unknown>) => Option.Option<T>,
): T[] | undefined {
  const items = Option.getOrUndefined(decodeUnknownArray(value));
  if (items === undefined) return undefined;
  return items.flatMap((item) => {
    const decoded = decodeItem(item);
    return Option.isSome(decoded) ? [decoded.value] : [];
  });
}

function decodeStringArray(value: Schema.Schema.Type<typeof Schema.Unknown>): string[] | undefined {
  return decodeValidArrayItems(value, decodeString);
}

function decodeOptionalItem<T>(
  decodeItem: (item: Schema.Schema.Type<typeof Schema.Unknown>) => T | undefined,
  item: Schema.Schema.Type<typeof Schema.Unknown>,
): Option.Option<T> {
  const decoded = decodeItem(item);
  return decoded === undefined ? Option.none() : Option.some(decoded);
}

function decodeRecord(value: Schema.Schema.Type<typeof Schema.Unknown>): SafeRecord | undefined {
  return Option.getOrUndefined(decodeSafeRecord(value));
}

function withoutKnownFields(record: SafeRecord, knownFields: readonly string[]): SafeRecord {
  const unknownFields = { ...record };
  for (const field of knownFields) delete unknownFields[field];
  return unknownFields;
}

function decodeDiffOption(value: Schema.Schema.Type<typeof Schema.Unknown>): DiffOption | undefined {
  const record = decodeRecord(value);
  if (!record) return undefined;
  const fields = Option.getOrUndefined(Schema.decodeUnknownOption(DiffOptionSchema)(record));
  if (!fields) return undefined;
  return {
    ...withoutKnownFields(record, ['id', 'label']),
    ...fields,
  };
}

function decodeWorktreeInfo(value: Schema.Schema.Type<typeof Schema.Unknown>): NonNullable<GitContext['worktrees']>[number] | undefined {
  const record = decodeRecord(value);
  if (!record) return undefined;
  const fields = Option.getOrUndefined(Schema.decodeUnknownOption(WorktreeInfoSchema)(record));
  if (!fields) return undefined;
  return {
    ...withoutKnownFields(record, ['path', 'branch', 'head']),
    ...fields,
  };
}

function decodeRecentCommit(value: Schema.Schema.Type<typeof Schema.Unknown>): NonNullable<GitContext['recentCommits']>[number] | undefined {
  const record = decodeRecord(value);
  if (!record) return undefined;
  const fields = Option.getOrUndefined(decodeRecentCommitFields(record));
  if (!fields) return undefined;
  return {
    ...withoutKnownFields(record, ['sha', 'shortSha', 'subject', 'relativeDate', 'author']),
    ...fields,
  };
}

function decodeCompareTarget(value: Schema.Schema.Type<typeof Schema.Unknown>): GitContext['compareTarget'] | undefined {
  const record = decodeRecord(value);
  if (!record) return undefined;
  const fields = Option.getOrUndefined(Schema.decodeUnknownOption(CompareTargetConfigSchema)(record));
  if (!fields) return undefined;

  const pickerRecord = decodeRecord(fields.picker);
  if (!pickerRecord) return undefined;
  const pickerFields = Option.getOrUndefined(Schema.decodeUnknownOption(CompareTargetPickerCopySchema)(pickerRecord));
  if (!pickerFields) return undefined;

  return {
    ...withoutKnownFields(record, ['diffTypes', 'fallback', 'picker']),
    diffTypes: decodeStringArray(fields.diffTypes) ?? [],
    fallback: fields.fallback,
    picker: {
      ...withoutKnownFields(pickerRecord, [
        'rowLabel',
        'triggerLabel',
        'triggerTitlePrefix',
        'searchPlaceholder',
        'emptyText',
        'localGroupLabel',
        'remoteGroupLabel',
      ]),
      ...pickerFields,
    },
  };
}

function decodeRepository(value: Schema.Schema.Type<typeof Schema.Unknown>): NonNullable<GitContext['repository']> | undefined {
  const record = decodeRecord(value);
  if (!record) return undefined;
  const fields = Option.getOrUndefined(Schema.decodeUnknownOption(RepositoryContextSchema)(record));
  if (!fields) return undefined;

  const displayFallback = Option.getOrUndefined(decodeString(fields.displayFallback));
  return {
    ...withoutKnownFields(record, ['displayFallback']),
    ...(displayFallback !== undefined && { displayFallback }),
  };
}

function decodeJjEvolog(value: Schema.Schema.Type<typeof Schema.Unknown>): NonNullable<GitContext['jjEvologs']>[number] | undefined {
  const record = decodeRecord(value);
  if (!record) return undefined;
  const fields = Option.getOrUndefined(Schema.decodeUnknownOption(JjEvologSchema)(record));
  if (!fields) return undefined;

  const age = Option.getOrUndefined(decodeString(fields.age));
  return {
    ...withoutKnownFields(record, ['commitId', 'description', 'age']),
    commitId: fields.commitId,
    description: fields.description,
    ...(age !== undefined && { age }),
  };
}

function decodePRStackNode(value: Schema.Schema.Type<typeof Schema.Unknown>): PRStackNode | undefined {
  const record = decodeRecord(value);
  if (!record) return undefined;
  const fields = Option.getOrUndefined(Schema.decodeUnknownOption(PRStackNodeSchema)(record));
  if (!fields) return undefined;

  const { number, title, url, state, ...required } = fields;
  const decodedNumber = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.Int)(number));
  const decodedTitle = Option.getOrUndefined(decodeString(title));
  const decodedUrl = Option.getOrUndefined(decodeString(url));
  const decodedState = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.Literals(['open', 'merged', 'closed']))(state));
  return {
    ...withoutKnownFields(record, ['branch', 'number', 'title', 'url', 'isCurrent', 'isDefaultBranch', 'state']),
    ...required,
    ...(decodedNumber !== undefined && { number: decodedNumber }),
    ...(decodedTitle !== undefined && { title: decodedTitle }),
    ...(decodedUrl !== undefined && { url: decodedUrl }),
    ...(decodedState !== undefined && { state: decodedState }),
  };
}

function decodeAvailableBranches(value: Schema.Schema.Type<typeof Schema.Unknown>): GitContext['availableBranches'] {
  const record = decodeRecord(value);
  const fields = record === undefined ? undefined : Option.getOrUndefined(decodeAvailableBranchesFields(record));
  return {
    ...(record !== undefined && withoutKnownFields(record, ['local', 'remote'])),
    local: decodeStringArray(fields?.local) ?? [],
    remote: decodeStringArray(fields?.remote) ?? [],
  };
}

function decodeRepoInfo(value: Schema.Schema.Type<typeof Schema.Unknown>): { display: string; branch?: string } | undefined {
  const record = decodeRecord(value);
  if (!record) return undefined;
  const fields = Option.getOrUndefined(decodeRepoInfoFields(record));
  if (!fields) return undefined;

  const branch = Option.getOrUndefined(decodeString(fields.branch));
  return {
    ...withoutKnownFields(record, ['display', 'branch']),
    display: fields.display,
    ...(branch !== undefined && { branch }),
  };
}

function decodeGitContext(value: Schema.Schema.Type<typeof Schema.Unknown>): GitContext | undefined {
  const record = decodeRecord(value);
  if (!record) return undefined;
  const context = Option.getOrUndefined(decodeGitContextFields(record));
  if (!context) return undefined;

  const diffOptions = decodeValidArrayItems(context.diffOptions, (item) => decodeOptionalItem(decodeDiffOption, item)) ?? [];
  const worktrees = decodeValidArrayItems(context.worktrees, (item) => decodeOptionalItem(decodeWorktreeInfo, item)) ?? [];
  const compareTarget = decodeCompareTarget(context.compareTarget);
  const repository = decodeRepository(context.repository);
  const cwd = Option.getOrUndefined(decodeString(context.cwd));
  const vcsType = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.Literals(['git', 'jj', 'p4']))(context.vcsType));
  const jjEvologs = decodeValidArrayItems(
    context.jjEvologs,
    (item) => decodeOptionalItem(decodeJjEvolog, item),
  );
  const recentCommits = decodeValidArrayItems(context.recentCommits, (item) => decodeOptionalItem(decodeRecentCommit, item));

  return {
    ...withoutKnownFields(record, [
      'currentBranch',
      'defaultBranch',
      'diffOptions',
      'worktrees',
      'availableBranches',
      'compareTarget',
      'repository',
      'cwd',
      'vcsType',
      'jjEvologs',
      'recentCommits',
    ]),
    currentBranch: context.currentBranch,
    defaultBranch: context.defaultBranch,
    diffOptions,
    worktrees,
    availableBranches: decodeAvailableBranches(context.availableBranches),
    ...(compareTarget !== undefined && { compareTarget }),
    ...(repository !== undefined && { repository }),
    ...(cwd !== undefined && { cwd }),
    ...(vcsType !== undefined && { vcsType }),
    ...(jjEvologs !== undefined && { jjEvologs }),
    ...(recentCommits !== undefined && { recentCommits }),
  };
}

function decodePRMetadata(value: Schema.Schema.Type<typeof Schema.Unknown>): PRMetadata | undefined {
  const record = decodeRecord(value);
  if (!record) return undefined;
  const fields = Option.getOrUndefined(decodePRMetadataFields(record));
  if (!fields) return undefined;

  if (fields.platform === 'github') {
    const { prNodeId, defaultBranch, mergeBaseSha, ...required } = fields;
    const decodedPrNodeId = Option.getOrUndefined(decodeString(prNodeId));
    const decodedDefaultBranch = Option.getOrUndefined(decodeString(defaultBranch));
    const decodedMergeBaseSha = Option.getOrUndefined(decodeString(mergeBaseSha));
    return {
      ...withoutKnownFields(record, [
        'platform',
        'host',
        'owner',
        'repo',
        'number',
        'prNodeId',
        'title',
        'author',
        'baseBranch',
        'headBranch',
        'defaultBranch',
        'baseSha',
        'headSha',
        'mergeBaseSha',
        'url',
      ]),
      ...required,
      ...(decodedPrNodeId !== undefined && { prNodeId: decodedPrNodeId }),
      ...(decodedDefaultBranch !== undefined && { defaultBranch: decodedDefaultBranch }),
      ...(decodedMergeBaseSha !== undefined && { mergeBaseSha: decodedMergeBaseSha }),
    };
  }

  const { defaultBranch, mergeBaseSha, ...required } = fields;
  const decodedDefaultBranch = Option.getOrUndefined(decodeString(defaultBranch));
  const decodedMergeBaseSha = Option.getOrUndefined(decodeString(mergeBaseSha));
  return {
    ...withoutKnownFields(record, [
      'platform',
      'host',
      'projectPath',
      'iid',
      'title',
      'author',
      'baseBranch',
      'headBranch',
      'defaultBranch',
      'baseSha',
      'headSha',
      'mergeBaseSha',
      'url',
    ]),
    ...required,
    ...(decodedDefaultBranch !== undefined && { defaultBranch: decodedDefaultBranch }),
    ...(decodedMergeBaseSha !== undefined && { mergeBaseSha: decodedMergeBaseSha }),
  };
}

function decodePRStackInfo(value: Schema.Schema.Type<typeof Schema.Unknown>): PRStackInfo | null | undefined {
  if (value === null) return null;
  const record = decodeRecord(value);
  if (!record) return undefined;
  const fields = Option.getOrUndefined(decodePRStackInfoFields(record));
  if (fields === undefined || fields === null) return fields;

  const { defaultBranch, ...required } = fields;
  const decodedDefaultBranch = Option.getOrUndefined(decodeString(defaultBranch));
  return {
    ...withoutKnownFields(record, ['isStacked', 'baseBranch', 'defaultBranch', 'label', 'source']),
    ...required,
    ...(decodedDefaultBranch !== undefined && { defaultBranch: decodedDefaultBranch }),
  };
}

function decodeSemanticDiff(value: Schema.Schema.Type<typeof Schema.Unknown>): SemanticDiffAdvert | undefined {
  const record = decodeRecord(value);
  if (!record) return undefined;
  const fields = Option.getOrUndefined(decodeSemanticDiffFields(record));
  if (!fields) return undefined;

  const { semVersion, semSource, ...required } = fields;
  const decodedSemVersion = Option.getOrUndefined(decodeString(semVersion));
  const decodedSemSource = Option.getOrUndefined(decodeString(semSource));
  return {
    ...withoutKnownFields(record, ['available', 'semVersion', 'semSource']),
    ...required,
    ...(decodedSemVersion !== undefined && { semVersion: decodedSemVersion }),
    ...(decodedSemSource !== undefined && { semSource: decodedSemSource }),
  };
}

function decodePRStackTree(value: Schema.Schema.Type<typeof Schema.Unknown>): PRStackTree | null | undefined {
  if (value === null) return null;
  const record = decodeRecord(value);
  if (!record) return undefined;
  const tree = Option.getOrUndefined(decodePRStackTreeSchema(record));
  if (tree === undefined || tree === null) return tree;

  const rawNodes = Option.getOrUndefined(decodeUnknownArray(tree.nodes));
  if (rawNodes === undefined) return undefined;

  const nodes = rawNodes.flatMap((node) => {
    const decoded = decodePRStackNode(node);
    return decoded === undefined ? [] : [decoded];
  });
  return rawNodes.length > 0 && nodes.length === 0 ? undefined : {
    ...withoutKnownFields(record, ['nodes']),
    nodes,
  };
}

function decodeDiffOptions(value: Schema.Schema.Type<typeof Schema.Unknown>): DiffOption[] | undefined {
  return decodeValidArrayItems(value, (item) => decodeOptionalItem(decodeDiffOption, item));
}

function decodeViewedFiles(value: Schema.Schema.Type<typeof Schema.Unknown>): string[] | undefined {
  return decodeValidArrayItems(value, decodeString);
}

function decodePRDiffScopeOptions(value: Schema.Schema.Type<typeof Schema.Unknown>): PRDiffScopeOption[] | undefined {
  return decodeValidArrayItems(value, Schema.decodeUnknownOption(PRDiffScopeOptionSchema));
}

function decodeServerDiffOptions(value: Schema.Schema.Type<typeof Schema.Unknown>): DiffOptions | undefined {
  const record = decodeRecord(value);
  if (!record) return undefined;
  const fields = Option.getOrUndefined(decodeServerDiffOptionsFields(record));
  if (!fields) return undefined;

  const diffStyle = Option.getOrUndefined(decodeServerDiffStyle(fields.diffStyle));
  const overflow = Option.getOrUndefined(decodeServerOverflow(fields.overflow));
  const diffIndicators = Option.getOrUndefined(decodeServerDiffIndicators(fields.diffIndicators));
  const lineDiffType = Option.getOrUndefined(decodeServerLineDiffType(fields.lineDiffType));
  const showLineNumbers = Option.getOrUndefined(decodeBoolean(fields.showLineNumbers));
  const showDiffBackground = Option.getOrUndefined(decodeBoolean(fields.showDiffBackground));
  const fontFamily = Option.getOrUndefined(decodeString(fields.fontFamily));
  const fontSize = Option.getOrUndefined(decodeString(fields.fontSize));
  const tabSize = Option.getOrUndefined(decodeNumber(fields.tabSize));
  const hideWhitespace = Option.getOrUndefined(decodeBoolean(fields.hideWhitespace));
  const expandUnchanged = Option.getOrUndefined(decodeBoolean(fields.expandUnchanged));
  const defaultDiffType = Option.getOrUndefined(decodeServerDefaultDiffType(fields.defaultDiffType));
  const canonicalDefaultDiffType = defaultDiffType === 'branch' ? 'merge-base' : defaultDiffType;
  const lineBgIntensity = Option.getOrUndefined(decodeServerLineBgIntensity(fields.lineBgIntensity));

  return {
    ...withoutKnownFields(record, [
      'diffStyle',
      'overflow',
      'diffIndicators',
      'lineDiffType',
      'showLineNumbers',
      'showDiffBackground',
      'fontFamily',
      'fontSize',
      'tabSize',
      'hideWhitespace',
      'expandUnchanged',
      'defaultDiffType',
      'lineBgIntensity',
    ]),
    ...(diffStyle !== undefined && { diffStyle }),
    ...(overflow !== undefined && { overflow }),
    ...(diffIndicators !== undefined && { diffIndicators }),
    ...(lineDiffType !== undefined && { lineDiffType }),
    ...(showLineNumbers !== undefined && { showLineNumbers }),
    ...(showDiffBackground !== undefined && { showDiffBackground }),
    ...(fontFamily !== undefined && { fontFamily }),
    ...(fontSize !== undefined && { fontSize }),
    ...(tabSize !== undefined && { tabSize }),
    ...(hideWhitespace !== undefined && { hideWhitespace }),
    ...(expandUnchanged !== undefined && { expandUnchanged }),
    ...(canonicalDefaultDiffType !== undefined && { defaultDiffType: canonicalDefaultDiffType }),
    ...(lineBgIntensity !== undefined && { lineBgIntensity }),
  };
}

function decodeServerAnnotationOptions(value: Schema.Schema.Type<typeof Schema.Unknown>): AnnotationOptions | undefined {
  const record = decodeRecord(value);
  if (!record) return undefined;
  const fields = Option.getOrUndefined(decodeServerAnnotationOptionsFields(record));
  if (!fields) return undefined;

  const proseFontFamily = Option.getOrUndefined(decodeString(fields.proseFontFamily));
  const proseFontSize = Option.getOrUndefined(decodeString(fields.proseFontSize));
  const codeFontFamily = Option.getOrUndefined(decodeString(fields.codeFontFamily));
  const codeFontSize = Option.getOrUndefined(decodeString(fields.codeFontSize));

  return {
    ...withoutKnownFields(record, ['proseFontFamily', 'proseFontSize', 'codeFontFamily', 'codeFontSize']),
    ...(proseFontFamily !== undefined && { proseFontFamily }),
    ...(proseFontSize !== undefined && { proseFontSize }),
    ...(codeFontFamily !== undefined && { codeFontFamily }),
    ...(codeFontSize !== undefined && { codeFontSize }),
  };
}

function decodeConventionalLabel(value: Schema.Schema.Type<typeof Schema.Unknown>): CCLabelConfig | undefined {
  const record = decodeRecord(value);
  if (!record) return undefined;
  const fields = Option.getOrUndefined(decodeConventionalLabelFields(record));
  if (!fields) return undefined;
  return {
    ...withoutKnownFields(record, ['label', 'display', 'blocking']),
    ...fields,
  };
}

function decodeConventionalLabels(value: Schema.Schema.Type<typeof Schema.Unknown>): CCLabelConfig[] | null | undefined {
  const labels = Option.getOrUndefined(decodeNullableUnknownArray(value));
  if (labels === undefined || labels === null) return labels;

  return labels.flatMap((label) => {
    const decoded = decodeConventionalLabel(label);
    return decoded === undefined ? [] : [decoded];
  });
}

function decodeServerConfig(value: Schema.Schema.Type<typeof Schema.Unknown>): InitialDiffServerConfig | undefined {
  const record = decodeRecord(value);
  if (!record) return undefined;
  const fields = Option.getOrUndefined(decodeServerConfigFields(record));
  if (!fields) return undefined;

  const displayName = Option.getOrUndefined(decodeString(fields.displayName));
  const diffOptions = decodeServerDiffOptions(fields.diffOptions);
  const annotationOptions = decodeServerAnnotationOptions(fields.annotationOptions);
  const gitUser = Option.getOrUndefined(decodeString(fields.gitUser));
  const conventionalComments = Option.getOrUndefined(decodeBoolean(fields.conventionalComments));
  const conventionalLabels = decodeConventionalLabels(fields.conventionalLabels);

  return {
    ...withoutKnownFields(record, [
      'displayName',
      'diffOptions',
      'annotationOptions',
      'gitUser',
      'conventionalComments',
      'conventionalLabels',
    ]),
    ...(displayName !== undefined && { displayName }),
    ...(diffOptions !== undefined && { diffOptions }),
    ...(annotationOptions !== undefined && { annotationOptions }),
    ...(gitUser !== undefined && { gitUser }),
    ...(conventionalComments !== undefined && { conventionalComments }),
    ...(conventionalLabels !== undefined && {
      conventionalLabels: conventionalLabels === null ? null : Array.from(conventionalLabels),
    }),
  };
}

/** Decode the unknown value returned by the initial `/api/diff` fetch. */
export function decodeInitialDiffResponse(
  value: Schema.Schema.Type<typeof Schema.Unknown>,
): Result.Result<InitialDiffResponse, Schema.SchemaError> {
  const root = decodeRoot(value);
  if (Result.isFailure(root)) return Result.fail(root.failure);

  const data = root.success;
  const origin = Option.getOrUndefined(decodeOrigin(data.origin));
  const mode = Option.getOrUndefined(decodeMode(data.mode));
  const diffType = Option.getOrUndefined(decodeString(data.diffType));
  const base = Option.getOrUndefined(decodeString(data.base));
  const gitContext = decodeGitContext(data.gitContext);
  const diffOptions = decodeDiffOptions(data.diffOptions);
  const agentCwd = Option.getOrUndefined(decodeNullableString(data.agentCwd));
  const sharingEnabled = Option.getOrUndefined(decodeBoolean(data.sharingEnabled));
  const repoInfo = decodeRepoInfo(data.repoInfo);
  const prMetadata = decodePRMetadata(data.prMetadata);
  const prStackInfo = decodePRStackInfo(data.prStackInfo);
  const prStackTree = decodePRStackTree(data.prStackTree);
  const prDiffScope = Option.getOrUndefined(decodePRDiffScope(data.prDiffScope));
  const prDiffScopeOptions = decodePRDiffScopeOptions(data.prDiffScopeOptions);
  const prPatchIncomplete = Option.getOrUndefined(decodeBoolean(data.prPatchIncomplete));
  const prPatchUpgradeAvailable = Option.getOrUndefined(decodeBoolean(data.prPatchUpgradeAvailable));
  const platformUser = Option.getOrUndefined(decodeString(data.platformUser));
  const viewedFiles = decodeViewedFiles(data.viewedFiles);
  const error = Option.getOrUndefined(decodeString(data.error));
  const semanticDiff = decodeSemanticDiff(data.semanticDiff);
  const serverConfig = decodeServerConfig(data.serverConfig);

  return Result.succeed({
    rawPatch: data.rawPatch,
    gitRef: data.gitRef,
    ...(origin !== undefined && { origin }),
    ...(mode !== undefined && { mode }),
    ...(diffType !== undefined && { diffType }),
    ...(base !== undefined && { base }),
    ...(gitContext !== undefined && { gitContext }),
    ...(diffOptions !== undefined && { diffOptions }),
    ...(agentCwd !== undefined && { agentCwd }),
    ...(sharingEnabled !== undefined && { sharingEnabled }),
    ...(repoInfo !== undefined && { repoInfo }),
    ...(prMetadata !== undefined && { prMetadata }),
    ...(prStackInfo !== undefined && { prStackInfo }),
    ...(prStackTree !== undefined && { prStackTree }),
    ...(prDiffScope !== undefined && { prDiffScope }),
    ...(prDiffScopeOptions !== undefined && { prDiffScopeOptions }),
    ...(prPatchIncomplete !== undefined && { prPatchIncomplete }),
    ...(prPatchUpgradeAvailable !== undefined && { prPatchUpgradeAvailable }),
    ...(platformUser !== undefined && { platformUser }),
    ...(viewedFiles !== undefined && { viewedFiles }),
    ...(error !== undefined && { error }),
    ...(semanticDiff !== undefined && { semanticDiff }),
    ...(serverConfig !== undefined && { serverConfig }),
  });
}

/** Decoded `/api/diff/switch` data with a required string diff type. */
export interface DiffSwitchResponse extends InitialDiffResponse {
  diffType: string;
}

/** Decode a diff switch response, rejecting malformed roots and required fields. */
export function decodeDiffSwitchResponse(
  value: Schema.Schema.Type<typeof Schema.Unknown>,
): DiffSwitchResponse | undefined {
  const decoded = decodeInitialDiffResponse(value);
  if (Result.isFailure(decoded)) return undefined;

  const { diffType } = decoded.success;
  if (diffType === undefined) return undefined;
  return { ...decoded.success, diffType };
}

export type InitialDiffLoadResult =
  | { source: 'api'; data: InitialDiffResponse }
  | { source: 'demo' };

export async function loadInitialDiffResponse(
  readJson: () => Promise<Schema.Schema.Type<typeof Schema.Unknown>>,
): Promise<InitialDiffLoadResult> {
  try {
    const decoded = decodeInitialDiffResponse(await readJson());
    return Result.isSuccess(decoded) ? { source: 'api', data: decoded.success } : { source: 'demo' };
  } catch {
    return { source: 'demo' };
  }
}
