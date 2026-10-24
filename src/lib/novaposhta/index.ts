const NP_ENDPOINT = "https://api.novaposhta.ua/v2.0/json/";

export interface NpCity {
  ref: string;
  name: string;
  area: string;
}

export interface NpWarehouse {
  ref: string;
  name: string;
  number: string;
}

interface NpApiResponse<T> {
  success: boolean;
  data: T[];
  errors: string[];
  warnings: string[];
}

async function npRequest<T>(
  modelName: string,
  calledMethod: string,
  methodProperties: Record<string, string>
): Promise<T[]> {
  const apiKey = process.env.NOVA_POSHTA_API_KEY;
  if (!apiKey) {
    throw new Error("NOVA_POSHTA_API_KEY не налаштовано");
  }

  const response = await fetch(NP_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties }),
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Nova Poshta API error: ${response.status}`);
  }

  const json = (await response.json()) as NpApiResponse<T>;
  if (!json.success) {
    throw new Error(json.errors?.join(", ") || "Nova Poshta request failed");
  }
  return json.data;
}

// City search by string (for autocomplete)
export async function searchCities(query: string): Promise<NpCity[]> {
  if (!query || query.trim().length < 2) return [];
  const data = await npRequest<{ Ref: string; Description: string; AreaDescription: string }>(
    "Address",
    "getCities",
    { FindByString: query.trim(), Limit: "20" }
  );
  return data.map((c) => ({ ref: c.Ref, name: c.Description, area: c.AreaDescription }));
}

const MIN_WAREHOUSE_WEIGHT_KG = 200;

export async function getWarehouses(cityRef: string, query = ""): Promise<NpWarehouse[]> {
  if (!cityRef) return [];
  const props: Record<string, string> = { CityRef: cityRef, Limit: "500" };
  if (query.trim()) props.FindByString = query.trim();
  const data = await npRequest<{
    Ref: string;
    Description: string;
    Number: string;
    CategoryOfWarehouse?: string;
    TotalMaxWeightAllowed?: string;
  }>("Address", "getWarehouses", props);

  return data
    .filter((w) => {
      // Exclude parcel lockers
      if (w.CategoryOfWarehouse === "Postomat") return false;

      // Nova Poshta states the weight limit in the warehouse name itself, e.g.:
      //   "Відділення №8 (до 30 кг на одне місце)"  — small format
      //   "Відділення №21 (до 200 кг)"              — accepts heavy items
      //   "Відділення №1: вул. Городоцька, 359"     — freight, no limit
      // The structured TotalMaxWeightAllowed field is 0 for the small warehouses,
      // so they can only be told apart from the freight ones by the name.
      const limitMatch = w.Description.match(/до\s+(\d+)\s*кг/i);
      if (limitMatch && Number(limitMatch[1]) < MIN_WAREHOUSE_WEIGHT_KG) {
        return false; // e.g. "до 30 кг" — we cut it off
      }
      // What is left: warehouses with a limit >= 200 kg and freight ones (no limit in the name).
      return true;
    })
    .map((w) => ({ ref: w.Ref, name: w.Description, number: w.Number }));
}
