import { requirePage } from "@/lib/auth";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDate, fmtQty } from "@/lib/format";
import { Card, Empty, PageHeader } from "@/components/ui";
import { employeeHistory } from "@/server/services/reports";
import { netHeld } from "@/server/services/stockdocs";
import { variantOptionsByIds } from "@/server/services/catalog";

export const metadata = { title: "Mənim materiallarım" };
export const dynamic = "force-dynamic";

/** Worker self-service: what is currently on me and when I received it. Read-only. */
export default async function MyItems() {
  const user = await requirePage("my.items");
  if (!user.employeeId) {
    return (
      <>
        <PageHeader title="Mənim materiallarım" />
        <Card><Empty title="Hesabınız işçi kartına bağlanmayıb" hint="Administrator hesabınızı işçi kartınıza bağladıqdan sonra üzərinizdəki materiallar burada görünəcək." /></Card>
      </>
    );
  }
  const e = await db.employee.findUnique({ where: { id: user.employeeId }, include: { project: true } });
  const [held, hist] = await Promise.all([netHeld(db, { employeeId: user.employeeId }), employeeHistory(user.employeeId)]);
  const ids = [...held.entries()].filter(([, q]) => q.gt(0)).map(([v]) => v);
  const opts = await variantOptionsByIds(ids);
  return (
    <>
      <PageHeader title="Mənim materiallarım" subtitle={e ? `${e.fullName} · ${az.employeeGroup[e.group]}${e.project ? ` · ${e.project.code} — ${e.project.name}` : ""}` : undefined} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Hazırda üzərimdə olan" pad={false}>
          {ids.length === 0 ? <Empty title="Üzərinizdə qeydə alınmış material yoxdur" /> : (
            <table className="tbl"><thead><tr><th>Material</th><th>Ölçü</th><th className="num">Miqdar</th></tr></thead>
              <tbody>{ids.map((v) => { const o = opts.get(v); return <tr key={v}><td>{o?.name}</td><td>{o?.size || "—"}</td><td className="num font-semibold">{fmtQty(held.get(v))} {o?.unit}</td></tr>; })}</tbody></table>
          )}
        </Card>
        <Card title="Təhvil tarixçəsi" pad={false}>
          {hist.ledger.length === 0 ? <p className="p-4 text-sm text-muted">Tarixçə yoxdur.</p> : (
            <table className="tbl"><thead><tr><th>Tarix</th><th>Növ</th><th>Material</th><th className="num">Miqdar</th></tr></thead>
              <tbody>{hist.ledger.map((r) => <tr key={String(r.id)}><td>{fmtDate(r.movementDate)}</td><td>{r.entryType === "ISSUE" ? "Alındı" : "Qaytarıldı"}</td><td>{r.name}{r.size ? ` (${r.size})` : ""}</td><td className="num">{fmtQty(r.qty)}</td></tr>)}</tbody></table>
          )}
        </Card>
      </div>
      <p className="mt-3 text-xs text-muted">Səhv görürsünüzsə, sahə anbardarına və ya ofisə bildirin. Bu səhifə yalnız baxış üçündür.</p>
    </>
  );
}
