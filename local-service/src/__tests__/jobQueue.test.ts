import { enqueueJob, getJobStatus } from '../jobs/jobQueue';

describe('jobQueue', () => {
  it('enqueueJob creates a job with queued status', () => {
    const job = enqueueJob('summarize', { messages: [] });

    expect(job.id).toBeDefined();
    expect(job.type).toBe('summarize');
    expect(job.status).toBe('queued');
    expect(job.payload).toEqual({ messages: [] });
    expect(job.createdAt).toBeDefined();
    expect(job.updatedAt).toBeDefined();
  });

  it('getJobStatus returns the correct job', () => {
    const job = enqueueJob('transcribe', { audioRef: 'audio-123' });
    const fetched = getJobStatus(job.id);

    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(job.id);
    expect(fetched!.type).toBe('transcribe');
  });

  it('getJobStatus returns undefined for unknown id', () => {
    const result = getJobStatus('nonexistent-job-id');

    expect(result).toBeUndefined();
  });

  it('enqueueJob assigns unique ids to different jobs', () => {
    const job1 = enqueueJob('summarize', { messages: [] });
    const job2 = enqueueJob('transcribe', { audioRef: 'x' });

    expect(job1.id).not.toBe(job2.id);
  });
});
