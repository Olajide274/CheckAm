import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Pool } from "pg";
import { parseTacCsv } from "../lib/tac-csv";

const source = "Osmocom TAC database";
const batchSize = 500;

export async function importTacCsv(csvPath: string): Promise<void> {
  const contents = await readFile(csvPath, "utf8");
  const parsed = parseTacCsv(contents);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set to import TAC data.");
  }

  const pool = new Pool({ connectionString });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TABLE IF NOT EXISTS tac_models (
          tac CHAR(8) PRIMARY KEY,
          brand TEXT,
          model TEXT,
          source TEXT,
          imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      for (let offset = 0; offset < parsed.rows.length; offset += batchSize) {
        const batch = parsed.rows.slice(offset, offset + batchSize);
        const values: Array<string> = [];
        const placeholders = batch.map((row, index) => {
          const start = index * 4;
          values.push(row.tac, row.brand, row.model, source);
          return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4})`;
        });
        await client.query(
          `INSERT INTO tac_models (tac, brand, model, source)
           VALUES ${placeholders.join(", ")}
           ON CONFLICT (tac) DO UPDATE
           SET brand = EXCLUDED.brand,
               model = EXCLUDED.model,
               source = EXCLUDED.source,
               imported_at = NOW()`,
          values,
        );
      }
      await client.query("COMMIT");
      console.info(
        `TAC import complete: imported ${parsed.rows.length}, skipped ${parsed.invalidRows}, duplicates ${parsed.duplicateRows}.`,
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

const scriptPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === scriptPath) {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  void importTacCsv(resolve(scriptDirectory, "../data/tac.csv")).catch(
    (error: unknown) => {
      console.error("TAC import failed:", error);
      process.exitCode = 1;
    },
  );
}
