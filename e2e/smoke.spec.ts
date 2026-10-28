import { test, expect, signUp, a11y, checkProblems } from './fixtures';
test('smoke: sign up, see calendar', async ({ page, problems }) => {
  await signUp(page);
  await page.goto('/calendar');
  await expect(page.getByRole('heading').first()).toBeVisible();
  await a11y(page);
  checkProblems(problems);
});
