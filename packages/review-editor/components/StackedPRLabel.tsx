import React, { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { buildMinimalStackTree } from "@plannotator/shared/pr-stack";
import { getItem, setItem } from "@plannotator/ui/utils/storage";
import type { PRMetadata } from "@plannotator/shared/pr-types";
import type {
  PRDiffScope,
  PRDiffScopeOption,
  PRStackInfo,
  PRStackTree,
  PRStackNode,
} from "@plannotator/shared/pr-stack";

interface StackedPRLabelProps {
  metadata: PRMetadata;
  prNumberLabel: string;
  stackInfo: PRStackInfo | null;
  stackTree: PRStackTree | null;
  scope: PRDiffScope;
  scopeOptions: PRDiffScopeOption[];
  isSwitchingScope: boolean;
  onSelectScope: (scope: PRDiffScope) => void;
  onNavigatePR?: (url: string) => void;
}

function nodeLabel(node: PRStackNode): string {
  if (node.isDefaultBranch) return node.branch;
  if (node.number != null && node.title) return `#${node.number} ${node.title}`;
  if (node.number != null) return `#${node.number}`;
  return node.branch;
}

function shortNodeLabel(node: PRStackNode): string {
  if (node.isDefaultBranch) return node.branch;
  if (node.number != null) return `#${node.number}`;
  return node.branch;
}

type NodeAction = { kind: "full-stack" } | { kind: "current" } | { kind: "navigate"; url: string };

function classifyNode(node: PRStackNode): NodeAction {
  if (node.isCurrent) return { kind: "current" };
  if (node.isDefaultBranch) return { kind: "full-stack" };
  return { kind: "navigate", url: node.url ?? "" };
}

const HIDE_MERGED_KEY = "plannotator-stack-hide-merged";

interface StackLabelModel {
  tree: PRStackTree;
  prNodes: PRStackNode[];
  parentNode: PRStackNode | null;
  fullStackTarget: string;
  scopeTarget: string;
  showToggle: boolean;
  mergedCount: number;
  layerOption?: PRDiffScopeOption;
  fullStackOption?: PRDiffScopeOption;
}

function createStackLabelModel(
  metadata: PRMetadata,
  stackInfo: PRStackInfo | null,
  stackTree: PRStackTree | null,
  scope: PRDiffScope,
  scopeOptions: PRDiffScopeOption[],
): StackLabelModel {
  const tree =
    stackTree ?? (stackInfo ? buildMinimalStackTree(metadata, stackInfo) : { nodes: [] });
  const currentIndex = tree.nodes.findIndex((node) => node.isCurrent);
  const parentNode = currentIndex > 0 ? tree.nodes[currentIndex - 1] : null;
  const rootNode = tree.nodes[0];
  const mergedNodes = tree.nodes.filter(
    (node) => !node.isDefaultBranch && !node.isCurrent && node.state === "merged",
  );
  const hasStateInfo = tree.nodes.some((node) => !node.isDefaultBranch && node.state !== undefined);
  const fullStackTarget = rootNode?.isDefaultBranch
    ? rootNode.branch
    : (stackInfo?.defaultBranch ?? "main");
  const layerTarget = parentNode ? shortNodeLabel(parentNode) : (stackInfo?.baseBranch ?? "base");

  return {
    tree,
    prNodes: tree.nodes.filter((node) => !node.isDefaultBranch),
    parentNode,
    fullStackTarget,
    scopeTarget: scope === "full-stack" ? fullStackTarget : layerTarget,
    showToggle: hasStateInfo && mergedNodes.length > 0,
    mergedCount: mergedNodes.length,
    layerOption: scopeOptions.find((option) => option.id === "layer"),
    fullStackOption: scopeOptions.find((option) => option.id === "full-stack"),
  };
}

function isMergedStackNode(node: PRStackNode): boolean {
  return !node.isCurrent && !node.isDefaultBranch && node.state === "merged";
}

function getStackNodeTooltip(
  node: PRStackNode,
  fullStackOption?: PRDiffScopeOption,
): string | undefined {
  const action = classifyNode(node);
  if (action.kind === "full-stack") {
    return fullStackOption?.enabled
      ? "Switch to full-stack diff"
      : "Full-stack diff requires local checkout";
  }
  return action.kind === "navigate" && action.url ? `Review ${shortNodeLabel(node)}` : undefined;
}

function isStackNodeDisabled(
  node: PRStackNode,
  action: NodeAction,
  isSwitchingScope: boolean,
  fullStackOption: PRDiffScopeOption | undefined,
  onNavigatePR: ((url: string) => void) | undefined,
): boolean {
  if (isMergedStackNode(node) || action.kind === "current") return true;
  if (action.kind === "full-stack") return !fullStackOption?.enabled || isSwitchingScope;
  return !action.url || isSwitchingScope || !onNavigatePR;
}

function getStackNodeIndicatorClass(node: PRStackNode, merged: boolean): string {
  if (node.isCurrent) return "bg-annotation-comment";
  if (node.isDefaultBranch) return "bg-muted-foreground/30";
  return merged ? "bg-muted-foreground/20" : "bg-muted-foreground/40";
}

function getStackNodeClass(node: PRStackNode, merged: boolean, disabled: boolean): string {
  if (node.isCurrent) return "text-annotation-comment font-medium cursor-default";
  if (merged) return "text-muted-foreground/40 cursor-default";
  if (disabled) return "text-muted-foreground/40 cursor-not-allowed";
  return classifyNode(node).kind === "navigate"
    ? "text-muted-foreground hover:text-foreground hover:bg-muted/30 cursor-pointer"
    : "text-muted-foreground hover:text-annotation-comment hover:bg-muted/30 cursor-pointer";
}

const StackTreeNodeItem: React.FC<{
  node: PRStackNode;
  depth: number;
  isLast: boolean;
  isSwitchingScope: boolean;
  fullStackOption?: PRDiffScopeOption;
  onSelectFullStack: () => void;
  onNavigatePR?: (url: string) => void;
}> = ({
  node,
  depth,
  isLast,
  isSwitchingScope,
  fullStackOption,
  onSelectFullStack,
  onNavigatePR,
}) => {
  const merged = isMergedStackNode(node);
  const action = classifyNode(node);
  const disabled = isStackNodeDisabled(
    node,
    action,
    isSwitchingScope,
    fullStackOption,
    onNavigatePR,
  );

  function handleClick() {
    if (action.kind === "full-stack") onSelectFullStack();
    if (action.kind === "navigate" && action.url && onNavigatePR) onNavigatePR(action.url);
  }

  return (
    <div className="flex items-start" style={{ paddingLeft: `${depth * 2}px` }}>
      <div className="flex items-center flex-shrink-0 mt-[5px]">
        {depth > 0 && (
          <span className="text-[10px] text-border/70 font-mono leading-none mr-0.5">
            {isLast ? "└─" : "├─"}
          </span>
        )}
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${getStackNodeIndicatorClass(node, merged)}`}
        />
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        title={getStackNodeTooltip(node, fullStackOption)}
        className={`flex items-center gap-1.5 min-w-0 text-xs leading-6 ml-1.5 rounded px-1 -mx-0.5 transition-colors ${getStackNodeClass(node, merged, disabled)}`}
      >
        <span className={`truncate ${merged ? "line-through" : ""}`}>{nodeLabel(node)}</span>
        {node.isCurrent && (
          <span className="text-[9px] text-annotation-comment/60 whitespace-nowrap">reviewing</span>
        )}
        {merged && (
          <span className="text-[9px] text-muted-foreground/40 whitespace-nowrap border border-muted-foreground/20 rounded px-0.5 leading-tight">
            merged
          </span>
        )}
        {action.kind === "navigate" && node.url && !disabled && (
          <svg
            className="w-2.5 h-2.5 flex-shrink-0 opacity-40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        )}
      </button>
    </div>
  );
};

const StackScopeOption: React.FC<{
  option: PRDiffScopeOption;
  optionScope: PRDiffScope;
  scope: PRDiffScope;
  title: string;
  description: string;
  isSwitchingScope: boolean;
  onSelect: (scope: PRDiffScope) => void;
}> = ({ option, optionScope, scope, title, description, isSwitchingScope, onSelect }) => (
  <button
    type="button"
    disabled={!option.enabled || isSwitchingScope}
    onClick={() => onSelect(optionScope)}
    title={!option.enabled && optionScope === "full-stack" ? "Requires local checkout" : undefined}
    className={`w-full flex items-start gap-2 rounded px-2 py-1.5 text-left transition-colors ${
      scope === optionScope
        ? "bg-muted text-foreground"
        : option.enabled
          ? "text-foreground/80 hover:bg-muted/70"
          : "text-muted-foreground/40 cursor-not-allowed"
    }`}
  >
    <span className="mt-0.5 w-3 flex-shrink-0 text-xs">{scope === optionScope ? "◉" : "○"}</span>
    <span className="min-w-0">
      <span className="block text-xs font-medium truncate">{title}</span>
      <span className="block text-[11px] leading-snug text-muted-foreground">{description}</span>
    </span>
  </button>
);

const StackScopeSelector: React.FC<{
  scope: PRDiffScope;
  model: StackLabelModel;
  stackInfo: PRStackInfo | null;
  isSwitchingScope: boolean;
  onSelect: (scope: PRDiffScope) => void;
}> = ({ scope, model, stackInfo, isSwitchingScope, onSelect }) => {
  if (!model.layerOption && !model.fullStackOption) return null;

  const layerTitle = model.parentNode
    ? nodeLabel(model.parentNode)
    : (stackInfo?.baseBranch ?? "base");

  return (
    <>
      <div className="border-t border-border/50" />
      <div className="px-3 py-2">
        <div className="text-[11px] font-medium text-muted-foreground mb-1.5">
          Comparing against
        </div>
        {model.layerOption && (
          <StackScopeOption
            option={model.layerOption}
            optionScope="layer"
            scope={scope}
            title={layerTitle}
            description="Only changes in this PR"
            isSwitchingScope={isSwitchingScope}
            onSelect={onSelect}
          />
        )}
        {model.fullStackOption && (
          <StackScopeOption
            option={model.fullStackOption}
            optionScope="full-stack"
            scope={scope}
            title={model.fullStackTarget}
            description={`All changes from ${model.fullStackTarget} to here`}
            isSwitchingScope={isSwitchingScope}
            onSelect={onSelect}
          />
        )}
      </div>
    </>
  );
};

export function StackedPRLabel({
  metadata,
  prNumberLabel,
  stackInfo,
  stackTree,
  scope,
  scopeOptions,
  isSwitchingScope,
  onSelectScope,
  onNavigatePR,
}: StackedPRLabelProps) {
  const [open, setOpen] = useState(false);

  const [hideMerged, setHideMerged] = useState(() => getItem(HIDE_MERGED_KEY) === "true");
  function toggleHideMerged() {
    const next = !hideMerged;
    setHideMerged(next);
    setItem(HIDE_MERGED_KEY, String(next));
  }

  const hasStack = Boolean(
    stackInfo || (stackTree && stackTree.nodes.filter((node) => !node.isDefaultBranch).length > 1),
  );

  if (!hasStack) return null;

  const model = createStackLabelModel(metadata, stackInfo, stackTree, scope, scopeOptions);
  const visibleNodes =
    hideMerged && model.showToggle
      ? model.tree.nodes.filter((node) => !isMergedStackNode(node))
      : model.tree.nodes;

  function handleSelect(nextScope: PRDiffScope) {
    if (nextScope === scope) {
      setOpen(false);
      return;
    }
    onSelectScope(nextScope);
    setOpen(false);
  }

  function handleNavigatePR(url: string) {
    onNavigatePR?.(url);
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={isSwitchingScope}
          title={`Stack: comparing vs ${model.scopeTarget}`}
          className="text-[10px] text-annotation-comment/70 hover:text-annotation-comment inline-flex items-center gap-1 whitespace-nowrap transition-colors rounded px-1.5 py-0.5 hover:bg-muted/20 disabled:opacity-60 disabled:cursor-wait"
        >
          <svg
            className="w-[18px] h-[18px] flex-shrink-0"
            viewBox="0 0 500 400"
            fill="none"
            stroke="currentColor"
            strokeWidth={28}
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <polygon points="250,30 470,160 250,290 30,160" />
            <polyline points="30,220 250,350 470,220" />
            <polyline points="30,280 250,410 470,280" />
          </svg>
          <span>vs {model.scopeTarget}</span>
          <svg
            className={`w-2.5 h-2.5 flex-shrink-0 opacity-40 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-50 w-80 bg-popover text-popover-foreground border border-border rounded shadow-lg overflow-hidden origin-[var(--radix-popover-content-transform-origin)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          {/* Section 1: Stack Tree */}
          <div className="px-3 pt-3 pb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-muted-foreground">
                Stack ({model.prNodes.length} {model.prNodes.length === 1 ? "PR" : "PRs"})
                {hideMerged && model.showToggle && (
                  <span className="ml-1 text-[10px] text-muted-foreground/50">
                    · {model.mergedCount} merged hidden
                  </span>
                )}
              </span>
              {model.showToggle && (
                <button
                  type="button"
                  onClick={toggleHideMerged}
                  title={hideMerged ? "Show merged PRs" : "Hide merged PRs"}
                  className={`cc-blocking-toggle ${hideMerged ? "is-on" : ""}`}
                  style={{ borderLeft: "none", marginLeft: 0 }}
                >
                  <span className="cc-toggle-track">
                    <span className="cc-toggle-thumb" />
                  </span>
                  <span>Hide merged</span>
                </button>
              )}
            </div>
            <div>
              {visibleNodes.map((node, index) => (
                <StackTreeNodeItem
                  key={node.branch}
                  node={node}
                  depth={node.isDefaultBranch ? 0 : index}
                  isLast={index === visibleNodes.length - 1}
                  isSwitchingScope={isSwitchingScope}
                  fullStackOption={model.fullStackOption}
                  onSelectFullStack={() => handleSelect("full-stack")}
                  onNavigatePR={onNavigatePR ? handleNavigatePR : undefined}
                />
              ))}
            </div>
          </div>

          <StackScopeSelector
            scope={scope}
            model={model}
            stackInfo={stackInfo}
            isSwitchingScope={isSwitchingScope}
            onSelect={handleSelect}
          />

          <div className="border-t border-border/50" />

          {/* Section 3: PR Link */}
          <div className="px-3 py-2">
            <a
              href={metadata.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
            >
              View {prNumberLabel} on GitHub
              <svg
                className="w-2.5 h-2.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
