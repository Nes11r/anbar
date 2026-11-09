import Link from "next/link";
import { DeleteButton } from "@/components/delete-button";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { can, isLeadership, scopeProjectId } from "@/lib/rbac";
import { db } from "@/lib/db";
import { az, MR_LISTS } from "@/i18n/az";
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, isoDate, sp } from "@/lib/format";
import { Badge, Card, MrStatusBadge, PageHeader } from "@/components/ui";
import { PrintButton, PrintHeader } from "@/components/print";
import { ActionButton } from "@/components/client/action-button";
import { canDecideStep } from "@/server/services/procurement";
import { variantOptionsByIds } from "@/server/services/catalog";
import { MRForm, type MRHeaderState } from "../mr-form";
import { mrFormOptions } from "../options";
import { OrderTimeline } from "@/components/timeline";
import { mrTimeline } from "@/server/services/tracking";
import { siteFiguresFor } from "@/server/services/sites";
import { cancelMRAction, decideMRAction, reviseMRAction, submitMRAction } from "../actions";

export const dynamic = "force-dynamic";
const label = (list: readonly (readonly [string, string])[], code: string | null) => list.find(([c]) => c === code)?.[1] ?? code ?? "—";

export default async function MRPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("mr.view");
  const { id } = await params;
  const s = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const mr = await db.materialRequest.findUnique({ where: { id }, include: { lines: { orderBy: { lineNo: "asc" }, include: { poLines: { include: { po: { select: { id: true, poNumber: true, status: true } } } } } }, approvals: { orderBy: { step: "asc" } }, orders: { select: { id: true, poNumber: true, status: true } } } });
  if (!mr) notFound();
  const scope = scopeProjectId(user);
  if (scope && mr.projectId !== scope) notFound();
  const isClient = user.role === "CLIENT";
  const [project, wh, history, stages, site] = await Promise.all([
    db.project.findUnique({ where: { id: mr.projectId } }),
    mr.deliveryWarehouseId ? db.warehouse.findUnique({ where: { id: mr.deliveryWarehouseId } }) : null,
    db.statusHistory.findMany({ where: { entityType: "MaterialRequest", entityId: mr.id }, orderBy: { id: "asc" } }),
    mrTimeline(mr.id),
    siteFiguresFor(mr.projectId, mr.lines.map((l) => l.variantId).filter((x): x is string => !!x)),
  ]);
  const siteWarnings = mr.lines.filter((l) => l.variantId && (site.get(l.variantId)?.inStock.gt(0) ?? false));
  const editable = (mr.status === "DRAFT" || mr.status === "RETURNED") && (mr.requesterId === user.id || isLeadership(user.role)) && can(user.role, "mr.create");

  if (editable && sp(s.edit) === "1") {
    const [opts, vopts] = await Promise.all([mrFormOptions(), variantOptionsByIds(mr.lines.map((l) => l.variantId).filter(Boolean) as string[])]);
    const h: MRHeaderState = {
      projectId: mr.projectId, discipline: mr.discipline, disciplineOther: mr.disciplineOther ?? "", projectPhase: mr.projectPhase ?? "", requestType: mr.requestType, priority: mr.priority, supplyCategory: mr.supplyCategory ?? "", procurementRoute: mr.procurementRoute ?? "",
      supersedesMrNumber: mr.supersedesMrNumber ?? "", revisionReason: mr.revisionReason ?? "", dateRaised: isoDate(mr.dateRaised), requiredOnSiteDate: isoDate(mr.requiredOnSiteDate), requesterName: mr.requesterName, requesterPosition: mr.requesterPosition ?? "",
      justification: mr.justification ?? "", notes: mr.notes ?? "", currency: mr.currency, deliveryWarehouseId: mr.deliveryWarehouseId ?? "", referenceDocs: (mr.referenceDocs as MRHeaderState["referenceDocs"]) ?? [],
    };
    return (
      <>
        <PageHeader viewOnly={{ role: user.role, perm: "mr.create", action: "MR yaratmaq və dəyişmək" }} title={`Düzəliş: ${mr.mrNumber} Rev.${mr.revision}`} crumbs={[{ href: "/mr", label: "MR" }, { href: `/mr/${mr.id}`, label: mr.mrNumber }, { label: "Düzəliş" }]} />
        <MRForm {...opts} defaults={{ requesterName: mr.requesterName }} id={mr.id} version={mr.version} lockProject
          initial={{ h, lines: mr.lines.map((l) => ({ key: l.id, variant: l.variantId ? vopts.get(l.variantId) ?? null : null, materialCode: l.materialCode ?? "", description: l.description, size: l.size ?? "", gradeStandard: l.gradeStandard ?? "", uomCode: l.uomCode, qtyRequired: String(Number(l.qtyRequired)), surplusPct: String(Number(l.surplusPct)), estUnitPrice: l.estUnitPrice == null ? "" : String(Number(l.estUnitPrice)), requiredDate: isoDate(l.requiredDate), remarks: l.remarks ?? "" })) }} />
      </>
    );
  }

  const current = mr.approvals.find((a) => a.decision === "PENDING");
  const canDecide = current && canDecideStep(user.role, current.allowedRoles) && (mr.status === "UNDER_REVIEW" || mr.status === "SUBMITTED");
  const orderable = ["APPROVED", "IN_SOURCING", "PARTIALLY_ORDERED", "PARTIALLY_DELIVERED"].includes(mr.status);
  const refs = (mr.referenceDocs as { docType: string; docNumber: string; revision?: string; title?: string }[]) ?? [];
  return (
    <>
      <PrintHeader title="Material Request (MR)" number={`${mr.mrNumber} · Rev. ${mr.revision}`} formNo="Form No. HEC-PRC-FRM-001 · Rev. 00" />
      <PageHeader
        viewOnly={{ role: user.role, perm: "mr.create", action: "MR yaratmaq və dəyişmək" }}
        title={`${mr.mrNumber} · Rev.${mr.revision}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><MrStatusBadge status={mr.status} />{az.requestType[mr.requestType]} · {mr.priority === "NORMAL" ? "Normal" : <Badge tone={mr.priority === "EMERGENCY" ? "bad" : "warn"}>{az.priority[mr.priority]}</Badge>}</span>}
        crumbs={[{ href: "/mr", label: "Material tələbləri" }, { label: mr.mrNumber }]}
        actions={<>
          <PrintButton />
          {editable && <Link className="btn" href={`/mr/${mr.id}?edit=1`}>Düzəliş</Link>}
          {(mr.status === "DRAFT" || mr.status === "CANCELLED") && can(user.role, "mr.create") && (mr.requesterId === user.id || isLeadership(user.role)) && <DeleteButton type="materialRequest" id={mr.id} label={`${mr.mrNumber} Rev.${mr.revision}`} />}
          {editable && <ActionButton className="btn btn-primary" action={submitMRAction.bind(null, mr.id)} confirm="MR təsdiq marşrutuna göndərilsin? Göndərildikdən sonra dəyişmək olmaz (yalnız geri qaytarılarsa).">Təsdiqə göndər</ActionButton>}
          {orderable && can(user.role, "po.manage") && <Link className="btn btn-brand" href={`/po/new?mr=${mr.id}`}>PO yarat</Link>}
          {can(user.role, "mr.create") && !["DRAFT"].includes(mr.status) && <ActionButton className="btn" action={reviseMRAction.bind(null, mr.id)} confirm="Yeni reviziya (Rev.+1) yaradılsın?" reason={{ label: "Reviziya səbəbi", required: true }} >Reviziya</ActionButton>}
          {can(user.role, "mr.create") && !["CANCELLED", "CLOSED", "DELIVERED", "REJECTED"].includes(mr.status) && <ActionButton className="btn btn-danger" action={cancelMRAction.bind(null, mr.id)} confirm="MR ləğv edilsin?" reason={{ label: "Ləğv səbəbi", required: true }}>Ləğv et</ActionButton>}
        </>}
      />
      <div className="no-print"><OrderTimeline stages={stages} /></div>
      {siteWarnings.length > 0 && !["DELIVERED", "CLOSED", "CANCELLED", "REJECTED"].includes(mr.status) && (
        <div className="alert alert-warn mb-4">
          <b>Diqqət — bu layihənin sahə anbarında artıq var:</b>{" "}
          {siteWarnings.map((l) => `${l.description}: stokda ${fmtQty(site.get(l.variantId!)!.inStock)}`).join("; ")}.{" "}
          Təsdiqdən əvvəl tələbin həqiqətən lazım olduğunu yoxlayın. <Link className="link" href={`/sites/${mr.projectId}`}>Sahəyə bax</Link>
        </div>
      )}
      {canDecide && current && (
        <div className="alert alert-info no-print mb-4 flex flex-wrap items-center justify-between gap-3">
          <span>Sizin qərarınız gözlənilir: <b>Mərhələ {current.step} — {current.roleLabel}</b></span>
          <span className="flex flex-wrap gap-2">
            <ActionButton className="btn btn-primary" action={decideMRAction.bind(null, mr.id, current.step, "APPROVED")} confirm={`${current.roleLabel}: MR təsdiqlənsin?`} reason={{ label: "Şərh (ixtiyari)" }}>Təsdiq</ActionButton>
            <ActionButton className="btn" action={decideMRAction.bind(null, mr.id, current.step, "REVISE")} confirm="MR düzəlişə qaytarılsın?" reason={{ label: "Nə düzəldilməlidir?", required: true }}>Düzəlişə qaytar</ActionButton>
            <ActionButton className="btn btn-danger" action={decideMRAction.bind(null, mr.id, current.step, "REJECTED")} confirm="MR rədd edilsin?" reason={{ label: "Rədd səbəbi", required: true }}>Rədd et</ActionButton>
          </span>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="1–2. İdentifikasiya, layihə, tələb edən">
          <dl className="kv">
            <dt>Layihə</dt><dd>{project ? <Link className="link" href={`/projects/${project.id}`}>{project.code} — {project.name}</Link> : "—"}</dd>
            <dt>Sifarişçi / lokasiya</dt><dd>{[project?.client, project?.location].filter(Boolean).join(" · ") || "—"}</dd>
            <dt>Disiplin</dt><dd>{label(MR_LISTS.DISCIPLINE, mr.discipline)}{mr.disciplineOther ? ` (${mr.disciplineOther})` : ""}</dd>
            <dt>Faza</dt><dd>{label(MR_LISTS.PROJECT_PHASE, mr.projectPhase)}</dd>
            <dt>Supply category</dt><dd>{label(MR_LISTS.SUPPLY_CATEGORY, mr.supplyCategory)}</dd>
            <dt>Procurement route</dt><dd>{label(MR_LISTS.PROCUREMENT_ROUTE, mr.procurementRoute)}</dd>
            <dt>MR tarixi / RoS</dt><dd>{fmtDate(mr.dateRaised)} → {fmtDate(mr.requiredOnSiteDate)}</dd>
            <dt>Tələb edən</dt><dd>{mr.requesterName}{mr.requesterPosition ? `, ${mr.requesterPosition}` : ""}</dd>
            <dt>Qəbul anbarı</dt><dd>{wh?.name ?? "—"}</dd>
            {mr.supersedesMrNumber && <><dt>Əvəz edir</dt><dd>{mr.supersedesMrNumber}</dd></>}
            {mr.revisionReason && <><dt>Reviziya səbəbi</dt><dd>{mr.revisionReason}</dd></>}
            {!isClient && <><dt>Təxmini dəyər</dt><dd className="font-semibold">{fmtMoney(mr.estimatedValue, mr.currency)}</dd></>}
            {mr.justification && <><dt>Əsaslandırma</dt><dd className="whitespace-pre-wrap">{mr.justification}</dd></>}
            {mr.notes && <><dt>Qeyd</dt><dd className="whitespace-pre-wrap">{mr.notes}</dd></>}
            {refs.length > 0 && <><dt>İstinad sənədləri</dt><dd>{refs.map((r, i) => <div key={i}>{label(MR_LISTS.REF_DOC_TYPE, r.docType)}: {r.docNumber}{r.revision ? ` Rev.${r.revision}` : ""}{r.title ? ` — ${r.title}` : ""}</div>)}</dd></>}
            {mr.orders.length > 0 && <><dt>PO-lar</dt><dd className="flex flex-wrap gap-2">{mr.orders.map((o) => <Link key={o.id} className="link" href={`/po/${o.id}`}>{o.poNumber} ({az.poStatus[o.status]})</Link>)}</dd></>}
          </dl>
        </Card>
        <Card title="3. Material cədvəli" className="order-first xl:col-span-3" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th>#</th><th>Material</th><th>UoM</th><th className="num">Tələb</th>
                <th className="num" title="Ofis anbarları + bu layihənin sahə anbarı">Stokda</th>
                <th className="num" title="Bu layihənin sahəsində: anbarda / işçilərdə">Sahədə<br /><span className="text-[10px] font-normal">stok / işçidə</span></th>
                <th className="num">Surplus%</th><th className="num">Net sifariş</th>{!isClient && <th className="num">Vahid qiymət</th>}<th className="num">Sifariş edilib</th><th>Tarix</th>
              </tr></thead>
              <tbody>{mr.lines.map((l) => {
                const ordered = l.poLines.filter((p) => p.po.status !== "CANCELLED" && p.po.status !== "DRAFT").reduce((a, p) => a + Number(p.qtyOrdered), 0);
                const sub = [l.materialCode, l.size, l.gradeStandard].filter(Boolean).join(" · ");
                return (
                  <tr key={l.id}>
                    <td>{l.lineNo}</td>
                    <td className="min-w-[14rem]">
                      <div className="font-medium">{l.description}</div>
                      {sub && <div className="text-xs text-muted">{sub}</div>}
                      {!l.variantId && <Badge tone="warn">kataloqda yox</Badge>}
                      {l.remarks && <div className="text-xs text-muted">{l.remarks}</div>}
                    </td>
                    <td>{l.uomCode}</td>
                    <td className="num">{fmtQty(l.qtyRequired)}</td><td className="num">{fmtQty(l.qtyInStock)}</td><td className={`num ${l.variantId && site.get(l.variantId)?.inStock.gt(0) ? "font-bold text-warn" : ""}`}>{l.variantId ? `${fmtQty(site.get(l.variantId)?.inStock ?? 0)} / ${fmtQty(site.get(l.variantId)?.withWorkers ?? 0)}` : "—"}</td><td className="num">{fmtQty(l.surplusPct)}</td><td className="num font-bold">{fmtQty(l.netQtyToOrder)}</td>{!isClient && <td className="num">{l.estUnitPrice == null ? "—" : fmtQty(l.estUnitPrice, 2)}</td>}<td className="num">{fmtQty(ordered)}</td><td className="whitespace-nowrap">{fmtDate(l.requiredDate)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </Card>
        <div className="flex flex-col gap-4 xl:col-span-2">
        <Card title="7. Təsdiq marşrutu" pad={false}>
          {mr.approvals.length === 0 ? <p className="p-4 text-sm text-muted">MR hələ təsdiqə göndərilməyib.</p> : (
            <table className="tbl">
              <thead><tr><th>Mərhələ</th><th>Rol</th><th>Marşrut</th><th>Ad</th><th>Tarix</th><th>Qərar</th><th>Şərh</th></tr></thead>
              <tbody>{mr.approvals.map((a) => (
                <tr key={a.id} className={a === current ? "bg-info-soft" : ""}>
                  <td>{a.step}</td><td className="font-semibold">{a.roleLabel}</td><td>{a.required ? "Məcburi" : "Tələb olunmur"}</td><td>{a.approverName ?? "—"}</td><td>{fmtDateTime(a.decidedAt)}</td>
                  <td><Badge tone={a.decision === "APPROVED" ? "ok" : a.decision === "REJECTED" ? "bad" : a.decision === "REVISE" ? "warn" : a.decision === "SKIPPED" ? "muted" : "info"}>{az.decision[a.decision]}</Badge></td><td className="text-xs">{a.comment}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </Card>
        <Card title="Status tarixçəsi" pad={false}>
          <ul className="divide-y divide-line text-sm">{history.map((h) => (
            <li key={String(h.id)} className="px-4 py-2"><span className="font-semibold">{az.mrStatus[h.toStatus as keyof typeof az.mrStatus] ?? h.toStatus}</span><span className="block text-xs text-muted">{fmtDateTime(h.at)}{h.note ? ` · ${h.note}` : ""}</span></li>
          ))}</ul>
        </Card>
        </div>
      </div>
    </>
  );
}
