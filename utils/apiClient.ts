import { httpRequest, type HttpRequestOptions, type HttpResponse } from '@/src/shared/api/httpClient';

export interface ApiResponse<T, M = any> extends HttpResponse<T> {
  meta?: M;
}

export async function apiClient<Req = undefined, Res = any>(
  path: string,
  options: HttpRequestOptions<Req> = {}
): Promise<ApiResponse<Res>> {
  return httpRequest<Req, Res>(path, options);
}

