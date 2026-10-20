import { describe, expect, it } from 'vitest';
import { projectClientResume } from './client-resume';

const saved = {
  booking_status: 'confirmed', worker_full_name: '  Synthetic Worker  ',
  worker_phone: ' 09170000000 ', worker_barangay: ' Santa Ana ',
  worker_skills: ['Painting', ' Carpentry ', 'Painting'],
  worker_is_verified: true, worker_rating_avg: 4.5, worker_rating_count: 2,
  email: 'private@example.invalid', bio: 'NOT RELEASED', proficiency_level: 'expert',
  address: 'PRIVATE HOME', identity_document: 'PRIVATE ID', verified_by: 'ADMIN ID',
  worker_user_id: 'INTERNAL ID', no_show_count: 2,
};

describe('automatic Client resume projection', () => {
  it('derives only authorized facts from the current saved booking projection', () => {
    expect(projectClientResume(saved)).toEqual({
      fullName: 'Synthetic Worker', phone: '09170000000', barangay: 'Santa Ana',
      skills: ['Carpentry', 'Painting'], isVerified: true, ratingAvg: 4.5, ratingCount: 2,
    });
    expect(projectClientResume({ ...saved, worker_skills: ['Masonry'] })?.skills).toEqual(['Masonry']);
    expect(saved.worker_skills).toEqual(['Painting', ' Carpentry ', 'Painting']);
  });

  it('does not invent missing profile, qualification, experience or rating values', () => {
    expect(projectClientResume({ booking_status: 'confirmed' })).toEqual({
      fullName: null, phone: null, barangay: null, skills: [],
      isVerified: null, ratingAvg: null, ratingCount: null,
    });
    expect(projectClientResume({ ...saved, worker_skills: null, worker_rating_count: 0, worker_rating_avg: 0 }))
      .toMatchObject({ skills: [], ratingAvg: null, ratingCount: 0 });
  });

  it('cannot pass private fields or internal identifiers into rendered or document data', () => {
    const projected = projectClientResume(saved);
    expect(Object.keys(projected!)).toEqual(['fullName', 'phone', 'barangay', 'skills', 'isVerified', 'ratingAvg', 'ratingCount']);
    expect(JSON.stringify(projected)).not.toMatch(/PRIVATE|INTERNAL|ADMIN|NOT RELEASED|example.invalid|expert/);
  });

  it.each(['pending', 'completed', 'cancelled', 'no_show', '', undefined])('suppresses the projection for %s', (booking_status) => {
    expect(projectClientResume({ ...saved, booking_status })).toBeNull();
  });

  it('rejects malformed optional facts instead of making qualifications or scores', () => {
    expect(projectClientResume({ ...saved, worker_skills: [' ', 123, 'Plumbing'], worker_is_verified: 'true', worker_rating_avg: 6, worker_rating_count: -1 }))
      .toMatchObject({ skills: ['Plumbing'], isVerified: null, ratingAvg: null, ratingCount: null });
    expect(projectClientResume({ ...saved, worker_rating_avg: Number.NaN })?.ratingAvg).toBeNull();
  });
});
