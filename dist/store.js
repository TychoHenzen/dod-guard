import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
const STORE_DIR = path.join(os.homedir(), ".claude", "dod-store");
async function ensureStoreDir() {
    await fs.mkdir(STORE_DIR, { recursive: true });
}
function docPath(id) {
    return path.join(STORE_DIR, `${id}.json`);
}
export function generateId() {
    return crypto.randomUUID();
}
export async function save(doc) {
    await ensureStoreDir();
    await fs.writeFile(docPath(doc.id), JSON.stringify(doc, null, 2), "utf-8");
}
export async function load(id) {
    try {
        const data = await fs.readFile(docPath(id), "utf-8");
        return JSON.parse(data);
    }
    catch {
        return null;
    }
}
export async function findByPath(markdownPath) {
    await ensureStoreDir();
    const files = await fs.readdir(STORE_DIR);
    for (const file of files) {
        if (!file.endsWith(".json"))
            continue;
        try {
            const data = await fs.readFile(path.join(STORE_DIR, file), "utf-8");
            const doc = JSON.parse(data);
            const normalizedStored = path.resolve(doc.markdown_path).toLowerCase();
            const normalizedSearch = path.resolve(markdownPath).toLowerCase();
            if (normalizedStored === normalizedSearch)
                return doc;
        }
        catch {
            continue;
        }
    }
    return null;
}
export async function listAll() {
    await ensureStoreDir();
    const files = await fs.readdir(STORE_DIR);
    const docs = [];
    for (const file of files) {
        if (!file.endsWith(".json"))
            continue;
        try {
            const data = await fs.readFile(path.join(STORE_DIR, file), "utf-8");
            docs.push(JSON.parse(data));
        }
        catch {
            continue;
        }
    }
    return docs;
}
export async function remove(id) {
    try {
        await fs.unlink(docPath(id));
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=store.js.map