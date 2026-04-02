import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../drizzle/schema.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema });
export { schema };
