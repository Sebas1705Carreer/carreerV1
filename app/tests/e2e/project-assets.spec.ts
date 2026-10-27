import { test, expect } from '@playwright/test';

// Portfolio assets standard: every project card shows a 2:1 banner (repo/API image or generated fallback).
test.describe('Project banners', () => {
    for (const lang of ['en', 'es']) {
        test(`every project card on /${lang}/projects has a 2:1 banner with alt text`, async ({ page }) => {
            await page.goto(`${lang}/projects`);
            const banners = page.locator('article [data-testid="project-banner"]');
            const count = await banners.count();
            expect(count).toBeGreaterThan(0);

            for (let i = 0; i < count; i++) {
                const banner = banners.nth(i);
                await banner.scrollIntoViewIfNeeded();
                const box = await banner.boundingBox();
                expect(box).not.toBeNull();
                expect(box!.width / box!.height).toBeCloseTo(2, 1);

                const img = banner.locator(':scope > img');
                if (await img.count() > 0) {
                    await expect(img).toHaveAttribute('loading', 'lazy');
                    expect((await img.getAttribute('alt'))?.trim()).toBeTruthy();
                } else {
                    const fallback = banner.locator('[data-testid="project-banner-fallback"]');
                    await expect(fallback).toHaveAttribute('role', 'img');
                    expect((await fallback.getAttribute('aria-label'))?.trim()).toBeTruthy();
                }
            }
        });
    }
});
