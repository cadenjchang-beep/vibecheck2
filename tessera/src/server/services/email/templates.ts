import { APP_NAME } from '@shared/constants';
import type { EmailMessage } from './transport';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Layout {
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footnote?: string;
}

/** One plain, accessible layout for every message: real text, one clear action. */
function layout({ to, subject, heading, paragraphs, action, footnote }: Layout): EmailMessage {
  const text = [
    heading,
    '',
    ...paragraphs,
    ...(action ? ['', `${action.label}: ${action.url}`] : []),
    ...(footnote ? ['', footnote] : []),
    '',
    `— ${APP_NAME}`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#faf8f4;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1c1a22;line-height:1.55;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e6e0d8;border-radius:16px;padding:32px;">
    <p style="margin:0 0 20px;font-size:15px;font-weight:700;letter-spacing:.02em;color:#7a1f63;">${APP_NAME}</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">${escapeHtml(heading)}</h1>
    ${paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:16px;">${escapeHtml(p)}</p>`).join('\n    ')}
    ${
      action
        ? `<p style="margin:24px 0;"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#7a1f63;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:12px 22px;border-radius:10px;">${escapeHtml(action.label)}</a></p>
    <p style="margin:0 0 14px;font-size:13px;color:#5d5864;word-break:break-all;">Or paste this link into your browser: ${escapeHtml(action.url)}</p>`
        : ''
    }
    ${footnote ? `<p style="margin:20px 0 0;font-size:13px;color:#5d5864;">${escapeHtml(footnote)}</p>` : ''}
  </div>
</body>
</html>`;

  return { to, subject, text, html };
}

export function verificationEmail(user: { name: string; email: string }, url: string): EmailMessage {
  return layout({
    to: user.email,
    subject: `Confirm your email for ${APP_NAME}`,
    heading: `Welcome, ${user.name}`,
    paragraphs: [
      'Confirm your email address so you can share sets publicly, create classes and recover your account if you ever lose access.',
    ],
    action: { label: 'Confirm email', url },
    footnote: `If you didn't create a ${APP_NAME} account, you can ignore this message.`,
  });
}

export function resetPasswordEmail(user: { name: string; email: string }, url: string): EmailMessage {
  return layout({
    to: user.email,
    subject: `Reset your ${APP_NAME} password`,
    heading: 'Reset your password',
    paragraphs: [
      `Hi ${user.name}, we received a request to reset your password. This link works once and expires in one hour.`,
    ],
    action: { label: 'Choose a new password', url },
    footnote: "If you didn't ask for this, you can ignore this message. Your password won't change.",
  });
}

export function parentalConsentEmail(parentEmail: string, childName: string, url: string): EmailMessage {
  return layout({
    to: parentEmail,
    subject: `${childName} would like to use ${APP_NAME}`,
    heading: 'A child in your care wants to study with Tessera',
    paragraphs: [
      `${childName} told us they are under 13 and gave this address as their parent or guardian's.`,
      `${APP_NAME} is a study app for making flashcards and reviewing them. For a child's account we store a display name, the sign-in email, the birth month and year, and study activity. Children cannot publish sets publicly, and we never sell personal data or show third-party advertising.`,
      'Nothing can be used until you decide. You can review the details and approve or decline on the page below.',
    ],
    action: { label: 'Review and decide', url },
    footnote: 'If you do not recognise this request, choose "Decline" on that page and the account will be deleted.',
  });
}

export function reminderEmail(
  user: { name: string; email: string },
  info: { dueCount: number; streak: number; url: string },
): EmailMessage {
  const lines: string[] = [];
  if (info.dueCount > 0) {
    lines.push(`You have ${info.dueCount} ${info.dueCount === 1 ? 'card' : 'cards'} ready for review today.`);
  } else {
    lines.push("You haven't reached today's study goal yet. A few minutes is enough to keep things fresh.");
  }
  if (info.streak > 1) lines.push(`Your streak is at ${info.streak} days. Study today to keep it going.`);
  return layout({
    to: user.email,
    subject: info.dueCount > 0 ? `${info.dueCount} cards are ready for review` : `Time for today's study session`,
    heading: `Hi ${user.name}, ready for a quick session?`,
    paragraphs: lines,
    action: { label: 'Start studying', url: info.url },
    footnote: 'You asked for these reminders. Change or turn them off any time under Settings → Reminders.',
  });
}
