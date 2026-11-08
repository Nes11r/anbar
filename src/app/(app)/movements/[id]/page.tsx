import Link from "next/link";
import { DeleteButton } from "@/components/delete-button";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDate, fmtDateTime, fmtQty, isoDate, sp } from "@/lib/format";
import { Card, DocStatusBadge, PageHeader } from "@/components/ui";
import { PrintButton, PrintHeader, Signatures } from "@/components/print";
import { ActionButton } from "@/components/client/action-button";
import { variantOptionsByIds } from "@/server/services/catalog";
import { StockDocForm } from "../stockdoc-form";
import { stockDocOptions } from "../options";
import { cancelStockDocAction, postStockDocAction, reverseStockDocAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MovementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("stockdoc.view");
  const { id } = await params;
  const s = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await db.stockDocument.findUnique({ where: { id }, include: { lines: { orderBy: { lineNo: "asc" } } } });
  if (!d) notFound();
  const [opts, whs, project, employee, supplier, original, reversal, users, ledger] = await Promise.all([
    variantOptionsByIds(d.lines.map((l) => l.variantId), d.warehouseId),
    db.warehouse.findMany(),
    d.projectId ? db.project.findUnique({ where: { id: d.projectId } }) : null,
    d.employeeId ? db.employee.findUnique({ where: { id: d.employeeId } }) : null,
    d.supplierId ? db.supplier.findUnique({ where: { id: d.supplierId } }) : null,
    d.reversalOfId ? db.stockDocument.findUnique({ where: { id: d.reversalOfId }, select: { id: true, number: true } }) : null,
    db.stockDocument.findFirst({ where: { reversalOfId: d.id }, select: { id: true, number: true } }),
    db.user.findMany({ where: { id: { in: [d.createdById, d.postedById].filter(Boolean) as string[] } }, select: { id: true, name: true } }),
    d.reversalOfId ? db.stockLedgerEntry.findMany({ where: { docId: d.id } }) : null,
  ]);
  const wn = (wid: string | null) => whs.find((w) => w.id === wid)?.name ?? "—";
  const un = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? "—";
  const draft = d.status === "DRAFT";

  if (draft && sp(s.edit) === "1" && can(user.role, "stockdoc.edit")) {
    const options = await stockDocOptions(user.role, user);
    return (
      <>
        <PageHeader title={`Düzəliş: ${d.number}`} crumbs={[{ href: "/movements", label: "Mədaxil / Məxaric" }, { href: `/movements/${d.id}`, label: d.number }, { label: "Düzəliş" }]} />
        <StockDocForm
          kind={d.kind}
          options={options}
          id={d.id}
          version={d.version}
          initial={{
            kind: d.kind, warehouseId: d.warehouseId, toWarehouseId: d.toWarehouseId, projectId: d.projectId, employeeId: d.employeeId, supplierId: d.supplierId, recipientName: d.recipientName, purpose: d.purpose, reason: d.reason, externalRef: d.externalRef, docDate: isoDate(d.docDate), notes: d.notes,
            lines: d.lines.map((l) => ({ key: l.id, variant: opts.get(l.variantId) ?? null, qty: String(Number(l.qty)), direction: l.direction, condition: l.condition ?? "GOOD", targetWarehouseId: l.targetWarehouseId ?? undefined, overrideReason: l.overrideReason ?? "", note: l.note ?? "" })),
          }}
        />
      </>
    );
  }

  const title = d.kind.startsWith("ISSUE") ? "Material təhvil qaiməsi (Issue Slip)" : az.stockDocKind[d.kind];
  return (
    <>
      <PrintHeader title={title} number={d.number} />
      <PageHeader
        title={`${az.stockDocKind[d.kind]} ${d.number}`}
        subtitle={<span className="flex items-center gap-2"><DocStatusBadge status={d.status} />{original && <>Ləğv edir: <Link className="link" href={`/movements/${original.id}`}>{original.number}</Link></>}{reversal && <>Ləğv sənədi: <Link className="link" href={`/movements/${reversal.id}`}>{reversal.number}</Link></>}</span>}
        crumbs={[{ href: "/movements", label: "Mədaxil / Məxaric" }, { label: d.number }]}
        actions={
          <>
            <PrintButton />
            {draft && can(user.role, "stockdoc.edit") && <Link className="btn" href={`/movements/${d.id}?edit=1`}>Düzəliş</Link>}
            {draft && can(user.role, "stockdoc.edit") && <ActionButton className="btn" action={cancelStockDocAction.bind(null, d.id)} confirm="Qaralama ləğv edilsin?">Ləğv et</ActionButton>}
            {(draft || d.status === "CANCELLED") && can(user.role, "stockdoc.edit") && <DeleteButton type="stockDocument" id={d.id} label={d.number} />}
            {draft && can(user.role, d.kind === "ADJUSTMENT" ? "adjustment.post" : "stockdoc.post") && (
              <ActionButton className="btn btn-primary" action={postStockDocAction.bind(null, d.id)} confirm={`${d.number} təsdiqlənsin? Qalıq dərhal yenilənəcək. Təsdiqlənmiş sənəd silinmir, yalnız ləğv sənədi ilə geri qaytarılır.`}>
                Təsdiqlə
              </ActionButton>
            )}
            {d.status === "POSTED" && !d.reversalOfId && can(user.role, "document.reverse") && (
              <ActionButton className="btn btn-danger" action={reverseStockDocAction.bind(null, d.id)} confirm="Ləğv (reversal) sənədi yaradılsın? Əks jurnal qeydləri yazılacaq." reason={{ label: "Ləğv səbəbi", required: true }}>
                Ləğv sənədi yarat
              </ActionButton>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Sənəd məlumatı">
          <dl className="kv">
            <dt>Növ</dt><dd>{az.stockDocKind[d.kind]}</dd>
            <dt>Tarix</dt><dd>{fmtDate(d.docDate)}</dd>
            <dt>Anbar</dt><dd>{wn(d.warehouseId)}{d.toWarehouseId && ` → ${wn(d.toWarehouseId)}`}</dd>
            {project && <><dt>Layihə</dt><dd><Link className="link" href={`/projects/${project.id}`}>{project.code} — {project.name}</Link></dd></>}
            {employee && <><dt>İşçi</dt><dd><Link className="link" href={`/employees/${employee.id}`}>{employee.fullName}</Link> ({az.employeeGroup[employee.group]}, {employee.code})</dd></>}
            {supplier && <><dt>Tədarükçü</dt><dd>{supplier.name}</dd></>}
            {d.recipientName && <><dt>Təhvil alan</dt><dd>{d.recipientName}</dd></>}
            {d.purpose && <><dt>Məqsəd</dt><dd>{d.purpose}</dd></>}
            {d.reason && <><dt>Səbəb</dt><dd>{d.reason}</dd></>}
            {d.externalRef && <><dt>Xarici sənəd</dt><dd>{d.externalRef}</dd></>}
            <dt>Yaradan</dt><dd>{un(d.createdById)} · {fmtDateTime(d.createdAt)}</dd>
            <dt>Təsdiqləyən</dt><dd>{d.postedById ? `${un(d.postedById)} · ${fmtDateTime(d.postedAt)}` : "—"}</dd>
            {d.notes && <><dt>Qeyd</dt><dd>{d.notes}</dd></>}
          </dl>
        </Card>
        <Card title="Materiallar" className="lg:col-span-2" pad={false}>
          {d.lines.length === 0 && ledger ? (
            <p className="p-4 text-sm text-muted">Ləğv sənədi: {ledger.length} əks jurnal qeydi yazılıb. Ətraflı: <Link className="link" href={`/journal?q=${encodeURIComponent(d.number)}`}>hərəkət jurnalı</Link>.</p>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>#</th><th>SKU</th><th>Material</th><th>Ölçü</th>{d.kind === "ADJUSTMENT" && <th>İstiqamət</th>}<th className="num">Miqdar</th>{d.kind.startsWith("RETURN_FROM") && <th>Vəziyyət</th>}<th>Qeyd</th></tr></thead>
                <tbody>{d.lines.map((l) => { const v = opts.get(l.variantId); return (
                  <tr key={l.id}>
                    <td>{l.lineNo}</td><td>{v?.sku}</td><td>{v?.name}</td><td>{v?.size || "—"}</td>
                    {d.kind === "ADJUSTMENT" && <td>{l.direction > 0 ? "+ artım" : "− azalma"}</td>}
                    <td className="num font-semibold">{fmtQty(l.qty)} {v?.unit}</td>
                    {d.kind.startsWith("RETURN_FROM") && <td>{l.condition === "DEFECTIVE" ? `Qüsurlu → ${wn(l.targetWarehouseId)}` : "Yararlı"}</td>}
                    <td className="text-xs">{l.note}{l.overrideReason && <div className="text-warn">Təyinat override: {l.overrideReason}</div>}</td>
                  </tr>
                ); })}</tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <Signatures roles={d.kind.startsWith("ISSUE") ? ["Təhvil verən (anbardar)", "Təhvil alan", "Təsdiq edən"] : ["Hazırlayan", "Qəbul edən", "Təsdiq edən"]} />
    </>
  );
}
