import type { Response } from 'superagent';

const rawSetCookies = (response: Response): string[] => {
  const header = response.headers['set-cookie'] as unknown as
    | string[]
    | string
    | undefined;

  if (!header) {
    return [];
  }

  return Array.isArray(header) ? header : [header];
};

/**
 * Full Set-Cookie entry (name=value plus attributes) for a given cookie
 * name, e.g. to assert on HttpOnly/Path/SameSite.
 */
export const findSetCookie = (
  response: Response,
  name: string,
): string | undefined =>
  rawSetCookies(response).find((cookie) => cookie.startsWith(`${name}=`));

export const cookieValue = (
  response: Response,
  name: string,
): string | undefined => {
  const cookie = findSetCookie(response, name);

  return cookie?.split(';')[0].slice(name.length + 1);
};

/**
 * Turns the Set-Cookie headers of a response into a Cookie header value
 * suitable for `.set('Cookie', ...)` on a follow-up request.
 */
export const cookieHeaderFrom = (response: Response): string =>
  rawSetCookies(response)
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
