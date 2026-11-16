import { useLocation, useNavigate } from "react-router-dom";
import { crm, fetchUsers, unwrap } from "@/lib/api";
import { dataOr, QueryView, useQuery, useSearchState } from "@/lib/hooks";
import { EmptyState, PageHeader, Pagination } from "@/ui/layout";
import { ProspectFilters, searchBodyFrom, type ListParams } from "./ProspectFilters";
import { ProspectTable } from "./shared";

const PAGE_SIZE = 25;

export function TouchesPage() {
  const [params, setParams] = useSearchState<keyof ListParams>();
  const navigate = useNavigate();
  const location = useLocation();
  const users = dataOr(useQuery(fetchUsers), []);
  const page = Math.max(1, Number(params.page) || 1);
  const body = searchBodyFrom(params, { touched: true, status: null, field_filters: [] });
  const query = useQuery(() => unwrap(crm.prospects.search.$post({ json: { ...body, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE } })), params);

  return (
    <>
      <PageHeader crumbs="CRM / Touches" title="Touches" lede="Prospects someone has contacted, by their latest touch." />
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ProspectFilters params={params} onApply={(next) => setParams(next)} users={users} mode="touches" />
        <div className="min-w-0">
          <QueryView query={query}>
            {(data) =>
              data.prospects.length === 0 ? (
                <EmptyState title="No touched prospects match">Change the filters to see more.</EmptyState>
              ) : (
                <div className="flex flex-col gap-3">
                  <ProspectTable prospects={data.prospects} onOpen={(p) => navigate(`/prospects/${p.id}`, { state: { from: location.pathname + location.search } })} />
                  <Pagination total={data.total} limit={PAGE_SIZE} offset={(page - 1) * PAGE_SIZE} onChange={(offset) => setParams({ page: String(offset / PAGE_SIZE + 1) })} noun="prospects" />
                </div>
              )
            }
          </QueryView>
        </div>
      </div>
    </>
  );
}
