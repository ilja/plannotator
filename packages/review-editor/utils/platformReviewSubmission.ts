import { getDisplayRepo, type PRMetadata } from "@plannotator/shared/pr-types";
import type { ReviewSubmission, SubmissionTarget } from "../components/ReviewSubmissionDialog";

export type PlatformReviewAction = "approve" | "comment";

/** Build the review-level body sent to an individual pull request. */
export function buildPlatformReviewActionBody(
  target: SubmissionTarget,
  generalComment?: string,
): string {
  const parts: string[] = [];
  if (generalComment) parts.push(generalComment);
  parts.push("Review from Plannotator");
  if (target.fileScopedBody) parts.push(target.fileScopedBody);
  return parts.join("\n\n");
}

/**
 * Choose the pull requests that receive a platform action.
 *
 * Approval is scoped to the active pull request. A review-level comment without
 * inline findings creates a target for that same pull request.
 */
export function selectPlatformReviewTargets(
  action: PlatformReviewAction,
  plan: ReviewSubmission,
  generalComment: string | undefined,
  prMetadata: PRMetadata | null,
): SubmissionTarget[] {
  if (action !== "approve" && (plan.targets.length > 0 || !generalComment?.trim())) {
    return plan.targets;
  }

  const currentTarget = plan.targets.find((target) => target.prUrl === prMetadata?.url);
  if (currentTarget) return [currentTarget];

  return [
    {
      prUrl: prMetadata?.url ?? "",
      prNumber: prMetadata?.number ?? 0,
      prTitle: prMetadata?.title ?? "",
      prRepo: prMetadata ? getDisplayRepo(prMetadata) : "",
      fileComments: [],
      fileScopedBody: "",
      fileCount: 0,
      annotationCount: 0,
      status: "pending",
    },
  ];
}
