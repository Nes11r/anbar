"use server";
import { runAction } from "@/lib/action";
import { saveProject } from "@/server/services/masterdata";

export async function saveProjectAction(id: string | null, data: Record<string, unknown>) {
  return runAction("project.manage", (a) => saveProject(a, id, data as never).then((p) => ({ id: p.id })), { revalidate: ["/projects"], message: "Layihə yadda saxlanıldı" });
}
