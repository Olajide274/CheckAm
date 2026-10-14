import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Pool } from "pg";
import { importTacModelBatch } from "../lib/database";
import {
  parseTacCsv,
  parseTacSupplementCsv,
} from "../lib/tac-csv";

type ImportFormat = "osmocom" | "supplement";
const batchSize = 500;

export async function importTacCsv(
  csvPath: string,
  format: ImportFormat = "osmocom",
): Promise<void> {
  const contents = await readFile(csvPath, "utf8");
  const parsed =
    format === "supplement"
      ? parseTacSupplementCsv(contents)
      : parseTacCsv(contents);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set to import TAC data.");
  }
  const rows = parsed.rows.map((row) => ({
    ...row,
    source:
      format === "supplement"
        ? `supplement:${row.source ?? "Nigerian TAC supplement"}`
        : "Osmocom TAC database",
  }));

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

      let writtenRows = 0;
      for (let offset = 0; offset < rows.length; offset += batchSize) {
        const batch = rows.slice(offset, offset + batchSize);
        writtenRows += await importTacModelBatch(client, batch, format);
      }
      await client.query("COMMIT");
      console.info(
        `TAC import complete (${format}): ${format === "supplement" ? "inserted" : "upserted"} ${writtenRows}, skipped invalid ${parsed.invalidRows}, duplicates ${parsed.duplicateRows}, rows ${parsed.totalRows}.`,
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
  const args = process.argv.slice(2);
  const format = args[0] === "--supplement" ? "supplement" : "osmocom";
  const fileArgument = format === "supplement" ? args[1] : args[0];
  if (args.length > (format === "supplement" ? 2 : 1)) {
    console.error(
      "Usage: import-tac.ts [--supplement] [path/to/input.csv]",
    );
    process.exitCode = 1;
  } else {
    const defaultFile =
      format === "supplement"
        ? "data/tac-supplement.csv"
        : "data/tac.csv";
    void importTacCsv(
      resolve(scriptDirectory, "..", fileArgument ?? defaultFile),
      format,
    ).catch((error: unknown) => {
      console.error("TAC import failed:", error);
      process.exitCode = 1;
    });
  }
}
