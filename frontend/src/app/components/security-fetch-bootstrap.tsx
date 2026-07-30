'use client';

import { useEffect } from 'react';
import { withEscolaCsrf } from '@/app/lib/csrf-fetch';

export default function SecurityFetchBootstrap() {
  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    const secureFetch: typeof window.fetch = (input, init) =>
      nativeFetch(input, withEscolaCsrf(input, init));
    window.fetch = secureFetch;
    return () => {
      if (window.fetch === secureFetch) window.fetch = nativeFetch;
    };
  }, []);

  return null;
}

