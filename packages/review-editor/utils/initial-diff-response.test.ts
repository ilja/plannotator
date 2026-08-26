import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import {
  decodeDiffSwitchResponse,
  decodeInitialDiffResponse,
  loadInitialDiffResponse,
} from './initial-diff-response';

const validResponse = {
  rawPatch: 'diff --git a/file.ts b/file.ts',
  gitRef: 'main..HEAD',
  origin: 'pi',
  mode: 'workspace',
  diffType: 'workspace-current',
  base: 'origin/main',
  gitContext: {
    currentBranch: 'feature/review',
    defaultBranch: 'main',
    diffOptions: [{ id: 'workspace-current', label: 'Current changes' }],
    worktrees: [{ path: '/tmp/worktree', branch: 'feature/review', head: 'abc123' }],
    availableBranches: { local: ['main'], remote: ['origin/main'] },
    compareTarget: {
      diffTypes: ['branch', 'merge-base'],
      fallback: 'main',
      picker: {
        rowLabel: 'compare against',
        triggerLabel: 'base',
        triggerTitlePrefix: 'Review base',
        searchPlaceholder: 'Search branches',
        emptyText: 'No branches',
        localGroupLabel: 'Local',
        remoteGroupLabel: 'Remote',
      },
    },
    repository: { displayFallback: 'plannotator' },
    cwd: '/tmp/worktree',
    vcsType: 'git',
    jjEvologs: [{ commitId: 'abc123', description: 'Review', age: '1 hour ago' }],
    recentCommits: [{
      sha: 'abc123',
      shortSha: 'abc123',
      subject: 'Review',
      relativeDate: '1 hour ago',
      author: 'Ilja',
    }],
  },
  diffOptions: [{ id: 'workspace-current', label: 'Current changes' }],
  agentCwd: '/tmp/worktree',
  sharingEnabled: false,
  repoInfo: { display: 'backnotprop/plannotator', branch: 'feature/review' },
  prMetadata: {
    platform: 'github',
    host: 'github.com',
    owner: 'backnotprop',
    repo: 'plannotator',
    number: 42,
    prNodeId: 'PR_node_42',
    title: 'Safe response decoding',
    author: 'ilja',
    baseBranch: 'main',
    headBranch: 'feature/review',
    defaultBranch: 'main',
    baseSha: 'base-sha',
    headSha: 'head-sha',
    mergeBaseSha: 'merge-base-sha',
    url: 'https://github.com/backnotprop/plannotator/pull/42',
  },
  prStackInfo: {
    isStacked: true,
    baseBranch: 'parent',
    defaultBranch: 'main',
    label: 'feature/review stacked on parent',
    source: 'branch-inferred',
  },
  prStackTree: {
    nodes: [{
      branch: 'feature/review',
      number: 42,
      title: 'Safe response decoding',
      url: 'https://github.com/backnotprop/plannotator/pull/42',
      isCurrent: true,
      isDefaultBranch: false,
      state: 'open',
    }],
  },
  prDiffScope: 'layer',
  prDiffScopeOptions: [{
    id: 'layer',
    label: 'Layer',
    description: 'Only changes relative to parent.',
    enabled: true,
  }],
  prPatchIncomplete: true,
  prPatchUpgradeAvailable: true,
  platformUser: 'ilja',
  viewedFiles: ['file.ts'],
  error: 'A non-fatal diff warning',
  semanticDiff: { available: true, semVersion: '1.0.0', semSource: 'local' },
  serverConfig: {
    displayName: 'Ilja',
    gitUser: 'Ilja',
    diffOptions: { diffStyle: 'split', tabSize: 2 },
    annotationOptions: { codeFontFamily: 'Geist Mono' },
    conventionalComments: true,
    conventionalLabels: [{ label: 'bug', display: 'Bug', blocking: true }],
  },
};

describe('decodeInitialDiffResponse', () => {
  test('decodes a complete producer-shaped response', () => {
    const decoded = decodeInitialDiffResponse(validResponse);

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toEqual(validResponse);
    }
  });

  test('rejects malformed roots and required fields', () => {
    const malformedResponses = [
      null,
      [],
      {},
      { ...validResponse, rawPatch: 42 },
      { ...validResponse, gitRef: null },
      { ...validResponse, rawPatch: undefined },
      { ...validResponse, gitRef: undefined },
    ];

    for (const response of malformedResponses) {
      expect(Result.isFailure(decodeInitialDiffResponse(response))).toBeTrue();
    }
  });

  test('rejects invalid unknown roots', () => {
    const decoded = decodeInitialDiffResponse('not an object');

    expect(Result.isFailure(decoded)).toBeTrue();
  });

  test('preserves compatible null and false optional values', () => {
    const decoded = decodeInitialDiffResponse({
      rawPatch: validResponse.rawPatch,
      gitRef: validResponse.gitRef,
      agentCwd: null,
      sharingEnabled: false,
      prStackInfo: null,
      prStackTree: null,
      serverConfig: { conventionalLabels: null },
      prPatchIncomplete: false,
      prPatchUpgradeAvailable: false,
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toEqual({
        rawPatch: validResponse.rawPatch,
        gitRef: validResponse.gitRef,
        agentCwd: null,
        sharingEnabled: false,
        prStackInfo: null,
        prStackTree: null,
        serverConfig: { conventionalLabels: null },
        prPatchIncomplete: false,
        prPatchUpgradeAvailable: false,
      });
    }
  });

  test('normalizes the legacy branch default diff type', () => {
    const decoded = decodeInitialDiffResponse({
      rawPatch: validResponse.rawPatch,
      gitRef: validResponse.gitRef,
      serverConfig: { diffOptions: { defaultDiffType: 'branch' } },
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.serverConfig).toEqual({
        diffOptions: { defaultDiffType: 'merge-base' },
      });
    }
  });

  test('retains unknown record fields while sanitizing known fields', () => {
    const decoded = decodeInitialDiffResponse({
      rawPatch: validResponse.rawPatch,
      gitRef: validResponse.gitRef,
      gitContext: {
        ...validResponse.gitContext,
        contextExtra: 'context',
        diffOptions: [{ ...validResponse.gitContext.diffOptions[0], optionExtra: 'option' }],
        worktrees: [{ ...validResponse.gitContext.worktrees[0], worktreeExtra: 'worktree' }],
        availableBranches: {
          ...validResponse.gitContext.availableBranches,
          branchesExtra: 'branches',
        },
        compareTarget: {
          ...validResponse.gitContext.compareTarget,
          compareExtra: 'compare',
          picker: {
            ...validResponse.gitContext.compareTarget.picker,
            pickerExtra: 'picker',
          },
        },
        repository: { displayFallback: 42, repositoryExtra: 'repository' },
        jjEvologs: [{ ...validResponse.gitContext.jjEvologs[0], age: 42, evologExtra: 'evolog' }],
        recentCommits: [{ ...validResponse.gitContext.recentCommits[0], recentExtra: 'recent' }],
      },
      repoInfo: { display: validResponse.repoInfo.display, branch: 42, repoExtra: 'repo' },
      prMetadata: {
        ...validResponse.prMetadata,
        defaultBranch: 42,
        metadataExtra: 'metadata',
      },
      prStackInfo: { ...validResponse.prStackInfo, defaultBranch: 42, stackExtra: 'stack' },
      prStackTree: {
        treeExtra: 'tree',
        nodes: [{ ...validResponse.prStackTree.nodes[0], title: 42, nodeExtra: 'node' }],
      },
      semanticDiff: { available: true, semVersion: 42, semanticExtra: 'semantic' },
      serverConfig: {
        serverExtra: 'server',
        diffOptions: {
          defaultDiffType: 'branch',
          tabSize: 'bad',
          diffExtra: 'diff',
          ['__proto__']: { polluted: true },
        },
        annotationOptions: { codeFontFamily: 'Geist Mono', annotationExtra: 'annotation' },
        conventionalLabels: [{ ...validResponse.serverConfig.conventionalLabels[0], labelExtra: 'label' }],
      },
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.gitContext).toMatchObject({
        contextExtra: 'context',
        diffOptions: [{ ...validResponse.gitContext.diffOptions[0], optionExtra: 'option' }],
        worktrees: [{ ...validResponse.gitContext.worktrees[0], worktreeExtra: 'worktree' }],
        availableBranches: {
          local: ['main'],
          remote: ['origin/main'],
          branchesExtra: 'branches',
        },
        compareTarget: {
          diffTypes: ['branch', 'merge-base'],
          fallback: 'main',
          compareExtra: 'compare',
          picker: {
            ...validResponse.gitContext.compareTarget.picker,
            pickerExtra: 'picker',
          },
        },
        repository: { repositoryExtra: 'repository' },
        jjEvologs: [{
          commitId: 'abc123',
          description: 'Review',
          evologExtra: 'evolog',
        }],
        recentCommits: [{ ...validResponse.gitContext.recentCommits[0], recentExtra: 'recent' }],
      });
      expect(decoded.success.gitContext?.repository).not.toHaveProperty('displayFallback');
      expect(decoded.success.gitContext?.jjEvologs?.[0]).not.toHaveProperty('age');
      expect(decoded.success.repoInfo).toEqual({ display: validResponse.repoInfo.display, repoExtra: 'repo' });
      expect(decoded.success.prMetadata).toMatchObject({ metadataExtra: 'metadata' });
      expect(decoded.success.prMetadata).not.toHaveProperty('defaultBranch');
      expect(decoded.success.prStackInfo).toMatchObject({ stackExtra: 'stack' });
      expect(decoded.success.prStackInfo).not.toHaveProperty('defaultBranch');
      expect(decoded.success.prStackTree).toEqual({
        treeExtra: 'tree',
        nodes: [{
          branch: validResponse.prStackTree.nodes[0].branch,
          url: validResponse.prStackTree.nodes[0].url,
          number: validResponse.prStackTree.nodes[0].number,
          isCurrent: true,
          isDefaultBranch: false,
          state: 'open',
          nodeExtra: 'node',
        }],
      });
      expect(decoded.success.prStackTree?.nodes[0]).not.toHaveProperty('title');
      expect(decoded.success.semanticDiff).toEqual({ available: true, semanticExtra: 'semantic' });
      expect(decoded.success.serverConfig).toEqual({
        serverExtra: 'server',
        diffOptions: {
          defaultDiffType: 'merge-base',
          diffExtra: 'diff',
          ['__proto__']: { polluted: true },
        },
        annotationOptions: { codeFontFamily: 'Geist Mono', annotationExtra: 'annotation' },
        conventionalLabels: [{
          label: 'bug',
          display: 'Bug',
          blocking: true,
          labelExtra: 'label',
        }],
      });
      const decodedDiffOptions = decoded.success.serverConfig?.diffOptions;
      if (decodedDiffOptions) {
        expect(Object.prototype.hasOwnProperty.call(decodedDiffOptions, '__proto__')).toBeTrue();
        expect(Object.getPrototypeOf(decodedDiffOptions)).toBe(Object.prototype);
        expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBeFalse();
      }
    }
  });

  test('drops malformed optional fields while retaining valid required fields and siblings', () => {
    const decoded = decodeInitialDiffResponse({
      ...validResponse,
      mode: 42,
      gitContext: { currentBranch: 'missing required fields' },
      diffOptions: [{ id: 'valid', label: 'Valid option' }, { id: 'invalid' }],
      agentCwd: 42,
      sharingEnabled: 'true',
      repoInfo: { display: 42 },
      prMetadata: { platform: 'github', number: '42' },
      prStackInfo: { ...validResponse.prStackInfo, source: 'unknown' },
      prStackTree: { nodes: [{ branch: 'missing flags' }] },
      prDiffScope: 'unknown',
      prDiffScopeOptions: [{ ...validResponse.prDiffScopeOptions[0], enabled: 'yes' }],
      viewedFiles: ['valid.ts', 42],
      error: 42,
      semanticDiff: { available: 'yes' },
      serverConfig: {
        displayName: 'Retained display name',
        diffOptions: { diffStyle: 'invalid', tabSize: 4 },
      },
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.rawPatch).toBe(validResponse.rawPatch);
      expect(decoded.success.gitRef).toBe(validResponse.gitRef);
      expect(decoded.success.origin).toBe(validResponse.origin);
      expect(decoded.success.diffOptions).toEqual([{ id: 'valid', label: 'Valid option' }]);
      expect(decoded.success.serverConfig).toEqual({
        displayName: 'Retained display name',
        diffOptions: { tabSize: 4 },
      });
      expect(decoded.success.mode).toBeUndefined();
      expect(decoded.success.gitContext).toBeUndefined();
      expect(decoded.success.agentCwd).toBeUndefined();
      expect(decoded.success.sharingEnabled).toBeUndefined();
      expect(decoded.success.repoInfo).toBeUndefined();
      expect(decoded.success.prMetadata).toBeUndefined();
      expect(decoded.success.prStackInfo).toBeUndefined();
      expect(decoded.success.prStackTree).toBeUndefined();
      expect(decoded.success.prDiffScope).toBeUndefined();
      expect(decoded.success.prDiffScopeOptions).toEqual([]);
      expect(decoded.success.viewedFiles).toEqual(['valid.ts']);
      expect(decoded.success.error).toBeUndefined();
      expect(decoded.success.semanticDiff).toBeUndefined();
    }
  });

  test('retains valid Git context siblings when optional children are malformed', () => {
    const decoded = decodeInitialDiffResponse({
      rawPatch: validResponse.rawPatch,
      gitRef: validResponse.gitRef,
      gitContext: {
        ...validResponse.gitContext,
        diffOptions: [validResponse.gitContext.diffOptions[0], { id: 'missing label' }],
        worktrees: [validResponse.gitContext.worktrees[0], { path: 42 }],
        availableBranches: { local: ['main', 42], remote: 'not an array' },
        compareTarget: {
          ...validResponse.gitContext.compareTarget,
          diffTypes: ['branch', 42],
          picker: validResponse.gitContext.compareTarget.picker,
        },
        repository: { displayFallback: 42 },
        cwd: 42,
        vcsType: 'svn',
        recentCommits: [
          validResponse.gitContext.recentCommits[0],
          { sha: 'missing fields' },
        ],
        jjEvologs: [
          { ...validResponse.gitContext.jjEvologs[0], age: 42 },
          { commitId: 'missing description' },
        ],
      },
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.gitContext).toEqual({
        currentBranch: validResponse.gitContext.currentBranch,
        defaultBranch: validResponse.gitContext.defaultBranch,
        diffOptions: validResponse.gitContext.diffOptions,
        worktrees: validResponse.gitContext.worktrees,
        availableBranches: { local: ['main'], remote: [] },
        compareTarget: {
          diffTypes: ['branch'],
          fallback: validResponse.gitContext.compareTarget.fallback,
          picker: validResponse.gitContext.compareTarget.picker,
        },
        repository: {},
        jjEvologs: [{
          commitId: validResponse.gitContext.jjEvologs[0].commitId,
          description: validResponse.gitContext.jjEvologs[0].description,
        }],
        recentCommits: [validResponse.gitContext.recentCommits[0]],
      });
    }
  });

  test('retains GitContext when array containers are malformed', () => {
    const decoded = decodeInitialDiffResponse({
      rawPatch: validResponse.rawPatch,
      gitRef: validResponse.gitRef,
      gitContext: {
        currentBranch: validResponse.gitContext.currentBranch,
        defaultBranch: validResponse.gitContext.defaultBranch,
        diffOptions: 'not an array',
        worktrees: null,
        availableBranches: 42,
      },
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.gitContext).toEqual({
        currentBranch: validResponse.gitContext.currentBranch,
        defaultBranch: validResponse.gitContext.defaultBranch,
        diffOptions: [],
        worktrees: [],
        availableBranches: { local: [], remote: [] },
      });
    }
  });

  test('retains a PR stack node when optional fields are malformed', () => {
    const decoded = decodeInitialDiffResponse({
      rawPatch: validResponse.rawPatch,
      gitRef: validResponse.gitRef,
      prStackTree: {
        nodes: [{
          ...validResponse.prStackTree.nodes[0],
          number: '42',
          title: 42,
          url: false,
          state: 'unknown',
        }],
      },
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.prStackTree).toEqual({
        nodes: [{
          branch: validResponse.prStackTree.nodes[0].branch,
          isCurrent: true,
          isDefaultBranch: false,
        }],
      });
    }
  });

  test('omits a non-empty PR stack tree when every node is malformed', () => {
    const decoded = decodeInitialDiffResponse({
      rawPatch: validResponse.rawPatch,
      gitRef: validResponse.gitRef,
      prStackTree: { nodes: [{ branch: 'missing flags' }] },
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.prStackTree).toBeUndefined();
    }
  });

  test('omits malformed optional PR and semantic fields while retaining valid fields', () => {
    const decoded = decodeInitialDiffResponse({
      rawPatch: validResponse.rawPatch,
      gitRef: validResponse.gitRef,
      repoInfo: { display: validResponse.repoInfo.display, branch: 42 },
      prMetadata: {
        ...validResponse.prMetadata,
        prNodeId: 42,
        defaultBranch: 42,
        mergeBaseSha: false,
      },
      prStackInfo: { ...validResponse.prStackInfo, defaultBranch: 42 },
      semanticDiff: { available: true, semVersion: 42, semSource: false },
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.repoInfo).toEqual({ display: validResponse.repoInfo.display });
      expect(decoded.success.prStackInfo).toEqual({
        isStacked: validResponse.prStackInfo.isStacked,
        baseBranch: validResponse.prStackInfo.baseBranch,
        label: validResponse.prStackInfo.label,
        source: validResponse.prStackInfo.source,
      });
      expect(decoded.success.prMetadata).toEqual({
        platform: validResponse.prMetadata.platform,
        host: validResponse.prMetadata.host,
        owner: validResponse.prMetadata.owner,
        repo: validResponse.prMetadata.repo,
        number: validResponse.prMetadata.number,
        title: validResponse.prMetadata.title,
        author: validResponse.prMetadata.author,
        baseBranch: validResponse.prMetadata.baseBranch,
        headBranch: validResponse.prMetadata.headBranch,
        baseSha: validResponse.prMetadata.baseSha,
        headSha: validResponse.prMetadata.headSha,
        url: validResponse.prMetadata.url,
      });
      expect(decoded.success.semanticDiff).toEqual({ available: true });
    }
  });

  test('decodes GitLab metadata without GitHub-only fields', () => {
    const decoded = decodeInitialDiffResponse({
      rawPatch: validResponse.rawPatch,
      gitRef: validResponse.gitRef,
      prMetadata: {
        platform: 'gitlab',
        host: 'gitlab.com',
        projectPath: 'backnotprop/plannotator',
        iid: 42,
        title: 'Safe response decoding',
        author: 'ilja',
        baseBranch: 'main',
        headBranch: 'feature/review',
        defaultBranch: 42,
        baseSha: 'base-sha',
        headSha: 'head-sha',
        mergeBaseSha: false,
        url: 'https://gitlab.com/backnotprop/plannotator/-/merge_requests/42',
      },
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.prMetadata).toEqual({
        platform: 'gitlab',
        host: 'gitlab.com',
        projectPath: 'backnotprop/plannotator',
        iid: 42,
        title: 'Safe response decoding',
        author: 'ilja',
        baseBranch: 'main',
        headBranch: 'feature/review',
        baseSha: 'base-sha',
        headSha: 'head-sha',
        url: 'https://gitlab.com/backnotprop/plannotator/-/merge_requests/42',
      });
      expect('prNodeId' in decoded.success.prMetadata).toBeFalse();
    }
  });

  test('omits a PR stack tree when nodes is not an array', () => {
    const decoded = decodeInitialDiffResponse({
      rawPatch: validResponse.rawPatch,
      gitRef: validResponse.gitRef,
      prStackTree: { nodes: 'not an array' },
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.prStackTree).toBeUndefined();
    }
  });

  test('preserves an actually empty PR stack node array', () => {
    const decoded = decodeInitialDiffResponse({
      rawPatch: validResponse.rawPatch,
      gitRef: validResponse.gitRef,
      prStackTree: { nodes: [] },
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.prStackTree).toEqual({ nodes: [] });
    }
  });

  test('filters malformed PR stack nodes while retaining valid siblings', () => {
    const decoded = decodeInitialDiffResponse({
      rawPatch: validResponse.rawPatch,
      gitRef: validResponse.gitRef,
      prStackTree: {
        nodes: [
          validResponse.prStackTree.nodes[0],
          { branch: 'missing flags' },
        ],
      },
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.prStackTree).toEqual(validResponse.prStackTree);
    }
  });

  test('filters malformed conventional labels while retaining valid siblings', () => {
    const decoded = decodeInitialDiffResponse({
      rawPatch: validResponse.rawPatch,
      gitRef: validResponse.gitRef,
      serverConfig: {
        conventionalLabels: [
          validResponse.serverConfig.conventionalLabels[0],
          { label: 'missing fields' },
        ],
      },
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success.serverConfig?.conventionalLabels).toEqual(validResponse.serverConfig.conventionalLabels);
    }
  });

  test('decodes a complete diff switch response', () => {
    expect(decodeDiffSwitchResponse(validResponse)).toEqual(validResponse);
  });

  test('rejects malformed roots and required diff switch fields', () => {
    const malformedResponses = [
      null,
      [],
      {},
      { ...validResponse, rawPatch: undefined },
      { ...validResponse, rawPatch: 42 },
      { ...validResponse, gitRef: undefined },
      { ...validResponse, gitRef: null },
      { ...validResponse, diffType: undefined },
      { ...validResponse, diffType: null },
      { ...validResponse, diffType: 42 },
    ];

    for (const response of malformedResponses) {
      expect(decodeDiffSwitchResponse(response)).toBeUndefined();
    }
  });

  test('retains valid optional siblings while filtering malformed ones', () => {
    const decoded = decodeDiffSwitchResponse({
      ...validResponse,
      mode: 42,
      diffOptions: [{ id: 'valid', label: 'Valid option' }, { id: 'invalid' }],
      viewedFiles: ['valid.ts', 42],
      semanticDiff: { available: 'yes' },
      serverConfig: {
        displayName: 'Retained display name',
        diffOptions: { diffStyle: 'invalid', tabSize: 4 },
      },
    });

    expect(decoded).toMatchObject({
      rawPatch: validResponse.rawPatch,
      gitRef: validResponse.gitRef,
      diffType: validResponse.diffType,
      diffOptions: [{ id: 'valid', label: 'Valid option' }],
      viewedFiles: ['valid.ts'],
      serverConfig: {
        displayName: 'Retained display name',
        diffOptions: { tabSize: 4 },
      },
    });
    expect(decoded).not.toHaveProperty('mode');
    expect(decoded).not.toHaveProperty('semanticDiff');
  });

  test('falls back to demo when JSON reading or decoding fails', async () => {
    await expect(loadInitialDiffResponse(() => Promise.reject(new SyntaxError('Invalid JSON')))).resolves.toEqual({
      source: 'demo',
    });
    await expect(loadInitialDiffResponse(async () => 'not an object')).resolves.toEqual({
      source: 'demo',
    });
  });
});
