"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/client/toast";
import { beginUploadAction, chunkAction, finishUploadAction } from "./actions";

/** Hosting limits one request to ~4.5 MB → the file is sent in 3.5 MB pieces and assembled on the server. */
const CHUNK = 3.5 * 1024 * 1024;

export function UploadForm() {
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState<number | null>(null);
  const toast = useToast();
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem("file") as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) { toast("bad", "Fayl seçilməyib."); return; }
        start(async () => {
          try {
            const b = await beginUploadAction(file.name, file.size);
            if (!b.ok) { toast("bad", b.error); return; }
            const uploadId = (b.data as { uploadId: string }).uploadId;
            const parts = Math.ceil(file.size / CHUNK);
            for (let i = 0; i < parts; i++) {
              setProgress(Math.round((i / parts) * 100));
              const fd = new FormData();
              fd.set("chunk", file.slice(i * CHUNK, Math.min(file.size, (i + 1) * CHUNK)));
              let r = await chunkAction(uploadId, i, fd);
              if (!r.ok) r = await chunkAction(uploadId, i, fd); // one retry on a network blip
              if (!r.ok) { toast("bad", r.error); setProgress(null); return; }
            }
            setProgress(100);
            const f = await finishUploadAction(uploadId);
            setProgress(null);
            if (f.ok) { toast("ok", f.message!); router.push((f.data as { redirect: string }).redirect); } else toast("bad", f.error);
          } catch {
            setProgress(null);
            toast("bad", "Serverlə əlaqə kəsildi. Yenidən cəhd edin.");
          }
        });
      }}
    >
      <label className="label min-w-[260px] flex-1"><span className="req">Excel faylı (.xlsx, .xlsm — makrolar icra edilmir, maks. 25 MB)</span>
        <input className="input pt-1.5" type="file" name="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12" required />
      </label>
      <button className="btn btn-primary" disabled={pending}>{pending ? (progress != null ? `Yüklənir… ${progress}%` : "Yoxlanılır…") : "Yüklə"}</button>
    </form>
  );
}
