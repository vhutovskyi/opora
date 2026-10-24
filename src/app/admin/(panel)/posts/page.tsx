import { listPosts, listSnippets } from "../../actions";
import PostsManager from "./PostsManager";

export const dynamic = "force-dynamic";

export default async function PostsPage() {
  const [posts, snippets] = await Promise.all([listPosts(), listSnippets()]);
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-opora-brown">Статті</h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-500">
        Інформаційні сторінки («Щит чи масив», «Про ламелі»…). Складаються з тих самих блоків, що й опис
        товару. Щоб послатися на статтю з опису товару, вставте в текст{" "}
        <code className="rounded bg-gray-100 px-1">[текст посилання](/posts/адреса)</code> — відносний шлях
        працює однаково на localhost і на проді.
      </p>
      <PostsManager initial={posts} snippets={snippets} />
    </div>
  );
}
