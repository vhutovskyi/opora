export type Offer = {
  offer_id: string;
  name: string;
  model: string;
  price: number | null;
  quantity: number | null;
  vendor: string | null;
  color_code: string | null;
  params: Record<string, string>;
};

export type Row = {
  offer_id: string;
  name: string;
  model: string;
  price: number | null;
  quantity: number | null;
  color_code: string | null;
  available: boolean;
  imported: boolean;
  params: Record<string, string> | null;
};

export type Page = {
  items: Row[];
  nextCursor: string | null;
  counts?: { all: number; available: number; unavailable: number };
};

export type Filter = "all" | "available" | "unavailable";

export type ApiResp = {
  error?: string;
  staged?: number;
  marked?: number;
  counts?: Record<string, number>;
  done?: boolean;
};
