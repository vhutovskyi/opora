import Link from "next/link";
import { getCounts } from "../actions";
import { Card } from "../ui";

export const dynamic = "force-dynamic";

const CARDS = [
  { key: "products", label: "Товари", href: "/admin/products" },
  { key: "variants", label: "Варіації", href: "/admin/products" },
  { key: "banners", label: "Банери", href: "/admin/marketing?tab=banners" },
  { key: "comments", label: "Коментарі", href: "/admin/comments" },
  { key: "requests", label: "Заявки", href: "/admin/requests" },
  { key: "options", label: "Опції", href: "/admin/marketing?tab=filters" },
] as const;

export default async function Dashboard() {
  const counts = await getCounts();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-opora-brown">Огляд</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {CARDS.map((c) => (
          <Link key={c.label + c.href} href={c.href}>
            <Card className="transition hover:shadow-md">
              <div className="text-3xl font-bold text-opora-brown">{counts[c.key as keyof typeof counts] ?? 0}</div>
              <div className="mt-1 text-sm text-gray-500">{c.label}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
