import { describe, expect, it } from 'vitest';

import {
  LEGAL_EFFECTIVE_DATE,
  PRIVACY_DOCUMENT,
  PRIVACY_PARAGRAPHS,
  PRIVACY_PARAGRAPHS_FIL,
  PRIVACY_TITLE,
  PRIVACY_TITLE_FIL,
  PRIVACY_VERSION,
  TERMS_DOCUMENT,
  TERMS_PARAGRAPHS,
  TERMS_PARAGRAPHS_FIL,
  TERMS_TITLE,
  TERMS_TITLE_FIL,
  TERMS_VERSION,
} from './legal-documents';
import { toLegalSection } from './legal-document-sections';

const termsText = TERMS_PARAGRAPHS.join('\n');
const privacyText = PRIVACY_PARAGRAPHS.join('\n');
const legalText = `${termsText}\n${privacyText}`;
const filipinoText = [...TERMS_PARAGRAPHS_FIL, ...PRIVACY_PARAGRAPHS_FIL].join('\n');
const everyText = `${legalText}\n${filipinoText}`;

describe('legal document versions', () => {
  it('exports the 2026-11-v1 pair, effective November 11, 2026', () => {
    expect(TERMS_VERSION).toBe('2026-11-v1');
    expect(PRIVACY_VERSION).toBe('2026-11-v1');
    expect(TERMS_DOCUMENT.version).toBe(TERMS_VERSION);
    expect(PRIVACY_DOCUMENT.version).toBe(PRIVACY_VERSION);
    expect(LEGAL_EFFECTIVE_DATE).toBe('November 11, 2026');
    expect(termsText).toContain('This is version 2026-11-v1, effective November 11, 2026.');
    expect(privacyText).toContain('This is version 2026-11-v1, effective November 11, 2026.');
    expect(filipinoText).toContain('Ito ang bersyon 2026-11-v1, na may bisa simula Nobyembre 11, 2026.');
  });
});

describe('titles, translation and layout', () => {
  it('exports English and Filipino titles and paragraphs', () => {
    expect(TERMS_DOCUMENT).toMatchObject({ title: TERMS_TITLE, paragraphs: TERMS_PARAGRAPHS });
    expect(PRIVACY_DOCUMENT).toMatchObject({ title: PRIVACY_TITLE, paragraphs: PRIVACY_PARAGRAPHS });
    expect(TERMS_TITLE).toBe('Terms and Conditions');
    expect(PRIVACY_TITLE).toBe('Privacy Policy');
    expect(TERMS_DOCUMENT.filipino).toMatchObject({ title: TERMS_TITLE_FIL, paragraphs: TERMS_PARAGRAPHS_FIL });
    expect(PRIVACY_DOCUMENT.filipino).toMatchObject({ title: PRIVACY_TITLE_FIL, paragraphs: PRIVACY_PARAGRAPHS_FIL });
  });

  it('keeps the Filipino text section for section with the English, plus a language note', () => {
    expect(TERMS_PARAGRAPHS_FIL).toHaveLength(TERMS_PARAGRAPHS.length + 1);
    expect(PRIVACY_PARAGRAPHS_FIL).toHaveLength(PRIVACY_PARAGRAPHS.length + 1);
    const note = 'Wika ng dokumentong ito. Ito ay salin sa Filipino ng bersyong Ingles. Kung may pagkakaiba ang dalawa, ang bersyong Ingles ang masusunod.';
    expect(TERMS_PARAGRAPHS_FIL.at(-1)).toBe(note);
    expect(PRIVACY_PARAGRAPHS_FIL.at(-1)).toBe(note);
  });

  it('gives every section a heading except the one research continuation sentence', () => {
    const headless = [...TERMS_PARAGRAPHS, ...PRIVACY_PARAGRAPHS, ...TERMS_PARAGRAPHS_FIL, ...PRIVACY_PARAGRAPHS_FIL]
      .filter((paragraph) => toLegalSection(paragraph).heading === null);
    expect(headless).toEqual([
      'Creating a SkillMatch account does not by itself provide consent for unrelated research participation.',
      'Ang paggawa ng SkillMatch account ay hindi nangangahulugang pumapayag ka nang lumahok sa anumang hindi kaugnay na pananaliksik.',
    ]);
  });

  it('has no placeholders, draft markers or approval claims', () => {
    expect(everyText).not.toMatch(/\[|\]|PLACEHOLDER|DRAFT|TBD/);
    expect(everyText).not.toMatch(/lawyer-approved|DPO-approved|legally certified/i);
  });
});

describe('statements checked against the live system', () => {
  it('requires every user to be 18 or older and limits Workers to 18 to 80', () => {
    expect(termsText).toContain('You must be at least 18 years old to create a SkillMatch account.');
    expect(termsText).toContain('SkillMatch accepts Workers aged 18 to 80 only.');
    expect(filipinoText).toContain('Dapat ay 18 taong gulang ka pataas');
  });

  it('describes in-app video calls without recording, and the dialer Call', () => {
    expect(termsText).toContain('rings for up to 45 seconds and ends after at most 60 minutes');
    expect(termsText).toContain('SkillMatch does not record calls.');
    expect(privacyText).toContain('The audio and video go through LiveKit and are not recorded or stored by SkillMatch.');
    expect(privacyText).toContain('Video call records are deleted 7 days after the call room is closed.');
    expect(legalText).not.toContain('does not provide voice calling');
  });

  it('describes Worker-only live location and its automatic deletion', () => {
    expect(termsText).toContain('Clients do not share their location.');
    expect(privacyText).toContain('only the Client of that booking can see it');
    expect(privacyText).toContain('within about 15 minutes of the last update');
    expect(privacyText).toContain('SkillMatch does not track you in the background.');
  });

  it('discloses that Administrators can read the chat of a reported booking', () => {
    expect(termsText).toContain("an Administrator may read that booking's chat to review the report");
    expect(privacyText).toContain("an Administrator can read that booking's chat messages, labeled only as worker or client");
  });

  it('describes strikes, suspension at 3 strikes, bans and reinstatement', () => {
    expect(termsText).toContain('At 3 strikes the account is suspended.');
    expect(termsText).toContain('reinstating a Worker resets their strikes to zero');
  });

  it('describes Ask Itik with exactly what goes to Gemini and with storage off', () => {
    expect(termsText).toContain("tap 'Ask Itik for skills'");
    expect(privacyText).toContain('only if photo suggestions are available, one job photo they choose');
    expect(privacyText).toContain('their hidden details, including location, are removed before sending');
    expect(privacyText).toContain('only the names of the missing skills are sent');
    expect(privacyText).toContain('with the Gemini storage option turned off');
    expect(legalText).not.toContain('taps Suggest skills');
    expect(legalText.toLowerCase()).not.toMatch(/\btrain(s|ed|ing)?\b/);
  });

  it('keeps Worker-first, rule-based matching wording', () => {
    expect(termsText).toContain('A Client does not pick a Worker from a ranked list.');
    expect(termsText).toContain('The first qualifying Worker to accept it gets a confirmed booking.');
    expect(termsText).toContain('using skill, location and rating');
  });

  it('keeps Cash / QR Ph PayMongo TEST wording', () => {
    expect(termsText).toContain('Cash and QR Ph');
    expect(termsText).toContain('QR Ph uses PayMongo in TEST mode for demonstration only. No real money moves.');
    expect(privacyText).toContain('PayMongo in test mode (QR Ph)');
  });

  it('names every outside service the system uses, including Vercel', () => {
    for (const provider of ['Supabase', 'Vercel', 'Google Gemini', 'Google Gmail', 'Expo push service', 'LiveKit', 'PayMongo', 'Photon', 'OpenFreeMap', 'Esri']) {
      expect(privacyText).toContain(provider);
    }
  });

  it('commits to the owner-approved retention periods', () => {
    expect(privacyText).toContain('the project team deletes your personal information within 30 days of confirming the request');
    expect(privacyText).toContain('the project team deletes all personal information within 6 months');
  });

  it('routes requests through Report an app issue and names the person responsible', () => {
    expect(privacyText).toContain('use Report an app issue in your Profile and describe your request');
    expect(privacyText).toContain('Jomerson Villoso is the team member responsible for privacy matters.');
    expect(privacyText).toContain('National Privacy Commission (privacy.gov.ph)');
    expect(privacyText).toContain('Republic Act No. 10173');
    expect(everyText).not.toMatch(/@[a-z0-9-]+\.[a-z]/i);
  });

  it('shows the documents only at registration and never asks an existing account again', () => {
    expect(termsText).toContain('The app shows these Terms only when you register and does not ask you to accept a new version later.');
    expect(privacyText).toContain('The app shows this policy only when you register and does not ask you to acknowledge a new version later.');
    expect(legalText).toContain('A new version applies to accounts created after it is published.');
    expect(privacyText).toContain('To ask for a copy of these documents or of your information');
    expect(filipinoText).toContain('kapag nagre-register ka');
    expect(everyText).not.toMatch(/asks you to (review|accept)|hihilingin ng app/);
    expect(everyText).not.toContain('you can read these documents');
    expect(everyText).not.toContain('puwede mong basahin ang mga dokumentong ito');
  });

  it('keeps research participation separate from ordinary account consent', () => {
    expect(privacyText).toContain(
      'Any use of SkillMatch data for research or formal evaluation must follow the separately approved research process, including the applicable participant information and consent requirements.'
    );
    expect(privacyText).toContain('Creating a SkillMatch account does not by itself provide consent for unrelated research participation.');
  });
});
