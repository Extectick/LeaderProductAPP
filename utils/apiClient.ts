import { httpRequest, type HttpRequestOptions, type HttpResponse } from '@/src/shared/api/httpClient';

export interface ApiResponse<T> extends HttpResponse<T> {}

export async function apiClient<Req = undefined, Res = any>(
  path: string,
  options: HttpRequestOptions<Req> = {}
): Promise<ApiResponse<Res>> {
  return httpRequest<Req, Res>(path, options);
}

