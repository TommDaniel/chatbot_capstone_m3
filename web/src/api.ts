export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('Não foi possível conectar à API. Verifique se o ambiente está iniciado.', 0);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null;
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') {
      window.dispatchEvent(new CustomEvent('fluxsus:session-expired'));
    }
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : response.status === 401
          ? 'Sua sessão expirou. Entre novamente.'
          : response.status === 403
            ? 'Seu perfil não permite esta ação.'
            : response.status === 409
              ? 'Este registro foi atualizado. Recarregue os dados e tente novamente.'
              : 'A solicitação não foi concluída. Tente novamente.';
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

export const json = (value: unknown): Pick<RequestInit, 'method' | 'body'> => ({
  method: 'POST',
  body: JSON.stringify(value),
});
