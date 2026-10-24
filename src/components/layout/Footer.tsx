"use client";

import { useState } from "react";
import { ChairLogo } from "../ui/Icons";
import Toast from "../ui/Toast";
import { generateRequestNumber, formatUaPhone } from "@/lib";
import { STORE } from "@/lib/site";

export default function Footer() {
  const [formData, setFormData] = useState({ name: "", phone: "+380" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; subMessage?: string } | null>(null);

  const showToast = (message: string, subMessage?: string) => {
    setToast({ message, subMessage });
    setTimeout(() => setToast(null), 5000);
  };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    // We generate the request number on the client so it can be shown to the user right away
    const orderNumber = generateRequestNumber();

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          phoneNumber: formData.phone,
          orderNumber,
          orders: [] // Empty array for a general consultation request
        }),
      });

      if (response.ok) {
        showToast("Заявку прийнято! Ми зателефонуємо найближчим часом.", `Заявка №${orderNumber}`);
        setFormData({ name: "", phone: "+380" });
      } else {
        showToast("Сталася помилка. Спробуйте пізніше.");
      }
    } catch (error) {
      console.error("Помилка відправки:", error);
      showToast("Помилка з'єднання. Перевірте інтернет.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <footer className="bg-opora-brown text-white overflow-hidden flex flex-col lg:flex-row">

      {/* LEFT: Map — no padding, full height, ~45% width */}
      <div className="relative h-64 lg:h-auto lg:w-[45%] shrink-0 m-5">
        <iframe
          src={`https://maps.google.com/maps?q=${encodeURIComponent(`${STORE.addressLine}, ${STORE.city}`)}&z=14&output=embed`}
          className="absolute inset-0 w-full h-full"
          style={{ border: 0, display: 'block' }}
          allowFullScreen={false}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={`OPORA Магазин — ${STORE.addressLine}, ${STORE.city}`}
        />
      </div>

      {/* RIGHT: Content */}
      <div className="relative flex-1 flex flex-col py-12 md:py-16 px-8 md:px-12">

        {/* Background SVG Chair */}
        <div className="absolute bottom-0 right-0 w-100 h-100 md:w-150 md:h-150 opacity-5 pointer-events-none translate-x-1/4 translate-y-1/4">
          <ChairLogo className="w-full h-full" />
        </div>

        {/* Top: Важко обрати */}
        <div className="relative z-10 mb-auto">
          <h2 className="text-2xl md:text-3xl font-medium tracking-wider mb-2">Важко обрати?</h2>
          <p className="text-white/80 mb-6 font-light">
            Залиште заявку і наш менеджер зв'яжеться з вами
          </p>
          <form onSubmit={handleFormSubmit} className="flex flex-col gap-3 max-w-md">
            <div className="relative">
              <input
                type="text"
                placeholder="Ваше ім'я"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-transparent border border-white/40 px-4 py-3 pr-8 text-white placeholder:text-white/60 focus:outline-none focus:border-white transition-colors"
              />
              <span className="absolute top-2.5 right-3 text-red-400 text-lg leading-none pointer-events-none">*</span>
            </div>
            <div className="relative">
              <input
                type="tel"
                placeholder="+380 XX XXX XX XX"
                pattern="^\+380 \d{2} \d{3} \d{2} \d{2}$"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: formatUaPhone(e.target.value) })}
                className="w-full bg-transparent border border-white/40 px-4 py-3 pr-8 text-white placeholder:text-white/60 focus:outline-none focus:border-white transition-colors"
              />
              <span className="absolute top-2.5 right-3 text-red-400 text-lg leading-none pointer-events-none">*</span>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-white text-opora-brown font-medium py-3 mt-1 hover:bg-white/90 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? "Відправка..." : "Отримати консультацію"}
            </button>
          </form>
        </div>

        {/* Bottom: Покупцям + Контакти + Copyright */}
        <div className="relative z-10 mt-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 mb-10">

            {/* Payment and delivery */}
            <div>
              <h3 className="text-lg font-medium mb-5 tracking-wide uppercase">Оплата і доставка</h3>
              <p className="text-sm text-white/70 font-light leading-relaxed pr-4">
                Ми здійснюємо доставку по всій Україні за допомогою Нової Пошти, Delivery Auto чи Приватними перевізниками. Оплата можлива готівкою при отриманні (післяплата), переказом на карту або за безготівковим розрахунком для юридичних осіб. Термін відправки: 1-3 робочих дні.
              </p>
            </div>

            {/* Contacts */}
            <div>
              <h3 className="text-lg font-medium mb-5 tracking-wide uppercase">Контакти</h3>
              <div className="space-y-3 font-light text-white/80">
                <p>
                  <a href={`tel:+${STORE.phoneRaw}`} className="hover:text-white transition-colors">{STORE.phoneDisplay}</a>
                </p>
                <p>
                  <a href={`mailto:${STORE.email}`} className="hover:text-white transition-colors">{STORE.email}</a>
                </p>
                <p>{STORE.addressLine}, {STORE.city}</p>
                <p>{STORE.hours}</p>
              </div>
            </div>

          </div>

          {/* Copyright */}
          <div className="pt-6 border-t border-white/10 flex flex-col md:flex-row justify-between items-center text-sm font-light text-white/50">
            <p>© 2026 OPORA. Всі права захищені.</p>
          </div>
        </div>

      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </footer>
  );
}