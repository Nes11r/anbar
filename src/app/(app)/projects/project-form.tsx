"use client";
import { SimpleForm } from "@/components/client/simple-form";
import { saveProjectAction } from "./actions";

export interface ProjectValues { code: string; name: string; client: string | null; location: string | null; startDate: string; endDate: string; managerName: string | null; isActive: boolean; notes: string | null }

export function ProjectForm({ id, v }: { id?: string; v?: ProjectValues }) {
  return (
    <SimpleForm
      action={(d) => saveProjectAction(id ?? null, d)}
      redirect={(d) => `/projects/${(d as { id: string }).id}`}
      cancelHref={id ? `/projects/${id}` : "/projects"}
      fields={[
        { name: "code", label: "Layihə kodu / müqavilə №", type: "text", required: true, defaultValue: v?.code, hint: "MR nömrələrində istifadə olunur: MR-[KOD]-[DİSİPLİN]-0001", maxLength: 30 },
        { name: "name", label: "Layihənin adı", type: "text", required: true, defaultValue: v?.name, span: 2 },
        { name: "client", label: "Sifarişçi", type: "text", defaultValue: v?.client },
        { name: "location", label: "Lokasiya", type: "text", defaultValue: v?.location },
        { name: "managerName", label: "Məsul şəxs", type: "text", defaultValue: v?.managerName },
        { name: "startDate", label: "Başlanma tarixi", type: "date", defaultValue: v?.startDate },
        { name: "endDate", label: "Bitmə tarixi", type: "date", defaultValue: v?.endDate },
        { name: "isActive", label: "Aktivdir", type: "checkbox", defaultValue: v?.isActive ?? true },
        { name: "notes", label: "Qeyd", type: "textarea", defaultValue: v?.notes, span: 3 },
      ]}
    />
  );
}
