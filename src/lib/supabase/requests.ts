import { ClientRequest } from "./types";
import { supabaseAdmin } from "./client";

// A client helper — POSTs to /api/requests (the server writes to Supabase).
export async function createRequest(request: ClientRequest) {
  const response = await fetch("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error("Failed to create request");
  return response.json();
}

type RequestFields = {
  name: string;
  phone_number: string;
  order_number: string;
  delivery: string | null;
  delivery_city: string | null;
  delivery_warehouse: string | null;
  orders: unknown[] | null;
};

// The server-side write of a request into Supabase (the cart goes into the orders jsonb column).
export async function insertRequest(fields: RequestFields): Promise<{ id: string; name: string }> {
  const { data, error } = await supabaseAdmin()
    .from("requests")
    .insert(fields)
    .select("id, name")
    .single();
  if (error) throw error;
  return data as { id: string; name: string };
}
