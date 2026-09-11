import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { getDisplayRepo, type PRMetadata } from "@plannotator/shared/pr-types";
import type { CodeAnnotation, EditorAnnotation } from "@plannotator/ui/types";
import { storage } from "@plannotator/ui/utils/storage";
import type { DiffFile } from "../types";
import {
  buildReviewSubmission,
  type ReviewSubmission,
  type SubmissionTarget,
} from "../components/ReviewSubmissionDialog";
import { readPRActionResponse } from "../utils/pr-action-response";
import {
  buildPlatformReviewActionBody,
  selectPlatformReviewTargets,
  type PlatformReviewAction,
} from "../utils/platformReviewSubmission";

export type ReviewDestination = "agent" | "platform";

export type { PlatformReviewAction } from "../utils/platformReviewSubmission";

interface PlatformReviewDialog {
  action: PlatformReviewAction;
  plan: ReviewSubmission;
}

export interface UsePlatformReviewActionsOptions {
  allAnnotations: CodeAnnotation[];
  editorAnnotations: EditorAnnotation[];
  files: DiffFile[];
  prMetadata: PRMetadata | null;
  onSubmitted: (submission: "approved" | "feedback") => void;
}

export interface PlatformReviewActions {
  reviewDestination: ReviewDestination;
  selectReviewDestination: (destination: ReviewDestination) => void;
  showDestinationMenu: boolean;
  setShowDestinationMenu: Dispatch<SetStateAction<boolean>>;
  isPlatformActioning: boolean;
  platformActionError: string | null;
  platformUser: string | null;
  setPlatformUser: Dispatch<SetStateAction<string | null>>;
  platformCommentDialog: PlatformReviewDialog | null;
  platformGeneralComment: string;
  setPlatformGeneralComment: Dispatch<SetStateAction<string>>;
  platformOpenPR: boolean;
  setPlatformOpenPR: (openPR: boolean) => void;
  platformMode: boolean;
  openPlatformDialog: (action: PlatformReviewAction) => void;
  closePlatformDialog: () => void;
  submitPlatformAction: (
    action: PlatformReviewAction,
    plan: ReviewSubmission,
    generalComment?: string,
  ) => Promise<void>;
}

export function usePlatformReviewActions({
  allAnnotations,
  editorAnnotations,
  files,
  prMetadata,
  onSubmitted,
}: UsePlatformReviewActionsOptions): PlatformReviewActions {
  const [reviewDestination, setReviewDestination] = useState<ReviewDestination>(() => {
    const stored = storage.getItem("plannotator-review-dest");

    return stored === "agent" ? "agent" : "platform";
  });

  const [showDestinationMenu, setShowDestinationMenu] = useState(false);
  const [isPlatformActioning, setIsPlatformActioning] = useState(false);
  const [platformActionError, setPlatformActionError] = useState<string | null>(null);
  const [platformUser, setPlatformUser] = useState<string | null>(null);

  const [platformCommentDialog, setPlatformCommentDialog] = useState<PlatformReviewDialog | null>(
    null,
  );

  const [platformGeneralComment, setPlatformGeneralComment] = useState("");

  const [platformOpenPR, setPlatformOpenPRState] = useState(() => {
    const platformSetting = storage.getItem("plannotator-platform-open-pr");

    if (platformSetting !== null) return platformSetting !== "false";

    const legacyGitHubSetting = storage.getItem("plannotator-github-open-pr");

    if (legacyGitHubSetting !== null) {
      storage.setItem("plannotator-platform-open-pr", legacyGitHubSetting);

      return legacyGitHubSetting !== "false";
    }

    return true;
  });

  const selectReviewDestination = useCallback((destination: ReviewDestination) => {
    setReviewDestination(destination);
    storage.setItem("plannotator-review-dest", destination);
    setPlatformActionError(null);
  }, []);

  const setPlatformOpenPR = useCallback((openPR: boolean) => {
    setPlatformOpenPRState(openPR);
    storage.setItem("plannotator-platform-open-pr", String(openPR));
  }, []);

  const submitPlatformAction = useCallback(
    async (
      action: PlatformReviewAction,
      plan: ReviewSubmission,
      generalComment?: string,
    ): Promise<void> => {
      setIsPlatformActioning(true);
      setPlatformActionError(null);

      try {
        const targets = selectPlatformReviewTargets(action, plan, generalComment, prMetadata);
        const openUrls: string[] = [];

        const results = await Promise.allSettled(
          targets.map(async (target): Promise<SubmissionTarget> => {
            if (target.status === "success") return target;

            try {
              const prRes = await fetch("/api/pr-action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action,
                  body: buildPlatformReviewActionBody(target, generalComment),
                  fileComments: target.fileComments,
                  targetPrUrl: target.prUrl || undefined,
                }),
              });

              const prResult = await readPRActionResponse(prRes);

              if (!prResult.ok) {
                return { ...target, status: "failed", error: prResult.error };
              }

              if (prResult.prUrl) openUrls.push(prResult.prUrl);

              return { ...target, status: "success" };
            } catch (error) {
              return {
                ...target,
                status: "failed",
                error: error instanceof Error ? error.message : "Network error",
              };
            }
          }),
        );

        const updatedTargets = results.map((result, index) =>
          result.status === "fulfilled"
            ? result.value
            : { ...targets[index], status: "failed" as const, error: "Unexpected error" },
        );

        const allSucceeded = updatedTargets.every((target) => target.status === "success");

        if (!allSucceeded) {
          setPlatformCommentDialog((previous) =>
            previous
              ? {
                  ...previous,
                  plan: { ...plan, targets: updatedTargets },
                }
              : null,
          );

          return;
        }

        setPlatformCommentDialog(null);
        onSubmitted(action === "approve" ? "approved" : "feedback");

        if (platformOpenPR) {
          for (const url of openUrls) window.open(url, "_blank");
        }

        const prLinks = openUrls.join(", ");

        const statusMessage =
          action === "approve"
            ? `Pull request approved on GitHub${prLinks ? ": " + prLinks : ""}`
            : `Pull request reviewed on GitHub${prLinks ? ": " + prLinks : ""}`;

        fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            approved: false,
            feedback: statusMessage,
            annotations: [],
          }),
        }).catch(() => {});
      } catch (error) {
        setPlatformActionError(error instanceof Error ? error.message : "Failed to submit review");
      } finally {
        setIsPlatformActioning(false);
      }
    },
    [platformOpenPR, prMetadata, onSubmitted],
  );

  const openPlatformDialog = useCallback(
    (action: PlatformReviewAction) => {
      const diffPaths = new Set(files.map((file) => file.path));

      const prMeta = prMetadata
        ? {
            number: prMetadata.number,
            title: prMetadata.title,
            repo: getDisplayRepo(prMetadata),
          }
        : undefined;

      const plan = buildReviewSubmission(
        allAnnotations,
        editorAnnotations,
        prMetadata?.url,
        diffPaths,
        prMeta,
      );

      setPlatformGeneralComment("");
      setPlatformCommentDialog({ action, plan });
    },
    [allAnnotations, editorAnnotations, files, prMetadata],
  );

  const closePlatformDialog = useCallback(() => {
    setPlatformCommentDialog(null);
  }, []);

  useEffect(() => {
    if (!prMetadata) return;
    let lastAltUp = 0;
    const DOUBLE_TAP_WINDOW = 300;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Alt" || event.repeat) return;
      const tag = event.target instanceof HTMLElement ? event.target.tagName : undefined;

      if (tag === "INPUT" || tag === "TEXTAREA") return;
    };

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.key !== "Alt") return;
      const now = Date.now();

      if (now - lastAltUp < DOUBLE_TAP_WINDOW) {
        setReviewDestination((previous) => {
          const next = previous === "platform" ? "agent" : "platform";
          storage.setItem("plannotator-review-dest", next);
          setPlatformActionError(null);

          return next;
        });
        lastAltUp = 0;
      } else {
        lastAltUp = now;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [prMetadata]);

  return {
    reviewDestination,
    selectReviewDestination,
    showDestinationMenu,
    setShowDestinationMenu,
    isPlatformActioning,
    platformActionError,
    platformUser,
    setPlatformUser,
    platformCommentDialog,
    platformGeneralComment,
    setPlatformGeneralComment,
    platformOpenPR,
    setPlatformOpenPR,
    platformMode: reviewDestination === "platform" && !!prMetadata,
    openPlatformDialog,
    closePlatformDialog,
    submitPlatformAction,
  };
}
