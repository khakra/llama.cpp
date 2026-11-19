// FORK: localchat. When this UI runs behind the LocalChat app, add the app's own
// MCP server (the gateway's /mcp) to the MCP servers list, once. If the user
// removes it later, it isn't added again.
import { mcpStore } from '../stores/mcp/index.svelte';
import { withBase } from '#lib/utils/base-path.ts';

const OFFERED_KEY = 'LocalChat.mcpServerOffered';
const SERVER_ID = 'localchat';

export async function addLocalchatMcpServer(): Promise<void> {
	try {
		if (localStorage.getItem(OFFERED_KEY)) return;

		// 404 or a network error: not running behind the LocalChat gateway
		const response = await fetch(withBase('/localchat/info'));

		if (!response.ok) return;

		const info = (await response.json()) as { mcp?: { path?: string } };

		if (!info.mcp?.path) return;

		const url = new URL(withBase(info.mcp.path), window.location.href).toString();
		const exists = mcpStore.getServers().some((s) => s.id === SERVER_ID || s.url === url);

		if (!exists) {
			mcpStore.addServer({
				displayName: 'LocalChat',
				enabled: true,
				id: SERVER_ID,
				name: 'LocalChat',
				url,
				useProxy: false
			});
		}

		localStorage.setItem(OFFERED_KEY, '1');
	} catch {
		// best effort: the server can still be added by hand
	}
}
