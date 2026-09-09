import { RenderedEmail } from '@/core/mailer/templates/email-change-otp.template';

export function renderAccountDeletionOtpEmail(
  code: string,
  ttlMinutes: number,
): RenderedEmail {
  const subject = 'Confirm permanent account deletion';

  const text = `Your account deletion confirmation code is ${code}. It expires in ${ttlMinutes} minute${
    ttlMinutes === 1 ? '' : 's'
  }. This code was requested to permanently delete your account. If you did not request this, you can safely ignore this email.`;

  const html = `
    <p>Your account deletion confirmation code is:</p>
    <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${code}</p>
    <p>It expires in ${ttlMinutes} minute${ttlMinutes === 1 ? '' : 's'}.</p>
    <p>This code was requested to permanently delete your account.</p>
    <p>If you did not request this, you can safely ignore this email.</p>
  `.trim();

  return { subject, text, html };
}
