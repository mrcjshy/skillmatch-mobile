import { describe, expect, it } from 'vitest';

import { FAQ_COPY, FAQ_ENTRIES, QUICK_TOPICS, entriesForCategories, resolveFaq, type FaqEntry } from './faq';

/**
 * Demo-readiness accuracy contract for the deterministic FAQ (AI-01).
 * Every claim checked here is about the CURRENT implemented product.
 */

const byId = (id: string): FaqEntry => {
  const entry = FAQ_ENTRIES.find((e) => e.id === id);
  if (entry === undefined) throw new Error(`missing FAQ entry ${id}`);
  return entry;
};

/** The resolved entry ids the user could see for a query (answer or ambiguous choices). */
function shown(query: string): string[] {
  const r = resolveFaq(query);
  if (r.kind === 'answer') return [r.entry.id];
  if (r.kind === 'ambiguous') return r.candidates.map((e) => e.id);
  return [];
}

const allText = FAQ_ENTRIES.map((e) => `${e.question} ${e.answer}`).join('\n');

describe('FAQ reflects the implemented product', () => {
  it('states the Worker accepts and the Client never picks from a ranked shortlist', () => {
    const answer = byId('job-choose').answer;
    expect(answer).toMatch(/Worker ang tumatanggap/);
    expect(answer).toMatch(/Hindi pumipili ang Client mula sa ranked list o shortlist/);
    expect(allText).not.toMatch(/Client (can|may) (choose|pick|select) (a|the) Worker/i);
  });

  it('keeps Client résumé/portfolio access to the own confirmed Booking only, with no Worker Profile actions', () => {
    const answer = byId('prof-resume').answer;
    expect(answer).toMatch(/sarili niyang confirmed Booking/);
    expect(answer).toMatch(/Walang resume o Skill Gap button sa Worker Profile/);
    expect(answer).toMatch(/walang AI na nag-iimbento/);
  });

  it('places Skill Gap on Job Opportunity details, deterministic first, AI guidance optional', () => {
    const answer = byId('opp-skill-gap').answer;
    expect(answer).toMatch(/Nasa Job Opportunity details/);
    expect(answer).toMatch(/hindi AI/);
    expect(answer).toMatch(/pangalan lang ng missing skills/);
    expect(answer).toMatch(/Hindi nito binabago ang matching o eligibility/);
  });

  it('limits pre-accept exact location to currently eligible Workers', () => {
    expect(byId('opp-accept').answer).toMatch(/verified, at kasalukuyang eligible na Worker/);
  });

  it('offers only Cash and QR Ph TEST MODE and no third pay-later method', () => {
    const answer = byId('pay-methods').answer;
    expect(answer).toMatch(/Dalawa lang: Cash at QR Ph — TEST MODE/);
    expect(answer).toMatch(/walang hiwalay na pay-later na method/);
    expect(answer).toMatch(/walang totoong pera/);
    for (const e of FAQ_ENTRIES) {
      if (e.category === 'qrph') expect(e.answer).toMatch(/TEST/);
    }
  });

  it('never claims OTP, push, completion emails or reminders are live now', () => {
    expect(byId('acc-register').answer).toMatch(/Kapag naka-activate ang email code verification/);
    expect(byId('notif-sms').answer).toMatch(/gagana lang kapag na-activate at na-configure/);
    expect(allText).not.toMatch(/makakatanggap ka ng (push|email|reminder)/i);
    expect(allText).not.toMatch(/I-verify ang Email gamit ang verification code\./);
  });

  it('never presents the deterministic FAQ as an external LLM', () => {
    expect(byId('gen-help').answer).toMatch(/Hindi ito AI, ChatGPT, o external chatbot/);
    expect(allText).not.toMatch(/powered by (AI|GPT|Gemini|an LLM)/i);
    expect(FAQ_COPY.noMatch).not.toMatch(/AI|GPT|Gemini/);
  });

  it('includes the payment-method entry in the Payments quick topic', () => {
    const payments = QUICK_TOPICS.find((t) => t.label === 'Payments');
    expect(payments).toBeDefined();
    expect(entriesForCategories(payments!.categories).map((e) => e.id)).toContain('pay-methods');
  });
});

describe('FAQ retrieval in English, Tagalog and Taglish', () => {
  it.each([
    ['How do I pay?', 'pay-methods'],
    ['What payment methods are available?', 'pay-methods'],
    ['pwede ba gcash o maya na payment method', 'pay-methods'],
    ['Can I choose the worker?', 'job-choose'],
    ['who can see the resume and portfolio', 'prof-resume'],
    ['ano ang skill gap', 'opp-skill-gap'],
    ['missing skills ko', 'opp-skill-gap'],
    ['may push notification ba', 'notif-sms'],
    ['Is this chatbot AI or ChatGPT?', 'gen-help'],
    ['paano mag-register', 'acc-register'],
    ['paano mag post ng trabaho', 'job-post'],
  ])('%s → %s', (query, id) => {
    expect(shown(query)).toContain(id);
  });

  it.each(['What is the weather today?', 'magkano ang bigas', 'asdfgh qwerty'])(
    'falls back to the fixed no-match line for unsupported "%s"',
    (query) => {
      expect(resolveFaq(query)).toEqual({ kind: 'none' });
    }
  );

  it('cannot answer about the caller\'s own private state with anything but fixed entries', () => {
    const r = resolveFaq('bayad na ba ang booking ko');
    expect(r.kind === 'answer' || r.kind === 'ambiguous' || r.kind === 'none').toBe(true);
    for (const id of shown('bayad na ba ang booking ko')) expect(FAQ_ENTRIES.some((e) => e.id === id)).toBe(true);
  });
});
