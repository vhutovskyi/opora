// Global SEO constants of the site.
// NEXT_PUBLIC_SITE_URL has to be set in the production environment (Cloudflare),
// otherwise the absolute URLs in the metadata, the sitemap and OG will point at the fallback.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://opora-furniture.com"
).replace(/\/$/, "");

export const SITE_NAME = "OPORA";

export const SITE_DESCRIPTION =
  "Мінімалістичні крісла та меблі OPORA (Опора) — лаконічний дизайн, що стає акцентом вашого інтер'єру.";

export const DEFAULT_OG_IMAGE = "/og-default.png";

// The store's contact details (address, phone, messengers, opening hours).
// Kept in one place — used in the header, the footer and the floating button.
export const STORE = {
  addressLine: "вул. Щирецька, 36",
  city: "Львів",
  hours: "Щодня з 10:00 до 19:00",
  email: "opora.furniture@gmail.com",
  // The phone in two formats: for display and for tel:/messengers
  phoneDisplay: "+380 67 010 39 66",
  phoneRaw: "380670103966",
} as const;

// OPORA does not accept returns on finished products (custom/made-to-order furniture).
// This is declared in the Product JSON-LD via MerchantReturnNotPermitted.
export const RETURN_POLICY = {
  category: "MerchantReturnNotPermitted",
  countryCode: "UA",
} as const;
