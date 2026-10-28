import { ClientRequest } from "@/lib";
import { insertRequest, repriceCartItems } from "@/lib/supabase/requests";
import { formatOrderMessage, DELIVERY_LABELS } from "@/lib/telegram/formatOrderMessage";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ClientRequest;
    const { name, phoneNumber, deliveryMethod, deliveryCity, deliveryWarehouse } = body;
    const deliveryLabel = deliveryMethod ? DELIVERY_LABELS[deliveryMethod] : "";

    // Basic validation
    if (!name || !phoneNumber) {
      return NextResponse.json(
        { error: 'Ім\'я та контактний спосіб (телефон або пошта) є обов\'язковими' },
        { status: 400 }
      );
    }

    // Prices come from the DB, not from the browser's (possibly days-old, pre-discount) cart.
    const orders = body.orders?.length ? await repriceCartItems(body.orders) : body.orders;

    // The order number comes from the client; if it doesn't — we generate it here as a fallback
    const orderNumber = body.orderNumber || Math.floor(100000 + Math.random() * 900000).toString();

    const inserted = await insertRequest({
      name,
      phone_number: phoneNumber || "",
      order_number: orderNumber,
      delivery: deliveryLabel || null,
      delivery_city: deliveryCity || null,
      delivery_warehouse: deliveryWarehouse || null,
      orders: orders && orders.length > 0 ? orders : null,
    });

    // The Telegram notification is "best effort": a failed notification must not break the request creation.
    try {
      const messageText = formatOrderMessage({
        orderNumber,
        name,
        phoneNumber,
        orders,
        deliveryLabel,
        deliveryCity,
        deliveryWarehouse,
      });
      const baseUrl = request.nextUrl.origin;
      await fetch(`${baseUrl}/api/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: messageText, orders }),
      });
    } catch (notifyError) {
      console.error("Не вдалося відправити сповіщення в Telegram:", notifyError);
    }

    return NextResponse.json(
      {
        success: true,
        data: { id: inserted.id, name: inserted.name, orderNumber },
        message: "Запит успішно створено!",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("API Create Request Error:", error);
    return NextResponse.json(
      { error: "Внутрішня помилка сервера при створенні запиту" },
      { status: 500 }
    );
  }
}