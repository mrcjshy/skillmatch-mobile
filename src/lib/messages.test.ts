import { beforeEach, expect, it, vi } from 'vitest';

import { canSendInStatus, compareMessageCursors, fetchBookingMessages, readNewBookingMessages, seedBookingMessageCursor, sendBookingMessage, validateContent } from './messages';

const wire = vi.hoisted(() => ({ fetch: vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>() }));
vi.mock('./supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return { supabase: createClient('https://messages.invalid', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: wire.fetch },
  }) };
});

const bookingId = '00000000-0000-4000-8000-000000000001';
const row = (n: number) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  created_at: '2026-09-27T01:00:00.123456+00:00',
  sender_id: '00000000-0000-4000-8000-000000009999',
});

// A small PostgREST boundary fake: the real installed Supabase query builder
// serializes requests; this server evaluates filters, ordering, and its own cap.
function splitTerms(value: string): string[] {
  let depth = 0, start = 0;
  const result: string[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (value[i] === ',' && depth === 0) { result.push(value.slice(start, i)); start = i + 1; }
  }
  result.push(value.slice(start));
  return result;
}

function matches(value: ReturnType<typeof row>, expression: string): boolean {
  for (const op of ['and', 'or']) {
    if (expression.startsWith(`${op}(`)) {
      const children = splitTerms(expression.slice(op.length + 1, -1));
      return op === 'and' ? children.every(x => matches(value, x)) : children.some(x => matches(value, x));
    }
  }
  const match = /^(id|created_at)\.(eq|gt|gte|lt|lte)\.(.*)$/.exec(expression);
  if (!match) throw new Error(`Unsupported mock-server filter: ${expression}`);
  const actual = value[match[1] as 'id' | 'created_at'], expected = match[3];
  switch (match[2]) {
    case 'eq': return actual === expected;
    case 'gt': return actual > expected;
    case 'gte': return actual >= expected;
    case 'lt': return actual < expected;
    default: return actual <= expected;
  }
}

function server(rows: ReturnType<typeof row>[], cap = 1000) {
  const requests: URL[] = [];
  wire.fetch.mockImplementation(async input => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(url);
    expect(url.searchParams.get('booking_id')).toBe(`eq.${bookingId}`);
    const limit = Number(url.searchParams.get('limit'));
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBeLessThan(1000);
    expect(url.searchParams.get('select')).not.toMatch(/content|is_read/);
    const filter = url.searchParams.get('or');
    const selected = rows.filter(r => !filter || matches(r, `or${filter}`));
    selected.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    if (url.searchParams.get('order')?.includes('desc')) selected.reverse();
    return new Response(JSON.stringify(selected.slice(0, Math.min(cap, limit))));
  });
  return requests;
}

it('seeds beyond 1000 then consumes every same-timestamp boundary over multiple capped pages', async () => {
  const rows = Array.from({ length: 1205 }, (_, i) => row(i + 1));
  const requests = server(rows, 37); // Deliberately smaller even than the requested page.
  const cursor = await seedBookingMessageCursor(bookingId);
  expect(cursor?.id).toBe(row(1205).id);
  rows.push(...Array.from({ length: 250 }, (_, i) => row(1206 + i)));
  const result = await readNewBookingMessages(bookingId, cursor, () => true);
  expect(result.messages.map(r => r.id)).toEqual(Array.from({ length: 250 }, (_, i) => row(1206 + i).id));
  expect(result.cursor?.id).toBe(row(1455).id);
  expect(requests.length).toBeGreaterThan(7);
  expect((await readNewBookingMessages(bookingId, result.cursor, () => true)).messages).toEqual([]);
});

beforeEach(() => { wire.fetch.mockReset(); });

it('seeds only the latest accessible cursor, without reading message bodies', async () => {
  wire.fetch.mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.get('order')).toBe('created_at.desc,id.desc');
    expect(url.searchParams.get('select')).not.toContain('content');
    return new Response(JSON.stringify([{
      id: '00000000-0000-4000-8000-000000001205',
      created_at: '2026-09-27T01:00:00.123456+00:00',
    }]));
  });
  expect(await seedBookingMessageCursor('00000000-0000-4000-8000-000000000001')).toEqual({
    id: '00000000-0000-4000-8000-000000001205',
    created_at: '2026-09-27T01:00:00.123456+00:00',
  });
});

it('supports an empty seed followed by the first incoming message', async () => {
  const rows: ReturnType<typeof row>[] = []; server(rows);
  expect(await seedBookingMessageCursor(bookingId)).toBeNull();
  rows.push(row(1));
  expect((await readNewBookingMessages(bookingId, null, () => true)).messages).toEqual([row(1)]);
});

it('does not present duplicate boundary rows twice', async () => {
  const rows = Array.from({ length: 205 }, (_, i) => row(i + 1));
  server(rows, 37);
  const respond = wire.fetch.getMockImplementation()!;
  let previous: ReturnType<typeof row> | undefined;
  wire.fetch.mockImplementation(async (input, init) => {
    const response = await respond(input, init);
    const values = await response.json() as ReturnType<typeof row>[];
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.searchParams.get('order')?.includes('asc')) {
      const boundary = previous; previous = values.at(-1);
      if (boundary) values.unshift(boundary);
    }
    return new Response(JSON.stringify(values));
  });
  const result = await readNewBookingMessages(bookingId, row(1), () => true);
  expect(result.messages).toHaveLength(204);
  expect(new Set(result.messages.map(r => r.id)).size).toBe(204);
  expect(result.cursor?.id).toBe(row(205).id);
});

it('rejects terminal-generation invalidation after page one before requesting page two', async () => {
  server(Array.from({ length: 250 }, (_, i) => row(i + 1)), 37);
  const respond = wire.fetch.getMockImplementation()!;
  let current = true, requests = 0;
  wire.fetch.mockImplementation(async (input, init) => {
    const response = await respond(input, init);
    if (++requests === 2) current = false; // latest cursor then first page
    return response;
  });
  await expect(readNewBookingMessages(bookingId, row(1), () => current)).rejects.toThrow('invalidated');
  expect(requests).toBe(2);
});

it('rejects RLS disappearance during pagination without returning a partial batch', async () => {
  server(Array.from({ length: 250 }, (_, i) => row(i + 1)), 37);
  const respond = wire.fetch.getMockImplementation()!; let requests = 0;
  wire.fetch.mockImplementation(async (input, init) => ++requests === 3 ? new Response('[]') : respond(input, init));
  await expect(readNewBookingMessages(bookingId, row(1), () => true)).rejects.toThrow('could not complete');
});

it('rejects a non-progressing page rather than looping indefinitely', async () => {
  wire.fetch.mockResolvedValueOnce(new Response(JSON.stringify([row(5)])))
    .mockResolvedValue(new Response(JSON.stringify([row(1)])));
  await expect(readNewBookingMessages(bookingId, row(1), () => true)).rejects.toThrow('could not complete');
  expect(wire.fetch).toHaveBeenCalledTimes(2);
});

it('rejects a failed page without returning its previously read rows', async () => {
  server(Array.from({ length: 250 }, (_, i) => row(i + 1)), 37);
  const respond = wire.fetch.getMockImplementation()!; let requests = 0;
  wire.fetch.mockImplementation(async (input, init) => ++requests === 3 ?
    new Response(JSON.stringify({ message: 'denied', code: '42501' }), { status: 403 }) : respond(input, init));
  await expect(readNewBookingMessages(bookingId, row(1), () => true)).rejects.toMatchObject({ code: '42501' });
});

it('keeps microsecond precision and compares equivalent timezone representations', () => {
  expect(compareMessageCursors({ ...row(9), created_at: '2026-09-27T01:00:00.000001Z' },
    { ...row(1), created_at: '2026-09-27T01:00:00.000002Z' })).toBe(-1);
  expect(compareMessageCursors({ ...row(1), created_at: '2026-09-27T09:00:00.123456+08:00' }, row(1))).toBe(0);
});

it.each([null, 'bad', '2026-09-27T00:00:00Z),id.gt.any'])('rejects malformed cursor timestamps: %s', created_at => {
  wire.fetch.mockResolvedValue(new Response(JSON.stringify([{ ...row(1), created_at }])));
  return expect(seedBookingMessageCursor(bookingId)).rejects.toThrow('Invalid message cursor');
});

it('does not chase new arrivals indefinitely beyond the latest-row snapshot', async () => {
  const rows = [row(1), row(2), row(3)]; server(rows, 1);
  const respond = wire.fetch.getMockImplementation()!;
  wire.fetch.mockImplementation(async (input, init) => {
    const response = await respond(input, init); rows.push(row(rows.length + 1)); return response;
  });
  const result = await readNewBookingMessages(bookingId, row(1), () => true);
  expect(result.messages.map(r => r.id)).toEqual([row(2).id, row(3).id]);
  expect(result.cursor?.id).toBe(row(3).id);
});

it('preserves existing chat-history ordering and content fields', async () => {
  wire.fetch.mockImplementation(async input => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    expect(url.searchParams.get('order')).toBe('created_at.asc,id.asc');
    expect(url.searchParams.get('select')).toBe('id,sender_id,content,created_at');
    expect(url.searchParams.has('limit')).toBe(false);
    return new Response(JSON.stringify([{ ...row(1), content: 'Hello' }]));
  });
  expect(await fetchBookingMessages(bookingId)).toEqual([{ ...row(1), content: 'Hello' }]);
});

it('preserves message INSERT without read-state writes and the 2000-character limit', async () => {
  wire.fetch.mockImplementation(async (_input, init) => {
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ booking_id: bookingId, sender_id: row(1).sender_id, content: 'Hello' });
    return new Response(null, { status: 201 });
  });
  await sendBookingMessage(bookingId, row(1).sender_id, 'Hello');
  expect(validateContent('a'.repeat(2000)).ok).toBe(true);
  expect(validateContent('a'.repeat(2001)).ok).toBe(false);
  expect(['pending', 'completed', 'cancelled', 'no_show'].map(canSendInStatus)).toEqual([false, false, false, false]);
  expect(canSendInStatus('confirmed')).toBe(true);
});
