import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { can, scopeProjectId } from "@/lib/rbac";
import { fmtDate, fmtQty } from "@/lib/format";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { projectsSummary } from "@/server/services/reports";

export const metadata = { title: "Layihələr" };
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await requirePage("project.view");
  const scope = scopeProjectId(user);
  const rows = (await projectsSummary()).filter((r) => !scope || r.projectId === scope);
  return (
    <>
      <PageHeader viewOnly={{ role: user.role, perm: "project.manage", action: "layihə yaratmaq və dəyişmək" }} title="Layihələr" subtitle="Hər layihəyə verilən, qaytarılan və xalis material (ledger əsasında)." actions={can(user.role, "project.manage") && <Link href="/projects/new" className="btn btn-primary">+ Yeni layihə</Link>} />
      <Card pad={false}>
        {rows.length === 0 ? <Empty title="Layihə yoxdur" action={can(user.role, "project.manage") ? <Link href="/projects/new" className="btn btn-primary">+ Yeni layihə</Link> : undefined} /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Kod</th><th>Ad</th><th className="num">Verilən</th><th className="num">Qaytarılan</th><th className="num">Xalis</th><th className="num">Sənəd</th><th>Son hərəkət</th><th>Status</th></tr></thead>
              <tbody>{rows.map((p) => (
                <tr key={p.projectId}>
                  <td><Link className="link" href={`/projects/${p.projectId}`}>{p.code}</Link></td><td>{p.name} <Link className="ml-1 text-xs link" href={`/sites/${p.projectId}`}>sahə →</Link></td>
                  <td className="num">{fmtQty(p.issued)}</td><td className="num">{fmtQty(p.returned)}</td><td className="num font-bold">{fmtQty(Number(p.issued) - Number(p.returned))}</td>
                  <td className="num">{String(p.docs)}</td><td>{fmtDate(p.lastMove)}</td><td>{p.isActive ? <Badge tone="ok">Aktiv</Badge> : <Badge>Bağlı</Badge>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
