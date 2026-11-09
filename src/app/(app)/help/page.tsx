import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { az } from "@/i18n/az";
import { sp } from "@/lib/format";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ALL, COMMON, GLOSSARY, guideForRole, type Guide } from "./content";

export const metadata = { title: "İstifadə qaydası" };

/** User guide: one tab per role (own role opens first), every user can read every tab. */
export default async function HelpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePage();
  const mine = guideForRole(user.role);
  const asked = sp((await searchParams).rol);
  const g: Guide = ALL.find((x) => x.id === asked) ?? mine;

  return (
    <>
      <PageHeader
        print={[]}
        title="İstifadə qaydası"
        subtitle={`Hər rol üçün ayrıca təlimat. Sizin rolunuz: ${az.role[user.role]} — öz bölməniz ilk açılır, digərlərinə də baxa bilərsiniz.`}
      />
      <nav className="no-print mb-4 flex flex-wrap gap-1.5" aria-label="Rollar">
        {ALL.map((x) => (
          <Link key={x.id} href={`/help?rol=${x.id}`} className="chip" aria-current={x.id === g.id ? "true" : undefined}>
            {x.title}
            {x.id === mine.id && x.id !== COMMON.id && <span className="text-[10px] font-normal opacity-80">· sizin rol</span>}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">{g.title}</h2>
              {g.id === mine.id && g.id !== COMMON.id && <Badge tone="brand">Sizin rolunuz</Badge>}
            </div>
            <p className="mt-1 text-sm">{g.who}</p>
          </Card>

          {g.tasks.map((t, i) => (
            <Card key={t.title} title={`${i + 1}. ${t.title}`}>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                {t.steps.map((s) => <li key={s}>{s}</li>)}
              </ol>
              {t.note && <p className="alert alert-info mt-3 text-xs">{t.note}</p>}
            </Card>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          {g.menu && (
            <Card title="Menyuda görəcəyiniz bölmələr">
              <ul className="space-y-1 text-sm">{g.menu.map((m) => <li key={m}>• {m}</li>)}</ul>
            </Card>
          )}
          {g.cannot && g.cannot.length > 0 && (
            <Card title="Bu rolda edilə bilməyənlər">
              <ul className="space-y-1.5 text-sm">{g.cannot.map((c) => <li key={c}>✕ {c}</li>)}</ul>
            </Card>
          )}
          {g.tips && g.tips.length > 0 && (
            <Card title="Faydalı məsləhətlər">
              <ul className="space-y-1.5 text-sm">{g.tips.map((c) => <li key={c}>• {c}</li>)}</ul>
            </Card>
          )}
          <Card title="Terminlər lüğəti">
            <dl className="space-y-2 text-sm">
              {GLOSSARY.map(([k, v]) => (
                <div key={k}><dt className="font-semibold">{k}</dt><dd className="text-muted">{v}</dd></div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
