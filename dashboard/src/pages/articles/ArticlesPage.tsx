import React from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Plus } from "lucide-react";
import type { InferResponseType } from "hono/client";
import { crm, unwrap } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { QueryView, useAction, useQuery, useSearchState } from "@/lib/hooks";
import { Button } from "@/ui/button";
import { Field, Input, Select } from "@/ui/form";
import { Badge, Dialog, EmptyState, PageHeader } from "@/ui/layout";
import { Table, Td, Th, Tr } from "@/ui/table";

type ArticleSummary = InferResponseType<typeof crm.articles.search.$post, 200>["articles"][number];
type Status = ArticleSummary["status"];

export function ArticlesPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useSearchState<"q" | "status">();
  const [search, setSearch] = React.useState(filters.q ?? "");
  const [creating, setCreating] = React.useState(false);
  const query = useQuery(() => unwrap(crm.articles.search.$post({ json: { search: filters.q, status: (filters.status as Status) || undefined } })).then((r) => r.articles), filters);

  return (
    <>
      <PageHeader
        title="Articles"
        lede="News, guides and updates published at bestbuilderdeveloper.com/articles/."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New article
          </Button>
        }
      />
      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ q: search });
        }}
      >
        <Input className="max-w-xs" placeholder="Search titles" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => setFilters({ q: search })} />
        <Select
          className="max-w-[12rem]"
          value={filters.status ?? ""}
          placeholder="All articles"
          options={[
            { value: "published", label: "Published" },
            { value: "draft", label: "Drafts" },
          ]}
          onChange={(e) => setFilters({ status: e.target.value })}
        />
      </form>
      <QueryView query={query}>
        {(articles) =>
          articles.length === 0 ? (
            <EmptyState title={filters.q || filters.status ? "No articles match" : "No articles yet"}>
              {!filters.q && !filters.status && "Write the first one with New article. It stays a draft until you publish it."}
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th className="w-24">Cover</Th>
                  <Th>Title</Th>
                  <Th>Status</Th>
                  <Th>Published</Th>
                  <Th>Last edited</Th>
                </tr>
              </thead>
              <tbody>
                {articles.map((a) => (
                  <Tr key={a.id} onClick={() => navigate(`/articles/${a.id}`)}>
                    <Td>
                      {a.cover ? (
                        <img src={a.cover.thumb} alt="" className="h-12 w-20 rounded object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-12 w-20 items-center justify-center rounded bg-muted text-muted-foreground">
                          <FileText className="h-4 w-4" />
                        </div>
                      )}
                    </Td>
                    <Td className="min-w-[16rem]">
                      <div className="font-medium">{a.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        /articles/{a.slug}/ · {a.words} words{a.project_name ? ` · ${a.project_name}` : ""}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        {a.status === "published" ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge>}
                        {a.featured && <Badge tone="gold">Home</Badge>}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{a.status === "published" ? formatWhen(a.published_at) : "—"}</Td>
                    <Td className="whitespace-nowrap text-muted-foreground">
                      {formatWhen(a.updated_at)}
                      {a.created_by_username && <div className="text-xs">by {a.created_by_username}</div>}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )
        }
      </QueryView>
      <NewArticleDialog open={creating} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/articles/${id}`)} />
    </>
  );
}

function NewArticleDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = React.useState("");
  const create = useAction((t: string) => unwrap(crm.articles.$post({ json: { title: t } })));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const article = await create.run(title);
    if (article) onCreated(article.id);
  }
  return (
    <Dialog open={open} onClose={onClose} title="New article" width="max-w-md">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Title" hint="You can change it, and the web address, before publishing.">
          <Input autoFocus required maxLength={200} value={title} placeholder="e.g. 5 things to check before buying a plot" onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" pending={create.pending} disabled={!title.trim()}>
            Create draft
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
