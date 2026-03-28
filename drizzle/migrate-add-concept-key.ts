import Database from "better-sqlite3";
const db = new Database("data.db");
try {
  db.exec("ALTER TABLE upload_queue ADD COLUMN concept_key TEXT");
  console.log("Added concept_key column");
} catch (e: any) {
  if (e.message.includes("duplicate column")) console.log("Column already exists");
  else throw e;
}
// Backfill existing rows
const rows = db.prepare("SELECT * FROM upload_queue").all() as any[];
const stmt = db.prepare("UPDATE upload_queue SET concept_key = ? WHERE id = ?");
for (const row of rows) {
  const key = [row.brand, row.initiative, row.variation, row.angle,
    row.source, row.product, row.content_type, row.creative_type,
    row.copy_slug, row.filename, row.date].join("__");
  stmt.run(key, row.id);
}
console.log(`Backfilled ${rows.length} rows`);
db.close();
