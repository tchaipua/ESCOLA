'use client';

const CSRF_COOKIE_NAMES = [
  '__Host-msinfor_escola_csrf',
  'msinfor_escola_csrf',
] as const;

export function getEscolaCsrfToken(cookieHeader?: string) {
  const source =
    cookieHeader === undefined && typeof document !== 'undefined'
      ? document.cookie
      : String(cookieHeader || '');
  for (const item of source.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 1) continue;
    const name = item.slice(0, separator).trim();
    if (!CSRF_COOKIE_NAMES.includes(name as (typeof CSRF_COOKIE_NAMES)[number])) {
      continue;
    }
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

function getRequestSecurityContext(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  if (typeof window === 'undefined') {
    return { sameOrigin: false, unsafe: false };
  }
  const request = input instanceof Request ? input : null;
  const method = String(init?.method || request?.method || 'GET').toUpperCase();
  const rawUrl =
    input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.toString()
        : String(input);
  try {
    return {
      sameOrigin:
        new URL(rawUrl, window.location.origin).origin === window.location.origin,
      unsafe: !['GET', 'HEAD', 'OPTIONS'].includes(method),
    };
  } catch {
    return { sameOrigin: false, unsafe: false };
  }
}

export function withEscolaCsrf(
  input: RequestInfo | URL,
  init?: RequestInit,
): RequestInit | undefined {
  const request = input instanceof Request ? input : null;
  const headers = new Headers(request?.headers);
  new Headers(init?.headers).forEach((value, name) => {
    headers.set(name, value);
  });

  // Defesa em profundidade: o navegador da Escola nunca envia credencial
  // reutilizável em Authorization, mesmo que uma tela legada tente montá-la.
  headers.delete('authorization');

  const { sameOrigin, unsafe } = getRequestSecurityContext(input, init);
  if (sameOrigin && unsafe) {
    const token = getEscolaCsrfToken();
    if (token && !headers.has('x-msinfor-csrf')) {
      headers.set('x-msinfor-csrf', token);
    }
  }

  return {
    ...init,
    credentials: sameOrigin ? 'same-origin' : 'omit',
    headers,
  };
}
