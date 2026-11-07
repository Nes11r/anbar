"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "@/components/client/toast";
import { uploadAction } from "./actions";

export function UploadForm() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await uploadAction(fd);
          if (r.ok) { toast("ok", r.message!); router.push((r.data as { redirect: string }).redirect); } else toast("bad", r.error);
        });
      }}
    >
      <label className="label min-w-[260px] flex-1"><span className="req">Excel faylı (.xlsx, .xlsm — makrolar icra edilmir, maks. 25 MB)</span>
        <input className="input pt-1.5" type="file" name="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12" required />
      </label>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Yüklənir və yoxlanılır…" : "Yüklə"}</button>
    </form>
  );
}
