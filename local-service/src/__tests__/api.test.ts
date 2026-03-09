// Set DB_PATH before any imports so the database module uses in-memory SQLite
process.env.DB_PATH = ':memory:';

import { initializeDatabase, closeDatabase } from '../db/database';
import { app } from '../index';
import http from 'http';

let server: http.Server;
let baseUrl: string;

function request(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options: http.RequestOptions = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode!, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode!, body: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

describe('API routes', () => {
  beforeAll((done) => {
    initializeDatabase();
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      done();
    });
  });

  afterAll((done) => {
    server.close(() => {
      closeDatabase();
      done();
    });
  });

  it('GET /api/health returns ok status', async () => {
    const res = await request('GET', '/api/health');

    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.version).toBe('0.1.0');
    expect(typeof body.uptime).toBe('number');
    expect(body.database).toBe(true);
  });

  it('POST /api/extract/manual-summary returns 400 when data is missing', async () => {
    const res = await request('POST', '/api/extract/manual-summary', {});

    expect(res.status).toBe(400);
    const body = res.body as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });

  it('POST /api/extract/manual-summary creates a summary with valid data', async () => {
    const payload = {
      conversation: {
        platformConversationRef: 'test-conv-api-1',
        title: 'API Test Chat',
        participants: ['Alice', 'Bob'],
      },
      messages: [
        {
          senderName: 'Alice',
          timestamp: '2024-01-01T10:00:00Z',
          messageType: 'text',
          textBody: 'Hello Bob',
        },
        {
          senderName: 'Bob',
          timestamp: '2024-01-01T10:01:00Z',
          messageType: 'text',
          textBody: 'Hi Alice!',
        },
      ],
      includeVoiceNotes: false,
    };

    const res = await request('POST', '/api/extract/manual-summary', payload);

    expect(res.status).toBe(201);
    const body = res.body as Record<string, unknown>;
    expect(body.id).toBeDefined();
    expect(body.conversationTitle).toBe('API Test Chat');
    expect(body.shortSummary).toBeDefined();
    expect(body.summaryType).toBe('manual');
  });

  it('GET /api/summaries/:id returns 404 for unknown id', async () => {
    const res = await request('GET', '/api/summaries/nonexistent-id');

    expect(res.status).toBe(404);
  });

  it('POST /api/extract/incremental returns 400 when data is missing', async () => {
    const res = await request('POST', '/api/extract/incremental', {});

    expect(res.status).toBe(400);
    const body = res.body as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });

  it('POST /api/extract/incremental returns 404 for unknown conversation', async () => {
    const res = await request('POST', '/api/extract/incremental', {
      conversationId: 'unknown-conv-id',
      messages: [
        {
          senderName: 'Alice',
          timestamp: '2024-01-01T10:00:00Z',
          messageType: 'text',
          textBody: 'Hi',
        },
      ],
    });

    expect(res.status).toBe(404);
  });
});
