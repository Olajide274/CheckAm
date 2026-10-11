export interface TacCsvRow {
  tac: string;
  brand: string;
  model: string;
}

export interface ParsedTacCsv {
  rows: TacCsvRow[];
  totalRows: number;
  duplicateRows: number;
  invalidRows: number;
}

interface CsvRecord {
  fields: string[];
  invalid: boolean;
}

function parseCsvRecords(contents: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;
  let invalid = false;

  const finishField = () => {
    fields.push(field);
    field = "";
    afterQuote = false;
  };
  const finishRecord = () => {
    finishField();
    if (fields.some((value) => value.trim()) || invalid) {
      records.push({ fields, invalid: invalid || inQuotes });
    }
    fields = [];
    invalid = false;
  };

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index] ?? "";
    if (inQuotes) {
      if (character === '"' && contents[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
        afterQuote = true;
      } else {
        field += character;
      }
      continue;
    }

    if (afterQuote) {
      if (character === ",") {
        finishField();
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && contents[index + 1] === "\n") {
          index += 1;
        }
        finishRecord();
      } else if (!/\s/.test(character)) {
        invalid = true;
        field += character;
        afterQuote = false;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      inQuotes = true;
    } else if (character === '"') {
      invalid = true;
      field += character;
    } else if (character === ",") {
      finishField();
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && contents[index + 1] === "\n") {
        index += 1;
      }
      finishRecord();
    } else {
      field += character;
    }
  }

  if (inQuotes) invalid = true;
  if (fields.length > 0 || field || invalid || afterQuote) finishRecord();
  return records;
}

export function parseTacCsv(contents: string): ParsedTacCsv {
  const records = parseCsvRecords(contents.replace(/^\uFEFF/, ""));
  const header = records.shift();
  if (!header || header.invalid) {
    throw new Error("TAC CSV must include a valid header row.");
  }

  const columns = header.fields.map((field) => field.trim().toLowerCase());
  const tacIndex = columns.indexOf("tac");
  const brandIndex = columns.indexOf("brand");
  const modelIndex = columns.indexOf("model");
  if (tacIndex < 0 || brandIndex < 0 || modelIndex < 0) {
    throw new Error("TAC CSV header must include tac, brand, and model columns.");
  }

  const uniqueRows = new Map<string, TacCsvRow>();
  let duplicateRows = 0;
  let invalidRows = 0;

  for (const record of records) {
    if (record.invalid || record.fields.length !== columns.length) {
      invalidRows += 1;
      continue;
    }

    const tac = record.fields[tacIndex]?.trim() ?? "";
    const brand = record.fields[brandIndex]?.trim() ?? "";
    const model = record.fields[modelIndex]?.trim() ?? "";
    if (!/^\d{8}$/.test(tac) || !brand || !model) {
      invalidRows += 1;
      continue;
    }

    if (uniqueRows.has(tac)) duplicateRows += 1;
    uniqueRows.set(tac, { tac, brand, model });
  }

  return {
    rows: [...uniqueRows.values()],
    totalRows: records.length,
    duplicateRows,
    invalidRows,
  };
}
