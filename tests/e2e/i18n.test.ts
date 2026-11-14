import { expect, test } from "@playwright/test";

test.describe("Idioma", () => {
  test("el idioma por defecto es español", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(
      page.getByRole("heading", { name: "Bienvenido de nuevo" })
    ).toBeVisible();
  });

  test("la cookie NEXT_LOCALE=en muestra la interfaz en inglés", async ({
    context,
    page,
  }) => {
    await context.addCookies([
      { name: "NEXT_LOCALE", url: "http://localhost:3000", value: "en" },
    ]);
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible();
  });

  test("el selector de idioma cambia y persiste el idioma", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("language-en").first().click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.getByTestId("language-es").first().click();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
  });
});
