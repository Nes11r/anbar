import Link from "next/link";
import { notFound } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { requirePage } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { az } from "@/i18n/az";
import { fmtDateTime, sp } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getSettings } from "@/server/services/common";
import { MasterForm, SettingsForm, StepForm, UserForm } from "../forms";
import { DeleteButton } from "@/components/delete-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Parametrlər" };

const TABS: [string, string, boolean][] = [
  ["warehouses", "Anbarlar", false],
  ["suppliers", "Tədarükçülər", false],
  ["categories", "Kateqoriyalar", false],
  ["users", "İstifadəçilər və rollar", true],
  ["approval", "MR təsdiq marşrutu", true],
  ["system", "Sistem və ehtiyat nüsxə", true],
];
const ROLES = Object.keys(az.role) as UserRole[];

export default async function SettingsSection({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("masterdata.manage");
  const { section } = await params;
  const edit = sp((await searchParams).edit);
  const tab = TABS.find((t) => t[0] === section);
  if (!tab) notFound();
  const admin = can(user.role, "settings.manage");
  if (tab[2] && !admin) return <div className="alert alert-warn">Bu bölmə yalnız Super Admin üçündür.</div>;

  let body: React.ReactNode = null;
  if (section === "warehouses") {
    const rows = await db.warehouse.findMany({ orderBy: [{ type: "asc" }, { code: "asc" }] });
    const cur = rows.find((r) => r.id === edit);
    body = (
      <>
        <Card title={cur ? `Düzəliş: ${cur.name}` : "Yeni anbar"} className="mb-4">
          <MasterForm key={cur?.id ?? "new"} entity="warehouse" id={cur?.id ?? null} fields={[
            { name: "code", label: "Kod", type: "text", required: true, defaultValue: cur?.code, maxLength: 20 },
            { name: "name", label: "Ad", type: "text", required: true, defaultValue: cur?.name },
            { name: "type", label: "Növ", type: "select", defaultValue: cur?.type ?? "NORMAL", options: [["NORMAL", "Normal"], ["QUARANTINE", "Karantin (qüsurlu / bloklanmış — mövcud qalığa daxil deyil)"]] },
            { name: "location", label: "Ünvan", type: "text", defaultValue: cur?.location, span: 2 },
            { name: "isActive", label: "Aktiv", type: "checkbox", defaultValue: cur?.isActive ?? true },
          ]} />
        </Card>
        <Card pad={false}><table className="tbl"><thead><tr><th>Kod</th><th>Ad</th><th>Növ</th><th>Ünvan</th><th>Status</th><th></th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td>{r.code}</td><td>{r.name}</td><td>{az.whType[r.type]}</td><td>{r.location ?? "—"}</td><td>{r.isActive ? <Badge tone="ok">Aktiv</Badge> : <Badge>Deaktiv</Badge>}</td><td className="whitespace-nowrap"><Link className="btn btn-sm mr-1" href={`?edit=${r.id}`}>Düzəliş</Link><DeleteButton small type="warehouse" id={r.id} label={r.name} /></td></tr>)}</tbody></table></Card>
      </>
    );
  } else if (section === "suppliers") {
    const rows = await db.supplier.findMany({ orderBy: { name: "asc" } });
    const cur = rows.find((r) => r.id === edit);
    body = (
      <>
        <Card title={cur ? `Düzəliş: ${cur.name}` : "Yeni tədarükçü"} className="mb-4">
          <MasterForm key={cur?.id ?? "new"} entity="supplier" id={cur?.id ?? null} fields={[
            { name: "name", label: "Ad", type: "text", required: true, defaultValue: cur?.name, span: 2 },
            { name: "code", label: "Kod / VÖEN", type: "text", defaultValue: cur?.code },
            { name: "contact", label: "Əlaqə şəxsi", type: "text", defaultValue: cur?.contact },
            { name: "phone", label: "Telefon", type: "text", defaultValue: cur?.phone },
            { name: "email", label: "E-poçt", type: "email", defaultValue: cur?.email },
            { name: "notes", label: "Qeyd", type: "textarea", defaultValue: cur?.notes, span: 3 },
            { name: "isActive", label: "Aktiv", type: "checkbox", defaultValue: cur?.isActive ?? true },
          ]} />
        </Card>
        <Card pad={false}><table className="tbl"><thead><tr><th>Ad</th><th>Kod</th><th>Əlaqə</th><th>Telefon</th><th>Status</th><th></th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.code ?? "—"}</td><td>{r.contact ?? "—"}</td><td>{r.phone ?? "—"}</td><td>{r.isActive ? <Badge tone="ok">Aktiv</Badge> : <Badge>Deaktiv</Badge>}</td><td className="whitespace-nowrap"><Link className="btn btn-sm mr-1" href={`?edit=${r.id}`}>Düzəliş</Link><DeleteButton small type="supplier" id={r.id} label={r.name} /></td></tr>)}</tbody></table></Card>
      </>
    );
  } else if (section === "categories") {
    const rows = await db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { nameAz: "asc" }], include: { _count: { select: { materials: true } } } });
    const cur = rows.find((r) => r.id === edit);
    body = (
      <>
        <Card title={cur ? `Düzəliş: ${cur.nameAz}` : "Yeni kateqoriya"} className="mb-4">
          <MasterForm key={cur?.id ?? "new"} entity="category" id={cur?.id ?? null} fields={[
            { name: "code", label: "Kod", type: "text", required: true, defaultValue: cur?.code, maxLength: 30 },
            { name: "nameAz", label: "Ad (AZ)", type: "text", required: true, defaultValue: cur?.nameAz },
            { name: "nameEn", label: "Ad (EN)", type: "text", defaultValue: cur?.nameEn },
            { name: "sortOrder", label: "Sıra", type: "number", defaultValue: cur?.sortOrder ?? 0 },
            { name: "isUniform", label: "Forma / PPE (təyinat məcburidir)", type: "checkbox", defaultValue: cur?.isUniform ?? false },
            { name: "isActive", label: "Aktiv", type: "checkbox", defaultValue: cur?.isActive ?? true },
          ]} />
        </Card>
        <Card pad={false}><table className="tbl"><thead><tr><th>Kod</th><th>Ad</th><th>Forma/PPE</th><th className="num">Material</th><th>Status</th><th></th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td>{r.code}</td><td>{r.nameAz}</td><td>{r.isUniform ? "Bəli" : "—"}</td><td className="num">{r._count.materials}</td><td>{r.isActive ? <Badge tone="ok">Aktiv</Badge> : <Badge>Deaktiv</Badge>}</td><td className="whitespace-nowrap"><Link className="btn btn-sm mr-1" href={`?edit=${r.id}`}>Düzəliş</Link><DeleteButton small type="category" id={r.id} label={r.nameAz} /></td></tr>)}</tbody></table></Card>
      </>
    );
  } else if (section === "users") {
    const [rows, projects, employees] = await Promise.all([
      db.user.findMany({ orderBy: [{ pendingApproval: "desc" }, { email: "asc" }] }),
      db.project.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
      db.employee.findMany({ where: { isActive: true }, orderBy: { fullName: "asc" }, select: { id: true, code: true, fullName: true } }),
    ]);
    const pending = rows.filter((r) => r.pendingApproval);
    const active = rows.filter((r) => !r.pendingApproval);
    const cur = rows.find((r) => r.id === edit);
    const pName = new Map(projects.map((p) => [p.id, p.code]));
    const suggested = cur?.pendingApproval ? (cur.requestedType === "COMPANY" ? "WAREHOUSE_MANAGER" : cur.role) : cur?.role;
    body = (
      <>
        {pending.length > 0 && (
          <Card title={`Təsdiq gözləyən qeydiyyatlar (${pending.length})`} className="mb-4" pad={false}>
            <table className="tbl"><thead><tr><th>E-poçt</th><th>Ad</th><th>İstədiyi növ</th><th>Telefon</th><th>Qeyd</th><th>Tarix</th><th></th></tr></thead>
              <tbody>{pending.map((r) => (
                <tr key={r.id}><td>{r.email}</td><td>{r.name}</td><td><Badge tone="info">{r.requestedType ? az.accountType[r.requestedType] : "—"}</Badge></td><td>{r.phone ?? "—"}</td><td className="text-xs">{r.note ?? "—"}</td><td>{fmtDateTime(r.createdAt)}</td>
                  <td className="whitespace-nowrap"><Link className="btn btn-sm btn-primary mr-1" href={`?edit=${r.id}`}>Bax və təsdiq et</Link><DeleteButton small type="user" id={r.id} label={r.email}>Rədd et</DeleteButton></td></tr>
              ))}</tbody></table>
          </Card>
        )}
        <Card title={cur?.pendingApproval ? `Təsdiq: ${cur.email} (${cur.requestedType ? az.accountType[cur.requestedType] : ""})` : cur ? `Düzəliş: ${cur.email}` : "Yeni istifadəçi"} className="mb-4">
          {cur?.pendingApproval && <p className="alert alert-info mb-3 text-sm">Rolu və lazım olsa layihəni seçin, sonra “Yadda saxla” — hesab aktivləşəcək. İstifadəçi öz parolu ilə daxil olacaq.</p>}
          <UserForm key={cur?.id ?? "new"} id={cur?.id ?? null} fields={[
            { name: "email", label: "E-poçt (login)", type: "email", required: true, defaultValue: cur?.email },
            { name: "name", label: "Ad, soyad", type: "text", required: true, defaultValue: cur?.name },
            { name: "role", label: "Rol", type: "select", defaultValue: suggested ?? "STOREKEEPER", options: ROLES.filter((r) => r !== "CLIENT" && (r !== "EMPLOYEE" || cur?.role === r)).map((r) => [r, az.role[r]] as [string, string]), hint: "Rəhbər / Direktor — hər şeyi görür və təsdiq edir. Super Admin — əlavə olaraq istifadəçiləri və sistem parametrlərini idarə edir. Sifarişçinin girişi yoxdur — onun adı layihədə yazılır." },
            { name: "projectId", label: "Layihə ilə məhdudlaşdır", type: "select", defaultValue: cur?.projectId ?? "", options: [["", "— bütün layihələr —"], ...projects.map((p) => [p.id, `${p.code} — ${p.name}`] as [string, string])], hint: "Sahə anbardarı və layihə rəhbəri üçün: yalnız bu layihəni və onun sahə anbarını idarə edir" },
            ...(cur?.role === "EMPLOYEE" ? [{ name: "employeeId", label: "İşçi kartı (köhnə İşçi hesabı)", type: "select" as const, defaultValue: cur?.employeeId ?? "", options: [["", "—"] as [string, string], ...employees.map((e) => [e.id, `${e.fullName} (${e.code})`] as [string, string])] }] : []),
            { name: "password", label: cur ? "Yeni parol (boş — dəyişmir)" : "İlkin parol", type: "password", required: !cur, hint: "Ən azı 10 simvol, hərf və rəqəm." },
            { name: "isActive", label: "Aktiv", type: "checkbox", defaultValue: cur ? (cur.pendingApproval ? true : cur.isActive) : true },
          ]} />
        </Card>
        <Card pad={false}><table className="tbl"><thead><tr><th>E-poçt</th><th>Ad</th><th>Rol</th><th>Layihə</th><th>Son giriş</th><th>Status</th><th></th></tr></thead>
          <tbody>{active.map((r) => <tr key={r.id}><td>{r.email}</td><td>{r.name}</td><td>{az.role[r.role]}</td><td>{r.projectId ? pName.get(r.projectId) : "Hamısı"}</td><td>{fmtDateTime(r.lastLoginAt)}</td><td>{r.isActive ? <Badge tone="ok">Aktiv</Badge> : <Badge>Deaktiv</Badge>}{r.lockedUntil && r.lockedUntil > new Date() && <Badge tone="bad">Bloklanıb</Badge>}</td><td className="whitespace-nowrap"><Link className="btn btn-sm mr-1" href={`?edit=${r.id}`}>Düzəliş</Link><DeleteButton small type="user" id={r.id} label={r.email} /></td></tr>)}</tbody></table></Card>
      </>
    );
  } else if (section === "approval") {
    const [steps, settings] = await Promise.all([db.approvalStepConfig.findMany({ orderBy: { step: "asc" } }), getSettings()]);
    body = (
      <>
        <Card title="Təsdiq limitləri (MR valyutasında)" className="mb-4">
          <p className="mb-3 text-xs text-muted">İlkin dəyərlər MR formasının “Settings” vərəqindən götürülüb; orada da qeyd edildiyi kimi HECOTEC səlahiyyət bölgüsü (DoA) ilə təsdiqlənməlidir.</p>
          <SettingsForm fields={[
            { name: "pmApprovalThreshold", label: "Layihə meneceri təsdiqi (bu məbləğdən yuxarı)", type: "number", defaultValue: settings.pmApprovalThreshold },
            { name: "gdApprovalThreshold", label: "Baş direktor təsdiqi (bu məbləğdən yuxarı)", type: "number", defaultValue: settings.gdApprovalThreshold },
            { name: "overReceiptTolerancePct", label: "Artıq qəbul toleransı, % (0 = qadağan)", type: "number", defaultValue: settings.overReceiptTolerancePct },
          ]} />
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          {steps.map((st) => (
            <Card key={st.step} title={`${st.step}. ${st.labelAz}`}>
              <p className="mb-2 text-xs text-muted">{st.responsibility}. İşarələnmiş rollar bu mərhələni imzalaya bilər.</p>
              <StepForm step={st.step} fields={[
                { name: "condition", label: "Nə vaxt tələb olunur", type: "select", defaultValue: st.condition, options: Object.entries(az.approvalCondition) },
                { name: "isActive", label: "Mərhələ aktivdir", type: "checkbox", defaultValue: st.isActive },
                ...ROLES.map((r) => ({ name: `role_${r}`, label: az.role[r], type: "checkbox" as const, defaultValue: st.allowedRoles.includes(r) })),
              ]} />
            </Card>
          ))}
        </div>
      </>
    );
  } else if (section === "system") {
    const [ledger, sessions] = await Promise.all([db.stockLedgerEntry.count(), db.session.count({ where: { expiresAt: { gt: new Date() } } })]);
    body = (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Vəziyyət"><dl className="kv"><dt>Jurnal qeydləri</dt><dd>{ledger}</dd><dt>Aktiv sessiyalar</dt><dd>{sessions}</dd><dt>Sağlamlıq yoxlaması</dt><dd><a className="link" href="/api/health?deep=1" target="_blank">/api/health?deep=1</a> (ledger ↔ qalıq uyğunluğu)</dd></dl></Card>
        <Card title="Ehtiyat nüsxə və bərpa">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Docker rejimində “backup” servisi hər gün <code>pg_dump</code> edir (30 gün saxlanılır, <code>./backups</code>).</li>
            <li>Əl ilə: <code>npm run backup</code> (Windows/Linux).</li>
            <li>Bərpa: <code>pg_restore --clean -d hecotec_wms backups/fayl.dump</code> — ətraflı <code>docs/deployment.md</code>.</li>
            <li>Bütün hesabatlar Excel/CSV kimi “Hesabatlar” bölməsindən ixrac oluna bilər.</li>
          </ul>
        </Card>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Parametrlər" />
      <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Parametr bölmələri">
        {TABS.filter((t) => !t[2] || admin).map(([k, l]) => <Link key={k} href={`/settings/${k}`} className="chip" aria-current={k === section ? "true" : undefined}>{l}</Link>)}
      </nav>
      {body}
    </>
  );
}
