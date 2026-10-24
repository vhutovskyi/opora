import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import StorefrontChrome from "@/components/layout/StorefrontChrome";
import JsonLd from "@/components/seo/JsonLd";
import { getCatalogs, getSubcategoryOptions } from "@/lib";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, DEFAULT_OG_IMAGE } from "@/lib/site";
import Providers from "./providers";
import Script from "next/script";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
const UMAMI_SRC = process.env.NEXT_PUBLIC_UMAMI_SRC ?? "https://cloud.umami.is/script.js";

const rubik = Rubik({
  subsets: ["latin", "cyrillic"],
  variable: "--font-rubik",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — мінімалістичні крісла та меблі`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: ["меблі", "крісла", "дизайнерські меблі", "OPORA", "мінімалізм"],
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "uk_UA",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: `${SITE_NAME} — мінімалістичні крісла та меблі`,
    description: SITE_DESCRIPTION,
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — мінімалістичні крісла та меблі`,
    description: SITE_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  robots: { index: true, follow: true },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  // Cyrillic spelling of the brand — Latin "OPORA" and Cyrillic "Опора" are different
  // characters, so without this Google has no text to match a Cyrillic-typed brand search to.
  alternateName: "Опора",
  url: SITE_URL,
  description: SITE_DESCRIPTION,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Catalogs/subcategories for the header navigation (cached reads, the "catalog" tag).
  const [catalogs, subcategoryOptions] = await Promise.all([getCatalogs(), getSubcategoryOptions()]);

  return (
    <html lang="uk" className={`${rubik.variable}`}>
      <head>
        {/* GA */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />

        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', '${GA_ID}');
          `}
        </Script>

        {/* UMAMI */}
        {UMAMI_WEBSITE_ID && (
          <Script defer src={UMAMI_SRC} data-website-id={UMAMI_WEBSITE_ID} />
        )}
      </head>
      <body className="font-sans text-opora-brown antialiased" suppressHydrationWarning>
        <JsonLd data={organizationJsonLd} />
        <Providers>
          <StorefrontChrome catalogs={catalogs} subcategoryOptions={subcategoryOptions}>{children}</StorefrontChrome>
        </Providers>
      </body>
    </html>
  );
}