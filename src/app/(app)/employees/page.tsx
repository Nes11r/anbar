import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { sp } from "@/lib/format";
import { Badge, Card, Empty, FilterChips, PageHeader, Pagination } from "@/components/ui";
import { SearchBox } from "@/components/client/search-box";

export const metadata = { title: "İşçilər və PPE" };
export const dynamic = "force-dynamic";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("employee.view");
  const s = await searchParams;
  const params = { q: sp(s.q), group: sp(s.group), active: sp(s.active) };
  const page = Number(sp(s.page)) || 1;
  const where: Prisma.EmployeeWhereInput = { isActive: params.active === "0" ? false : params.active === "all" ? undefined : true };
  if (params.group === "ENGINEER" || params.group === "WORKER") where.group = params.group;
  if (params.q) where.OR = [{ fullName: { contains: params.q, mode: "insensitive" } }, { code: { contains: params.q, mode: "insensitive" } }, { position: { contains: params.q, mode: "insensitive" } }];
  const [total, rows, projects, hist] = await Promise.all([
    db.employee.count({ where }),
    db.employee.findMany({ where, orderBy: { fullName: "asc" }, skip: (page - 1) * 50, take: 50 }),
    db.project.findMany({ select: { id: true, code: true } }),
    db.historicalIssue.count(),
  ]);
  const pm = new Map(projects.map((p) => [p.id, p.code]));
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
  return (
    <>
      <PageHeader viewOnly={{ role: user.role, perm: "employee.manage", action: "işçi kartlarını idarə etmək" }} title="İşçilər və PPE" subtitle="Şəxsi məlumatlar minimuma endirilib: ID, ad, kateqoriya, vəzifə, layihə." actions={can(user.role, "employee.manage") && <Link href="/employees/new" className="btn btn-primary">+ Yeni işçi</Link>} />
      {hist > 0 && <p className="mb-3 text-xs text-muted">Excel-dən import edilmiş {hist} tarixi təhvil qeydi işçi kartlarında ayrıca (“tarixi”) göstərilir və qalığa təsir etmir.</p>}
      <Card pad={false}>
        <div className="flex flex-col gap-3 border-b border-line p-3">
          <SearchBox placeholder="Ad, ID, vəzifə" />
          <div className="flex flex-wrap gap-4">
            <FilterChips name="group" value={params.group} params={clean} options={[["", "Hamısı"], ["ENGINEER", "Mühəndis"], ["WORKER", "Fəhlə"]]} />
            <FilterChips name="active" value={params.active} params={clean} options={[["", "Aktiv"], ["0", "Deaktiv"], ["all", "Hamısı"]]} />
          </div>
        </div>
        {rows.length === 0 ? <Empty title="İşçi tapılmadı" /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>ID</th><th>Ad, soyad</th><th>Kateqoriya</th><th>Vəzifə</th><th>Layihə / şöbə</th><th>Status</th></tr></thead>
              <tbody>{rows.map((e) => (
                <tr key={e.id}>
                  <td>{e.code}</td><td><Link className="link" href={`/employees/${e.id}`}>{e.fullName}</Link></td>
                  <td>{e.group === "ENGINEER" ? <Badge tone="brand">Mühəndis</Badge> : <Badge tone="warn">Fəhlə</Badge>}</td>
                  <td>{e.position ?? "—"}</td><td>{[e.projectId && pm.get(e.projectId), e.department].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{e.isActive ? <Badge tone="ok">Aktiv</Badge> : <Badge>Deaktiv</Badge>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={50} total={total} params={clean} />
      </Card>
    </>
  );
}
