export async function apiClient(){throw new Error('QA fixture: real API is disabled');}
export const request=apiClient;
export const httpClient={get:apiClient,post:apiClient,patch:apiClient,delete:apiClient};
