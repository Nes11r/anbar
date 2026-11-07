"use client";
import { SimpleForm } from "@/components/client/simple-form";
import { saveEmployeeAction } from "./actions";

export function EmployeeForm({ id, v, projects }: { id?: string; v?: { code: string; fullName: string; group: string; position: string | null; department: string | null; projectId: string | null; isActive: boolean; notes: string | null }; projects: [string, string][] }) {
  return (
    <SimpleForm
      action={(d) => saveEmployeeAction(id ?? null, d)}
      redirect={(d) => `/employees/${(d as { id: string }).id}`}
      cancelHref={id ? `/employees/${id}` : "/employees"}
      fields={[
        { name: "code", label: "İşçi ID", type: "text", required: true, defaultValue: v?.code, maxLength: 30 },
        { name: "fullName", label: "Ad, soyad", type: "text", required: true, defaultValue: v?.fullName, span: 2 },
        { name: "group", label: "Kateqoriya", type: "select", required: true, defaultValue: v?.group ?? "", options: [["", "— seçin —"], ["ENGINEER", "Mühəndis"], ["WORKER", "Fəhlə"]], hint: "PPE təhvilində materialın təyinatı ilə yoxlanılır" },
        { name: "position", label: "Vəzifə", type: "text", defaultValue: v?.position },
        { name: "department", label: "Şöbə", type: "text", defaultValue: v?.department },
        { name: "projectId", label: "Layihə", type: "select", defaultValue: v?.projectId ?? "", options: [["", "—"], ...projects] },
        { name: "isActive", label: "Aktivdir", type: "checkbox", defaultValue: v?.isActive ?? true },
        { name: "notes", label: "Qeyd", type: "textarea", defaultValue: v?.notes, span: 3 },
      ]}
    />
  );
}
