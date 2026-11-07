import { expect, test } from "@playwright/test";
import { E2E_USERS } from "./global-setup";

/** Visual smoke: every main page renders without the error boundary (screenshots in test-results/screens). */
const PAGES = ["/", "/catalog", "/stock", "/inventory", "/movements", "/journal", "/mr", "/mr/new", "/po", "/grn", "/projects", "/employees", "/reports", "/import", "/audit", "/settings/warehouses", "/settings/users", "/settings/approval", "/movements/new?kind=ISSUE_EMPLOYEE"];

test("all main pages render (light + dark)", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-poçt").fill(E2E_USERS.admin.email);
  await page.getByLabel("Parol").fill(E2E_USERS.admin.password);
  await page.getByRole("button", { name: "Daxil ol" }).click();
  await expect(page.getByRole("heading", { name: "İdarə paneli" })).toBeVisible();
  for (const url of PAGES) {
    await page.goto(url);
    await expect(page.getByText("Səhifə yüklənərkən xəta baş verdi")).toHaveCount(0);
    await expect(page.locator("h1").first()).toBeVisible();
    await page.screenshot({ path: `test-results/screens/${url.replace(/[/?=&]+/g, "_") || "home"}.png`, fullPage: false });
  }
  await page.context().addCookies([{ name: "theme", value: "dark", url: "http://127.0.0.1:3100" }]);
  for (const url of ["/", "/stock"]) {
    await page.goto(url);
    await page.screenshot({ path: `test-results/screens/dark${url.replace(/\//g, "_")}.png` });
  }
});
