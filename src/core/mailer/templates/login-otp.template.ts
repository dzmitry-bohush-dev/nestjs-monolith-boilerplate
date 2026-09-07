export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderLoginOtpEmail(
  code: string,
  ttlMinutes: number,
): RenderedEmail {
  const subject = 'Your login confirmation code';

  const text = `Your login confirmation code is ${code}. It expires in ${ttlMinutes} minute${
    ttlMinutes === 1 ? '' : 's'
  }. If you did not attempt to log in, you can safely ignore this email.`;

  const html = `
    <p>Your login confirmation code is:</p>
    <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${code}</p>
    <p>It expires in ${ttlMinutes} minute${ttlMinutes === 1 ? '' : 's'}.</p>
    <p>If you did not attempt to log in, you can safely ignore this email.</p>
  `.trim();

  return { subject, text, html };
}
