/**
 * AI-01 — local FAQ knowledge base and deterministic retrieval.
 *
 * D-004 (LOCKED): the FAQ chatbot is a fixed, developer-created knowledge
 * base in simple Taglish, with no account, booking, payment, or private
 * user-data lookup and no new table. This module is the whole of it.
 *
 * WHY THERE IS NO SERVER AND NO MODEL HERE
 * ----------------------------------------
 * Every answer a user can ever see is a string in FAQ_ENTRIES below. Search
 * only ranks those entries; it cannot compose, paraphrase or combine them,
 * so it cannot state anything a developer did not write. That is what makes
 * the feature safe to demonstrate: it cannot hallucinate a rule about
 * payments or matching, and it cannot leak anything, because it reads
 * nothing but this file. No network, no database, no storage, no identity.
 *
 * WHAT THE FAQ MAY AND MAY NOT ANSWER
 * -----------------------------------
 * It explains how SkillMatch works in general ("Paano gumagana ang QR Ph?").
 * It can never answer about the caller's own state ("Bayad na ba ang Booking
 * ko?") because it has no access to that state -- by construction, not by
 * policy. Entries are written accordingly.
 *
 * ACCURACY IS A CONTRACT
 * ----------------------
 * Answers describe CURRENT implemented behaviour only. Nothing deferred is
 * described as existing. When behaviour changes, the entry changes in the
 * same commit.
 */

export type FaqCategory =
  | 'account'
  | 'verification'
  | 'profile'
  | 'job-posting'
  | 'opportunities'
  | 'booking'
  | 'messaging'
  | 'ratings'
  | 'cash'
  | 'qrph'
  | 'notifications'
  | 'general';

export type FaqEntry = {
  /** Stable, source-controlled. Used for deterministic tie-breaks and to keep
   *  a displayed answer bound to the entry it came from. */
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
  /** Lower-case search terms, Tagalog and English, beyond the question text. */
  keywords: readonly string[];
};

export const CATEGORY_LABEL: Record<FaqCategory, string> = {
  account: 'Account at Registration',
  verification: 'Worker Verification',
  profile: 'Worker Profile at Skills',
  'job-posting': 'Pag-post ng Trabaho',
  opportunities: 'Job Opportunities',
  booking: 'Booking',
  messaging: 'Messaging',
  ratings: 'Ratings',
  cash: 'Cash Payment',
  qrph: 'QR Ph Payment',
  notifications: 'Notifications',
  general: 'Tungkol sa SkillMatch',
};

/* ------------------------------------------------------------------ *
 * Knowledge base
 * ------------------------------------------------------------------ */

export const FAQ_ENTRIES: readonly FaqEntry[] = [
  /* ---------------- 1. Account / Registration ---------------- */
  {
    id: 'acc-register',
    category: 'account',
    question: 'Paano mag-register sa SkillMatch?',
    answer:
      'Buksan ang app at piliin ang Register. I-fill up ang Full Name, Phone, Email, Password, at Confirm Password, tapos piliin kung Worker ka o Client. Kapag successful ang registration, diretso ka na sa app at hindi na kailangang mag-log in ulit. Ang barangay at city ay naka-set na sa Santa Ana, Pateros, kaya hindi na ito hinihingi sa registration.',
    keywords: ['register', 'sign up', 'signup', 'gumawa', 'account', 'bago', 'paano magsimula', 'magparehistro'],
  },
  {
    id: 'acc-roles',
    category: 'account',
    question: 'Ano ang pagkakaiba ng Worker at Client?',
    answer:
      'Ang Worker ay nag-aalok ng serbisyo at tumatanggap ng trabaho. Ang Client ay nagpo-post ng trabaho na kailangan ng Worker. Isang role lang ang bawat account, at ito ang nagtatakda kung aling dashboard ang makikita mo.',
    keywords: ['worker', 'client', 'role', 'pagkakaiba', 'difference', 'account type', 'sino'],
  },
  {
    id: 'acc-login',
    category: 'account',
    question: 'Hindi ako maka-log in. Ano ang gagawin ko?',
    answer:
      'Siguraduhing tama ang email at password na ginamit mo sa registration. Kung bago ang account, kumpletuhin muna ang registration. Kung tuloy-tuloy ang problema, isara at buksan ulit ang app at subukan muli.',
    keywords: ['login', 'log in', 'password', 'hindi makapasok', 'error', 'sign in', 'pumasok'],
  },

  /* ---------------- 2. Worker Verification ---------------- */
  {
    id: 'ver-what',
    category: 'verification',
    question: 'Ano ang Worker verification?',
    answer:
      'Ang Administrator ang nagve-verify ng Worker account. Kapag verified ka na, saka ka lang isasama sa job matching at makakatanggap ng job opportunities. Hindi ito ginagawa ng Client.',
    keywords: ['verify', 'verified', 'verification', 'admin', 'administrator', 'approve', 'aprubado', 'legit'],
  },
  {
    id: 'ver-no-jobs',
    category: 'verification',
    question: 'Bakit wala akong nakikitang job opportunities?',
    answer:
      'Para makakita ng opportunities, kailangan verified, active at available ang Worker, at may kahit isang skill na tumutugma sa kailangan ng trabaho. I-check ang availability at skills mo sa dashboard, o hintayin ang verification ng Administrator.',
    keywords: ['walang trabaho', 'wala', 'empty', 'no jobs', 'hindi lumalabas', 'bakit', 'opportunities'],
  },

  /* ---------------- 3. Worker Profile / Skills ---------------- */
  {
    id: 'prof-skills',
    category: 'profile',
    question: 'Paano ako magdadagdag ng skills?',
    answer:
      'Sa Worker dashboard, i-update ang About Me at piliin ang skills mo mula sa listahan, tapos i-save. Ang skills mo ang isa sa mga batayan para ma-match ka sa mga trabaho, kaya panatilihing tama at kumpleto ang mga ito.',
    keywords: ['skills', 'skill', 'kakayahan', 'dagdag', 'add', 'profile', 'about me', 'bio', 'edit'],
  },
  {
    id: 'prof-availability',
    category: 'profile',
    question: 'Ano ang availability status?',
    answer:
      'Ipinapakita nito kung available ka para tumanggap ng trabaho. Kapag hindi ka available, hindi ka isasama sa matching kahit verified ka. Pwede mo itong baguhin sa Worker dashboard.',
    keywords: ['availability', 'available', 'unavailable', 'status', 'busy', 'libre'],
  },
  {
    id: 'prof-rating',
    category: 'profile',
    question: 'Saan galing ang rating sa profile ko?',
    answer:
      'Ang rating sa Worker profile ay average ng mga rating (1 hanggang 5) na ibinigay ng mga Client pagkatapos ng completed Booking. Nakikita ito ng Clients at bahagi ito ng match score.',
    keywords: ['rating', 'average', 'stars', 'score', 'profile', 'badge'],
  },

  /* ---------------- 4. Job Posting ---------------- */
  {
    id: 'job-post',
    category: 'job-posting',
    question: 'Paano mag-post ng trabaho?',
    answer:
      'Sa Client dashboard, gamitin ang Post a Job form: ilagay ang title, description, address, date at time, budget, at piliin ang kailangang skills. Pagka-post, magiging open ito para sa mga qualified Worker.',
    keywords: ['post', 'mag-post', 'trabaho', 'job', 'gumawa ng trabaho', 'client', 'budget', 'hire'],
  },
  {
    id: 'job-choose',
    category: 'job-posting',
    question: 'Pwede ko bang pumili ng Worker para sa trabaho ko?',
    answer:
      'Hindi. Sa SkillMatch, ang qualified Worker ang tumatanggap ng opportunity (Worker-choice model). Hindi manu-manong pumipili ng Worker ang Client. Makakatanggap ka ng notification kapag may tumanggap sa trabaho mo.',
    keywords: ['pumili', 'choose', 'select worker', 'pick', 'assign', 'sino ang kukuha'],
  },

  /* ---------------- 5. Job Opportunities / Acceptance ---------------- */
  {
    id: 'opp-matching',
    category: 'opportunities',
    question: 'Paano gumagana ang job matching?',
    answer:
      'Ipinapakita ang trabaho sa mga Worker na verified, active, available, at may kahit isang tumutugmang skill. May match score: Skill 50%, Location 30%, Rating 20%. Ang Worker ang pumipili at tumatanggap ng trabaho, hindi ang system.',
    keywords: ['matching', 'match', 'paano', 'how', 'score', 'skill', 'location', 'rating', 'algorithm'],
  },
  {
    id: 'opp-accept',
    category: 'opportunities',
    question: 'Paano tumanggap ng job opportunity?',
    answer:
      'Sa Job Opportunities, buksan ang trabaho at i-tap ang Accept. Isang Worker lang ang makakatanggap ng bawat trabaho; kapag natanggap na ito ng iba, hindi na ito lalabas sa listahan mo.',
    keywords: ['accept', 'tanggap', 'tumanggap', 'kunin', 'opportunity', 'apply', 'mag-apply'],
  },
  {
    id: 'opp-nearest',
    category: 'opportunities',
    question: 'Automatic bang ibibigay ang trabaho sa pinakamalapit na Worker?',
    answer:
      'Hindi. Walang automatic assignment sa SkillMatch. Ang location ay bahagi lang ng match score (30%). Ang Worker pa rin ang tumatanggap ng trabaho, at walang live na GPS tracking.',
    keywords: ['automatic', 'nearest', 'pinakamalapit', 'malapit', 'gps', 'location', 'tracking', 'assign'],
  },

  /* ---------------- 6. Booking Lifecycle ---------------- */
  {
    id: 'bk-create',
    category: 'booking',
    question: 'Paano nagkakaroon ng Booking?',
    answer:
      'Kapag tinanggap ng Worker ang job opportunity, awtomatikong nagkakaroon ng confirmed Booking sa pagitan ng Client at Worker. Makikita ito sa My Bookings ng pareho.',
    keywords: ['booking', 'confirmed', 'paano nagkakaroon', 'create', 'my bookings', 'schedule'],
  },
  {
    id: 'bk-complete',
    category: 'booking',
    question: 'Paano mamarkahan na tapos na ang serbisyo?',
    answer:
      'Ang Client lang ang maaaring mag-complete ng Booking pagkatapos ng serbisyo. Hindi ito maaaring gawin ng Worker. Pagkatapos ma-complete, saka lang lalabas ang payment options.',
    keywords: ['complete', 'completed', 'tapos', 'done', 'finish', 'markahan', 'mark'],
  },
  {
    id: 'bk-cancel',
    category: 'booking',
    question: 'Pwede bang i-cancel ang Booking?',
    answer:
      'Oo. Pwedeng i-cancel ng Client o ng Worker habang pinapayagan pa ito ng status ng Booking. Walang automatic re-matching sa kasalukuyang bersyon pagkatapos ng cancel.',
    keywords: ['cancel', 'kanselahin', 'i-cancel', 'bawiin', 'ayaw na', 'rematch'],
  },

  /* ---------------- 7. Messaging ---------------- */
  {
    id: 'msg-how',
    category: 'messaging',
    question: 'Paano mag-message sa Client o Worker?',
    answer:
      'Ang messaging ay para sa Client at Worker na may Booking. Pwedeng magbasa at mag-send habang confirmed ang Booking. Kapag completed o cancelled na ito, hindi na bukas ang conversation. Hanggang 2,000 characters ang isang message.',
    keywords: ['message', 'chat', 'mag-message', 'usap', 'makipag-usap', 'text', 'send', 'contact'],
  },
  {
    id: 'msg-refresh',
    category: 'messaging',
    question: 'Bakit hindi lumalabas agad ang bagong message?',
    answer:
      'Karaniwang kusang lumalabas agad ang bagong message habang bukas ang confirmed na conversation. Kapag mahina o naputol ang internet, maaaring ma-delay ito — i-refresh lang o buksan ulit ang conversation.',
    keywords: ['bagong message', 'new message', 'hindi lumalabas', 'refresh', 'delay', 'live', 'instant'],
  },

  /* ---------------- 8. Ratings ---------------- */
  {
    id: 'rate-who',
    category: 'ratings',
    question: 'Sino ang pwedeng mag-rate?',
    answer:
      'Ang Client lang ang nagra-rate ng Worker, at pagkatapos lang ng completed Booking. Isang rating (1 hanggang 5) kada Booking. Hindi nagra-rate ang Worker ng Client sa kasalukuyang bersyon.',
    keywords: ['rate', 'rating', 'mag-rate', 'review', 'feedback', 'stars', 'sino'],
  },
  {
    id: 'rate-effect',
    category: 'ratings',
    question: 'Ano ang epekto ng rating?',
    answer:
      'Ang mga rating mula sa Clients ay nagiging average rating sa Worker profile, at bahagi ito ng match score (Rating 20%). Mas mataas na rating ay maaaring magpataas ng ranking score ng Worker kumpara sa ibang eligible Workers para sa parehong trabaho. Hindi ito nagdadagdag ng bilang ng trabaho na pwede mong tanggapin.',
    keywords: ['epekto', 'effect', 'rating', 'score', 'average', 'bakit mahalaga'],
  },

  /* ---------------- 9. Cash Payment ---------------- */
  {
    id: 'cash-how',
    category: 'cash',
    question: 'Paano gumagana ang Cash Payment?',
    answer:
      'Pagkatapos ma-complete ang Booking, pipiliin ng Client ang Cash Payment. Ibibigay ang cash nang personal sa Worker, tapos ang Worker ang magko-confirm sa app na natanggap na niya ang cash. Saka lang ito magiging paid.',
    keywords: ['cash', 'cash payment', 'bayad', 'magbayad', 'pera', 'cod', 'personal', 'paano magbayad'],
  },
  {
    id: 'cash-confirm',
    category: 'cash',
    question: 'Sino ang nagko-confirm na bayad na ang cash?',
    answer:
      'Ang Worker lang, gamit ang Confirm Cash Received. Hindi maaaring markahan ng Client na bayad na. Kapag na-confirm ng Worker, makakatanggap ng notification ang Client.',
    keywords: ['confirm', 'natanggap', 'received', 'bayad na', 'paid', 'cash received', 'sino'],
  },

  /* ---------------- 10. QR Ph Payment ---------------- */
  {
    id: 'qr-how',
    category: 'qrph',
    question: 'Paano gumagana ang QR Ph payment?',
    answer:
      'Pagkatapos ma-complete ang Booking, pipiliin ng Client ang QR Ph. Gagawa ang app ng QR code para sa eksaktong halaga ng trabaho. Magiging paid lang ang Booking kapag kinumpirma ng payment provider sa server ang bayad. Sa kasalukuyang demo, TEST mode ito at hindi totoong pera ang ginagamit.',
    keywords: ['qr', 'qr ph', 'qrph', 'qr code', 'online', 'paymongo', 'scan', 'digital', 'bayad', 'magbayad'],
  },
  {
    id: 'qr-scan',
    category: 'qrph',
    question: 'Pwede ko bang i-scan ang QR gamit ang GCash o Maya?',
    answer:
      'Sa demo, HUWAG i-scan ang TEST QR gamit ang GCash, Maya, o anumang banking app. Gamitin ang Open PayMongo Test Payment button sa app para i-simulate ang bayad. TEST mode ang kasalukuyang integration, hindi production.',
    keywords: ['gcash', 'maya', 'bank', 'scan', 'i-scan', 'wallet', 'test', 'demo', 'totoo'],
  },
  {
    id: 'qr-pending',
    category: 'qrph',
    question: 'Bakit pending pa ang QR Ph payment?',
    answer:
      'Ang Refresh Payment Status ay nagtatanong sa server kung na-confirm na ng payment provider ang bayad. Kung hindi pa kinumpirma, mananatiling pending. Hindi maaaring markahan ng Client o Worker na bayad na ang QR Ph; galing lang ito sa provider confirmation. Sa demo, TEST mode ang ginagamit.',
    keywords: ['pending', 'refresh', 'status', 'hindi pa paid', 'naghihintay', 'waiting', 'confirm'],
  },

  /* ---------------- 11. Notifications ---------------- */
  {
    id: 'notif-what',
    category: 'notifications',
    question: 'Anong notifications ang matatanggap ko?',
    answer:
      'May in-app Notifications inbox para sa mahahalagang pangyayari, gaya ng natanggap na trabaho o kapag kinumpirma ng Worker na natanggap na ang Cash Payment. Buksan ang Notifications sa dashboard para basahin at markahan ang mga ito bilang read.',
    keywords: ['notification', 'notifications', 'abiso', 'inbox', 'alert', 'read', 'unread'],
  },
  {
    id: 'notif-sms',
    category: 'notifications',
    question: 'May SMS o text notification ba?',
    answer:
      'Wala. Sa kasalukuyang bersyon, nasa in-app Notifications inbox lang ang mga abiso. Buksan ang app para makita ang mga ito.',
    keywords: ['sms', 'text', 'push', 'email notification', 'abiso', 'wala'],
  },

  /* ---------------- 12. General ---------------- */
  {
    id: 'gen-what',
    category: 'general',
    question: 'Ano ang SkillMatch?',
    answer:
      'Ang SkillMatch ay livelihood matching platform na nag-uugnay ng local Workers at Clients. Ang app na ito ang ginagamit ng Worker, Client, at Administrator. Ang website ay information page lang.',
    keywords: ['skillmatch', 'ano', 'what is', 'about', 'tungkol', 'platform', 'app', 'website'],
  },
  {
    id: 'gen-help',
    category: 'general',
    question: 'Paano gamitin ang Help?',
    answer:
      'I-type ang tanong mo sa simpleng Tagalog o English, o pumili ng topic sa ibaba. Ang mga sagot ay galing sa fixed na gabay ng SkillMatch. Hindi nito nakikita ang personal na account, Booking, o payment data mo.',
    keywords: ['help', 'tulong', 'faq', 'paano gamitin', 'gabay', 'guide', 'chatbot'],
  },
];

/* ------------------------------------------------------------------ *
 * Fixed copy
 * ------------------------------------------------------------------ */

export const FAQ_COPY = {
  title: 'Help & FAQ',
  greeting: 'Hi! Ano ang gusto mong malaman tungkol sa SkillMatch?',
  inputLabel: 'Itanong tungkol sa SkillMatch',
  placeholder: 'Halimbawa: Paano gumagana ang QR Ph?',
  ask: 'Ask',
  botName: 'SkillMatch Help',
  youName: 'You',
  quickTopics: 'Quick topics',
  related: 'Related questions',
  choose: 'Pumili ng tanong:',
  /** Fixed. Never a generated sentence. */
  noMatch:
    'Hindi ko nahanap ang eksaktong sagot. Pumili ng topic sa ibaba o subukan ang mas simpleng tanong tungkol sa paggamit ng SkillMatch.',
  suggested: 'Mga karaniwang tanong:',
} as const;

/** Dashboard-style entry points. Each maps to one or more fixed categories. */
export const QUICK_TOPICS: readonly { label: string; categories: readonly FaqCategory[] }[] = [
  { label: 'Account', categories: ['account', 'verification', 'profile'] },
  { label: 'Finding Jobs', categories: ['opportunities', 'job-posting'] },
  { label: 'Bookings', categories: ['booking', 'ratings'] },
  { label: 'Payments', categories: ['cash', 'qrph'] },
  { label: 'Messaging', categories: ['messaging', 'notifications'] },
];

/** Shown for an empty query. Fixed order, fixed set. */
const SUGGESTED_IDS: readonly string[] = ['gen-what', 'opp-matching', 'bk-complete', 'cash-how', 'qr-how'];

export const MAX_QUERY_LENGTH = 300;

/* ------------------------------------------------------------------ *
 * Deterministic retrieval
 * ------------------------------------------------------------------ */

const PHRASE_IN_QUESTION = 100;
const KEYWORD_HIT = 10;
const QUESTION_WORD_HIT = 6;
const CATEGORY_WORD_HIT = 3;
const ANSWER_WORD_HIT = 1;
/** Fewer words than this cannot earn phrase credit. */
const PHRASE_MIN_WORDS = 3;

/** Below this the best hit is only incidental answer-text overlap: no answer. */
const MIN_CONFIDENT_SCORE = KEYWORD_HIT;

/**
 * Lower-case, letters/digits only, single-spaced. Pure. Tagalog and English
 * both use the Latin alphabet, so an explicit class (plus the accented
 * vowels and enye that appear in Filipino text) is enough and avoids relying
 * on Unicode property escapes in the JS engine.
 */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9ñáéíóú]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Distinct words of length >= 2, in first-seen order. Pure. */
export function wordsOf(s: string): string[] {
  const seen = new Set<string>();
  for (const w of normalizeText(s).split(' ')) {
    if (w.length >= 2) seen.add(w);
  }
  return [...seen];
}

/* Precomputed once per entry so ranking is a plain lookup. */
type Indexed = {
  entry: FaqEntry;
  order: number;
  question: string;
  questionWords: Set<string>;
  keywordWords: Set<string>;
  categoryWords: Set<string>;
  answerWords: Set<string>;
};

const INDEX: readonly Indexed[] = FAQ_ENTRIES.map((entry, order) => ({
  entry,
  order,
  question: normalizeText(entry.question),
  questionWords: new Set(wordsOf(entry.question)),
  keywordWords: new Set(entry.keywords.flatMap((k) => wordsOf(k))),
  categoryWords: new Set(wordsOf(CATEGORY_LABEL[entry.category])),
  answerWords: new Set(wordsOf(entry.answer)),
}));

export type FaqHit = { entry: FaqEntry; score: number };

/**
 * Rank every entry against the query. Pure, total, deterministic: the same
 * string always yields the same list. Ties break on knowledge-base order.
 * Returns only entries with a non-zero score; an empty query returns [].
 */
export function searchFaq(query: string): FaqHit[] {
  const q = normalizeText(query.slice(0, MAX_QUERY_LENGTH));
  if (q === '') return [];
  const words = wordsOf(q);

  const hits: (FaqHit & { order: number })[] = [];
  for (const ix of INDEX) {
    let score = 0;
    // A phrase match needs a phrase. A lone word that happens to sit inside a
    // question ("bayad" inside "Sino ang nagko-confirm na bayad na...") is a
    // word hit, not a phrase hit; letting it score as one would silence the
    // ambiguity guard and answer with whichever entry's wording contained it.
    const isPhrase = words.length >= PHRASE_MIN_WORDS && ix.question.includes(q);
    const containsWholeQuestion = q.includes(ix.question);
    if (isPhrase || containsWholeQuestion) score += PHRASE_IN_QUESTION;
    for (const w of words) {
      if (ix.keywordWords.has(w)) score += KEYWORD_HIT;
      if (ix.questionWords.has(w)) score += QUESTION_WORD_HIT;
      if (ix.categoryWords.has(w)) score += CATEGORY_WORD_HIT;
      if (ix.answerWords.has(w)) score += ANSWER_WORD_HIT;
    }
    if (score > 0) hits.push({ entry: ix.entry, score, order: ix.order });
  }

  hits.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.order - b.order));
  return hits.map(({ entry, score }) => ({ entry, score }));
}

/**
 * What the chat should do with a query. Four outcomes, none of them a
 * generated sentence:
 *
 *   empty      -> offer the fixed suggested questions
 *   none       -> the fixed no-match line
 *   ambiguous  -> several entries scored close together; offer them as
 *                 tappable fixed questions instead of blending them
 *   answer     -> one clear best entry, plus fixed related questions
 *
 * "Close together" means the runner-up scores more than half of the best.
 * That is what stops two keyword-level hits (say Cash vs QR Ph on "bayad")
 * being resolved by guesswork.
 */
export type FaqResolution =
  | { kind: 'empty'; suggested: FaqEntry[] }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidates: FaqEntry[] }
  | { kind: 'answer'; entry: FaqEntry; related: FaqEntry[] };

export function resolveFaq(query: string): FaqResolution {
  if (normalizeText(query) === '') return { kind: 'empty', suggested: suggestedEntries() };

  const hits = searchFaq(query);
  if (hits.length === 0 || hits[0].score < MIN_CONFIDENT_SCORE) return { kind: 'none' };

  const [best, second] = hits;
  if (second !== undefined && second.score * 2 > best.score) {
    return { kind: 'ambiguous', candidates: hits.slice(0, 4).map((h) => h.entry) };
  }
  return {
    kind: 'answer',
    entry: best.entry,
    related: hits
      .slice(1, 4)
      .filter((h) => h.score >= MIN_CONFIDENT_SCORE)
      .map((h) => h.entry),
  };
}

/** Entries for a quick topic, in knowledge-base order. Pure. */
export function entriesForCategories(categories: readonly FaqCategory[]): FaqEntry[] {
  const wanted = new Set(categories);
  return FAQ_ENTRIES.filter((e) => wanted.has(e.category));
}

/** The fixed suggestion list, resolved by id so a typo cannot drop one silently. */
export function suggestedEntries(): FaqEntry[] {
  return SUGGESTED_IDS.map((id) => FAQ_ENTRIES.find((e) => e.id === id)).filter(
    (e): e is FaqEntry => e !== undefined
  );
}

export function findFaqEntry(id: string): FaqEntry | undefined {
  return FAQ_ENTRIES.find((e) => e.id === id);
}
