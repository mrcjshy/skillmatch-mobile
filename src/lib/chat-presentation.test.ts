import { describe, expect, it } from 'vitest';

import {
  chatBookingFromRow,
  counterpartPresentation,
  findChatBooking,
  messageAuthor,
} from './chat-presentation';

const workerRow = {
  booking_id: 'booking-1',
  booking_status: 'confirmed',
  job_title: 'Carpentry',
  client_full_name: 'Ian Saren',
  client_phone: 'secret phone',
  client_email: 'secret email',
  job_address: 'secret address',
  identity_document: 'secret ID',
};

const clientRow = {
  booking_id: 'booking-2',
  booking_status: 'confirmed',
  job_title: 'Plumbing Repair',
  worker_full_name: 'Jomerson Villoso',
};

describe('authorized chat presentation', () => {
  it('shows the Client name and initials for a confirmed Worker booking', () => {
    const booking = findChatBooking('worker', [workerRow], 'booking-1');
    expect(counterpartPresentation('worker', booking)).toEqual({
      name: 'Ian Saren', firstName: 'Ian', initials: 'IS',
    });
    expect(booking?.jobTitle).toBe('Carpentry');
  });

  it('shows the Worker name and initials for a confirmed Client booking', () => {
    const booking = findChatBooking('client', [clientRow], 'booking-2');
    expect(counterpartPresentation('client', booking)).toEqual({
      name: 'Jomerson Villoso', firstName: 'Jomerson', initials: 'JV',
    });
  });

  it('labels own messages from authenticated ownership and incoming messages from the authorized name', () => {
    const counterpart = counterpartPresentation('worker', findChatBooking('worker', [workerRow], 'booking-1'))!;
    expect(messageAuthor('my-id', 'my-id', counterpart)).toBe('You');
    expect(messageAuthor('other-id', 'my-id', counterpart)).toBe('Ian');
    expect(messageAuthor('my-id', 'different-auth-id', counterpart)).toBe('Ian');
  });

  it('uses role fallbacks when a released name is absent or blank', () => {
    const worker = chatBookingFromRow('worker', { ...workerRow, client_full_name: null });
    const client = chatBookingFromRow('client', { ...clientRow, worker_full_name: '   ' });
    expect(counterpartPresentation('worker', worker)).toEqual({ name: 'Client', firstName: 'Client', initials: 'C' });
    expect(counterpartPresentation('client', client)).toEqual({ name: 'Worker', firstName: 'Worker', initials: 'W' });
  });

  it('uses the established role fallback for a type-valid empty counterpart name', () => {
    expect(counterpartPresentation('worker', {
      status: 'confirmed', jobTitle: 'Carpentry', counterpartName: '',
    })).toEqual({ name: 'Client', firstName: 'Client', initials: 'C' });
  });

  it('uses the established role fallback for a direct whitespace-only name', () => {
    expect(counterpartPresentation('client', {
      status: 'confirmed', jobTitle: 'Plumbing Repair', counterpartName: '   ',
    })).toEqual({ name: 'Worker', firstName: 'Worker', initials: 'W' });
  });

  it('does not produce identity for an absent or unrelated booking', () => {
    expect(findChatBooking('worker', [workerRow], 'another-booking')).toBeNull();
    expect(findChatBooking('worker', [], 'booking-1')).toBeNull();
    expect(counterpartPresentation('worker', null)).toBeNull();
  });

  it('drops the released name when a refresh changes status', () => {
    const confirmed = findChatBooking('worker', [workerRow], 'booking-1');
    const terminal = findChatBooking('worker', [{ ...workerRow, booking_status: 'completed', client_full_name: 'Ian Saren' }], 'booking-1');
    expect(counterpartPresentation('worker', confirmed)?.name).toBe('Ian Saren');
    expect(terminal?.counterpartName).toBeNull();
    expect(counterpartPresentation('worker', terminal)).toBeNull();
  });

  it('normalizes whitespace and uses one initial for a single name', () => {
    const full = chatBookingFromRow('client', { ...clientRow, worker_full_name: '  Jomerson   Villoso  ' });
    const single = chatBookingFromRow('worker', { ...workerRow, client_full_name: ' Ian ' });
    expect(counterpartPresentation('client', full)?.initials).toBe('JV');
    expect(counterpartPresentation('client', full)?.name).toBe('Jomerson Villoso');
    expect(counterpartPresentation('worker', single)?.initials).toBe('I');
  });

  it('keeps sensitive fields out of the identity model', () => {
    expect(Object.keys(chatBookingFromRow('worker', workerRow)!)).toEqual(['status', 'jobTitle', 'counterpartName']);
  });
});
