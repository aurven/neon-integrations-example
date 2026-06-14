/**
 * Delayed Importer — simulates a content feed into Neon.
 * Accepts a batch of items (stories/images) and imports them one at a time,
 * spread evenly over a caller-supplied timespan, into a target workfolder.
 *
 * In-memory only: jobs are lost on server restart (documented limitation).
 * Ported from src/delayed-importer.js.
 */
import crypto from 'crypto';
import dayjs from 'dayjs';
import * as storiesPopulator from '../populator/service';
import * as imagesImporter from '../populator/images';
import { getImageNameFromUrl } from '../../core/utils';
import type { MetadataGeneratorOptions } from '../../core/utils';
import type { PutNodeResponse } from '../../core/neon-bo-api-v3';
import type { ImageMetadata } from '../populator/images';

export type ItemType = 'story' | 'image';

export interface JobItem {
  type: ItemType;
  title?: string;
  content?: string;
  summary?: string;
  byline?: string;
  metadata?: MetadataGeneratorOptions & ImageMetadata;
  url?: string;
  name?: string;
  workfolder?: string;
  assignTo?: string | string[];
}

export interface DelayedImportPayload {
  duration: number;
  site: string;
  workspace: string;
  workfolder?: string;
  assignTo?: string | string[];
  publish?: boolean;
  items: JobItem[];
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const ITEM_TYPES: ItemType[] = ['story', 'image'];

export function validatePayload(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Missing request body' };
  }
  const payload = body as Partial<DelayedImportPayload>;

  if (typeof payload.duration !== 'number' || !(payload.duration > 0)) {
    return { valid: false, error: 'duration must be a number of minutes greater than 0' };
  }
  if (!payload.site || typeof payload.site !== 'string') {
    return { valid: false, error: 'site is required' };
  }
  if (!payload.workspace || typeof payload.workspace !== 'string') {
    return { valid: false, error: 'workspace is required' };
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return { valid: false, error: 'items must be a non-empty array' };
  }
  if (payload.assignTo !== undefined && !isValidAssignTo(payload.assignTo)) {
    return { valid: false, error: 'assignTo must be a string or an array of strings' };
  }

  for (let i = 0; i < payload.items.length; i++) {
    const item = payload.items[i] as Partial<JobItem> | null;
    if (!item || typeof item !== 'object') {
      return { valid: false, error: `items[${i}]: must be an object` };
    }
    if (!item.type || !ITEM_TYPES.includes(item.type)) {
      return { valid: false, error: `items[${i}]: type must be one of ${ITEM_TYPES.join(', ')}` };
    }
    if (item.assignTo !== undefined && !isValidAssignTo(item.assignTo)) {
      return { valid: false, error: `items[${i}]: assignTo must be a string or an array of strings` };
    }
    if (item.type === 'story') {
      if (!item.title || typeof item.title !== 'string') {
        return { valid: false, error: `items[${i}]: story requires a title` };
      }
      if (!item.content || typeof item.content !== 'string') {
        return { valid: false, error: `items[${i}]: story requires content` };
      }
    }
    if (item.type === 'image') {
      if (!item.url || typeof item.url !== 'string') {
        return { valid: false, error: `items[${i}]: image requires a url` };
      }
    }
  }
  return { valid: true };
}

function isValidAssignTo(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0;
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string' && v.length > 0);
}

export interface JobResult {
  index: number;
  type: ItemType;
  status: 'ok' | 'error';
  familyRef?: string | null;
  error?: string;
  at: string;
}

export type JobState = 'running' | 'completed' | 'cancelled';

interface Job {
  jobId: string;
  state: JobState;
  site: string;
  workspace: string;
  workfolder: string | null;
  assignTo: string | string[] | null;
  publish: boolean;
  items: JobItem[];
  intervalMs: number;
  startedAt: string;
  estimatedEndAt: string;
  nextFireAt: string | null;
  results: JobResult[];
  timer: ReturnType<typeof setTimeout> | null;
}

export interface PublicJob {
  jobId: string;
  state: JobState;
  done: number;
  total: number;
  errors: number;
  intervalMs: number;
  startedAt: string;
  estimatedEndAt: string;
  nextFireAt: string | null;
  results: JobResult[];
}

export interface JobSummary {
  jobId: string;
  state: JobState;
  done: number;
  total: number;
  nextFireAt: string | null;
}

export interface SubmitResponse {
  jobId: string;
  itemCount: number;
  intervalMs: number;
  estimatedEndAt: string;
}

export interface DispatchOutcome {
  familyRef: string | null;
}

export type DispatchFn = (item: JobItem, job: Job) => Promise<DispatchOutcome>;

export interface Dispatchers {
  dispatchStory: DispatchFn;
  dispatchImage: DispatchFn;
}

export interface CreateJobDeps {
  dispatchStory?: DispatchFn;
  dispatchImage?: DispatchFn;
}

const EVICTION_MS = 60 * 60 * 1000; // finished jobs evicted after 1 hour

const jobs = new Map<string, Job>();

function resolveWorkfolder(item: JobItem, job: Job): string | undefined {
  return item.workfolder || job.workfolder || job.workspace;
}

function resolveAssignTo(item: JobItem, job: Job): string | string[] | undefined {
  return item.assignTo || job.assignTo || undefined;
}

function publicJob(job: Job): PublicJob {
  return {
    jobId: job.jobId,
    state: job.state,
    done: job.results.length,
    total: job.items.length,
    errors: job.results.filter((r) => r.status === 'error').length,
    intervalMs: job.intervalMs,
    startedAt: job.startedAt,
    estimatedEndAt: job.estimatedEndAt,
    nextFireAt: job.nextFireAt,
    results: job.results,
  };
}

function finishJob(job: Job, state: JobState): void {
  job.state = state;
  job.nextFireAt = null;
  if (job.timer) clearTimeout(job.timer);
  job.timer = null;
  const evictionTimer = setTimeout(() => jobs.delete(job.jobId), EVICTION_MS);
  evictionTimer.unref?.();
}

async function runTick(job: Job, index: number, deps: Dispatchers): Promise<void> {
  if (job.state !== 'running') return;

  const item = job.items[index];
  try {
    const dispatch = item.type === 'story' ? deps.dispatchStory : deps.dispatchImage;
    const outcome = await dispatch(item, job);
    job.results.push({
      index,
      type: item.type,
      status: 'ok',
      familyRef: outcome?.familyRef || null,
      at: new Date().toISOString(),
    });
    console.log(`delayed-import ${job.jobId}: item ${index} (${item.type}) imported`);
  } catch (error) {
    console.error(`❌ delayed-import ${job.jobId}: item ${index} (${item.type}) failed: ${(error as Error).message}`);
    job.results.push({
      index,
      type: item.type,
      status: 'error',
      error: (error as Error).message,
      at: new Date().toISOString(),
    });
  }

  if (job.state !== 'running') return; // cancelled while dispatching

  const next = index + 1;
  if (next >= job.items.length) {
    finishJob(job, 'completed');
    console.log(`delayed-import ${job.jobId}: completed (${job.results.length} items)`);
    return;
  }
  job.nextFireAt = new Date(Date.now() + job.intervalMs).toISOString();
  job.timer = setTimeout(() => void runTick(job, next, deps), job.intervalMs);
}

/**
 * Story item -> storiesPopulator.newNodeFromStory.
 * Deliberately does NOT copy item.type onto the story: getCreationOptions
 * uses story.type as the Neon node type and must default to 'article'.
 * No figureUrl / language: image upload no-ops.
 */
export async function dispatchStoryItem(
  item: JobItem,
  job: Job,
  populator: Pick<typeof storiesPopulator, 'newNodeFromStory'> = storiesPopulator
): Promise<DispatchOutcome> {
  const story: storiesPopulator.StoryInput = {
    title: item.title,
    headline: item.title,
    summary: item.summary || '',
    byline: item.byline || '',
    mainContentHtml: item.content,
    metadata: item.metadata,
    tgtSite: job.site,
    tgtWorkspace: resolveWorkfolder(item, job),
    assignTo: resolveAssignTo(item, job),
  };
  const familyRef = await populator.newNodeFromStory(story, job.publish);
  return { familyRef: familyRef || null };
}

/** Image item -> imagesImporter.uploadImage. Image fetched live at tick time. */
export async function dispatchImageItem(
  item: JobItem,
  job: Job,
  importer: Pick<typeof imagesImporter, 'uploadImage'> = imagesImporter
): Promise<DispatchOutcome> {
  const imageName = item.name || getImageNameFromUrl(item.url || '') || `image-${Date.now()}`;
  const node = (await importer.uploadImage({
    imageName,
    imageUrl: item.url || '',
    workspace: resolveWorkfolder(item, job),
    metadata: item.metadata,
  })) as PutNodeResponse & { familyRef?: string };
  const familyRef = node?.node?.familyRef || node?.familyRef || null;
  return { familyRef };
}

/**
 * Schedules a new job. Payload must already be validated with validatePayload.
 * `deps` is for tests only — production callers use the default dispatchers.
 * Returns the submit response: { jobId, itemCount, intervalMs, estimatedEndAt }.
 */
export function createJob(body: DelayedImportPayload, deps: CreateJobDeps = {}): SubmitResponse {
  const dispatchers: Dispatchers = {
    dispatchStory: deps.dispatchStory || dispatchStoryItem,
    dispatchImage: deps.dispatchImage || dispatchImageItem,
  };

  const itemCount = body.items.length;
  const intervalMs = Math.round((body.duration * 60000) / itemCount);
  const jobId = `dlyimp-${dayjs().format('YYYYMMDD')}-${crypto.randomBytes(3).toString('hex')}`;
  const now = Date.now();

  const job: Job = {
    jobId,
    state: 'running',
    site: body.site,
    workspace: body.workspace,
    workfolder: body.workfolder || null,
    assignTo: body.assignTo || null,
    publish: body.publish === true,
    items: body.items,
    intervalMs,
    startedAt: new Date(now).toISOString(),
    estimatedEndAt: new Date(now + intervalMs * (itemCount - 1)).toISOString(),
    nextFireAt: new Date(now).toISOString(),
    results: [],
    timer: null,
  };
  jobs.set(jobId, job);

  // first item fires immediately (next tick, after the 202 is sent)
  job.timer = setTimeout(() => void runTick(job, 0, dispatchers), 0);

  return { jobId, itemCount, intervalMs, estimatedEndAt: job.estimatedEndAt };
}

export function getJob(jobId: string): PublicJob | null {
  const job = jobs.get(jobId);
  return job ? publicJob(job) : null;
}

export function listJobs(): JobSummary[] {
  return Array.from(jobs.values()).map((job) => ({
    jobId: job.jobId,
    state: job.state,
    done: job.results.length,
    total: job.items.length,
    nextFireAt: job.nextFireAt,
  }));
}

/**
 * Returns null if unknown, { error } if already finished,
 * otherwise the cancelled job snapshot. Imported items are not rolled back.
 */
export function cancelJob(jobId: string): PublicJob | { error: string } | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  if (job.state !== 'running') return { error: 'Job already finished' };
  finishJob(job, 'cancelled');
  console.log(`delayed-import ${jobId}: cancelled after ${job.results.length} items`);
  return publicJob(job);
}

/** Test helper: clears all jobs and pending timers. */
export function _reset(): void {
  for (const job of jobs.values()) {
    if (job.timer) clearTimeout(job.timer);
  }
  jobs.clear();
}
