const GERMAN_TO_ENGLISH_MEDICAL: Record<string, string> = {
  leber: 'liver',
  lunge: 'lung',
  niere: 'kidney',
  herz: 'heart',
  milz: 'spleen',
  pankreas: 'pancreas',
  gallenblase: 'gallbladder',
  magen: 'stomach',
  darm: 'intestine',
  gehirn: 'brain',
  wirbelsäule: 'spine',
  knochen: 'bone',
  gelenk: 'joint',
  schilddrüse: 'thyroid',
  nebenniere: 'adrenal',
  prostata: 'prostate',
  blase: 'bladder',
  gebärmutter: 'uterus',
  eierstock: 'ovary',
  zyste: 'cyst',
  tumor: 'tumor',
  läsion: 'lesion',
  masse: 'mass',
  raumforderung: 'mass',
  metastase: 'metastasis',
  lymphknoten: 'lymph node',
  aneurysma: 'aneurysm',
  stenose: 'stenosis',
  verschluss: 'occlusion',
  embolie: 'embolism',
  thrombose: 'thrombosis',
  blutung: 'hemorrhage',
  infarkt: 'infarction',
  entzündung: 'inflammation',
  abszess: 'abscess',
  fraktur: 'fracture',
  ruptur: 'rupture',
  verletzung: 'injury',
  trauma: 'trauma',
  nekrose: 'necrosis',
  fibrose: 'fibrosis',
  zirrhose: 'cirrhosis',
  dilatation: 'dilatation',
  hypertrophie: 'hypertrophy',
  atrophie: 'atrophy',
  infiltration: 'infiltration',
  verdichtung: 'consolidation',
  erguss: 'effusion',
  ödem: 'edema',
  verkalkung: 'calcification',
  verdacht: 'suspected',
  untersuchung: 'imaging',
  befund: 'finding',
  ct: 'CT',
  mrt: 'MRI',
  mri: 'MRI',
  röntgen: 'radiography',
  ultraschall: 'ultrasound',
  sonographie: 'ultrasound',
  angiographie: 'angiography',
  kontrastmittel: 'contrast',
};

const STOP_WORDS = new Set([
  'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'aber', 'mit', 'ohne',
  'bei', 'zu', 'im', 'am', 'ist', 'sind', 'war', 'waren', 'wird', 'werden',
  'von', 'dem', 'den', 'des', 'für', 'auf', 'an', 'in', 'als', 'nach',
  'vor', 'über', 'unter', 'durch', 'kann', 'hat', 'haben', 'keine', 'kein',
  'nicht', 'sich', 'auch', 'nur', 'noch', 'sehr', 'mehr', 'bzw', 'ca',
  'the', 'a', 'an', 'and', 'or', 'but', 'with', 'without', 'at', 'in', 'on',
  'is', 'are', 'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do',
  'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'can',
]);

export function buildPubMedQueryFromReport(
  befundText: string,
  beurteilungText: string,
  studyName?: string
): string {
  const fullText = `${befundText} ${beurteilungText}`.toLowerCase();

  const words = fullText
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\wäöüß\s-]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .filter(w => !STOP_WORDS.has(w))
    .filter(w => !/^\d+$/.test(w));

  const wordFreq: Record<string, number> = {};
  for (const word of words) {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  }

  const sortedWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 8);

  const translatedTerms: string[] = [];
  const untranslatedTerms: string[] = [];

  for (const word of sortedWords) {
    if (GERMAN_TO_ENGLISH_MEDICAL[word]) {
      translatedTerms.push(GERMAN_TO_ENGLISH_MEDICAL[word]);
    } else if (word.length > 3 && word.match(/^[a-z]/)) {
      untranslatedTerms.push(word);
    }
  }

  const modalityTerms: string[] = [];
  if (studyName) {
    const studyLower = studyName.toLowerCase();
    if (studyLower.includes('ct')) modalityTerms.push('CT');
    if (studyLower.includes('mrt') || studyLower.includes('mri')) modalityTerms.push('MRI');
    if (studyLower.includes('ultrasound') || studyLower.includes('sono')) modalityTerms.push('ultrasound');
    if (studyLower.includes('röntgen') || studyLower.includes('x-ray')) modalityTerms.push('radiography');
  }

  const queryTerms = [
    ...translatedTerms.slice(0, 4),
    ...modalityTerms,
    ...untranslatedTerms.slice(0, 2)
  ];

  if (queryTerms.length === 0) {
    return 'imaging findings';
  }

  const finalQuery = queryTerms.slice(0, 6).join(' ');
  return finalQuery;
}

export function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
