import { expect, test, type Page } from "@playwright/test";
import { E2E_USERS } from "./global-setup";

async function login(page: Page, who: keyof typeof E2E_USERS) {
  await page.goto("/login");
  await page.getByLabel("E-poçt").fill(E2E_USERS[who].email);
  await page.getByLabel("Parol").fill(E2E_USERS[who].password);
  await page.getByRole("button", { name: "Daxil ol" }).click();
  await expect(page.getByRole("heading", { name: "İdarə paneli" })).toBeVisible();
}

const sel = (page: Page, label: string) => page.locator(`label:has(> span:text-is("${label}")) select`);

async function pickVariant(page: Page, row: number, query: string, option: RegExp) {
  const box = page.locator("input[role=combobox]").nth(row);
  await box.click();
  await box.fill(query);
  await page.getByRole("option", { name: option }).first().click();
}

test.describe.serial("critical journey", () => {
  test("login rejects wrong password, unauthenticated pages redirect", async ({ page }) => {
    await page.goto("/stock");
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("E-poçt").fill(E2E_USERS.admin.email);
    await page.getByLabel("Parol").fill("wrong-password-1");
    await page.getByRole("button", { name: "Daxil ol" }).click();
    await expect(page.getByText("E-poçt və ya parol yanlışdır.")).toBeVisible();
  });

  test("admin: project, material with sizes, opening count, issue to project", async ({ page }) => {
    await login(page, "admin");
    // dashboard shows real zeros, no fake numbers
    await expect(page.getByText("Stokda unikal SKU")).toBeVisible();

    // Project
    await page.goto("/projects/new");
    await page.getByLabel("Layihə kodu / müqavilə №").fill("E2E01");
    await page.getByLabel("Layihənin adı").fill("E2E test layihəsi");
    await page.getByRole("button", { name: "Yadda saxla" }).click();
    await expect(page.getByRole("heading", { name: /E2E01/ })).toBeVisible();

    // Material: worker boots 41 + 42
    await page.goto("/catalog/new");
    await page.getByLabel("Material adı (AZ)").fill("E2E Botinka");
    await sel(page, "Kateqoriya").selectOption({ label: "Təhlükəsizlik ayaqqabısı (forma/PPE)" });
    await page.locator("label.chip", { hasText: "Fəhlə" }).click();
    await page.locator("label.chip", { hasText: "Ayaqqabı (EU 36–48)" }).click();
    await page.getByRole("button", { name: "41", exact: true }).click();
    await page.getByRole("button", { name: "42", exact: true }).click();
    await sel(page, "Ölçü vahidi").selectOption("PAIR");
    await page.getByRole("button", { name: "Materialı yarat" }).click();
    await expect(page.getByText("Variantlar və qalıq")).toBeVisible();
    await expect(page.getByRole("cell", { name: "41", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "42", exact: true })).toBeVisible();

    // Opening count: 10 × size 42
    await page.goto("/inventory/new");
    await page.getByLabel("Sayımı aparan(lar)").fill("E2E Sayıcı");
    await pickVariant(page, 0, "E2E", /42/);
    await page.getByLabel("Sayılmış miqdar 1").fill("10");
    await page.getByRole("button", { name: "Qaralama kimi saxla" }).click();
    await expect(page.getByRole("heading", { name: /Sayım INV0-/ })).toBeVisible();
    await page.getByRole("button", { name: "Təsdiqlə və qalığa yaz" }).click();
    await page.getByRole("button", { name: "Təsdiq et" }).click();
    await expect(page.getByText("Təsdiqləndi: 1 jurnal qeydi")).toBeVisible();

    // Issue 3 to project
    await page.goto("/movements/new?kind=ISSUE_PROJECT");
    await sel(page, "Layihə").selectOption({ label: "E2E01 — E2E test layihəsi" });
    await page.getByLabel("Təhvil alan").fill("Usta Test");
    await pickVariant(page, 0, "E2E", /42/);
    await page.getByLabel("Miqdar 1").fill("3");
    await page.getByRole("button", { name: "Qaralama kimi saxla" }).click();
    await expect(page.getByRole("heading", { name: /Layihəyə məxaric ISP-/ })).toBeVisible();
    // double-click on post is harmless (button disables; server idempotent)
    await page.getByRole("button", { name: "Təsdiqlə" }).click();
    await page.getByRole("button", { name: "Təsdiq et" }).dblclick();
    await expect(page.getByText("Təsdiqləndi, qalıq yeniləndi.")).toBeVisible();

    // Stock = 7 everywhere, survives reload
    await page.goto("/stock?q=E2E");
    const row = page.getByRole("row", { name: /E2E Botinka/ }).filter({ hasText: "42" });
    await expect(row).toContainText("7");
    await page.reload();
    await expect(row).toContainText("7");
    await page.goto("/");
    await expect(page.locator(".card", { hasText: "Fiziki qalıq" })).toContainText("7");

    // Project report shows net 3
    await page.goto("/projects");
    await page.getByRole("link", { name: "E2E01" }).click();
    await expect(page.locator(".card", { hasText: "Xalis layihədə" })).toContainText("3");
  });

  test("auditor cannot post or reach admin pages; actions are blocked server-side", async ({ page }) => {
    await login(page, "auditor");
    await expect(page.getByRole("link", { name: "Parametrlər" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Excel importu" })).toHaveCount(0);
    await page.goto("/settings/users");
    await expect(page.getByRole("heading", { name: /giriş icazəniz yoxdur/ })).toBeVisible();
    await page.goto("/movements/new?kind=ISSUE_PROJECT");
    await expect(page.getByRole("heading", { name: /giriş icazəniz yoxdur/ })).toBeVisible();
    await page.goto("/movements");
    await expect(page.getByRole("link", { name: "+ Layihəyə məxaric" })).toHaveCount(0);
  });

  test("mobile: dashboard and stock have no horizontal page overflow", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await login(page, "keeper");
    await expect(page.getByRole("navigation", { name: "Mobil naviqasiya" })).toBeVisible();
    await page.getByRole("button", { name: "Sürətli əməliyyatlar" }).click();
    await expect(page.getByRole("link", { name: "Layihəyə məxaric" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Menyunu aç" }).click();
    await expect(page.getByRole("complementary", { name: "Əsas menyu" }).getByRole("link", { name: "Anbar qalığı" })).toBeInViewport();
    await page.getByRole("button", { name: "Menyunu bağla" }).click();
    for (const url of ["/", "/stock", "/movements", "/catalog", "/projects", "/journal", "/mr", "/inventory/new", "/movements/new?kind=ISSUE_PROJECT", "/reports"]) {
      await page.goto(url);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, url).toBeLessThanOrEqual(1);
    }
    await ctx.close();
  });
});

test("regression: client-side tab/filter navigation never hangs (Next 15 loading.tsx streaming bug)", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/settings/system");
  for (const [name, path] of [["MR təsdiq marşrutu", "/settings/approval"], ["İstifadəçilər və rollar", "/settings/users"], ["MR təsdiq marşrutu", "/settings/approval"], ["Anbarlar", "/settings/warehouses"]] as const) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\/") + "$"));
  }
  await page.goto("/stock");
  await page.getByRole("link", { name: "Fəhlə", exact: true }).click();
  await expect(page).toHaveURL(/group=WORKER/);
});

test("PWA: manifest, service worker and offline page are served", async ({ request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m.display).toBe("standalone");
  expect(m.icons.length).toBeGreaterThanOrEqual(3);
  expect((await request.get("/sw.js")).status()).toBe(200);
  expect((await request.get("/offline.html")).status()).toBe(200);
  expect((await request.get("/icons/maskable-512.png")).status()).toBe(200);
});

test("delete: unused project is deleted from UI; project with history is refused with a reason", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/projects/new");
  await page.getByLabel("Layihə kodu / müqavilə №").fill("DEL01");
  await page.getByLabel("Layihənin adı").fill("Silinəcək layihə");
  await page.getByRole("button", { name: "Yadda saxla" }).click();
  await expect(page.getByRole("heading", { name: /DEL01/ })).toBeVisible();
  await page.getByRole("button", { name: "Sil", exact: true }).click();
  await page.getByRole("button", { name: "Təsdiq et" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("link", { name: "DEL01" })).toHaveCount(0);
  // E2E01 has stock movements → refused
  await page.getByRole("link", { name: "E2E01" }).click();
  await page.getByRole("button", { name: "Sil", exact: true }).click();
  await page.getByRole("button", { name: "Təsdiq et" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Silmək olmaz" })).toBeVisible();
});
