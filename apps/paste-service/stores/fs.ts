import { mkdirSync, readdirSync, readFileSync, unlinkSync } from "fs";
import { join, resolve } from "path";
import { Schema } from "effect";
import type { PasteStore } from "../core/storage";

const PasteFile = Schema.Struct({
  data: Schema.String,
  expiresAt: Schema.Finite,
});

type PasteFile = Schema.Schema.Type<typeof PasteFile>;

const PasteFileJson = Schema.fromJsonString(PasteFile);

/** Decode and validate JSON persisted by the filesystem paste store. */
export const decodePasteFile = Schema.decodeUnknownSync(PasteFileJson);

export class FsPasteStore implements PasteStore {
  private resolvedDir: string;

  constructor(private dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.resolvedDir = resolve(dataDir);
    this.sweep();
  }

  private safePath(id: string): string {
    const filePath = resolve(join(this.dataDir, `${id}.json`));
    if (!filePath.startsWith(this.resolvedDir)) {
      throw new Error("Invalid paste ID");
    }
    return filePath;
  }

  async put(id: string, data: string, ttlSeconds: number): Promise<void> {
    const entry: PasteFile = {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
    await Bun.write(this.safePath(id), JSON.stringify(entry));
  }

  async get(id: string): Promise<string | null> {
    const path = this.safePath(id);
    try {
      const entry = decodePasteFile(await Bun.file(path).text());
      if (Date.now() > entry.expiresAt) {
        unlinkSync(path);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  /** Delete expired pastes on startup */
  private sweep(): void {
    try {
      const files = readdirSync(this.dataDir).filter((f) => f.endsWith(".json"));
      const now = Date.now();
      for (const file of files) {
        const path = join(this.dataDir, file);
        try {
          const raw = readFileSync(path, "utf-8");
          const entry = decodePasteFile(raw);
          if (now > entry.expiresAt) {
            unlinkSync(path);
          }
        } catch {
          // skip malformed files
        }
      }
    } catch {
      // dataDir might not exist yet
    }
  }
}
