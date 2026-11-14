export class CurrentUvError extends Error {
  constructor(code, message, status = 502) { super(message); this.code = code; this.status = status; }
}

export function requireCurrentUvKeys(vworldKey, safemapKey) {
  if ([vworldKey, safemapKey].some(key => typeof key !== 'string' || !key.trim() || /\[|\]/.test(key))) {
    throw new CurrentUvError('CURRENT_UV_KEY_REQUIRED', '서버 .env의 VWORLD_API_KEY와 SAFEMAP_SERVICE_KEY를 설정하고 서버를 재시작해 주세요.', 503);
  }
}

// Never surface upstream URLs, response bodies or error messages: they may contain keys/coordinates.
export async function fetchCurrentUvJson(url, { fetcher = fetch, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetcher(url, { signal: controller.signal, redirect: 'error' });
        if ([401, 403].includes(response.status)) throw new CurrentUvError('CURRENT_UV_AUTH_FAILED', '외부 API 인증에 실패했습니다. 인증키와 이용 승인·허용 도메인 설정을 확인해 주세요.');
        if (!response.ok) throw new CurrentUvError('CURRENT_UV_NETWORK_ERROR', '자외선 API 통신에 실패했습니다. 잠시 후 다시 조회해 주세요.');
        const text = await response.text();
        if (text.trim().startsWith('<') && /SERVICE_KEY_IS_NOT_REGISTERED|SERVICE_KEY_IS_NOT_REGISTERED_ERROR|SERVICE_ACCESS_DENIED|인증키|인증.*실패/i.test(text)) {
          throw new CurrentUvError('CURRENT_UV_AUTH_FAILED', '외부 API 인증에 실패했습니다. 인증키와 이용 승인을 확인해 주세요.');
        }
        try { return JSON.parse(text); }
        catch { throw new CurrentUvError('CURRENT_UV_RESPONSE_ERROR', '외부 API 응답 형식을 확인할 수 없습니다. 운영자가 실제 JSON 응답 구조를 확인해야 합니다.'); }
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new CurrentUvError('CURRENT_UV_TIMEOUT', '자외선 API 응답 시간이 초과되었습니다. 다시 조회해 주세요.', 504)); }, timeoutMs); }),
    ]);
  } catch (error) {
    if (error instanceof CurrentUvError) throw error;
    throw new CurrentUvError('CURRENT_UV_NETWORK_ERROR', '자외선 API 통신에 실패했습니다. 잠시 후 다시 조회해 주세요.');
  } finally { clearTimeout(timer); }
}
