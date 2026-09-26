export const SAFETY_SHOES_MODULE_ID = 'safety-shoes'
export const SAFETY_SHOES_VERSION = 2
export const SAFETY_SHOES_STORAGE_KEY = 'voqenti-lesson-safety-shoes'

export function isSafetyShoeLessonDone() {
  try {
    return window.localStorage.getItem(SAFETY_SHOES_STORAGE_KEY) === 'done'
  } catch {
    return false
  }
}

export function markSafetyShoeLessonDone() {
  try {
    window.localStorage.setItem(SAFETY_SHOES_STORAGE_KEY, 'done')
    return true
  } catch {
    return false
  }
}

export const lessonSources = [
  { id: 'dguv', href: 'https://publikationen.dguv.de/regelwerk/dguv-regeln/961/benutzung-von-fuss-und-knieschutz', labelKey: 'shoeSourceDguv' },
  { id: 'arb5', href: 'https://www.gesetze-im-internet.de/arbschg/__5.html', labelKey: 'shoeSourceArb5' },
  { id: 'arb15', href: 'https://www.gesetze-im-internet.de/arbschg/__15.html', labelKey: 'shoeSourceArb15' },
  { id: 'psa2', href: 'https://www.gesetze-im-internet.de/psa-bv/__2.html', labelKey: 'shoeSourcePsa2' },
  { id: 'psa3', href: 'https://www.gesetze-im-internet.de/psa-bv/__3.html', labelKey: 'shoeSourcePsa3' },
  { id: 'intro', href: 'https://www.arbeitsbedarf24.de/blog-arbeitsschutz-sicherheitsschuhe', labelKey: 'shoeSourceIntro' },
]

export const lessonScreens = [
  { id: 'intro', type: 'intro', titleKey: 'shoeLessonTitle' },
  {
    id: 'why',
    type: 'why',
    titleKey: 'shoeWhyTitle',
    cards: [
      { id: 'fall', art: 'hazardFall', titleKey: 'shoeWhyFallTitle', exampleKey: 'shoeWhyFallExample', protectKey: 'shoeWhyFallProtect' },
      { id: 'crush', art: 'hazardCrush', titleKey: 'shoeWhyCrushTitle', exampleKey: 'shoeWhyCrushExample', protectKey: 'shoeWhyCrushProtect' },
      { id: 'sharp', art: 'hazardSharp', titleKey: 'shoeWhySharpTitle', exampleKey: 'shoeWhySharpExample', protectKey: 'shoeWhySharpProtect' },
      { id: 'slip', art: 'hazardSlip', titleKey: 'shoeWhySlipTitle', exampleKey: 'shoeWhySlipExample', protectKey: 'shoeWhySlipProtect' },
      { id: 'chem', art: 'hazardChem', titleKey: 'shoeWhyChemTitle', exampleKey: 'shoeWhyChemExample', protectKey: 'shoeWhyChemProtect' },
      { id: 'temp', art: 'hazardTemp', titleKey: 'shoeWhyTempTitle', exampleKey: 'shoeWhyTempExample', protectKey: 'shoeWhyTempProtect' },
    ],
  },
  {
    id: 'who',
    type: 'who',
    titleKey: 'shoeWhoTitle',
    cards: [
      { id: 'employer', art: 'roleEmployer', titleKey: 'shoeWhoEmployerTitle', points: ['shoeWhoEmployer1', 'shoeWhoEmployer2', 'shoeWhoEmployer3', 'shoeWhoEmployer4'] },
      { id: 'worker', art: 'roleWorker', titleKey: 'shoeWhoWorkerTitle', points: ['shoeWhoWorker1', 'shoeWhoWorker2', 'shoeWhoWorker3'] },
    ],
  },
  {
    id: 'marks',
    type: 'marks',
    titleKey: 'shoeMarkTitle',
    basics: [
      { code: 'S', key: 'shoeMarkS' },
      { code: 'P', key: 'shoeMarkP' },
      { code: 'O', key: 'shoeMarkO' },
    ],
    extra: [
      { code: 'S1', key: 'shoeMarkS1' },
      { code: 'S2', key: 'shoeMarkS2' },
      { code: 'S3 / S3L / S3S', key: 'shoeMarkS3' },
      { code: 'S6', key: 'shoeMarkS6' },
      { code: 'S7 / S7L / S7S', key: 'shoeMarkS7' },
      { code: 'SR', key: 'shoeMarkSR' },
      { code: 'WR', key: 'shoeMarkWR' },
      { code: 'FO', key: 'shoeMarkFO' },
      { code: 'CI', key: 'shoeMarkCI' },
      { code: 'HI', key: 'shoeMarkHI' },
    ],
  },
  {
    id: 'examples',
    type: 'examples',
    titleKey: 'shoeExTitle',
    cards: [
      { id: 'indoor', art: 'sceneIndoor', titleKey: 'shoeExIndoorTitle', riskKey: 'shoeExIndoorRisk', pointKey: 'shoeExIndoorPoint' },
      { id: 'water', art: 'sceneWater', titleKey: 'shoeExWaterTitle', riskKey: 'shoeExWaterRisk', pointKey: 'shoeExWaterPoint' },
      { id: 'site', art: 'sceneSite', titleKey: 'shoeExSiteTitle', riskKey: 'shoeExSiteRisk', pointKey: 'shoeExSitePoint' },
      { id: 'industry', art: 'sceneIndustry', titleKey: 'shoeExIndustryTitle', riskKey: 'shoeExIndustryRisk', pointKey: 'shoeExIndustryPoint' },
      { id: 'lab', art: 'sceneLab', titleKey: 'shoeExLabTitle', riskKey: 'shoeExLabRisk', pointKey: 'shoeExLabPoint' },
      { id: 'winter', art: 'sceneWinter', titleKey: 'shoeExWinterTitle', riskKey: 'shoeExWinterRisk', pointKey: 'shoeExWinterPoint' },
    ],
  },
  {
    id: 'inspect',
    type: 'inspect',
    titleKey: 'shoeLookTitle',
    checks: [
      'shoeLookSole',
      'shoeLookSeam',
      'shoeLookCrack',
      'shoeLookTread',
      'shoeLookClose',
      'shoeLookInside',
      'shoeLookShape',
      'shoeLookDirt',
      'shoeLookMark',
    ],
    options: [
      { id: 'good', art: 'shoeGood', labelKey: 'shoeLookGood', explainKey: 'shoeLookGoodExplain', ok: false },
      { id: 'loose', art: 'shoeLoose', labelKey: 'shoeLookLoose', explainKey: 'shoeLookLooseExplain', ok: true },
      { id: 'worn', art: 'shoeWorn', labelKey: 'shoeLookWorn', explainKey: 'shoeLookWornExplain', ok: true },
    ],
  },
  {
    id: 'care',
    type: 'care',
    titleKey: 'shoeCareTitle',
    rules: [
      'shoeCare1',
      'shoeCare2',
      'shoeCare3',
      'shoeCare4',
      'shoeCare5',
      'shoeCare6',
      'shoeCare7',
      'shoeCare8',
      'shoeCare9',
    ],
  },
  {
    id: 'unfit',
    type: 'unfit',
    titleKey: 'shoeUnfitTitle',
    cases: [
      'shoeUnfitSmall',
      'shoeUnfitSlip',
      'shoeUnfitDamaged',
      'shoeUnfitMissing',
    ],
  },
  {
    id: 'quiz',
    type: 'quiz',
    titleKey: 'shoeQuizTitle',
    questions: [
      {
        id: 'who',
        promptKey: 'shoeQuizWho',
        correctId: 'employer',
        explainKey: 'shoeQuizWhoExplain',
        options: [
          { id: 'fashion', labelKey: 'shoeQuizWhoFashion' },
          { id: 'employer', labelKey: 'shoeQuizWhoEmployer' },
          { id: 'self', labelKey: 'shoeQuizWhoSelf' },
        ],
      },
      {
        id: 'chem',
        promptKey: 'shoeQuizChem',
        correctId: 'no',
        explainKey: 'shoeQuizChemExplain',
        options: [
          { id: 'yes', labelKey: 'shoeQuizChemYes' },
          { id: 'no', labelKey: 'shoeQuizChemNo' },
          { id: 'color', labelKey: 'shoeQuizChemColor' },
        ],
      },
      {
        id: 'sole',
        promptKey: 'shoeQuizSole',
        correctId: 'stop',
        explainKey: 'shoeQuizSoleExplain',
        options: [
          { id: 'tape', labelKey: 'shoeQuizSoleTape' },
          { id: 'stop', labelKey: 'shoeQuizSoleStop' },
          { id: 'ignore', labelKey: 'shoeQuizSoleIgnore' },
        ],
      },
      {
        id: 'wet',
        promptKey: 'shoeQuizWet',
        correctId: 'grip',
        explainKey: 'shoeQuizWetExplain',
        options: [
          { id: 'color', labelKey: 'shoeQuizWetColor' },
          { id: 'grip', labelKey: 'shoeQuizWetGrip' },
          { id: 'speed', labelKey: 'shoeQuizWetSpeed' },
        ],
      },
      {
        id: 'sport',
        promptKey: 'shoeQuizSport',
        correctId: 'no',
        explainKey: 'shoeQuizSportExplain',
        options: [
          { id: 'yes', labelKey: 'shoeQuizSportYes' },
          { id: 'no', labelKey: 'shoeQuizSportNo' },
          { id: 'later', labelKey: 'shoeQuizSportLater' },
        ],
      },
    ],
  },
  {
    id: 'summary',
    type: 'summary',
    titleKey: 'shoeSummaryTitle',
    rules: ['shoeRule1', 'shoeRule2', 'shoeRule3', 'shoeRule4', 'shoeRule5'],
  },
]
