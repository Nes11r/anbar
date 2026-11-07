import Link from "next/link";
import { DeleteButton } from "@/components/delete-button";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDate, fmtQty, sp } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { employeeHistory } from "@/server/services/reports";
import { netHeld } from "@/server/services/stockdocs";
import { variantOptionsByIds } from "@/server/services/catalog";
import { EmployeeForm } from "../employee-form";

export const dynamic = "force-dynamic";

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("employee.view");
  const { id } = await params;
  const s = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const e = await db.employee.findUnique({ where: { id }, include: { project: true } });
  if (!e) notFound();
  if (sp(s.edit) === "1" && can(user.role, "employee.manage")) {
    const projects = await db.project.findMany({ orderBy: { code: "asc" } });
    return (
      <>
        <PageHeader title={`Düzəliş: ${e.fullName}`} crumbs={[{ href: "/employees", label: "İşçilər" }, { href: `/employees/${e.id}`, label: e.fullName }, { label: "Düzəliş" }]} />
        <EmployeeForm id={e.id} v={e} projects={projects.map((p) => [p.id, `${p.code} — ${p.name}`])} />
      </>
    );
  }
  const [hist, held] = await Promise.all([employeeHistory(id), netHeld(db, { employeeId: id })]);
  const heldIds = [...held.entries()].filter(([, q]) => q.gt(0)).map(([v]) => v);
  const opts = await variantOptionsByIds(heldIds);
  return (
    <>
      <PageHeader
        title={e.fullName}
        subtitle={<span className="flex items-center gap-2">{e.code} · {e.position ?? "—"} {e.group === "ENGINEER" ? <Badge tone="brand">Mühəndis</Badge> : <Badge tone="warn">Fəhlə</Badge>}{e.project && <> · <Link className="link" href={`/projects/${e.project.id}`}>{e.project.code}</Link></>}</span>}
        crumbs={[{ href: "/employees", label: "İşçilər" }, { label: e.fullName }]}
        actions={<>
          <a className="btn" href={`/api/export/employee?id=${e.id}`}>Excel</a>
          {can(user.role, "stockdoc.edit") && <Link className="btn btn-primary" href="/movements/new?kind=ISSUE_EMPLOYEE">+ PPE təhvili</Link>}
          {can(user.role, "employee.manage") && <Link className="btn" href={`/employees/${e.id}?edit=1`}>Düzəliş</Link>}
          {can(user.role, "employee.manage") && <DeleteButton type="employee" id={e.id} label={e.fullName} />}
        </>}
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Hazırda işçidə olan (xalis)" pad={false}>
          {heldIds.length === 0 ? <p className="p-4 text-sm text-muted">Sistem üzrə işçidə material yoxdur.</p> : (
            <table className="tbl"><thead><tr><th>Material</th><th>Ölçü</th><th className="num">Miqdar</th></tr></thead>
              <tbody>{heldIds.map((v) => { const o = opts.get(v); return <tr key={v}><td>{o?.sku} · {o?.name}</td><td>{o?.size || "—"}</td><td className="num">{fmtQty(held.get(v))}</td></tr>; })}</tbody></table>
          )}
        </Card>
        <Card title="Sistem üzrə təhvil tarixçəsi" className="xl:col-span-2" pad={false}>
          {hist.ledger.length === 0 ? <p className="p-4 text-sm text-muted">Sistemdə təhvil qeydi yoxdur.</p> : (
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Tarix</th><th>Növ</th><th>Sənəd</th><th>Material</th><th className="num">Miqdar</th><th>Layihə</th></tr></thead>
              <tbody>{hist.ledger.map((r) => <tr key={String(r.id)}><td>{fmtDate(r.movementDate)}</td><td>{az.entryType[r.entryType as keyof typeof az.entryType]}</td><td>{r.docNumber}</td><td>{r.sku} · {r.name}{r.size ? ` (${r.size})` : ""}</td><td className="num">{fmtQty(r.qty)}</td><td>{r.project ?? "—"}</td></tr>)}</tbody></table></div>
          )}
        </Card>
        <Card title={`Tarixi qeydlər (Excel importu, ${hist.historical.length})`} className="xl:col-span-3" pad={false}>
          <p className="px-4 pt-3 text-xs text-muted">Bu qeydlər köhnə Excel “Total” vərəqindən gəlir, yalnız məlumat üçündür və anbar qalığına təsir etmir. Ad üzrə uyğunlaşdırılıb.</p>
          {hist.historical.length === 0 ? <p className="p-4 text-sm text-muted">Tarixi qeyd yoxdur.</p> : (
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Tarix</th><th>Material</th><th>Model</th><th>Ölçü</th><th className="num">Ədəd</th><th>Şərh</th></tr></thead>
              <tbody>{hist.historical.map((h) => <tr key={h.id}><td>{h.issueDate ? fmtDate(h.issueDate) : h.rawDate ?? "—"}</td><td>{h.itemText}</td><td>{h.modelText ?? "—"}</td><td>{h.sizeText ?? "—"}</td><td className="num">{h.qty == null ? "—" : fmtQty(h.qty)}</td><td>{h.comment ?? ""}</td></tr>)}</tbody></table></div>
          )}
        </Card>
      </div>
    </>
  );
}
