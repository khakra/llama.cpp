<!-- FORK: localchat. Settings › Memory: what LocalChat remembers about the user.
     Backed by the LocalChat gateway (/localchat/memory); memories live in the app, not the browser. -->
<script lang="ts">
	import { type MemoryItem, MemoryService, type MemorySettings } from './memory.service.ts';
	import { Button } from '@ggml-org/llama-ui/ui/button';
	import { Input } from '@ggml-org/llama-ui/ui/input';
	import { Switch } from '@ggml-org/llama-ui/ui/switch';
	import { onMount } from 'svelte';

	let memories = $state<MemoryItem[]>([]);
	let settings = $state<MemorySettings>({ enabled: true, withCloud: true });
	let loading = $state(true);
	let unavailable = $state<string | null>(null);
	let error = $state<string | null>(null);
	let draft = $state('');
	let editingId = $state<string | null>(null);
	let editText = $state('');
	let confirmingClear = $state(false);

	// the user's own first, then learned ones newest first (the prompt's order)
	let ordered = $derived(
		[...memories].sort((a, b) =>
			a.source === b.source ? b.updatedAt.localeCompare(a.updatedAt) : a.source === 'user' ? -1 : 1
		)
	);

	onMount(load);

	async function load() {
		try {
			const result = await MemoryService.list();

			memories = result.memories;
			settings = result.settings;
			unavailable = null;
		} catch {
			unavailable = 'Memory needs the LocalChat app. This server doesn’t offer it.';
		} finally {
			loading = false;
		}
	}

	async function attempt(action: () => Promise<void>) {
		error = null;
		try {
			await action();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	function setSetting(change: Partial<MemorySettings>) {
		void attempt(async () => {
			settings = await MemoryService.updateSettings(change);
		});
	}

	function add() {
		const text = draft.trim();

		if (!text) return;

		void attempt(async () => {
			const { memory } = await MemoryService.add(text);

			memories = [...memories.filter((m) => m.id !== memory.id), memory];
			draft = '';
		});
	}

	function startEdit(memory: MemoryItem) {
		editingId = memory.id;
		editText = memory.text;
	}

	function saveEdit(memory: MemoryItem) {
		const text = editText.trim();

		if (!text) return;

		void attempt(async () => {
			const updated = await MemoryService.edit(memory.id, text);

			memories = memories.map((m) => (m.id === updated.id ? updated : m));
			editingId = null;
		});
	}

	function remove(memory: MemoryItem) {
		void attempt(async () => {
			await MemoryService.remove(memory.id);
			memories = memories.filter((m) => m.id !== memory.id);
		});
	}

	function clearAll() {
		void attempt(async () => {
			await MemoryService.clear();
			memories = [];
			confirmingClear = false;
		});
	}
</script>

<div class="space-y-4">
	<p class="text-sm text-muted-foreground">
		LocalChat remembers short facts about you, like your preferences, likes and dislikes, and adds
		them to your chats so answers fit you. Ask any model to “remember that…”, or add them here.
		Memories are stored on this Mac, in the LocalChat app.
	</p>

	{#if loading}
		<div class="py-8 text-center text-sm text-muted-foreground">Loading…</div>
	{:else if unavailable}
		<div class="py-8 text-center text-sm text-muted-foreground">{unavailable}</div>
	{:else}
		<div class="space-y-3 rounded-lg border border-border/60 p-3 text-sm">
			<label class="flex items-center gap-3">
				<span class="flex-1">
					<span class="block font-medium">Use memories in chats</span>

					<span class="block text-xs text-muted-foreground">
						Adds what LocalChat knows about you to each chat.
					</span>
				</span>

				<Switch
					checked={settings.enabled}
					onCheckedChange={(value) => setSetting({ enabled: value })}
				/>
			</label>

			<label class={['flex items-center gap-3', !settings.enabled && 'opacity-50']}>
				<span class="flex-1">
					<span class="block font-medium">Include with cloud models</span>

					<span class="block text-xs text-muted-foreground">
						Your memories are sent to the cloud provider with each message to a cloud model.
					</span>
				</span>

				<Switch
					checked={settings.withCloud}
					disabled={!settings.enabled}
					onCheckedChange={(value) => setSetting({ withCloud: value })}
				/>
			</label>
		</div>

		<div class="flex gap-2">
			<Input
				bind:value={draft}
				class="h-8 flex-1"
				maxlength={300}
				onkeydown={(e) => e.key === 'Enter' && add()}
				placeholder="Add a memory, e.g. “I'm vegetarian”"
			/>

			<Button disabled={!draft.trim()} onclick={add} size="sm">Add</Button>
		</div>

		{#if error}
			<div class="text-xs text-destructive">{error}</div>
		{/if}

		{#if ordered.length === 0}
			<div class="py-6 text-center text-sm text-muted-foreground">
				Nothing remembered yet. Tell a model “remember that…”, or add something above.
			</div>
		{:else}
			<ul class="divide-y divide-border/50 rounded-lg border border-border/60">
				{#each ordered as memory (memory.id)}
					<li class="flex items-center gap-2 px-3 py-2 text-sm">
						{#if editingId === memory.id}
							<Input
								bind:value={editText}
								class="h-8 flex-1"
								maxlength={300}
								onkeydown={(e) => {
									if (e.key === 'Enter') saveEdit(memory);

									if (e.key === 'Escape') editingId = null;
								}}
							/>

							<Button onclick={() => saveEdit(memory)} size="sm">Save</Button>

							<Button onclick={() => (editingId = null)} size="sm" variant="ghost">Cancel</Button>
						{:else}
							<span class="min-w-0 flex-1">{memory.text}</span>

							<span class="shrink-0 text-[11px] text-muted-foreground">
								{memory.source === 'user' ? 'You said' : 'Learned'}
							</span>

							<Button onclick={() => startEdit(memory)} size="sm" variant="ghost">Edit</Button>

							<Button onclick={() => remove(memory)} size="sm" variant="ghost">Delete</Button>
						{/if}
					</li>
				{/each}
			</ul>

			<div class="flex items-center justify-end gap-2">
				{#if confirmingClear}
					<span class="text-xs text-muted-foreground">Delete all {ordered.length} memories?</span>

					<Button onclick={clearAll} size="sm" variant="destructive">Forget everything</Button>

					<Button onclick={() => (confirmingClear = false)} size="sm" variant="ghost">Cancel</Button
					>
				{:else}
					<Button onclick={() => (confirmingClear = true)} size="sm" variant="outline"
						>Forget everything…</Button
					>
				{/if}
			</div>
		{/if}
	{/if}
</div>
