import { test, expect } from '@playwright/test';

const GOAL_TEXT = 'Write nightly reflection';
const JOURNAL_TEXT = 'Logged lessons learned from the journaling session.';

test.describe('Capture to reflection loop', () => {
  test('allows capturing goals and stories locally', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Generate Reflection' })).toBeVisible();

    const goalInput = page.getByPlaceholder('Add a goal you want to accomplish today');
    await goalInput.fill(GOAL_TEXT);
    await expect(goalInput).toHaveValue(GOAL_TEXT);

    const addGoalButton = page.getByRole('button', { name: 'Add goal' });
    await expect(addGoalButton).toBeEnabled();
    await addGoalButton.click();

    await expect(page.getByRole('checkbox', { name: GOAL_TEXT })).toBeVisible();

    const journalEntry = page.getByLabel('Journal Entry').first();
    await journalEntry.fill(JOURNAL_TEXT);
    await expect(journalEntry).toHaveValue(JOURNAL_TEXT);

    await page.getByRole('button', { name: /Add another entry/i }).click();
    await expect(page.getByLabel('Journal Entry')).toHaveCount(2);
  });

  test('surfaces generated reflection when journaling flow completes', async ({ page }) => {
    await page.goto('/');

    const generateButton = page.getByRole('button', { name: 'Generate Reflection' });
    await expect(generateButton).toBeVisible();
    await expect(generateButton).toBeEnabled();

    const journalEntry = page.getByLabel('Journal Entry');
    await journalEntry.fill('Testing AI reflection guidance.');
    await expect(journalEntry).toHaveValue('Testing AI reflection guidance.');

    const reflectionOutput = page.getByPlaceholder('AI reflection will appear here after you generate one.');
    await expect(reflectionOutput).toHaveValue(/Stubbed reflection generated for Playwright tests\./, { timeout: 10000 });
    await expect(reflectionOutput).toHaveValue(/Next step: Celebrate a small win today\./);

    await expect(generateButton).toBeEnabled({ timeout: 10000 });
    await expect(page.getByText('Reflection generated successfully.')).toBeVisible();
  });
});
