// FORK: localchat. Client for the LocalChat gateway's cloud settings API
// (/localchat/cloud/providers). Keys are write-only: the gateway never returns them.
import { apiFetch } from '#lib/utils/api-fetch.ts';

export interface CloudProviderStatus {
	id: string;
	name: string;
	host: string;
	local: boolean;
	needsKey: boolean;
	enabled: boolean;
	hasKey: boolean;
	models: string[];
	keyURL?: string;
}

export interface CloudModel {
	id: string;
	name: string;
	contextLength: number;
	vision: boolean;
	reasoning: boolean;
}

const BASE = './localchat/cloud/providers';

function send<T>(path: string, method: string, body?: unknown): Promise<T> {
	return apiFetch<T>(`${BASE}${path}`, {
		body: body === undefined ? undefined : JSON.stringify(body),
		method
	});
}

export const CloudSettingsService = {
	list: () => send<{ providers: CloudProviderStatus[] }>('', 'GET').then((r) => r.providers),
	models: (id: string) =>
		send<{ models: CloudModel[] }>(`/${id}/models`, 'GET').then((r) => r.models),
	removeKey: (id: string) => send<{ hasKey: boolean }>(`/${id}/key`, 'DELETE'),
	setKey: (id: string, key: string) => send<{ hasKey: boolean }>(`/${id}/key`, 'PUT', { key }),
	test: (id: string) => send<{ message: string; ok: boolean }>(`/${id}/test`, 'POST'),
	update: (id: string, change: { enabled?: boolean; models?: string[] }) =>
		send<CloudProviderStatus>(`/${id}`, 'PATCH', change)
};
