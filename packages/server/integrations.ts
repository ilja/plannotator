/**
 * Note-taking app integrations (Obsidian).
 */

import { join } from "path";
import { mkdirSync, existsSync, statSync } from "fs";
import { detectProjectName } from "./project";

import {
  type ObsidianConfig,
  type IntegrationResult,
  extractTitle,
  generateFrontmatter,
  generateFilename,
  detectObsidianVaults,
} from "@plannotator/shared/integrations-common";
import { resolveUserPath } from "@plannotator/shared/resolve-file";

export type { ObsidianConfig, IntegrationResult };

export { detectObsidianVaults, extractTitle, generateFrontmatter, generateFilename };

/**
 * Extract tags from markdown content using simple heuristics
 * Includes project name detection (git repo or directory name)
 */
export async function extractTags(markdown: string): Promise<string[]> {
  const tags = new Set<string>(["plannotator"]);

  // Add project name tag (git repo name or directory fallback)
  const projectName = await detectProjectName();

  if (projectName) {
    tags.add(projectName);
  }

  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
    "into",
    "plan",
    "implementation",
    "overview",
    "phase",
    "step",
    "steps",
  ]);

  // Extract from first H1 title
  const h1Match = markdown.match(/^#\s+(?:Implementation\s+Plan:|Plan:)?\s*(.+)$/im);

  if (h1Match) {
    const titleWords = h1Match[1]
      .toLowerCase()
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word));

    titleWords.slice(0, 3).forEach((word) => tags.add(word));
  }

  // Extract code fence languages
  const langMatches = markdown.matchAll(/```(\w+)/g);
  const seenLangs = new Set<string>();

  for (const [, lang] of langMatches) {
    const normalizedLang = lang.toLowerCase();

    if (
      !seenLangs.has(normalizedLang) &&
      !["json", "yaml", "yml", "text", "txt", "markdown", "md"].includes(normalizedLang)
    ) {
      seenLangs.add(normalizedLang);
      tags.add(normalizedLang);
    }
  }

  return Array.from(tags).slice(0, 7);
}

// --- Obsidian Integration ---

/**
 * Save plan to Obsidian vault with cross-platform path handling
 */
export async function saveToObsidian(config: ObsidianConfig): Promise<IntegrationResult> {
  try {
    const { vaultPath, folder, plan } = config;

    if (!vaultPath?.trim()) {
      return { success: false, error: "Vault path is required" };
    }

    const normalizedVault = resolveUserPath(vaultPath);

    // Validate vault path exists and is a directory
    if (!existsSync(normalizedVault)) {
      return {
        success: false,
        error: `Vault path does not exist: ${normalizedVault}`,
      };
    }

    const vaultStat = statSync(normalizedVault);

    if (!vaultStat.isDirectory()) {
      return {
        success: false,
        error: `Vault path is not a directory: ${normalizedVault}`,
      };
    }

    // Build target folder path
    const folderName = folder.trim() || "plannotator";
    const targetFolder = join(normalizedVault, folderName);

    // Create folder if it doesn't exist (guard for Bun mkdirSync regression)
    if (!existsSync(targetFolder)) {
      mkdirSync(targetFolder, { recursive: true });
    }

    // Generate filename and full path
    const filename = generateFilename(plan, config.filenameFormat, config.filenameSeparator);
    const filePath = join(targetFolder, filename);

    // Generate content with frontmatter and backlink
    const tags = await extractTags(plan);
    const frontmatter = generateFrontmatter(tags);
    const content = `${frontmatter}\n\n[[Plannotator Plans]]\n\n${plan}`;

    // Write file
    await Bun.write(filePath, content);

    return { success: true, path: filePath };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    return { success: false, error: message };
  }
}
