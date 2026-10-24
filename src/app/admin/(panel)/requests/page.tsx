import { listRequests } from "../../actions";
import RequestsList from "./RequestsList";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const requests = await listRequests();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-opora-brown">Заявки</h1>
      <RequestsList requests={requests as never[]} />
    </div>
  );
}
