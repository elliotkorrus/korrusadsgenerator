import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../drizzle/schema.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In production on Railway, set DB_PATH to the mounted volume path (e.g. /app/data/data.db)
const dbPath = process.env.DB_PATH ?? path.join(__dirname, "..", "data.db");

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = DELETE"); // Avoid WAL split-brain between server and CLI
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("busy_timeout = 5000");

export const db = drizzle(sqlite, { schema });
export { schema };
