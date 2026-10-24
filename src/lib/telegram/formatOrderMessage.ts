import type { CartItem } from "@/store/cartStore";

// Delivery method codes → human-readable names
export const DELIVERY_LABELS: Record<string, string> = {
  novaposhta: "Нова Пошта",
  auto: "Delivery Auto",
  private: "Приватні перевізники",
};

type FormatInput = {
  orderNumber: string;
  name: string;
  phoneNumber: string;
  orders?: CartItem[];
  deliveryLabel?: string;
  deliveryCity?: string;
  deliveryWarehouse?: string;
};

// Builds the HTML message for Telegram. An empty cart → a consultation; otherwise — a full order.
export function formatOrderMessage(input: FormatInput): string {
  const { orderNumber, name, phoneNumber, orders, deliveryLabel, deliveryCity, deliveryWarehouse } = input;

  // CHECK: if the cart is empty -> this is just a consultation
  if (!orders || orders.length === 0) {
    return (
      `💡 <b>Запит на консультацію!</b>\n` +
      `🔖 <b>Запит №:</b> ${orderNumber}\n\n` +
      `👤 <b>Ім'я:</b> ${name}\n` +
      `📞 <b>Телефон:</b> ${phoneNumber}\n\n`
    );
  }

  // OTHERWISE: this is a full order
  let totalSum = 0;
  let productsListText = "\n\n🛍 <b>Деталі замовлення:</b>\n";

  orders.forEach((item, index) => {
    const itemQuantity = item.quantity || 1;
    const itemTotal = item.price * itemQuantity;
    totalSum += itemTotal;

    const optionNames = item.options?.map((o) => o.name).join(" / ") || "";
    const articleLine = item.sku ? ` [Art: ${item.sku}]` : "";

    productsListText += `${index + 1}. ${item.title}${articleLine}\n`;
    if (optionNames) productsListText += `   🎨 ${optionNames}\n`;
    productsListText += `   ${itemQuantity} шт. x ${item.price.toLocaleString("uk-UA")} ₴ = <b>${itemTotal.toLocaleString("uk-UA")} ₴</b>\n`;
  });

  const deliveryText =
    deliveryLabel || deliveryCity || deliveryWarehouse
      ? `\n\n🚚 <b>Доставка${deliveryLabel ? ` (${deliveryLabel})` : ""}:</b>\n` +
        (deliveryCity ? `   🏙 ${deliveryCity}\n` : "") +
        (deliveryWarehouse ? `   🏤 ${deliveryWarehouse}\n` : "")
      : "";

  return (
    `🎉 <b>Нове замовлення!</b>\n` +
    `🔖 <b>Замовлення №:</b> ${orderNumber}\n\n` +
    `👤 <b>Ім'я:</b> ${name}\n` +
    `📞 <b>Телефон:</b> ${phoneNumber}` +
    deliveryText +
    productsListText +
    `\n💰 <b>Загальна сума до сплати:</b> ${totalSum.toLocaleString("uk-UA")} ₴`
  );
}
