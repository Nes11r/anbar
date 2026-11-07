import Image from "next/image";
import type { ReactNode } from "react";

/** Header + signature block for printable documents (MR / PO / GRN / Issue slip). */
export function PrintHeader({ title, number, formNo, children }: { title: string; number: string; formNo?: string; children?: ReactNode }) {
  return (
    <div className="print-only mb-4 border-b-2 border-black pb-2">
      <div className="flex items-start justify-between">
        <div>
          <Image src="/hecotec-logo.png" alt="HECOTEC" width={160} height={45} />
          <div className="mt-1 text-[10px]">HECOTEC MMC · Industrial Development Company · Mardanov Gardashlari 59, Bakı</div>
        </div>
        <div className="text-right">
          <div className="text-base font-bold uppercase">{title}</div>
          <div className="text-sm font-semibold">{number}</div>
          {formNo && <div className="text-[10px]">{formNo}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function Signatures({ roles }: { roles: string[] }) {
  return (
    <div className="print-only mt-10">
      <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${roles.length}, 1fr)` }}>
        {roles.map((r) => (
          <div key={r} className="text-[10px]">
            <div className="h-10 border-b border-black" />
            <div className="mt-1 font-semibold">{r}</div>
            <div>Ad, soyad / imza / tarix</div>
          </div>
        ))}
      </div>
      <div className="mt-6 text-[9px]">Sistemdən çap edilib: {new Date().toLocaleString("az-AZ", { timeZone: "Asia/Baku" })}</div>
    </div>
  );
}

export { PrintButtonClient as PrintButton } from "./client/print-button";
