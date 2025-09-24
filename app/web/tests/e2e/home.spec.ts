import { test, expect } from '@playwright/test';

test.describe('Home page', () => {
  test('reveals journaling UI affordances', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: /Mindful Journal/i })).toBeVisible();
    await expect(page.getByLabel(/Journal Entry/i)).toBeVisible();

    const addGoalButton = page.getByRole('button', { name: 'Add goal' });
    const goalInput = page.getByPlaceholder('Add a goal you want to accomplish today');
    await expect(addGoalButton).toBeDisabled();
    await goalInput.type('Quick alignment goal');
    await expect(goalInput).toHaveValue('Quick alignment goal');
    await expect(addGoalButton).toBeEnabled();

    await expect(page.getByRole('button', { name: /generate/i })).toBeVisible();
  });
});
