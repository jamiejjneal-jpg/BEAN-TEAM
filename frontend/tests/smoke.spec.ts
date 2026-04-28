// Smoke tests — run with `yarn playwright test` after `yarn playwright install`
// These tests verify the critical user paths still work after every deploy.
//
// Setup (one-time):
//   yarn add -D @playwright/test
//   yarn playwright install --with-deps
//
// Run:
//   PLAYWRIGHT_BASE_URL=https://ink-validator.emergent.host yarn playwright test
//   (defaults to http://localhost:3000)
//
// Add a test admin to your Supabase first; set creds via env:
//   ADMIN_EMAIL, ADMIN_PASSWORD

import { test, expect } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'e1-test-admin@example.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestDev123!'

test.describe('Public pages', () => {
  test('homepage loads with primary CTA', async ({ page }) => {
    await page.goto(BASE)
    await expect(page.getByText("Rocky's Retreat")).toBeVisible()
    await expect(page.getByTestId('hero-cta')).toBeVisible()
  })

  test('login page renders', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('legal pages are reachable', async ({ page }) => {
    for (const path of ['/privacy', '/terms', '/pricing']) {
      const resp = await page.goto(`${BASE}${path}`)
      expect(resp?.status()).toBe(200)
    }
  })

  test('sitemap and robots are served', async ({ request }) => {
    const sm = await request.get(`${BASE}/sitemap.xml`)
    expect(sm.status()).toBe(200)
    expect(sm.headers()['content-type']).toContain('xml')
    const rb = await request.get(`${BASE}/robots.txt`)
    expect(rb.status()).toBe(200)
  })
})

test.describe('Admin authenticated paths', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL)
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/\/admin/, { timeout: 20000 })
  })

  test('dashboard renders with species widget', async ({ page }) => {
    await expect(page.getByTestId('species-breakdown-widget')).toBeVisible()
  })

  test('navigates Bookings → Pets → Analytics without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.getByRole('link', { name: 'Bookings' }).click()
    await expect(page).toHaveURL(/\/admin\/bookings/)
    await expect(page.getByText('Manage Bookings')).toBeVisible()

    await page.getByRole('link', { name: 'Pets' }).click()
    await expect(page).toHaveURL(/\/admin\/pets/)
    await expect(page.getByTestId('admin-pets-page')).toBeVisible()

    await page.getByRole('link', { name: 'Analytics' }).click()
    await expect(page).toHaveURL(/\/admin\/analytics/)
    await expect(page.getByTestId('analytics-page')).toBeVisible()

    expect(errors).toEqual([])
  })

  test('add booking dialog opens', async ({ page }) => {
    await page.getByRole('link', { name: 'Bookings' }).click()
    await page.getByTestId('add-booking-button').click()
    await expect(page.getByTestId('add-booking-confirm')).toBeVisible()
  })
})
