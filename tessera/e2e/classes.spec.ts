import { expect, test } from '@playwright/test';
import { answerLearnQuestion, createSet, latestEmail, linkFrom, newUser, signUp, VOCAB, waitForSync } from './helpers';

test('a teacher creates a class, a student joins by link, and the teacher sees their progress', async ({ browser }) => {
  // Teacher: create a class and assign a private set.
  const teacherPage = await (await browser.newContext()).newPage();
  const teacher = newUser('teacher');
  await signUp(teacherPage, teacher, { teacher: true });
  await teacherPage.goto(linkFrom(await latestEmail(teacher.email, 'Confirm your email')));
  const setId = await createSet(teacherPage, { title: 'Spanish greetings', cards: VOCAB });

  await teacherPage.goto('/classes');
  await teacherPage.getByRole('button', { name: 'New class' }).first().click();
  await teacherPage.getByLabel('Class name').fill('Spanish 1');
  await teacherPage.getByRole('button', { name: 'Create class' }).click();
  await expect(teacherPage.getByRole('heading', { name: 'Spanish 1', level: 1 })).toBeVisible();
  const code = (await teacherPage.getByTestId('join-code').innerText()).trim();

  await teacherPage.getByRole('button', { name: 'Assign a set' }).click();
  const dialog = teacherPage.getByRole('dialog', { name: 'Assign a set' });
  await dialog.getByLabel('Set').selectOption({ label: 'Spanish greetings (6 cards)' });
  await dialog.getByLabel('Note for students (optional)').fill('Learn these before Monday');
  await dialog.getByRole('button', { name: 'Assign' }).click();
  await expect(teacherPage.getByRole('link', { name: 'Spanish greetings' })).toBeVisible();

  // Student: join through the invite link and study the assignment.
  const studentPage = await (await browser.newContext()).newPage();
  const student = newUser('student');
  await signUp(studentPage, student);
  await studentPage.goto(`/join/${code.toLowerCase()}`);
  await expect(studentPage.getByText('Your teacher will see your name')).toBeVisible();
  await studentPage.getByRole('button', { name: 'Join class' }).click();
  await expect(studentPage.getByRole('heading', { name: 'Spanish 1', level: 1 })).toBeVisible();
  await expect(studentPage.getByText('Learn these before Monday')).toBeVisible();
  await studentPage.getByRole('link', { name: 'Study' }).click();
  await expect(studentPage).toHaveURL(/\/learn$/);
  for (let i = 0; i < 3; i++) await answerLearnQuestion(studentPage, VOCAB);
  // Leaving through the close button flushes recorded answers.
  await studentPage.getByRole('link', { name: 'Close and go back to the set' }).click();
  await waitForSync(studentPage, setId, (set) => Object.keys(set.progress).length > 0);

  // Teacher: the progress table shows the student.
  await teacherPage.reload();
  await teacherPage.getByRole('tab', { name: 'Progress' }).click();
  const row = teacherPage.getByRole('row', { name: new RegExp(student.name) });
  await expect(row).toBeVisible();
  await expect(row.getByText(/\d+%/)).toBeVisible({ timeout: 15_000 });
  await teacherPage.getByRole('tab', { name: /Students/ }).click();
  await expect(teacherPage.getByText(student.name)).toBeVisible();
});

test('a student without a class can enter a code by hand', async ({ page }) => {
  await signUp(page, newUser('nocls'));
  await page.goto('/classes');
  await expect(page.getByText('Ask your teacher for a class code')).toBeVisible();
  await page.getByRole('button', { name: 'Join a class' }).first().click();
  await page.getByLabel('Class code').fill('ZZZZ-ZZZ');
  await page.getByRole('button', { name: 'Find class' }).click();
  await expect(page.getByText("That code doesn't match an open class")).toBeVisible();
});
