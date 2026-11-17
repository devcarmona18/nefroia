import { expect, test } from "@playwright/test";

test.describe("Model Selector", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("displays a model button", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector");
    await expect(modelButton).toBeVisible();
  });

  test("opens model selector popover on click", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector");
    await modelButton.click();

    await expect(page.getByPlaceholder("Buscar modelos...")).toBeVisible();
  });

  test("can search for models", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector");
    await modelButton.click();

    const searchInput = page.getByPlaceholder("Buscar modelos...");
    await searchInput.fill("Gemini");

    await expect(
      page.getByRole("option", { name: /Gemini 2\.5 Pro/ })
    ).toBeVisible();
  });

  test("can close model selector by clicking outside", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector");
    await modelButton.click();

    await expect(page.getByPlaceholder("Buscar modelos...")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByPlaceholder("Buscar modelos...")).not.toBeVisible();
  });

  test("shows available models", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector");
    await modelButton.click();

    const availableModels = page.getByRole("group", { name: "Anthropic" });
    await expect(availableModels).toBeVisible();
    await expect(
      availableModels.getByRole("option", { name: /Claude Haiku 4\.5/ })
    ).toBeVisible();
    await expect(
      availableModels.getByRole("option", { name: /Claude Sonnet 4\.5/ })
    ).toBeVisible();
  });

  test("can select a different model", async ({ page }) => {
    const modelButton = page.getByTestId("model-selector");
    await modelButton.click();

    await page.getByRole("option", { name: /Gemini 2\.5 Pro/ }).click();

    await expect(page.getByPlaceholder("Buscar modelos...")).not.toBeVisible();
    await expect(modelButton).toContainText("Gemini 2.5 Pro");
  });
});
