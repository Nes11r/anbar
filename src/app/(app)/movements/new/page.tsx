import Link from "next/link";
import { notFound } from "next/navigation";
import type { StockDocKind } from "@prisma/client";
import { requirePage } from "@/lib/auth";
import { az } from "@/i18n/az";
import { sp } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { StockDocForm } from "../stockdoc-form";
import { stockDocOptions } from "../options";

export const metadata = { title: "Yeni əməliyyat" };

const HINT: Record<StockDocKind, string> = {
  ISSUE_PROJECT: "Sahədə işdə istifadə olunan (sərf edilən) materialı qeyd edin: layihəni seçin — material həmin layihənin sahə anbarından silinir. Ofisdən layihəyə material göndərmək üçün “Sahəyə göndər”dən istifadə edin.",
  ISSUE_EMPLOYEE: "Anbarı seçin, işçinin adını və soyadını yazın, verilən materialları əlavə edin. Ayrıca işçi qeydiyyatı lazım deyil — sistem kimə nə verildiyini ad üzrə yadda saxlayır.",
  RETURN_FROM_PROJECT: "Sərf kimi yazılmış, amma istifadə olunmayan material geri qaytarılır. Veriləndən çox qaytarıla bilməz; qüsurlu material karantinə düşür.",
  RETURN_FROM_EMPLOYEE: "İşçiyə xalis veriləndən çox geri alına bilməz.",
  RETURN_TO_SUPPLIER: "Qüsurlu və ya artıq malın tədarükçüyə qaytarılması.",
  TRANSFER: "Ofisdən layihənin sahə anbarına göndərmə və ya sahədən artıq qalanı ofisə qaytarma. Ümumi qalıq dəyişmir.",
  ADJUSTMENT: "Səbəbli qalıq düzəlişi (itki, zədə). Təsdiqi yalnız anbar müdiri edə bilər.",
};

export default async function NewMovement({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage("stockdoc.edit");
  const q = await searchParams;
  const kind = sp(q.kind) as StockDocKind;
  if (!(kind in az.stockDocKind)) notFound();
  const options = await stockDocOptions(user.role, user, kind);
  const uuid = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  const preset = { warehouseId: uuid(sp(q.wh)), toWarehouseId: uuid(sp(q.to)), employeeId: uuid(sp(q.employee)) };
  return (
    <>
      <PageHeader title={`Yeni: ${az.stockDocKind[kind]}`} subtitle={HINT[kind]} crumbs={[{ href: "/movements", label: "Mədaxil / Məxaric" }, { label: az.stockDocKind[kind] }]} />
      {(kind === "ISSUE_PROJECT" || kind === "RETURN_FROM_PROJECT") && options.projects.length === 0 ? (
        <div className="alert alert-warn">Əvvəlcə <Link className="link" href="/projects/new">layihə yaradın</Link>.</div>
      ) : kind === "RETURN_FROM_EMPLOYEE" && options.employees.length === 0 ? (
        <div className="alert alert-warn">Hələ heç bir işçiyə material verilməyib.</div>
      ) : (
        <StockDocForm kind={kind} options={options} preset={preset} />
      )}
    </>
  );
}
