import Image from "next/image";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { can, scopeProjectId, type Permission } from "@/lib/rbac";
import { az } from "@/i18n/az";
import { logoutAction } from "@/app/login/actions";
import { MenuButton, SideNav } from "@/components/client/side-nav";
import { MobileTabBar, type TabItem } from "@/components/client/mobile-tabbar";
import { ResponsiveTables } from "@/components/client/responsive-tables";
import { ThemeControls } from "@/components/client/theme-controls";
import { GlobalSearch } from "@/components/client/global-search";

const NAV: { href: string; label: string; perm: Permission; icon: string; group?: string }[] = [
  { href: "/", label: az.nav.dashboard, perm: "dashboard.view", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/catalog", label: az.nav.catalog, perm: "catalog.view", icon: "M4 6h16M4 12h16M4 18h10", group: "Anbar" },
  { href: "/stock", label: az.nav.stock, perm: "stock.view", icon: "M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7", group: "Anbar" },
  { href: "/inventory", label: az.nav.inventory, perm: "inventory.view", icon: "M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9", group: "Anbar" },
  { href: "/sites", label: az.nav.sites, perm: "site.view", icon: "M3 21h18M6 21V10l6-4 6 4v11M10 21v-5h4v5M4 10h16", group: "Anbar" },
  { href: "/my", label: az.nav.my, perm: "my.items", icon: "M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0", group: "Anbar" },
  { href: "/movements", label: az.nav.movements, perm: "stockdoc.view", icon: "M7 7h13l-4-4M17 17H4l4 4", group: "Anbar" },
  { href: "/journal", label: az.nav.journal, perm: "journal.view", icon: "M4 4h16v16H4zM8 8h8M8 12h8M8 16h5", group: "Anbar" },
  { href: "/mr", label: az.nav.mr, perm: "mr.view", icon: "M9 5h6M9 3h6v4H9zM6 5H5a1 1 0 00-1 1v14a1 1 0 001 1h14a1 1 0 001-1V6a1 1 0 00-1-1h-1", group: "Satınalma" },
  { href: "/po", label: az.nav.po, perm: "po.view", icon: "M3 3h2l2 12h11l2-8H6M9 20a1 1 0 100-2 1 1 0 000 2zM17 20a1 1 0 100-2 1 1 0 000 2z", group: "Satınalma" },
  { href: "/grn", label: az.nav.grn, perm: "grn.view", icon: "M3 7h11v10H3zM14 10h4l3 3v4h-7M7 20a2 2 0 100-4 2 2 0 000 4zM17 20a2 2 0 100-4 2 2 0 000 4z", group: "Satınalma" },
  { href: "/projects", label: az.nav.projects, perm: "project.view", icon: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6", group: "Layihə" },
  { href: "/reports", label: az.nav.reports, perm: "report.view", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2", group: "Analiz" },
  { href: "/import", label: az.nav.import, perm: "import.run", icon: "M12 3v12M7 10l5 5 5-5M4 21h16", group: "Sistem" },
  { href: "/audit", label: az.nav.audit, perm: "audit.view", icon: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z", group: "Sistem" },
  { href: "/settings", label: az.nav.settings, perm: "masterdata.manage", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z", group: "Sistem" },
];

const ICON = {
  home: "M3 12l9-8 9 8M5 10v10h14V10",
  stock: "M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7",
  mr: "M9 5h6M9 3h6v4H9zM6 5H5a1 1 0 00-1 1v14a1 1 0 001 1h14a1 1 0 001-1V6a1 1 0 00-1-1h-1",
  out: "M7 7h13l-4-4M17 17H4l4 4",
  ppe: "M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0",
  grn: "M3 7h11v10H3zM14 10h4l3 3v4h-7M7 20a2 2 0 100-4 2 2 0 000 4zM17 20a2 2 0 100-4 2 2 0 000 4z",
  ret: "M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3",
  count: "M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9",
  trf: "M4 7h16M16 3l4 4-4 4M20 17H4M8 13l-4 4 4 4",
  journal: "M4 4h16v16H4zM8 8h8M8 12h8M8 16h5",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePage();
  const items = NAV.filter((n) => can(user.role, n.perm)).map(({ perm: _p, ...rest }) => (void _p, rest));
  const tabs: TabItem[] = [
    { href: "/", label: "Panel", icon: ICON.home },
    can(user.role, "site.view") ? { href: "/sites", label: "Sahələr", icon: ICON.stock } : { href: "/stock", label: "Qalıq", icon: ICON.stock },
    can(user.role, "mr.view") ? { href: "/mr", label: "MR", icon: ICON.mr } : { href: "/journal", label: "Jurnal", icon: ICON.journal },
  ];
  const scope = scopeProjectId(user);
  const actions: TabItem[] = [
    ...(can(user.role, "site.report") ? [{ href: scope ? `/sites/${scope}/report` : "/sites", label: "Sahə hesabatı", icon: ICON.count }] : []),
    ...(can(user.role, "stockdoc.edit") && !scope ? [{ href: "/movements/new?kind=TRANSFER", label: "Sahəyə göndər", icon: ICON.trf }] : []),
    ...(can(user.role, "stockdoc.edit") ? [
      { href: "/movements/new?kind=ISSUE_PROJECT", label: "Layihəyə məxaric", icon: ICON.out },
      { href: "/movements/new?kind=ISSUE_EMPLOYEE", label: "İşçiyə PPE", icon: ICON.ppe },
      { href: "/movements/new?kind=RETURN_FROM_PROJECT", label: "Qaytarma", icon: ICON.ret },
    ] : []),
    ...(can(user.role, "grn.edit") ? [{ href: "/grn", label: "Mal qəbulu", icon: ICON.grn }] : []),
    ...(can(user.role, "inventory.edit") ? [{ href: "/inventory/new", label: "Sayım", icon: ICON.count }] : []),
    ...(can(user.role, "mr.create") ? [{ href: "/mr/new", label: "Yeni MR", icon: ICON.mr }] : []),
  ];
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-2">Məzmuna keç</a>
      <SideNav
        items={items}
        footer={
          <div className="flex items-center justify-between gap-2">
            <Link href="/account" className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold">{user.name}</div>
              <div className="text-xs text-muted">{az.role[user.role]}</div>
            </Link>
            <form action={logoutAction}><button className="btn btn-sm" type="submit">Çıxış</button></form>
          </div>
        }
      >
        <Link href="/" className="mb-3 flex items-center rounded-md bg-white px-2 py-1.5">
          <Image src="/hecotec-logo.png" alt="HECOTEC" width={150} height={42} priority />
        </Link>
      </SideNav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="flex h-14 items-center gap-2 px-2 sm:px-4">
            <MenuButton />
            <Link href="/" className="flex shrink-0 items-center rounded bg-white px-1.5 py-1 lg:hidden" aria-label="İdarə paneli">
              <Image src="/hecotec-logo.png" alt="HECOTEC" width={104} height={29} priority />
            </Link>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <ThemeControls />
              <Link href="/account" className="hidden text-right leading-tight sm:block">
                <div className="text-sm font-semibold">{user.name}</div>
                <div className="text-xs text-muted">{az.role[user.role]}</div>
              </Link>
              <form action={logoutAction} className="hidden lg:block">
                <button className="btn btn-sm" type="submit">Çıxış</button>
              </form>
            </div>
          </div>
        </header>
        {user.mustChangePwd && (
          <div className="no-print border-b border-warn bg-warn-soft px-4 py-2 text-sm">
            Parolunuz administrator tərəfindən təyin edilib. <Link className="link" href="/account">Parolu dəyişin</Link>.
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 pb-28 sm:px-4 md:p-6 lg:pb-6">{children}<div id="print-tail" /></main>
        <footer className="no-print hidden border-t border-line px-6 py-3 text-xs text-muted lg:block">HECOTEC MMC · Mardanov Gardashlari 59, Bakı · Məlumatlar mərkəzi serverdə saxlanılır.</footer>
      </div>
      <MobileTabBar tabs={tabs} actions={actions} />
      <ResponsiveTables />
    </div>
  );
}
