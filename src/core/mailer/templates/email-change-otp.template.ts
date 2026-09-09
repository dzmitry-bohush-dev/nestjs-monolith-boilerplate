export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderEmailChangeOtpEmail(
  code: string,
  ttlMinutes: number,
  newEmail: string,
): RenderedEmail {
  const subject = 'Confirm your new email address';

  const text = `Your email change confirmation code is ${code}. It expires in ${ttlMinutes} minute${
    ttlMinutes === 1 ? '' : 's'
  }. This code was requested to change your account email to ${newEmail}. If you did not request this, you can safely ignore this email.`;

  const html = `
    <p>Your email change confirmation code is:</p>
    <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${code}</p>
    <p>It expires in ${ttlMinutes} minute${ttlMinutes === 1 ? '' : 's'}.</p>
    <p>This code was requested to change your account email to ${newEmail}.</p>
    <p>If you did not request this, you can safely ignore this email.</p>
  `.trim();

  return { subject, text, html };
}
