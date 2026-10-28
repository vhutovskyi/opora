"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Drawer from "./Drawer";
import { useCartStore } from "@/store/cartStore";
import { hexColor, isHexColor } from "@/app/catalog/[slug]/components/types";
import { ClientRequest, generateRequestNumber, formatUaPhone } from "@/lib";
import NovaPoshtaDelivery, { DeliverySelection } from "@/components/blocks/NovaPoshtaDelivery";

export default function CartDrawer() {
  const isCartOpen = useCartStore((state) => state.isCartOpen);
  const closeCart = useCartStore((state) => state.closeCart);
  const cartItems = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const getTotalPrice = useCartStore((state) => state.getTotalPrice);
  const clearCart = useCartStore((state) => state.clearCart);
  const syncPrices = useCartStore((state) => state.syncPrices);

  // The cart is persisted in localStorage, so its prices can predate a discount (or a price change).
  // Refresh them whenever the drawer opens — the server prices the order the same way (/api/requests),
  // so the total shown here is the total the order arrives with.
  const cartIdsKey = cartItems.map((i) => i.id).sort().join(",");
  useEffect(() => {
    if (!isCartOpen || !cartIdsKey) return;
    const controller = new AbortController();
    fetch(`/api/cart/prices?ids=${cartIdsKey}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, number>>) : null))
      .then((prices) => prices && syncPrices(prices))
      .catch(() => {}); // aborted / offline — keep the stored prices, the server reprices the order anyway
    return () => controller.abort();
  }, [isCartOpen, cartIdsKey, syncPrices]);

  const [checkoutStep, setCheckoutStep] = useState<'cart' | 'form' | 'success'>('cart');
  const [formData, setFormData] = useState({ name: '', phone: '+380' });
  const [deliveryMethod, setDeliveryMethod] = useState<'novaposhta' | 'auto' | 'private'>('novaposhta');
  const [delivery, setDelivery] = useState<DeliverySelection | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  const handleCloseCart = () => {
    closeCart();
    setTimeout(() => {
      setCheckoutStep('cart');
      setFormData({ name: '', phone: '+380' });
      setDeliveryMethod('novaposhta');
      setDelivery(null);
    }, 300); // Reset after drawer transition finishes
  };

  const handleCheckoutSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    // We generate the order number on the client and pass it to the backend
    const newOrderNumber = generateRequestNumber();

    try {
      const payload: ClientRequest = {
        name: formData.name,
        phoneNumber: formData.phone,
        // email: formData.email, // Uncomment if you add an email field to the form
        orderNumber: newOrderNumber,
        deliveryMethod,
        deliveryCity: delivery?.cityName,
        deliveryWarehouse: delivery?.warehouseName,
        orders: [
          ...cartItems,
        ]
      };

      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json() as { success?: boolean; error?: string };

      if (response.ok && data.success) {
        setOrderNumber(newOrderNumber);
        setCheckoutStep('success');
        clearCart();
      } else {
        alert(data.error || "Сталася помилка. Будь ласка, спробуйте пізніше.");
      }
    } catch (error) {
      console.error("Помилка відправки форми:", error);
      alert("Помилка з'єднання. Перевірте підключення до інтернету.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer isOpen={isCartOpen} onClose={handleCloseCart} position="right" label="Кошик">
      <div className="flex flex-col h-full text-opora-brown">

        {/* STEP 1: CART ITEMS */}
        {checkoutStep === 'cart' && (
          <>
            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
              {cartItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-6">
                  <p className="text-lg">Ваш кошик порожній</p>
                  <Link
                    href="/catalog"
                    onClick={handleCloseCart}
                    className="py-3 px-8 bg-opora-brown text-white font-medium hover:opacity-90 transition-opacity"
                  >
                    До покупок
                  </Link>
                </div>
              ) : (
                cartItems.map((item) => (
                  <div key={item.id} className="flex gap-5 items-start border-b border-opora-brown/10 pb-6 last:border-0">
                    <div className="relative w-32 h-36 bg-opora-white rounded-sm shrink-0 overflow-hidden">
                      <Image src={item.image} alt={item.title} fill sizes="128px" className="object-contain object-center" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <h4 className="font-medium text-base leading-snug">{item.title}</h4>
                        <button onClick={() => removeItem(item.id)} className="shrink-0 p-1 hover:opacity-70 transition-opacity -mt-0.5">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        {item.options.filter((o) => isHexColor(o.value)).map((opt, i) => (
                          <span
                            key={i}
                            className="w-4 h-4 rounded-full border border-black/10 inline-block shrink-0"
                            style={{ backgroundColor: hexColor(opt.value) }}
                            title={opt.name}
                          />
                        ))}
                        <p className="text-xs font-light opacity-50">Art: {item.sku}</p>
                      </div>
                      {item.options.filter((o) => !isHexColor(o.value)).length > 0 && (
                        <p className="text-xs font-light opacity-70">
                          {item.options.filter((o) => !isHexColor(o.value)).map((o) => o.value).join(" · ")}
                        </p>
                      )}
                      <div className="flex flex-col gap-1 mt-auto">
                        <div className="flex items-center gap-5 py-3 w-fit">
                          <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="hover:opacity-70 text-xl leading-none">−</button>
                          <span className="text-base font-light w-4 text-center">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="hover:opacity-70 text-xl leading-none">+</button>
                        </div>
                        <p className="text-base font-medium">{(item.price * item.quantity).toLocaleString('uk-UA')} ₴</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cartItems.length > 0 && (
              <div className="pt-6 mt-auto bg-opora-white">
                <div className="flex justify-between items-center mb-6 text-lg font-medium border-t border-opora-brown/10 pt-6">
                  <span>Разом:</span>
                  <span>{getTotalPrice().toLocaleString('uk-UA')} ₴</span>
                </div>
                <button
                  onClick={() => setCheckoutStep('form')}
                  className="w-full py-4 bg-opora-brown text-white font-medium hover:opacity-90 transition-opacity"
                >
                  Оформити замовлення
                </button>
              </div>
            )}
          </>
        )}

        {/* STEP 2: CHECKOUT FORM */}
        {checkoutStep === 'form' && (
          <div className="h-full overflow-y-auto">
            <div className="flex flex-col min-h-full items-center justify-center text-center py-4 md:py-0">
              <h3 className="font-bold text-2xl mb-2">Визначились з замовленням?</h3>
              <p className="text-lg font-light mb-8 max-w-62.5">
                Заповніть форму і ми вам передзвонимо!
              </p>

              <form onSubmit={handleCheckoutSubmit} className="w-full max-w-sm space-y-6">
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Ваше ім'я"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-opora-brown p-4 pr-8 text-lg bg-transparent focus:outline-none focus:ring-1 focus:ring-opora-brown placeholder:text-opora-brown/50"
                  />
                  <span className="absolute top-3 right-3 text-red-500 text-lg leading-none pointer-events-none">*</span>
                </div>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    placeholder="+380 XX XXX XX XX"
                    pattern="^\+380 \d{2} \d{3} \d{2} \d{2}$"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: formatUaPhone(e.target.value) })}
                    className="w-full border border-opora-brown p-4 pr-8 text-lg bg-transparent focus:outline-none focus:ring-1 focus:ring-opora-brown placeholder:text-opora-brown/50"
                  />
                  <span className="absolute top-3 right-3 text-red-500 text-lg leading-none pointer-events-none">*</span>
                </div>

                <div className="space-y-2 text-left">
                  <label className="text-sm font-medium">Спосіб доставки</label>
                  <select
                    value={deliveryMethod}
                    onChange={(e) => {
                      setDeliveryMethod(e.target.value as typeof deliveryMethod);
                      setDelivery(null);
                    }}
                    className="w-full border border-opora-brown p-4 text-lg bg-transparent focus:outline-none focus:ring-1 focus:ring-opora-brown"
                  >
                    <option value="novaposhta">Нова Пошта</option>
                    <option value="auto">Delivery Auto</option>
                    <option value="private">Приватні перевезники</option>
                  </select>
                </div>

                {deliveryMethod === 'novaposhta' ? (
                  <NovaPoshtaDelivery value={delivery} onChange={setDelivery} />
                ) : null}

                <div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 bg-opora-brown text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isSubmitting ? 'Відправка...' : 'Оформити замовлення'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckoutStep('cart')}
                    className="w-full mt-4 text-sm underline underline-offset-4 hover:opacity-70"
                  >
                    Повернутися до кошика
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* STEP 3: SUCCESS */}
        {checkoutStep === 'success' && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <h3 className="font-bold text-2xl mb-4">Дякуємо за замовлення!</h3>
            {orderNumber && (
              <p className="text-sm font-medium mb-3 px-4 py-1.5 rounded-full bg-opora-softBeige">
                Замовлення №{orderNumber}
              </p>
            )}
            <p className="text-lg font-light mb-8 max-w-62.5">
              Наш менеджер зв'яжеться з вами найближчим часом для підтвердження.
            </p>
            <button
              onClick={handleCloseCart}
              className="py-4 px-8 border border-opora-brown hover:bg-opora-brown hover:text-white transition-colors"
            >
              Закрити
            </button>
          </div>
        )}

      </div>
    </Drawer>
  );
}
