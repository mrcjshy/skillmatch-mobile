import { describe, expect, it } from 'vitest';

import {
  PRIVACY_DOCUMENT,
  PRIVACY_PARAGRAPHS,
  PRIVACY_TITLE,
  PRIVACY_VERSION,
  TERMS_DOCUMENT,
  TERMS_PARAGRAPHS,
  TERMS_TITLE,
  TERMS_VERSION,
} from './legal-documents';

const termsText = TERMS_PARAGRAPHS.join('\n');
const privacyText = PRIVACY_PARAGRAPHS.join('\n');
const legalText = `${termsText}\n${privacyText}`;

const FORBIDDEN_DRAFT_MARKERS = [
  'DRAFT — NOT FINAL LEGAL TEXT',
  'PLACEHOLDER SECTION',
  'PLACEHOLDER',
  'Proposed project copy for Josh approval',
  '[PROJECT CONTACT TO BE CONFIRMED]',
  '[RETENTION PERIOD TO BE CONFIRMED',
] as const;

describe('legal document versions', () => {
  it('exports the locked Terms version', () => {
    expect(TERMS_VERSION).toBe('2026-09-v1');
    expect(TERMS_DOCUMENT.version).toBe(TERMS_VERSION);
  });

  it('exports the locked Privacy version', () => {
    expect(PRIVACY_VERSION).toBe('2026-09-v1');
    expect(PRIVACY_DOCUMENT.version).toBe(PRIVACY_VERSION);
  });
});

describe('legal document titles and final project copy', () => {
  it('exports Terms and Conditions as the Terms title', () => {
    expect(TERMS_TITLE).toBe('Terms and Conditions');
    expect(TERMS_DOCUMENT.title).toBe(TERMS_TITLE);
    expect(TERMS_DOCUMENT.paragraphs).toEqual(TERMS_PARAGRAPHS);
  });

  it('exports Privacy Policy as the Privacy title', () => {
    expect(PRIVACY_TITLE).toBe('Privacy Policy');
    expect(PRIVACY_DOCUMENT.title).toBe(PRIVACY_TITLE);
    expect(PRIVACY_DOCUMENT.paragraphs).toEqual(PRIVACY_PARAGRAPHS);
  });

  it('does not present the approved copy as draft or placeholder', () => {
    for (const marker of FORBIDDEN_DRAFT_MARKERS) {
      expect(legalText).not.toContain(marker);
    }
  });

  it('does not claim lawyer, DPO, or legal certification', () => {
    expect(legalText).not.toContain('lawyer-approved');
    expect(legalText).not.toContain('DPO-approved');
    expect(legalText).not.toContain('legally certified');
  });
});

describe('approved Terms and Privacy wording', () => {
  it('limits administrator action to reports and account controls, not general content deletion', () => {
    expect(termsText).toContain(
      'Users are responsible for the information and content they submit through SkillMatch.'
    );
    expect(termsText).toContain(
      "Administrators may review reports and may restrict or deactivate accounts when appropriate under the platform's administrative controls."
    );
    expect(termsText).not.toContain('SkillMatch may remove or restrict content');
  });

  it('describes authentication without claiming plaintext-password storage details', () => {
    expect(privacyText).toContain(
      "Authentication credentials are handled by SkillMatch's authentication service. The SkillMatch application does not store your plaintext password."
    );
    expect(privacyText).not.toContain('password (stored by the sign-in service)');
  });

  it('describes service-provider processing without unsupported guarantees', () => {
    expect(privacyText).toContain(
      'Technical service providers may process information as necessary to provide the services SkillMatch relies on, such as authentication, database hosting, file storage, and test-mode payment functionality.'
    );
    expect(privacyText).not.toContain(
      'Those services process data only as needed to operate SkillMatch.'
    );
  });

  it('keeps research participation separate from ordinary account consent', () => {
    expect(privacyText).toContain(
      'Any use of SkillMatch data for research or formal evaluation must follow the separately approved research process, including the applicable participant information and consent requirements.'
    );
    expect(privacyText).toContain(
      'Creating a SkillMatch account does not by itself provide consent for unrelated research participation.'
    );
  });

  it('does not make an advertising-network promise', () => {
    expect(privacyText).not.toContain(
      'SkillMatch does not use this operational data for advertising networks.'
    );
  });

  it('uses the approved project contact wording', () => {
    expect(termsText).toContain(
      'For questions about SkillMatch, contact the SkillMatch capstone project team through Pateros Technological College.'
    );
    expect(privacyText).toContain(
      'For privacy or account concerns, contact the SkillMatch capstone project team through Pateros Technological College.'
    );
    expect(legalText).not.toContain('[PROJECT CONTACT TO BE CONFIRMED]');
  });

  it('uses conservative retention wording with no invented numeric period', () => {
    expect(privacyText).toContain(
      'SkillMatch does not currently define a fixed public retention period. Information is retained as needed for legitimate platform operation, booking/security records, and applicable academic or administrative requirements of the project.'
    );
    expect(privacyText).not.toContain('[RETENTION PERIOD TO BE CONFIRMED');
  });

  it('does not invent a minimum-age threshold', () => {
    expect(legalText).not.toMatch(/\b13\+|\b16\+|\b18\+/);
    expect(legalText.toLowerCase()).not.toContain('minimum age');
  });

  it('retains Worker-first matching and hiring wording', () => {
    expect(termsText).toContain('A Client does not pick a Worker from a ranked list.');
    expect(termsText).toContain('AI does not choose the Worker.');
    expect(termsText).toContain('the first valid eligible Worker acceptance wins');
    expect(privacyText).toContain('SkillMatch uses rule-based matching, not AI');
    expect(privacyText).toContain('skill, location, and rating');
  });

  it('retains Administrator-reviewed identity wording without a government-database claim', () => {
    expect(termsText).toContain('An Administrator reviews the submission and may approve or reject it.');
    expect(termsText).toContain('SkillMatch does not check your ID against a government database');
    expect(privacyText).toContain('SkillMatch does not verify the ID through a government database.');
    expect(privacyText).toContain('private application data');
  });

  it('retains one-time Current Location and no continuous GPS tracking wording', () => {
    expect(termsText).toContain('does not continuously track you');
    expect(termsText).toContain('does not use background location tracking');
    expect(termsText).toContain('Matching uses stored barangay and city, not GPS coordinates.');
    expect(privacyText).toContain('one-time device location reading');
    expect(privacyText).toContain('does not continuously track your device');
  });

  it('retains Cash / QR Ph PayMongo TEST wording', () => {
    expect(termsText).toContain('Cash and QR Ph');
    expect(termsText).toContain('PayMongo in TEST mode');
    expect(termsText).toContain('not a live production payment service');
    expect(privacyText).toContain('PayMongo in TEST mode');
  });

  it('retains FAQ, Resume, and Skill Gap AI wording', () => {
    expect(termsText).toContain('local SkillMatch knowledge base');
    expect(termsText).toContain('does not invent work history');
    expect(termsText).toContain('may offer optional AI guidance text');
    expect(privacyText).toContain('Those tools do not decide matching or hiring.');
  });
});
