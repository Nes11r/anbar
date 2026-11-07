"use client";
import { SimpleForm, type FieldDef } from "@/components/client/simple-form";
import { saveMasterAction, saveSettingsAction, saveStepAction, saveUserAction } from "./actions";

export function MasterForm({ entity, id, fields }: { entity: "warehouse" | "supplier" | "category"; id: string | null; fields: FieldDef[] }) {
  return <SimpleForm plain fields={fields} action={(d) => saveMasterAction(entity, id, d)} redirect={() => `/settings/${entity === "category" ? "categories" : entity + "s"}`} cancelHref={id ? `/settings/${entity === "category" ? "categories" : entity + "s"}` : undefined} />;
}
export function UserForm({ id, fields }: { id: string | null; fields: FieldDef[] }) {
  return <SimpleForm plain fields={fields} action={(d) => saveUserAction(id, d)} redirect={() => "/settings/users"} cancelHref={id ? "/settings/users" : undefined} />;
}
export function SettingsForm({ fields }: { fields: FieldDef[] }) {
  return <SimpleForm plain fields={fields} action={(d) => saveSettingsAction(d)} />;
}
export function StepForm({ step, fields }: { step: number; fields: FieldDef[] }) {
  return <SimpleForm plain fields={fields} action={(d) => saveStepAction(step, d)} submitLabel="Saxla" />;
}
