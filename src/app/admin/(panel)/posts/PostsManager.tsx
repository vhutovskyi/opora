"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Checkbox, Field, Input, Textarea } from "../../ui";
import LongDescriptionBuilder from "../products/[id]/LongDescriptionBuilder";
import { deletePost, savePost, type PostRow } from "../../actions";
import type { LongDescriptionBlock, LongDescriptionSnippet } from "@/lib/longDescription/types";

function PostEditor({
  post,
  snippets,
  onDone,
}: {
  post: PostRow;
  snippets: LongDescriptionSnippet[];
  onDone: () => void;
}) {
  const [slug, setSlug] = useState(post.slug);
  const [title, setTitle] = useState(post.title);
  const [excerpt, setExcerpt] = useState(post.excerpt);
  const [visible, setVisible] = useState(post.visible);
  const [blocks, setBlocks] = useState<LongDescriptionBlock[]>(post.blocks);
  const [error, setError] = useState("");
  const [saving, start] = useTransition();

  const href = `/posts/${slug || "…"}`;

  return (
    <Card className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Заголовок *">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Щит чи масив Естелла" />
        </Field>
        <Field label="Адреса (латиницею) *">
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="shchyt-chy-masyv"
          />
        </Field>
      </div>
      <p className="text-xs text-gray-500">
        Сторінка буде за адресою <code className="rounded bg-gray-100 px-1">{href}</code>. У описі товару
        посилайтеся так: <code className="rounded bg-gray-100 px-1">[Детальніше]({href})</code>
      </p>
      <Field label="Короткий опис (для Google і прев'ю посилання)">
        <Textarea rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
      </Field>
      <Checkbox label="Показувати на сайті" checked={visible} onChange={(e) => setVisible(e.target.checked)} />

      <div className="border-t border-gray-200 pt-3">
        <LongDescriptionBuilder blocks={blocks} onChange={setBlocks} snippets={snippets} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={saving || !title.trim() || !slug.trim()}
          onClick={() => start(async () => {
            setError("");
            try {
              await savePost({ id: post.id || undefined, slug, title, excerpt, visible, blocks });
              onDone();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Не вдалося зберегти");
            }
          })}
        >
          {saving ? "Збереження..." : "Зберегти"}
        </Button>
        {post.id && (
          <>
            <Button variant="ghost" onClick={() => window.open(href, "_blank")}>
              Відкрити сторінку ↗
            </Button>
            <Button
              variant="danger"
              disabled={saving}
              onClick={() => start(async () => {
                if (!confirm(`Видалити «${post.title}»? Посилання на неї в описах товарів перестануть працювати.`)) return;
                await deletePost(post.id);
                onDone();
              })}
            >
              Видалити
            </Button>
          </>
        )}
        <Button variant="ghost" disabled={saving} onClick={onDone}>
          Скасувати
        </Button>
      </div>
    </Card>
  );
}

const BLANK: PostRow = { id: "", slug: "", title: "", excerpt: "", visible: true, blocks: [] };

export default function PostsManager({
  initial,
  snippets,
}: {
  initial: PostRow[];
  snippets: LongDescriptionSnippet[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PostRow | null>(null);

  const done = () => {
    setEditing(null);
    router.refresh();
  };

  if (editing) return <PostEditor post={editing} snippets={snippets} onDone={done} />;

  return (
    <div className="space-y-3">
      {initial.map((p) => (
        <Card key={p.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-opora-brown">{p.title}</p>
            <p className="truncate text-xs text-gray-500">
              /posts/{p.slug} · {p.blocks.length} блок(ів)
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge tone={p.visible ? "ok" : "off"}>{p.visible ? "Активна" : "Прихована"}</Badge>
            <Button variant="ghost" onClick={() => setEditing(p)}>
              Редагувати
            </Button>
          </div>
        </Card>
      ))}
      {!initial.length && <p className="text-sm text-gray-500">Статей ще немає.</p>}
      <Button onClick={() => setEditing(BLANK)}>+ Нова стаття</Button>
    </div>
  );
}
