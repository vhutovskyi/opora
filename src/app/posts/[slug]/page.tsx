import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPostBySlug } from "@/lib/supabase";
import { SITE_NAME } from "@/lib/site";
import LongDescriptionRenderer from "@/components/longDescription/LongDescriptionRenderer";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return { title: "Сторінку не знайдено" };

  // A relative canonical — so that localhost and prod each give their own domain.
  const url = `/posts/${slug}`;
  return {
    title: post.title,
    description: post.excerpt || post.title,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      title: post.title,
      description: post.excerpt || post.title,
      url,
    },
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-400 px-4 pb-16 pt-24 md:pt-32 lg:px-8 lg:pt-40">
      <h1 className="mb-2 text-3xl font-semibold text-opora-brown md:text-4xl">{post.title}</h1>
      {post.excerpt && <p className="mb-4 max-w-3xl text-stone-600">{post.excerpt}</p>}
      {/* The same renderer as a product's long description — the styles aren't duplicated. */}
      <LongDescriptionRenderer blocks={post.blocks} />
    </article>
  );
}
