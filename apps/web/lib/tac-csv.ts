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
  records.shift();
  const header = records.shift();
  if (
    !header ||
    header.invalid ||
    header.fields[0]?.trim().toLowerCase() !== "tac" ||
    header.fields[1]?.trim().toLowerCase() !== "name" ||
    header.fields[2]?.trim().toLowerCase() !== "name"
  ) {
    throw new Error("TAC CSV header must begin with tac,name,name columns.");
  }

  const uniqueRows = new Map<string, TacCsvRow>();
  let duplicateRows = 0;
  let invalidRows = 0;

  for (const record of records) {
    if (record.invalid || record.fields.length < 3) {
      invalidRows += 1;
      continue;
    }

    const tac = record.fields[0]?.trim() ?? "";
    const brand = record.fields[1]?.trim() ?? "";
    const model = record.fields[2]?.trim() ?? "";
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
