import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/delete-button";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDate, fmtDateTime, fmtQty, isoDate, sp } from "@/lib/format";
import { Card, DocStatusBadge, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/client/action-button";
import { variantOptionsByIds } from "@/server/services/catalog";
import { CountForm } from "../count-form";
import { approveCountAction, cancelCountAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function CountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("inventory.view");
  const { id } = await params;
  const s = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const c = await db.inventoryCount.findUnique({ where: { id }, include: { lines: true } });
  if (!c) notFound();
  const [whs, opts, users] = await Promise.all([
    db.warehouse.findMany({ where: { isActive: true }, orderBy: [{ type: "asc" }, { code: "asc" }] }),
    variantOptionsByIds(c.lines.map((l) => l.variantId), c.warehouseId),
    db.user.findMany({ where: { id: { in: [c.createdById, c.approvedById].filter(Boolean) as string[] } }, select: { id: true, name: true } }),
  ]);
  const uname = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? "—";
  const draft = c.status === "DRAFT";

  if (draft && sp(s.edit) === "1") {
    return (
      <>
        <PageHeader viewOnly={{ role: user.role, perm: "inventory.edit", action: "sayım sənədini dəyişmək" }} title={`Düzəliş: ${c.number}`} crumbs={[{ href: "/inventory", label: "İnventarlaşdırma" }, { href: `/inventory/${c.id}`, label: c.number }, { label: "Düzəliş" }]} />
        <CountForm
          warehouses={whs.map((w) => ({ id: w.id, name: w.name }))}
          id={c.id}
          version={c.version}
          initial={{ mode: c.mode, warehouseId: c.warehouseId, countDate: isoDate(c.countDate), countedBy: c.countedBy, notes: c.notes ?? "", lines: c.lines.map((l) => ({ key: l.id, variant: opts.get(l.variantId) ?? null, qty: String(Number(l.countedQty)), note: l.note ?? "" })) }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader print={["Sayımı aparan", "Anbar müdiri", "Təsdiq edən"]}
        viewOnly={{ role: user.role, perm: "inventory.edit", action: "sayım sənədini dəyişmək" }}
        title={`Sayım ${c.number}`}
        subtitle={<span className="flex items-center gap-2">{az.countMode[c.mode]} · <DocStatusBadge status={c.status} /></span>}
        crumbs={[{ href: "/inventory", label: "İnventarlaşdırma" }, { label: c.number }]}
        actions={(draft || c.status === "CANCELLED") && can(user.role, "inventory.edit") && (
          <>
            <DeleteButton type="inventoryCount" id={c.id} label={c.number} />
            {draft && <Link className="btn" href={`/inventory/${c.id}?edit=1`}>Düzəliş</Link>}
            {draft && <ActionButton className="btn" action={cancelCountAction.bind(null, c.id)} confirm="Qaralama ləğv edilsin?">Ləğv et</ActionButton>}
            {draft && can(user.role, "inventory.approve") && (
              <ActionButton className="btn btn-primary" action={approveCountAction.bind(null, c.id)} confirm={c.mode === "OPENING" ? `Açılış qalığı təsdiqlənsin? ${c.lines.length} sətir jurnala yazılacaq. Bu əməliyyat silinmir, yalnız sayımla düzəldilir.` : `Sayım fərqləri təsdiqlənsin? Sistem qalığı sayılan miqdara bərabərləşdiriləcək.`}>
                Təsdiqlə və qalığa yaz
              </ActionButton>
            )}
          </>
        )}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Sənəd">
          <dl className="kv">
            <dt>Anbar</dt><dd>{whs.find((w) => w.id === c.warehouseId)?.name ?? "—"}</dd>
            <dt>Sayım tarixi</dt><dd>{fmtDate(c.countDate)}</dd>
            <dt>Sayımı aparan</dt><dd>{c.countedBy}</dd>
            <dt>Qeyd edən</dt><dd>{uname(c.createdById)} · {fmtDateTime(c.createdAt)}</dd>
            <dt>Təsdiqləyən</dt><dd>{c.approvedById ? `${uname(c.approvedById)} · ${fmtDateTime(c.approvedAt)}` : "—"}</dd>
            <dt>Qeyd</dt><dd>{c.notes ?? "—"}</dd>
          </dl>
          {draft && <p className="alert alert-info mt-3">Qaralama qalığı dəyişmir. Təsdiqdən sonra sənəd kilidlənir.</p>}
        </Card>
        <Card title={`Sətirlər (${c.lines.length})`} className="lg:col-span-2" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>SKU</th><th>Material</th><th>Ölçü</th><th className="num">Sayılan</th>{c.status === "POSTED" && <><th className="num">Sistem (təsdiq anı)</th><th className="num">Fərq</th></>}<th>Qeyd</th></tr></thead>
              <tbody>{c.lines.map((l) => {
                const v = opts.get(l.variantId);
                const diff = Number(l.countedQty) - Number(l.systemQty ?? 0);
                return (
                  <tr key={l.id}>
                    <td>{v ? <Link className="link" href={`/stock/${v.id}`}>{v.sku}</Link> : "—"}</td><td>{v?.name}</td><td>{v?.size || "—"}</td>
                    <td className="num font-semibold">{fmtQty(l.countedQty)} {v?.unit}</td>
                    {c.status === "POSTED" && <><td className="num">{fmtQty(l.systemQty)}</td><td className={`num font-semibold ${diff > 0 ? "text-ok" : diff < 0 ? "text-bad" : ""}`}>{diff > 0 ? "+" : ""}{fmtQty(diff)}</td></>}
                    <td className="text-xs">{l.note}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
