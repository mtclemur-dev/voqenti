export const SAFETY_SHOES_MODULE_ID = 'safety-shoes'
export const SAFETY_SHOES_VERSION = 1
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

export const lessonScreens = [
  { id: 'intro', type: 'intro' },
  {
    id: 'situations',
    type: 'situations',
    cards: [
      { id: 'heavy', art: 'heavyObject', titleKey: 'shoeSitHeavyTitle', bodyKey: 'shoeSitHeavyBody', dangerKey: 'shoeSitHeavyDanger', measureKey: 'shoeSitHeavyMeasure' },
      { id: 'nail', art: 'nailFloor', titleKey: 'shoeSitNailTitle', bodyKey: 'shoeSitNailBody', dangerKey: 'shoeSitNailDanger', measureKey: 'shoeSitNailMeasure' },
      { id: 'wet', art: 'wetFloor', titleKey: 'shoeSitWetTitle', bodyKey: 'shoeSitWetBody', dangerKey: 'shoeSitWetDanger', measureKey: 'shoeSitWetMeasure' },
      { id: 'chem', art: 'chemicals', titleKey: 'shoeSitChemTitle', bodyKey: 'shoeSitChemBody', dangerKey: 'shoeSitChemDanger', measureKey: 'shoeSitChemMeasure' },
      { id: 'site', art: 'siteDebris', titleKey: 'shoeSitSiteTitle', bodyKey: 'shoeSitSiteBody', dangerKey: 'shoeSitSiteDanger', measureKey: 'shoeSitSiteMeasure' },
    ],
  },
  {
    id: 'compare',
    type: 'compare',
    items: [
      { id: 'casual', art: 'shoeCasual', titleKey: 'shoeCompareCasualTitle', bodyKey: 'shoeCompareCasualBody' },
      { id: 'grip', art: 'shoeGrip', titleKey: 'shoeCompareGripTitle', bodyKey: 'shoeCompareGripBody' },
      { id: 'protect', art: 'shoeProtect', titleKey: 'shoeCompareProtectTitle', bodyKey: 'shoeCompareProtectBody' },
    ],
  },
  {
    id: 'choose',
    type: 'choose',
    correctId: 'grip',
    options: [
      { id: 'casual', art: 'shoeCasual', labelKey: 'shoeChooseCasual', explainKey: 'shoeChooseCasualExplain' },
      { id: 'worn', art: 'shoeWorn', labelKey: 'shoeChooseWorn', explainKey: 'shoeChooseWornExplain' },
      { id: 'grip', art: 'shoeGrip', labelKey: 'shoeChooseGrip', explainKey: 'shoeChooseGripExplain' },
    ],
  },
  {
    id: 'checklist',
    type: 'checklist',
    items: [
      { id: 'sole', key: 'shoeCheckSole' },
      { id: 'tread', key: 'shoeCheckTread' },
      { id: 'front', key: 'shoeCheckFront' },
      { id: 'fasten', key: 'shoeCheckFasten' },
      { id: 'dry', key: 'shoeCheckDry' },
      { id: 'fit', key: 'shoeCheckFit' },
      { id: 'report', key: 'shoeCheckReport' },
    ],
  },
  {
    id: 'quiz',
    type: 'quiz',
    questions: [
      {
        id: 'risk',
        promptKey: 'shoeQuizRisk',
        correctId: 'depends',
        options: [
          { id: 'always', labelKey: 'shoeQuizRiskAlways' },
          { id: 'depends', labelKey: 'shoeQuizRiskDepends' },
          { id: 'any', labelKey: 'shoeQuizRiskAny' },
        ],
        explainKey: 'shoeQuizRiskExplain',
      },
      {
        id: 'sole',
        promptKey: 'shoeQuizSole',
        correctId: 'stop',
        options: [
          { id: 'tape', labelKey: 'shoeQuizSoleTape' },
          { id: 'stop', labelKey: 'shoeQuizSoleStop' },
          { id: 'ignore', labelKey: 'shoeQuizSoleIgnore' },
        ],
        explainKey: 'shoeQuizSoleExplain',
      },
      {
        id: 'missing',
        promptKey: 'shoeQuizMissing',
        correctId: 'inform',
        options: [
          { id: 'start', labelKey: 'shoeQuizMissingStart' },
          { id: 'inform', labelKey: 'shoeQuizMissingInform' },
          { id: 'borrow', labelKey: 'shoeQuizMissingBorrow' },
        ],
        explainKey: 'shoeQuizMissingExplain',
      },
      {
        id: 'chem',
        promptKey: 'shoeQuizChem',
        correctId: 'docs',
        options: [
          { id: 'anyboot', labelKey: 'shoeQuizChemAny' },
          { id: 'docs', labelKey: 'shoeQuizChemDocs' },
          { id: 'color', labelKey: 'shoeQuizChemColor' },
        ],
        explainKey: 'shoeQuizChemExplain',
      },
    ],
  },
  { id: 'result', type: 'result' },
]
