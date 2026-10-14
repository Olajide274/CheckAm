import { findTacModel } from "@/lib/database";

export type ModelLookupResult =
  | { status: "found"; brand: string; model: string }
  | { status: "brand_only"; brand: string }
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
    const brand = row?.brand?.trim();
    const model = row?.model?.trim();
    if (!brand) {
      return { status: "not_found", brand: null, model: null };
    }

    const comparable = (value: string) =>
      value.toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]/gu, "");
    if (!model || comparable(model) === comparable(brand)) {
      return { status: "brand_only", brand };
    }

    return {
      status: "found",
      brand,
      model,
    };
  },
};
