import { useEffect, type Dispatch, type SetStateAction } from "react";
import { isTypingTarget, type ReviewSearchMatch } from "./useReviewSearch";

export interface ReviewNavigationShortcutOptions {
  hasSearchableFiles: boolean;
  isSearchPending: boolean;
  searchMatches: ReviewSearchMatch[];
  showDestinationMenu: boolean;
  showExportModal: boolean;
  isSearchOpen: boolean;
  searchQuery: string;
  openSearch: () => void;
  stepSearchMatch: (direction: number) => void;
  clearSearch: () => void;
  closeSearch: () => void;
  isFileTreeOpen: boolean;
  setIsFileTreeOpen: Dispatch<SetStateAction<boolean>>;
  setShowDestinationMenu: Dispatch<SetStateAction<boolean>>;
  setShowExportModal: Dispatch<SetStateAction<boolean>>;
  isSidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
}

function handleReviewSearchShortcut(
  event: KeyboardEvent,
  options: ReviewNavigationShortcutOptions,
): boolean {
  if (
    !(event.metaKey || event.ctrlKey) ||
    event.key.toLowerCase() !== "f" ||
    isTypingTarget(event.target)
  ) {
    return false;
  }
  if (options.hasSearchableFiles) {
    event.preventDefault();
    options.setIsFileTreeOpen(true);
    options.openSearch();
  }
  return true;
}

function handleReviewSearchNavigationShortcut(
  event: KeyboardEvent,
  options: ReviewNavigationShortcutOptions,
): boolean {
  if (
    (event.key !== "Enter" && event.key !== "F3") ||
    options.searchMatches.length === 0 ||
    options.isSearchPending ||
    isTypingTarget(event.target)
  ) {
    return false;
  }
  event.preventDefault();
  options.stepSearchMatch(event.shiftKey ? -1 : 1);
  return true;
}

function handleReviewEscapeShortcut(
  event: KeyboardEvent,
  options: ReviewNavigationShortcutOptions,
): boolean {
  if (event.key !== "Escape") return false;
  if (options.showDestinationMenu) {
    options.setShowDestinationMenu(false);
  } else if (options.showExportModal) {
    options.setShowExportModal(false);
  } else if (options.isSearchOpen) {
    if (options.searchQuery) options.clearSearch();
    else options.closeSearch();
  } else if (options.searchQuery) {
    options.clearSearch();
  }
  return true;
}

function handleFileTreeShortcut(
  event: KeyboardEvent,
  setIsFileTreeOpen: Dispatch<SetStateAction<boolean>>,
): boolean {
  if (
    !(event.metaKey || event.ctrlKey) ||
    event.shiftKey ||
    event.altKey ||
    event.key.toLowerCase() !== "b" ||
    isTypingTarget(event.target)
  ) {
    return false;
  }
  event.preventDefault();
  setIsFileTreeOpen((previous) => !previous);
  return true;
}

function handleReviewSidebarShortcut(
  event: KeyboardEvent,
  options: ReviewNavigationShortcutOptions,
): void {
  if (!(event.metaKey || event.ctrlKey) || event.key !== "." || isTypingTarget(event.target)) {
    return;
  }
  event.preventDefault();
  if (options.isSidebarOpen) options.closeSidebar();
  else options.openSidebar();
}

export function useReviewNavigationShortcuts(options: ReviewNavigationShortcutOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (handleReviewSearchShortcut(event, options)) return;
      if (handleReviewSearchNavigationShortcut(event, options)) return;
      if (handleReviewEscapeShortcut(event, options)) return;
      if (handleFileTreeShortcut(event, options.setIsFileTreeOpen)) return;
      handleReviewSidebarShortcut(event, options);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    options.showExportModal,
    options.showDestinationMenu,
    options.isSearchOpen,
    options.searchQuery,
    options.searchMatches,
    options.isSearchPending,
    options.openSearch,
    options.stepSearchMatch,
    options.clearSearch,
    options.closeSearch,
    options.hasSearchableFiles,
    options.isSidebarOpen,
    options.openSidebar,
    options.closeSidebar,
    options.isFileTreeOpen,
    options.setIsFileTreeOpen,
  ]);
}
