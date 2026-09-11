import { Option, Schema } from "effect";
import type { VaultNode } from "../types";
import type { WorkspaceStatusPayload } from "@plannotator/shared/workspace-status";

const VaultNodeEnvelopeSchema = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  type: Schema.Literals(["file", "folder"]),
  children: Schema.optionalKey(Schema.Array(Schema.Unknown)),
});

const WorkspaceFileChangeSchema = Schema.Struct({
  path: Schema.String,
  repoRelativePath: Schema.String,
  oldPath: Schema.optionalKey(Schema.String),
  status: Schema.Literals([
    "modified",
    "added",
    "deleted",
    "renamed",
    "copied",
    "typechange",
    "conflicted",
    "untracked",
  ]),
  additions: Schema.Number,
  deletions: Schema.Number,
  staged: Schema.Boolean,
  unstaged: Schema.Boolean,
});

const WorkspaceStatusSchema = Schema.Struct({
  available: Schema.Boolean,
  rootPath: Schema.String,
  repoRoot: Schema.optionalKey(Schema.String),
  files: Schema.Record(Schema.String, WorkspaceFileChangeSchema),
  totals: Schema.Struct({
    files: Schema.Number,
    additions: Schema.Number,
    deletions: Schema.Number,
  }),
  error: Schema.optionalKey(Schema.String),
});

const FileBrowserSuccessEnvelopeSchema = Schema.Struct({
  tree: Schema.Array(Schema.Unknown),
  workspaceStatus: Schema.optionalKey(Schema.Unknown),
});

const FileBrowserErrorEnvelopeSchema = Schema.Struct({ error: Schema.String });

const decodeVaultNodeEnvelope = Schema.decodeUnknownOption(VaultNodeEnvelopeSchema);

const decodeWorkspaceStatus = Schema.decodeUnknownOption(WorkspaceStatusSchema);

const decodeSuccessEnvelope = Schema.decodeUnknownOption(FileBrowserSuccessEnvelopeSchema);

const decodeErrorEnvelope = Schema.decodeUnknownOption(FileBrowserErrorEnvelopeSchema);

/** A parsed successful file browser response with malformed tree nodes removed. */
export interface FileBrowserSuccessResponse {
  readonly tree: VaultNode[];
  readonly workspaceStatus?: WorkspaceStatusPayload;
}

function decodeVaultNode<Input>(input: Input): VaultNode | undefined {
  const node = Option.getOrUndefined(decodeVaultNodeEnvelope(input));

  if (!node) return undefined;

  if (node.children === undefined) {
    return { name: node.name, path: node.path, type: node.type };
  }

  const children = node.children.flatMap((child) => {
    const decoded = decodeVaultNode(child);

    return decoded ? [decoded] : [];
  });

  return { name: node.name, path: node.path, type: node.type, children };
}

/** Decodes a file browser success response, retaining only structurally valid tree nodes. */
export function decodeFileBrowserSuccessResponse<Input>(
  input: Input,
): FileBrowserSuccessResponse | undefined {
  const response = Option.getOrUndefined(decodeSuccessEnvelope(input));

  if (!response) return undefined;

  const tree = response.tree.flatMap((node) => {
    const decoded = decodeVaultNode(node);

    return decoded ? [decoded] : [];
  });

  const workspaceStatus = Option.getOrUndefined(decodeWorkspaceStatus(response.workspaceStatus));

  return workspaceStatus ? { tree, workspaceStatus } : { tree };
}

/** Extracts a server-provided file browser error only when it is a string. */
export function decodeFileBrowserErrorResponse<Input>(input: Input): string | undefined {
  return Option.getOrUndefined(decodeErrorEnvelope(input))?.error;
}
