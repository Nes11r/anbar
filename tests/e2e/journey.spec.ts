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

    // Office → site: 5 go to the project's site warehouse (one step, lands on the site page)
    await page.goto("/movements/new?kind=TRANSFER");
    await page.locator('label:has(> span:text-is("Hansı layihəyə göndərilir")) select').selectOption({ label: "E2E01 — E2E test layihəsi" });
    await page.locator('label:has(> span:text-is("Daşıyan şəxs")) input').fill("Sürücü Test");
    await pickVariant(page, 0, "E2E", /42/);
    await page.getByLabel("Miqdar 1").fill("5");
    await page.getByRole("button", { name: "Təsdiqlə", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Sahə: E2E01/ })).toBeVisible();

    // 3 used on site (consumption is recorded only from the project's site warehouse)
    await page.getByRole("link", { name: "Sahədə istifadə (sərf)" }).click();
    await page.locator('label:has(> span:text-is("Kim istifadə etdi (usta / briqada)")) input').fill("Usta Test");
    await pickVariant(page, 0, "E2E", /42/);
    await page.getByLabel("Miqdar 1").fill("3");
    await page.getByRole("button", { name: "Təsdiqlə", exact: true }).click();
    await expect(page.getByText(/Təsdiqləndi: ISP-.*Qalıq yeniləndi\./)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Sahə: E2E01/ })).toBeVisible();

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
    await expect(page.getByRole("link", { name: "+ Sahəyə göndər" })).toHaveCount(0);
    // view-only sections say who can change them
    await expect(page.getByText("Bu bölmə sizin üçün yalnız baxış üçündür.")).toBeVisible();
    await page.goto("/catalog");
    await expect(page.getByRole("note")).toContainText("Anbar müdiri");
    await expect(page.getByRole("link", { name: "+ Yeni material" })).toHaveCount(0);
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

test("registration: user picks account type, cannot log in until admin approves", async ({ page, browser }) => {
  await page.goto("/register");
  await page.locator("label", { hasText: "Sifarişçi" }).first().click();
  await page.getByLabel("Ad, soyad").fill("E2E Sifarişçi");
  await page.getByLabel("E-poçt").fill("e2e.client@test.local");
  await page.locator("input[name=password]").fill("ClientPass123");
  await page.locator("input[name=password2]").fill("ClientPass123");
  await page.getByRole("button", { name: "Qeydiyyat sorğusu göndər" }).click();
  await expect(page.getByText("Sorğunuz qəbul edildi")).toBeVisible();
  // pending → login refused
  await page.goto("/login");
  await page.getByLabel("E-poçt").fill("e2e.client@test.local");
  await page.getByLabel("Parol").fill("ClientPass123");
  await page.getByRole("button", { name: "Daxil ol" }).click();
  await expect(page.getByText("təsdiqini gözləyir")).toBeVisible();
  // admin approves
  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await login(admin, "admin");
  await admin.goto("/settings/users");
  await expect(admin.getByText("Təsdiq gözləyən qeydiyyatlar")).toBeVisible();
  await admin.getByRole("link", { name: "Bax və təsdiq et" }).click();
  await expect(admin.getByRole("heading", { name: /Təsdiq: e2e\.client@test\.local/ })).toBeVisible();
  // a client must be linked to a project
  await admin.getByRole("button", { name: "Yadda saxla" }).click();
  await expect(admin.getByText(/Sifarişçi hesabı layihəyə bağlanmalıdır/).first()).toBeVisible();
  await admin.getByLabel(/Layihə ilə məhdudlaşdır/).selectOption({ label: "E2E01 — E2E test layihəsi" });
  await admin.getByRole("button", { name: "Yadda saxla" }).click();
  await expect(admin.getByText("İstifadəçi yadda saxlanıldı")).toBeVisible();
  await ctx.close();
  // now login works; client is read-only (no approve/create buttons, no settings)
  await page.goto("/login");
  await page.getByLabel("E-poçt").fill("e2e.client@test.local");
  await page.getByLabel("Parol").fill("ClientPass123");
  await page.getByRole("button", { name: "Daxil ol" }).click();
  // client lands on their own project's site page and never sees company-wide figures
  await expect(page.getByRole("heading", { name: /Sahə: E2E01/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "İdarə paneli" })).toHaveCount(0);
  await page.goto("/stock");
  await expect(page).toHaveURL(/\/forbidden/);
  await page.goto("/sites");
  await expect(page.getByRole("heading", { name: "Layihələr və sahələr" })).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Ofisdən sahəyə göndər" })).toHaveCount(0);
  await page.goto("/mr");
  await expect(page.getByRole("link", { name: "+ Yeni MR" })).toHaveCount(0);
});

test("site: office → site transfer shows up as site stock; daily report records differences", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/sites");
  await page.getByRole("link", { name: /E2E01/ }).first().click();
  await expect(page.getByRole("heading", { name: /Sahə: E2E01/ })).toBeVisible();
  await page.getByRole("link", { name: "Ofisdən sahəyə göndər" }).click();
  await page.locator('label:has(> span:text-is("Daşıyan şəxs")) input').fill("Layihə rəhbəri");
  const box = page.locator("input[role=combobox]").first();
  await box.click();
  await box.fill("E2E");
  await page.getByRole("option", { name: /42/ }).first().click();
  await page.getByLabel("Miqdar 1").fill("2");
  await page.getByRole("button", { name: "Təsdiqlə", exact: true }).click();
  // posts immediately and lands on the site warehouse page
  await expect(page.getByText(/Təsdiqləndi: .*Qalıq yeniləndi\./)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Sahə: E2E01/ })).toBeVisible();
  await expect(page.locator(".card", { hasText: "Sahə anbarında stokda" })).toContainText("4");
  await page.getByRole("link", { name: "+ Gündəlik hesabat" }).click();
  await page.getByLabel(/stokda$/).first().fill("1");
  await page.getByLabel(/işçilərdə$/).first().fill("0");
  await page.getByRole("button", { name: "Hesabatı saxla" }).click();
  await expect(page.getByText(/materialda sistemlə fərq var/).first()).toBeVisible();
});
