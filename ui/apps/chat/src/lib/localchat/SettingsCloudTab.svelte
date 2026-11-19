<!-- FORK: localchat. Settings › Cloud: cloud providers, their keys and which models to show.
     Backed by the LocalChat gateway (/localchat/cloud/...); keys go to the Keychain and never come back. -->
<script lang="ts">
	import {
		type CloudModel,
		type CloudProviderStatus,
		CloudSettingsService
	} from './cloud.service.ts';
	import { Badge } from '@ggml-org/llama-ui/ui/badge';
	import { Button } from '@ggml-org/llama-ui/ui/button';
	import { Checkbox } from '@ggml-org/llama-ui/ui/checkbox';
	import { Input } from '@ggml-org/llama-ui/ui/input';
	import { Switch } from '@ggml-org/llama-ui/ui/switch';
	import { modelsStore } from '#lib/stores/index.ts';
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';

	let providers = $state<CloudProviderStatus[]>([]);
	let loading = $state(true);
	let unavailable = $state<string | null>(null);

	const keyDrafts = new SvelteMap<string, string>();
	const editingKey = new SvelteMap<string, boolean>();
	const busy = new SvelteMap<string, boolean>();
	const notes = new SvelteMap<string, { ok: boolean; text: string }>();
	const catalogs = new SvelteMap<string, CloudModel[]>();
	const catalogErrors = new SvelteMap<string, string>();
	let pickerOpen = $state<string | null>(null);
	let search = $state('');

	onMount(load);

	async function load() {
		try {
			providers = await CloudSettingsService.list();
			unavailable = null;
		} catch {
			unavailable = 'Cloud models need the LocalChat app. This server doesn’t offer them.';
		} finally {
			loading = false;
		}
	}

	function replace(updated: CloudProviderStatus) {
		providers = providers.map((p) => (p.id === updated.id ? updated : p));
	}

	/** The chat's model picker lists cloud models, so refresh it after a change. */
	function refreshModelList() {
		void modelsStore.fetchRouterModels().catch(() => {});
	}

	async function run(id: string, action: () => Promise<void>) {
		busy.set(id, true);
		notes.delete(id);
		try {
			await action();
		} catch (error) {
			notes.set(id, { ok: false, text: error instanceof Error ? error.message : String(error) });
		} finally {
			busy.set(id, false);
		}
	}

	function setEnabled(provider: CloudProviderStatus, enabled: boolean) {
		void run(provider.id, async () => {
			replace(await CloudSettingsService.update(provider.id, { enabled }));
			refreshModelList();
		});
	}

	function saveKey(provider: CloudProviderStatus) {
		const key = (keyDrafts.get(provider.id) ?? '').trim();

		if (!key) return;

		void run(provider.id, async () => {
			await CloudSettingsService.setKey(provider.id, key);
			keyDrafts.delete(provider.id);
			editingKey.set(provider.id, false);
			replace({ ...provider, hasKey: true });
			refreshModelList();
			await test(provider.id);
		});
	}

	function removeKey(provider: CloudProviderStatus) {
		void run(provider.id, async () => {
			await CloudSettingsService.removeKey(provider.id);
			replace({ ...provider, hasKey: false });
			refreshModelList();
		});
	}

	async function test(id: string) {
		const result = await CloudSettingsService.test(id);

		notes.set(id, { ok: result.ok, text: result.message });
	}

	async function openPicker(provider: CloudProviderStatus) {
		pickerOpen = pickerOpen === provider.id ? null : provider.id;
		search = '';

		if (pickerOpen && !catalogs.has(provider.id)) {
			catalogErrors.delete(provider.id);
			try {
				catalogs.set(provider.id, await CloudSettingsService.models(provider.id));
			} catch (error) {
				catalogErrors.set(provider.id, error instanceof Error ? error.message : String(error));
			}
		}
	}

	function toggleModel(provider: CloudProviderStatus, modelId: string, on: boolean) {
		const models = on
			? [...new Set([...provider.models, modelId])]
			: provider.models.filter((m) => m !== modelId);

		replace({ ...provider, models });
		void run(provider.id, async () => {
			replace(await CloudSettingsService.update(provider.id, { models }));
			refreshModelList();
		});
	}

	function filtered(provider: CloudProviderStatus): CloudModel[] {
		const list = catalogs.get(provider.id) ?? [];
		const query = search.trim().toLowerCase();
		const matches = query
			? list.filter(
					(m) => m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query)
				)
			: list;

		// chosen first, so they're easy to review and remove
		return [...matches].sort(
			(a, b) => Number(provider.models.includes(b.id)) - Number(provider.models.includes(a.id))
		);
	}

	function details(model: CloudModel): string {
		const parts = [model.id];

		if (model.contextLength > 0) parts.push(`${Math.round(model.contextLength / 1000)}K context`);

		if (model.vision) parts.push('images');

		if (model.reasoning) parts.push('reasoning');

		return parts.join(' · ');
	}
</script>

<div class="space-y-4">
	<p class="text-sm text-muted-foreground">
		Use cloud models next to your local ones. Messages to a cloud model are sent to that provider
		over the internet. Keys are stored in your Mac’s Keychain; this page can save them but never
		reads them back.
	</p>

	{#if loading}
		<div class="py-8 text-center text-sm text-muted-foreground">Loading…</div>
	{:else if unavailable}
		<div class="py-8 text-center text-sm text-muted-foreground">{unavailable}</div>
	{:else}
		{#each providers as provider (provider.id)}
			{@const note = notes.get(provider.id)}
			{@const isBusy = busy.get(provider.id) ?? false}
			<div class="rounded-lg border border-border/60 p-3">
				<div class="flex items-center gap-3">
					<div class="min-w-0 flex-1">
						<div class="font-medium">{provider.name}</div>

						<div class="truncate text-xs text-muted-foreground">
							{provider.local ? `Runs on this Mac · ${provider.host}` : provider.host}
						</div>
					</div>

					<Switch
						aria-label="Use {provider.name}"
						checked={provider.enabled}
						disabled={isBusy}
						onCheckedChange={(value) => setEnabled(provider, value)}
					/>
				</div>

				{#if provider.enabled}
					<div class="mt-3 space-y-3 border-t border-border/50 pt-3 text-sm">
						{#if provider.needsKey}
							<div class="flex flex-wrap items-center gap-2">
								<span class="min-w-20 text-muted-foreground">API key</span>

								{#if provider.hasKey && !editingKey.get(provider.id)}
									<Badge variant="secondary">Saved in Keychain</Badge>

									<div class="ml-auto flex gap-2">
										<Button
											disabled={isBusy}
											onclick={() => editingKey.set(provider.id, true)}
											size="sm"
											variant="outline">Replace</Button
										>

										<Button
											disabled={isBusy}
											onclick={() => removeKey(provider)}
											size="sm"
											variant="outline">Remove</Button
										>
									</div>
								{:else}
									<Input
										autocomplete="off"
										class="h-8 min-w-48 flex-1"
										oninput={(e) => keyDrafts.set(provider.id, e.currentTarget.value)}
										onkeydown={(e) => e.key === 'Enter' && saveKey(provider)}
										placeholder="Paste your {provider.name} key"
										type="password"
										value={keyDrafts.get(provider.id) ?? ''}
									/>

									<Button
										disabled={isBusy || !(keyDrafts.get(provider.id) ?? '').trim()}
										onclick={() => saveKey(provider)}
										size="sm">Save</Button
									>

									{#if provider.hasKey}
										<Button
											onclick={() => editingKey.set(provider.id, false)}
											size="sm"
											variant="ghost">Cancel</Button
										>
									{/if}

									{#if provider.keyURL}
										<a
											class="w-full text-xs text-muted-foreground underline"
											href={provider.keyURL}
											rel="noreferrer"
											target="_blank">Get a {provider.name} key</a
										>
									{/if}
								{/if}
							</div>
						{/if}

						<div class="flex flex-wrap items-center gap-2">
							<span class="min-w-20 text-muted-foreground">Models</span>

							{#if provider.models.length === 0}
								<span class="text-muted-foreground">None chosen yet</span>
							{:else}
								{#each provider.models as model (model)}
									<Badge class="font-mono text-[11px]" variant="outline">{model}</Badge>
								{/each}
							{/if}

							<Button
								class="ml-auto"
								disabled={provider.needsKey && !provider.hasKey}
								onclick={() => openPicker(provider)}
								size="sm"
								variant="outline">{pickerOpen === provider.id ? 'Done' : 'Choose…'}</Button
							>
						</div>

						{#if pickerOpen === provider.id}
							<div class="space-y-2 rounded-md bg-muted/40 p-2">
								<Input bind:value={search} class="h-8" placeholder="Search models" />

								{#if catalogErrors.get(provider.id)}
									<div class="p-2 text-xs text-destructive">{catalogErrors.get(provider.id)}</div>
								{:else if !catalogs.has(provider.id)}
									<div class="p-2 text-xs text-muted-foreground">Loading models…</div>
								{:else}
									<div class="max-h-72 space-y-0.5 overflow-y-auto">
										{#each filtered(provider) as model (model.id)}
											<label
												class="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-muted"
											>
												<Checkbox
													checked={provider.models.includes(model.id)}
													class="mt-0.5"
													onCheckedChange={(on) => toggleModel(provider, model.id, on === true)}
												/>

												<span class="min-w-0">
													<span class="block truncate">{model.name}</span>

													<span class="block truncate text-[11px] text-muted-foreground"
														>{details(model)}</span
													>
												</span>
											</label>
										{/each}
									</div>
								{/if}
							</div>
						{/if}

						<div class="flex items-center gap-2">
							{#if note}
								<span class={['text-xs', note.ok ? 'text-muted-foreground' : 'text-destructive']}
									>{note.ok ? '✓ ' : ''}{note.text}</span
								>
							{/if}

							<Button
								class="ml-auto"
								disabled={isBusy || (provider.needsKey && !provider.hasKey)}
								onclick={() => run(provider.id, () => test(provider.id))}
								size="sm"
								variant="outline">Test connection</Button
							>
						</div>
					</div>
				{/if}
			</div>
		{/each}
	{/if}
</div>
