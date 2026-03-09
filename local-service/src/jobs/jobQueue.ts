import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import type { JobStatus } from '../models/types';

interface Job {
  id: string;
  type: string;
  status: JobStatus;
  payload: unknown;
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

const jobStore = new Map<string, Job>();
const queue: string[] = [];
let processing = false;

export function enqueueJob(type: string, payload: unknown): Job {
  const now = new Date().toISOString();
  const job: Job = {
    id: uuidv4(),
    type,
    status: 'queued',
    payload,
    createdAt: now,
    updatedAt: now,
  };

  jobStore.set(job.id, job);
  queue.push(job.id);
  logger.info('Job enqueued', { id: job.id, type });

  // Start processing asynchronously
  if (!processing) {
    setImmediate(() => processJobs().catch(err => {
      logger.error('Job processing error', { error: err instanceof Error ? err.message : String(err) });
    }));
  }

  return job;
}

export async function processJobs(): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    while (queue.length > 0) {
      const jobId = queue.shift();
      if (!jobId) continue;

      const job = jobStore.get(jobId);
      if (!job) continue;

      job.status = 'processing';
      job.updatedAt = new Date().toISOString();

      try {
        const result = await executeJob(job);
        job.status = 'completed';
        job.result = result;
      } catch (err) {
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : String(err);
        logger.error('Job failed', { id: job.id, type: job.type, error: job.error });
      }

      job.updatedAt = new Date().toISOString();
    }
  } finally {
    processing = false;
  }
}

export function getJobStatus(id: string): Job | undefined {
  return jobStore.get(id);
}

async function executeJob(job: Job): Promise<unknown> {
  switch (job.type) {
    case 'transcribe': {
      const { transcribeAudio } = await import('../transcriber/transcriber');
      const payload = job.payload as { audioRef: string };
      return transcribeAudio(payload.audioRef);
    }

    case 'summarize': {
      const { generateSummary } = await import('../summarizer/summarizer');
      const payload = job.payload as { messages: import('../models/types').Message[] };
      return generateSummary(payload.messages);
    }

    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}
