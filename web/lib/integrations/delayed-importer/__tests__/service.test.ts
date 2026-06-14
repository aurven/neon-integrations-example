import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validatePayload,
  createJob,
  getJob,
  listJobs,
  cancelJob,
  dispatchStoryItem,
  dispatchImageItem,
  _reset,
  type DelayedImportPayload,
  type JobItem,
} from '../service';

function basePayload(overrides: Partial<DelayedImportPayload> = {}): DelayedImportPayload {
  return {
    duration: 1,
    site: 'demo-site',
    workspace: 'Demo Workspace',
    items: [
      { type: 'story', title: 'A', content: '<p>a</p>' },
      { type: 'story', title: 'B', content: '<p>b</p>' },
      { type: 'story', title: 'C', content: '<p>c</p>' },
    ],
    ...overrides,
  };
}

describe('validatePayload', () => {
  it('accepts a valid mixed payload', () => {
    const payload = basePayload({
      items: [
        { type: 'story', title: 'A', content: '<p>a</p>' },
        { type: 'image', url: 'https://example.com/pic.jpg' },
      ],
    });
    expect(validatePayload(payload)).toEqual({ valid: true });
  });

  it('rejects missing body', () => {
    expect(validatePayload(null).valid).toBe(false);
  });

  it('rejects bad duration', () => {
    for (const duration of [undefined, 0, -5, 'ten']) {
      const result = validatePayload(basePayload({ duration: duration as unknown as number }));
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/duration/);
    }
  });

  it('rejects missing site or workspace', () => {
    expect(validatePayload(basePayload({ site: undefined as unknown as string })).error).toMatch(/site/);
    expect(validatePayload(basePayload({ workspace: undefined as unknown as string })).error).toMatch(/workspace/);
  });

  it('rejects empty or missing items', () => {
    expect(validatePayload(basePayload({ items: [] })).valid).toBe(false);
    expect(validatePayload(basePayload({ items: undefined as unknown as JobItem[] })).valid).toBe(false);
  });

  it('rejects invalid item type with index in the message', () => {
    const payload = basePayload({
      items: [
        { type: 'story', title: 'A', content: '<p>a</p>' },
        { type: 'video' as unknown as 'story', url: 'https://example.com/x' },
      ],
    });
    const result = validatePayload(payload);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/items\[1\]/);
  });

  it('accepts assignTo as string or array, job-level and per-item', () => {
    expect(validatePayload(basePayload({ assignTo: '62038d84-f161-3579-a5f1-7aba053f999a' }))).toEqual({ valid: true });
    expect(validatePayload(basePayload({ assignTo: ['62038d84-f161-3579-a5f1-7aba053f999a', 'jane.doe'] }))).toEqual({
      valid: true,
    });
    expect(
      validatePayload(basePayload({ items: [{ type: 'story', title: 'A', content: '<p>a</p>', assignTo: 'jane.doe' }] }))
    ).toEqual({ valid: true });
  });

  it('rejects invalid assignTo', () => {
    expect(validatePayload(basePayload({ assignTo: '' })).error).toMatch(/assignTo/);
    expect(validatePayload(basePayload({ assignTo: [] })).error).toMatch(/assignTo/);
    expect(validatePayload(basePayload({ assignTo: 123 as unknown as string })).error).toMatch(/assignTo/);
    expect(
      validatePayload(basePayload({ items: [{ type: 'story', title: 'A', content: '<p>a</p>', assignTo: 5 as unknown as string }] }))
        .error
    ).toMatch(/items\[0\]: assignTo/);
  });

  it('enforces per-type required fields', () => {
    expect(validatePayload(basePayload({ items: [{ type: 'story', content: '<p>a</p>' } as JobItem] })).error).toMatch(
      /items\[0\].*title/
    );
    expect(validatePayload(basePayload({ items: [{ type: 'story', title: 'A' } as JobItem] })).error).toMatch(
      /items\[0\].*content/
    );
    expect(validatePayload(basePayload({ items: [{ type: 'image' } as JobItem] })).error).toMatch(/items\[0\].*url/);
  });
});

describe('createJob scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    _reset();
    vi.useRealTimers();
  });

  it('fires the first item immediately, then one per interval, then completes', async () => {
    const calls: string[] = [];
    const deps = {
      dispatchStory: async (item: JobItem) => {
        calls.push(item.title!);
        return { familyRef: 'ref-' + item.title };
      },
    };

    const submitted = createJob(basePayload(), deps);
    expect(submitted.jobId).toMatch(/^dlyimp-\d{8}-[0-9a-f]{6}$/);
    expect(submitted.itemCount).toBe(3);
    expect(submitted.intervalMs).toBe(20000); // 1 min / 3 items
    expect(submitted.estimatedEndAt).toBeTruthy();

    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['A']);

    const running = getJob(submitted.jobId)!;
    expect(running.state).toBe('running');
    expect(running.done).toBe(1);
    expect(running.total).toBe(3);
    expect(running.nextFireAt).toBeTruthy();
    expect(running.results[0].status).toBe('ok');
    expect(running.results[0].familyRef).toBe('ref-A');

    await vi.advanceTimersByTimeAsync(20000);
    await vi.advanceTimersByTimeAsync(20000);

    expect(calls).toEqual(['A', 'B', 'C']);
    const finished = getJob(submitted.jobId)!;
    expect(finished.state).toBe('completed');
    expect(finished.done).toBe(3);
    expect(finished.nextFireAt).toBeNull();
  });

  it('records per-item errors and continues the job', async () => {
    const deps = {
      dispatchStory: async (item: JobItem) => {
        if (item.title === 'B') throw new Error('neon exploded');
        return { familyRef: 'ref-' + item.title };
      },
    };

    const submitted = createJob(basePayload(), deps);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(20000);
    await vi.advanceTimersByTimeAsync(20000);

    const job = getJob(submitted.jobId)!;
    expect(job.state).toBe('completed');
    expect(job.done).toBe(3);
    expect(job.errors).toBe(1);
    expect(job.results[1].status).toBe('error');
    expect(job.results[1].error).toBe('neon exploded');
  });

  it('cancelJob stops pending ticks and keeps completed results', async () => {
    const calls: string[] = [];
    const deps = {
      dispatchStory: async (item: JobItem) => {
        calls.push(item.title!);
        return { familyRef: 'ref-' + item.title };
      },
    };

    const submitted = createJob(basePayload(), deps);
    await vi.advanceTimersByTimeAsync(0);

    const snapshot = cancelJob(submitted.jobId) as { state: string; done: number };
    expect(snapshot.state).toBe('cancelled');
    expect(snapshot.done).toBe(1);

    await vi.advanceTimersByTimeAsync(60000);
    expect(calls).toEqual(['A']); // no further dispatches

    expect(cancelJob(submitted.jobId)).toEqual({ error: 'Job already finished' });
  });

  it('getJob and cancelJob return null for an unknown job', () => {
    expect(getJob('nope')).toBeNull();
    expect(cancelJob('nope')).toBeNull();
  });

  it('listJobs returns summaries without a results array', async () => {
    const deps = { dispatchStory: async () => ({ familyRef: 'x' }) };
    const submitted = createJob(basePayload(), deps);
    await vi.advanceTimersByTimeAsync(0);

    const list = listJobs();
    expect(list).toHaveLength(1);
    expect(list[0].jobId).toBe(submitted.jobId);
    expect(list[0].state).toBe('running');
    expect(list[0].done).toBe(1);
    expect(list[0].total).toBe(3);
    expect((list[0] as unknown as { results?: unknown }).results).toBeUndefined();
  });

  it('routes image items to dispatchImage', async () => {
    const types: string[] = [];
    const deps = {
      dispatchStory: async () => {
        types.push('story');
        return { familyRef: 's' };
      },
      dispatchImage: async () => {
        types.push('image');
        return { familyRef: 'i' };
      },
    };
    const payload = basePayload({
      items: [
        { type: 'image', url: 'https://example.com/a.jpg' },
        { type: 'story', title: 'A', content: '<p>a</p>' },
      ],
    });
    createJob(payload, deps);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30000);
    expect(types).toEqual(['image', 'story']);
  });
});

describe('dispatchStoryItem', () => {
  it('maps item fields to the populator story shape', async () => {
    let received: { story: unknown; publish: boolean } | undefined;
    const fakePopulator = {
      newNodeFromStory: async (story: unknown, publish?: boolean) => {
        received = { story, publish: publish ?? true };
        return 'fam-1';
      },
    };
    const job = {
      site: 'demo-site',
      workspace: 'Demo Workspace',
      workfolder: '/Demo/Imports',
      publish: false,
    } as Parameters<typeof dispatchStoryItem>[1];
    const item: JobItem = {
      type: 'story',
      title: 'Headline',
      content: '<p>body</p>',
      summary: 'Standfirst',
      byline: 'Jane Doe',
      metadata: { seoTitle: 'seo' },
    };

    const out = await dispatchStoryItem(item, job, fakePopulator);

    expect(out.familyRef).toBe('fam-1');
    expect(received?.publish).toBe(false);
    const story = received?.story as Record<string, unknown>;
    expect(story.title).toBe('Headline');
    expect(story.headline).toBe('Headline');
    expect(story.mainContentHtml).toBe('<p>body</p>');
    expect(story.summary).toBe('Standfirst');
    expect(story.byline).toBe('Jane Doe');
    expect(story.metadata).toEqual({ seoTitle: 'seo' });
    expect(story.tgtSite).toBe('demo-site');
    expect(story.tgtWorkspace).toBe('/Demo/Imports');
    expect(story.type).toBeUndefined();
    expect(story.figureUrl).toBeUndefined();
  });

  it('lets item.workfolder override job.workfolder', async () => {
    let received: Record<string, unknown> | undefined;
    const fakePopulator = {
      newNodeFromStory: async (story: unknown) => {
        received = story as Record<string, unknown>;
        return 'x';
      },
    };
    const job = { site: 's', workspace: 'ws', workfolder: '/job-wf', publish: false } as Parameters<
      typeof dispatchStoryItem
    >[1];

    await dispatchStoryItem({ type: 'story', title: 'T', content: 'c', workfolder: '/item-wf' }, job, fakePopulator);
    expect(received?.tgtWorkspace).toBe('/item-wf');
  });

  it('passes job-level assignTo through to the populator', async () => {
    let received: Record<string, unknown> | undefined;
    const fakePopulator = {
      newNodeFromStory: async (story: unknown) => {
        received = story as Record<string, unknown>;
        return 'x';
      },
    };
    const job = {
      site: 's',
      workspace: 'ws',
      workfolder: null,
      assignTo: '62038d84-f161-3579-a5f1-7aba053f999a',
      publish: false,
    } as Parameters<typeof dispatchStoryItem>[1];

    await dispatchStoryItem({ type: 'story', title: 'T', content: 'c' }, job, fakePopulator);
    expect(received?.assignTo).toBe('62038d84-f161-3579-a5f1-7aba053f999a');
  });

  it('lets item.assignTo override job.assignTo', async () => {
    let received: Record<string, unknown> | undefined;
    const fakePopulator = {
      newNodeFromStory: async (story: unknown) => {
        received = story as Record<string, unknown>;
        return 'x';
      },
    };
    const job = {
      site: 's',
      workspace: 'ws',
      workfolder: null,
      assignTo: '62038d84-f161-3579-a5f1-7aba053f999a',
      publish: false,
    } as Parameters<typeof dispatchStoryItem>[1];

    await dispatchStoryItem({ type: 'story', title: 'T', content: 'c', assignTo: 'jane.doe' }, job, fakePopulator);
    expect(received?.assignTo).toBe('jane.doe');
  });
});

describe('dispatchImageItem', () => {
  it('maps item to uploadImage options with a workspace fallback', async () => {
    let received: Record<string, unknown> | undefined;
    const fakeImporter = {
      uploadImage: async (options: unknown) => {
        received = options as Record<string, unknown>;
        return { node: { familyRef: 'img-1' } };
      },
    };
    const job = { site: 's', workspace: 'Demo Workspace', workfolder: null, publish: false } as Parameters<
      typeof dispatchImageItem
    >[1];
    const item: JobItem = {
      type: 'image',
      url: 'https://example.com/photos/sunset.jpg',
      metadata: { caption: 'A sunset', credit: 'Jane' },
    };

    const out = await dispatchImageItem(item, job, fakeImporter);

    expect(out.familyRef).toBe('img-1');
    expect(received?.imageUrl).toBe('https://example.com/photos/sunset.jpg');
    expect(received?.workspace).toBe('Demo Workspace'); // job.workfolder null -> workspace fallback
    expect(received?.imageName).toBe('sunset.jpg'); // derived via getImageNameFromUrl
    expect(received?.metadata).toEqual({ caption: 'A sunset', credit: 'Jane' });
  });

  it('lets an explicit name win over the derived name', async () => {
    let received: Record<string, unknown> | undefined;
    const fakeImporter = {
      uploadImage: async (options: unknown) => {
        received = options as Record<string, unknown>;
        return {};
      },
    };
    const job = { site: 's', workspace: 'ws', workfolder: null, publish: false } as Parameters<
      typeof dispatchImageItem
    >[1];

    const out = await dispatchImageItem(
      { type: 'image', url: 'https://example.com/a.jpg', name: 'custom-name' },
      job,
      fakeImporter
    );
    expect(received?.imageName).toBe('custom-name');
    expect(out.familyRef).toBeNull(); // uploadImage returned no familyRef
  });
});
