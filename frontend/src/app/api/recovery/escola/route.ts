import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SOURCE_SYSTEM = 'ESCOLA';
const RECOVERY_PATH = '/v1/services/escola/recover';

function readSupervisorSecret() {
  const explicitValue = String(process.env.MSINFOR_SERVICE_SUPERVISOR_SECRET || '').trim();
  if (explicitValue.length >= 43) return explicitValue;

  const configuredPath = String(process.env.MSINFOR_SERVICE_SUPERVISOR_SECRET_FILE || '').trim();
  const secretPath = resolve(
    configuredPath || resolve(process.cwd(), '../../MSINFOR_INFRA/.secrets/service_supervisor_secret.txt'),
  );
  if (!existsSync(secretPath)) return '';

  const value = readFileSync(secretPath, 'utf8').trim();
  return value.length >= 43 ? value : '';
}

function getSupervisorUrl() {
  const baseUrl = String(
    process.env.MSINFOR_SERVICE_SUPERVISOR_URL || 'http://127.0.0.1:3199',
  ).replace(/\/+$/, '');
  try {
    const parsedUrl = new URL(baseUrl);
    if (
      parsedUrl.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost', '::1'].includes(parsedUrl.hostname) ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.pathname !== '/'
    ) {
      return null;
    }

    return baseUrl;
  } catch {
    return null;
  }
}

export async function POST() {
  if (String(process.env.NODE_ENV || 'development').toLowerCase() === 'production') {
    return NextResponse.json({ accepted: true, managedByRuntime: true }, { status: 202 });
  }

  const supervisorUrl = getSupervisorUrl();
  const secret = readSupervisorSecret();
  if (!supervisorUrl || !secret) {
    return NextResponse.json({ accepted: false }, { status: 503 });
  }

  const body = JSON.stringify({ reason: 'ESCOLA_UNAVAILABLE' });
  const timestamp = String(Date.now());
  const nonce = randomBytes(24).toString('hex');
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const canonical = `POST\n${RECOVERY_PATH}\n${timestamp}\n${nonce}\n${bodyHash}`;
  const signature = createHmac('sha256', secret).update(canonical).digest('hex');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);

  try {
    const response = await fetch(`${supervisorUrl}${RECOVERY_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-msinfor-source': SOURCE_SYSTEM,
        'x-msinfor-timestamp': timestamp,
        'x-msinfor-nonce': nonce,
        'x-msinfor-signature': `sha256=${signature}`,
      },
      body,
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({ accepted: false }));
    return NextResponse.json(payload, { status: response.ok ? 202 : 503 });
  } catch {
    return NextResponse.json({ accepted: false }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}
