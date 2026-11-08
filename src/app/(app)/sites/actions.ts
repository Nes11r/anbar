"use server";
import { runAction } from "@/lib/action";
import { createSiteReport, siteReportToCount, type SiteReportInput } from "@/server/services/sites";

export async function createSiteReportAction(input: SiteReportInput) {
  return runAction("site.report", (a) => createSiteReport(a, input).then((r) => ({ ...r, redirect: `/sites/reports/${r.id}` })), {
    revalidate: ["/sites"],
    message: (r) => (r.diffs ? `Hesabat saxlanıldı: ${r.diffs} materialda sistemlə fərq var.` : "Hesabat saxlanıldı: sistemlə tam uyğundur."),
  });
}

export async function siteReportToCountAction(reportId: string) {
  return runAction("inventory.edit", (a) => siteReportToCount(a, reportId), { revalidate: ["/inventory", "/sites"], message: (r) => `Qaralama sayım yaradıldı: ${r.number}. Təsdiq edilənə qədər qalıq dəyişmir.` });
}
