import { fetch as undiciFetch, ProxyAgent } from 'undici';
import type { RequestInit as UndiciRequestInit } from 'undici';

let proxyDispatcher: ProxyAgent | undefined;
let proxyChecked = false;

function getTelegramProxyDispatcher(): ProxyAgent | undefined {
  if (proxyChecked) return proxyDispatcher;
  proxyChecked = true;

  const raw =
    process.env.TELEGRAM_HTTP_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim();
  if (raw) {
    proxyDispatcher = new ProxyAgent(raw);
  }
  return proxyDispatcher;
}

export function telegramFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const dispatcher = getTelegramProxyDispatcher();
  if (!dispatcher) {
    return fetch(input, init);
  }
  return undiciFetch(input, {
    ...(init as UndiciRequestInit),
    dispatcher,
  }) as unknown as Promise<Response>;
}
