// FORK: localchat. Client for the LocalChat gateway's memory API (/localchat/memory).
import { apiFetch } from '#lib/utils/api-fetch.ts';

export interface MemoryItem {
	id: string;
	text: string;
	source: 'learned' | 'user';
	createdAt: string;
	updatedAt: string;
}

export interface MemorySettings {
	enabled: boolean;
	withCloud: boolean;
}

const BASE = './localchat/memory';

function send<T>(path: string, method: string, body?: unknown): Promise<T> {
	return apiFetch<T>(`${BASE}${path}`, {
		body: body === undefined ? undefined : JSON.stringify(body),
		method
	});
}

export const MemoryService = {
	add: (text: string) => send<{ isNew: boolean; memory: MemoryItem }>('', 'POST', { text }),
	clear: () => send<{ deleted: boolean }>('', 'DELETE'),
	edit: (id: string, text: string) => send<MemoryItem>(`/${id}`, 'PATCH', { text }),
	list: () => send<{ memories: MemoryItem[]; settings: MemorySettings }>('', 'GET'),
	remove: (id: string) => send<{ deleted: boolean }>(`/${id}`, 'DELETE'),
	updateSettings: (change: Partial<MemorySettings>) =>
		send<MemorySettings>('/settings', 'PATCH', change)
};
