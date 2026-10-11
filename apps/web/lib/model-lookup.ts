import { findTacModel } from "@/lib/database";

export type ModelLookupResult =
  | { status: "found"; brand: string; model: string }
  | { status: "not_found"; brand: null; model: null };

export interface ModelLookup {
  lookup(tac: string): Promise<ModelLookupResult>;
}

export const modelLookup: ModelLookup = {
  async lookup(tac) {
    if (!/^\d{8}$/.test(tac)) {
      return { status: "not_found", brand: null, model: null };
    }

    const row = await findTacModel(tac);
    if (!row?.brand?.trim() || !row.model?.trim()) {
      return { status: "not_found", brand: null, model: null };
    }

    return {
      status: "found",
      brand: row.brand.trim(),
      model: row.model.trim(),
    };
  },
};
