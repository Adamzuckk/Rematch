import { test, expect } from '@playwright/test'

test.describe('Rematch smoke', () => {
  test('dashboard loads in English shell', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByText(/ReMatch|ري ماتش/i).first()).toBeVisible()
  })

  test('judge mode route exists', async ({ page }) => {
    await page.goto('/judge')
    await expect(page.locator('h1')).toBeVisible()
  })
})
