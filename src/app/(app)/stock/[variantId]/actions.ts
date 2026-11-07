"use server";
import { runAction } from "@/lib/action";
import { createReservation, releaseReservation } from "@/server/services/masterdata";

export async function createReservationAction(input: { warehouseId: string; variantId: string; qty: number; projectId?: string | null; reason?: string | null }) {
  return runAction("reservation.manage", (a) => createReservation(a, input).then((r) => ({ number: r.number })), { revalidate: ["/stock"], message: (r) => `Rezerv yaradıldı: ${r.number}` });
}
export async function releaseReservationAction(id: string) {
  return runAction("reservation.manage", (a) => releaseReservation(a, id), { revalidate: ["/stock"], message: "Rezerv azad edildi" });
}
