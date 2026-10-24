import { listSnippets } from "../../actions";
import SnippetsManager from "./SnippetsManager";

export const dynamic = "force-dynamic";

export default async function DescriptionBlocksPage() {
  const snippets = await listSnippets();
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-opora-brown">Спільні блоки опису</h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-500">
        Набори блоків, які повторюються в багатьох товарах (напр. палітра кольорів). Редагуються тут один
        раз — зміни одразу застосовуються до всіх товарів, що на них посилаються. У картці товару такий
        блок додається через «Спільний блок».
      </p>
      <SnippetsManager initial={snippets} />
    </div>
  );
}
