import {
    readFile,
    unlink,
} from "node:fs/promises"
import fs from "fs-extra";
import { CatalogSnapshot, CatalogSnapshotSchema } from "../types.js";
import { HarnessPath } from "./path.js";
import path from "node:path";

export class CatalogStore {
    readonly filePath: string

    constructor(paths = new HarnessPath()) {
        this.filePath = paths.catalogFile
    }

    async get(): Promise<CatalogSnapshot | null> {
        try {
            const content = await readFile(this.filePath, "utf8")
            const result = CatalogSnapshotSchema.safeParse(JSON.parse(content))
            return result.success ? result.data : null
        } catch {
            return null
        }
    }

    async set(value: CatalogSnapshot): Promise<void> {
        try {
            const parsed = CatalogSnapshotSchema.parse(value)
            const directory = path.dirname(this.filePath)
            await fs.ensureDir(directory);
            await fs.writeJSON(this.filePath, parsed, { spaces: 2 })
        } catch (error) {
            console.log(error);
        }
    }

    async clear(): Promise<void> {
        try {
            await unlink(this.filePath)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        }
    }

}