// 조각로그 v1.9.0 · 화면 기능과 DOM 이벤트
// 개조 길잡이: ui-*.js는 기능 구현, 이 파일의 create...({...})는 기능 연결 목록.
// 데이터 읽기 createSettingsReader · 작업 수집/복원 collectWork/applyWorkState · 상세 안내 MODDING.md.
// Private feature closures share only their exported operations. App commands are injected at startup.
globalThis.MosaicUI = (() => {
'use strict';
// 부품은 먼저 생성 함수만 등록한다. 여기서 등록 목록을 고정하고 필요한 함수를 연결한다.
const parts = Object.freeze(globalThis.MosaicUIParts);
const {createSourceMapping,createPreviewSourceEdits} = parts.source;
const {createCardEditors,createFullscreenEditor} = parts.editor;
const {createPreviewInteractions} = parts.previewEdit;
const {createPreviewLayout,createPreviewSearch,createMobilePanelNavigation} = parts.previewView;
const {createCredit,createLibrary} = parts.library;

// DEFAULT_STYLE is the single source for fresh controls and design resets.
// Run before feature setup; restoring a draft later keeps its saved values.
function initializeStyleDefaults(root){
  for(const [id,value] of Object.entries(MosaicState.DEFAULT_STYLE)){
    const input = root.getElementById(id);
    if(!input) throw new Error('Missing style control: ' + id);
    if(input.type === 'checkbox'){
      input.defaultChecked = Boolean(value);
      input.checked = Boolean(value);
    }else if(input.tagName === 'SELECT'){
      for(const option of input.options) option.defaultSelected = option.value === String(value);
      input.value = value;
    }else{
      input.defaultValue = value;
      input.value = value;
    }
    for(const suffix of ['Val','Hex']){
      const mirror = root.getElementById(id + suffix);
      if(mirror?.tagName === 'INPUT'){
        mirror.defaultValue = input.value;
        mirror.value = input.value;
      }
    }
  }
}
initializeStyleDefaults(document);
// 새 라벨의 초기값도 저장·복원과 같은 작업 기본값을 사용한다.
for(const id of ['profileRelationshipHeading','profileSituationHeading']){
  const input = document.getElementById(id);
  input.defaultValue = MosaicState.WORK_FIELD_DEFAULTS[id];
  input.value = input.defaultValue;
}

let appCommands = null;
let initialized = false;

// One reader owns control-to-output settings and stored work fields; it never renders or writes controls.
function createSettingsReader(host){
function readControlValues(ids, root = host.root){
  return Object.fromEntries(ids.map(id => [id, root.getElementById(id).value]));
}

function readControlBooleans(ids, root = host.root){
  return Object.fromEntries(ids.map(id => [id, root.getElementById(id).checked]));
}

// 출력 설정 읽기는 상태 스키마와 같은 책임으로 묶는다.

// Output settings are read here; app.js consumes the resulting settings object.
function getSettings(){
  const textFont = host.root.getElementById('textFont').value;
  const advancedOn = host.root.getElementById('advancedOn').checked;
  const coverImageStatus = host.root.getElementById('imageLoadStatus');
  const currentExtraProfileCount = extraProfileCount();
  return {
    imgOn: host.root.getElementById('imgOn').checked,
    imgUrl: host.root.getElementById('imgUrl').value.trim(),
    // URL은 저장·복원용 원본으로 그대로 남기고, 현재 검사 실패 여부만 렌더 모델에
    // 일시적으로 전달한다. 이 값은 초안이나 내보낸 복원 데이터에는 저장하지 않는다.
    coverImageLoadFailed:Boolean(coverImageStatus && coverImageStatus.dataset.state === 'error'),
    imgHeight: host.root.getElementById('imgHeight').value,
    xpos: host.root.getElementById('xpos').value,
    ypos: host.root.getElementById('ypos').value,
    narrFont: textFont,
    narrSize: host.root.getElementById('narrSize').value,
    narrLine: host.root.getElementById('narrLine').value,
    narrColor: host.root.getElementById('narrColor').value,
    dlgStyle: host.root.getElementById('dlgStyle').value,
    dlgFont: textFont,
    dlgSize: host.root.getElementById('dlgSize').value,
    dlgLine: host.root.getElementById('dlgLine').value,
    titleSize: host.root.getElementById('titleSize').value,
    titleBold: host.root.getElementById('titleBold').checked,
    foldTitleSize: host.root.getElementById('foldTitleSize').value,
    foldTitleBold: host.root.getElementById('foldTitleBold').checked,
    foldTitleMinimal: !host.root.getElementById('foldTitleDecorationOn').checked,
    foldDividerMinimal: !host.root.getElementById('foldDividerOn').checked,
    foldTitleAutoNumber: host.root.getElementById('foldTitleAutoNumber').checked,
    charColor: host.root.getElementById('charColor').value,
    userColor: host.root.getElementById('userColor').value,
    emphasisColor: host.root.getElementById('emphasisColor').value,
    parallelTranslationSoft: host.root.getElementById('parallelTranslationLayout').value !== 'off' && host.root.getElementById('parallelDialogueOn').checked,
    parallelDialogueOn:host.root.getElementById('parallelDialogueOn').checked,
    parallelNarrationOn:host.root.getElementById('parallelNarrationOn').checked,
    parallelTranslationLayout: host.root.getElementById('parallelTranslationLayout').value,
    parallelTranslationOrder: host.root.getElementById('parallelTranslationOrder').value === 'translation' ? 'translation' : 'original',
    parallelTranslationBrackets: host.root.getElementById('parallelTranslationBrackets').value === 'hide' ? 'hide' : 'show',
    charSpeakerOn: host.root.getElementById('charSpeakerOn').checked,
    userSpeakerOn: host.root.getElementById('userSpeakerOn').checked,
    extraChars: host.readExtraChars(),
    charName: host.root.getElementById('charName').value,
    userName: host.root.getElementById('userName').value,
    nameRules: MosaicState.normalizeOutputRules(host.root.getElementById('nameRules').value, 'name'),
    keywordRules: MosaicState.normalizeOutputRules(host.root.getElementById('keywordRules').value),
    footerOn: host.root.getElementById('footerOn').checked,
    footerAuthor: host.root.getElementById('footerAuthor').value,
    creditOn: host.root.getElementById('creditOn').checked,
    creditPlacement: MosaicState.normalizeCreditPlacement(host.root.getElementById('creditPlacement').value),
    creditItems: host.readCreditItems(),
    logTitleOn: host.root.getElementById('logTitleOn').checked,
    titleMinimal: host.root.getElementById('titleMinimal').checked,
    titleImageBackgroundOn: host.root.getElementById('titleImageBackgroundOn').checked,
    titleTextPosition: host.root.getElementById('titleTextPosition').value,
    logNumber: host.root.getElementById('logNumber').value,
    logTitle: host.root.getElementById('logTitle').value,
    subChar: host.root.getElementById('subChar').value,
    subUser: host.root.getElementById('subUser').value,
    subtitleCoupleSeparator: MosaicState.normalizeSubtitleCoupleSeparator(host.root.getElementById('subtitleCoupleSeparator').value),
    logSubtitle: host.root.getElementById('logSubtitle').value,
    profileOn: host.root.getElementById('profileOn').checked,
    profileDividerMinimal: host.root.getElementById('profileDividerMinimal').checked,
    profileCharOn: host.root.getElementById('profileCharOn').checked,
    profileUserOn: host.root.getElementById('profileUserOn').checked,
    profileRelationshipOn: host.root.getElementById('profileRelationshipOn').checked,
    profileSituationOn: host.root.getElementById('profileSituationOn').checked,
    profilePlacement: host.root.getElementById('profilePlacement').value,
    profileTextPosition: host.root.getElementById('profileTextPosition').value,
    profileStyle: host.root.getElementById('profileStyle').value,
    profileOrder: host.root.getElementById('profileOrder').value,
    profileEntityOrder: MosaicState.normalizeProfileEntityOrder(
      host.root.getElementById('profileEntityOrder').value,
      currentExtraProfileCount,
      host.root.getElementById('profileOrder').value
    ),
    profileExtraCount: currentExtraProfileCount,
    profileExtras: MosaicState.EXTRA_PROFILE_SLOTS.filter(slot => slot <= currentExtraProfileCount + 2).map(slot => {
      const prefix = MosaicState.extraProfilePrefix(slot);
      const read = field => host.root.getElementById(prefix + field).value;
      return { key:`extra${slot}`, prefix, enabled:host.root.getElementById(prefix + 'On').checked,
        role:read('Role'), image:MosaicState.normalizeProtocolRelativeUrl(read('Image')),
        imageFailed:host.root.getElementById(prefix + 'ImageStatus')?.dataset?.state === 'error',
        scale:read('Scale'), x:read('X'), y:read('Y'),
        name:read('Name'), desc:read('Desc'), tags:read('Tags') };
    }),
    profileImageBackgroundOn: host.root.getElementById('profileImageBackgroundOn').checked,
    profileCharRole: host.root.getElementById('profileCharRole').value,
    profileCharImage: MosaicState.normalizeProtocolRelativeUrl(host.root.getElementById('profileCharImage').value),
    profileCharImageFailed: host.root.getElementById('profileCharImageStatus')?.dataset?.state === 'error',
    profileCharScale: host.root.getElementById('profileCharScale').value,
    profileCharX: host.root.getElementById('profileCharX').value,
    profileCharY: host.root.getElementById('profileCharY').value,
    profileCharName: host.root.getElementById('profileCharName').value,
    profileCharDesc: host.root.getElementById('profileCharDesc').value,
    profileCharTags: host.root.getElementById('profileCharTags').value,
    profileUserRole: host.root.getElementById('profileUserRole').value,
    profileUserImage: MosaicState.normalizeProtocolRelativeUrl(host.root.getElementById('profileUserImage').value),
    profileUserImageFailed: host.root.getElementById('profileUserImageStatus')?.dataset?.state === 'error',
    profileUserScale: host.root.getElementById('profileUserScale').value,
    profileUserX: host.root.getElementById('profileUserX').value,
    profileUserY: host.root.getElementById('profileUserY').value,
    profileUserName: host.root.getElementById('profileUserName').value,
    profileUserDesc: host.root.getElementById('profileUserDesc').value,
    profileUserTags: host.root.getElementById('profileUserTags').value,
    profileRelationshipHeading: host.root.getElementById('profileRelationshipHeading').value,
    profileRelationship: host.root.getElementById('profileRelationship').value,
    profileSituationHeading: host.root.getElementById('profileSituationHeading').value,
    profileSituation: host.root.getElementById('profileSituation').value,
    paragraphGap: host.root.getElementById('paragraphGap').value,
    narrDialogueGap: host.root.getElementById('narrDialogueGap').value,
    softBreakSpacing: MosaicState.normalizeSoftBreakSpacing(host.root.getElementById('softBreakSpacing').value),
    outputTheme: host.root.getElementById('outputTheme').value,
    cardLayout: MosaicState.normalizeCardLayout(host.root.getElementById('cardLayout').value),
    spacingMode: host.root.getElementById('spacingMode').value,
    cardWidth: host.root.getElementById('cardWidth').value,
    cardBorderOn: host.root.getElementById('cardBorderOn').checked,
    bgColor: host.root.getElementById('bgColor').value,
    advancedOn,
    hrShape: advancedOn ? host.root.getElementById('hrShape').value : 'solid',
    hrOpacity: advancedOn ? host.root.getElementById('hrOpacity').value : MosaicState.DEFAULT_STYLE.hrOpacity,
    hrLength: advancedOn ? host.root.getElementById('hrLength').value : '100',
    hrVerticalSpace: advancedOn ? host.root.getElementById('hrVerticalSpace').value : '26',
    hr2Shape: advancedOn ? host.root.getElementById('hr2Shape').value : 'star',
    hr2Opacity: advancedOn ? host.root.getElementById('hr2Opacity').value : '50',
    hr2VerticalSpace: advancedOn ? host.root.getElementById('hr2VerticalSpace').value : '48',
    hr3Shape: advancedOn ? host.root.getElementById('hr3Shape').value : 'dots',
    hr3Opacity: advancedOn ? host.root.getElementById('hr3Opacity').value : MosaicState.DEFAULT_STYLE.hr3Opacity,
    hr3VerticalSpace: advancedOn ? host.root.getElementById('hr3VerticalSpace').value : '36',
    gapHeight: advancedOn ? host.root.getElementById('gapHeight').value : '48',
    coverVerticalSpace: advancedOn ? host.root.getElementById('coverVerticalSpace').value : '0',
    profileOuterBackground: advancedOn && host.root.getElementById('profilePlacement').value === 'top'
      ? host.root.getElementById('profileOuterBackground').value : 'filled',
    profileItemGap: advancedOn && host.root.getElementById('profilePlacement').value === 'top'
      ? host.root.getElementById('profileItemGap').value : '0',
    profileTitleGap: advancedOn ? host.root.getElementById('profileTitleGap').value : '0',
    coverCardGap: advancedOn ? host.root.getElementById('coverCardGap').value : '0',
    cardGap: advancedOn ? host.root.getElementById('cardGap').value : '20',
    unifiedBottomSpace: advancedOn ? host.root.getElementById('unifiedBottomSpace').value : '0',
    creditWidth: advancedOn ? host.root.getElementById('creditWidth').value : '380',
    creditCardGap: advancedOn ? host.root.getElementById('creditCardGap').value : '40',
    cardInlinePadding: advancedOn ? host.root.getElementById('cardInlinePadding').value : '22',
    cardBodyTopSpace: advancedOn ? host.root.getElementById('cardBodyTopSpace').value : '0',
    cardBodyBottomSpace: advancedOn ? host.root.getElementById('cardBodyBottomSpace').value : '0',
    footerBodyGap: advancedOn ? host.root.getElementById('footerBodyGap').value : '0',
    headingTopSpace: advancedOn ? host.root.getElementById('headingTopSpace').value : '0',
    headingBetweenSpace: advancedOn ? host.root.getElementById('headingBetweenSpace').value : '0',
    headingBottomSpace: advancedOn ? host.root.getElementById('headingBottomSpace').value : '0',
    cardTitlePadding: advancedOn ? host.root.getElementById('cardTitlePadding').value : '26',
    coverDividerLength: advancedOn ? host.root.getElementById('coverDividerLength').value : '100',
    cardDividerLength: advancedOn ? host.root.getElementById('cardDividerLength').value : '100',
    cardCornerRadius: advancedOn ? host.root.getElementById('cardCornerRadius').value : '16',
    cardTitleOrnamentOpacity: advancedOn && host.root.getElementById('foldTitleDecorationOn').checked
      ? host.root.getElementById('cardTitleOrnamentOpacity').value : '50',
    foldAutoNumberStyle: advancedOn && host.root.getElementById('foldTitleAutoNumber').checked
      ? host.root.getElementById('foldAutoNumberStyle').value : MosaicState.DEFAULT_STYLE.foldAutoNumberStyle,
    creditBorderOn: advancedOn && host.root.getElementById('creditBorderOn').checked,
    creditTransparentOn: advancedOn && host.root.getElementById('creditTransparentOn').checked,
    narrIndent: host.root.getElementById('narrIndent').checked,
    narrCenter: host.root.getElementById('narrCenter').checked,
    headingCenter: host.root.getElementById('headingCenter').checked,
    dialogueCenter: host.root.getElementById('dialogueCenter').checked,
    memoCenter: host.root.getElementById('memoCenter').checked,
    quoteCenter: host.root.getElementById('quoteCenter').checked,
    bodyFoldTitleCenter: host.root.getElementById('bodyFoldTitleCenter').checked,
    commentWidth: MosaicState.normalizeCommentWidth(host.root.getElementById('commentWidth').value),
    commentAlign: MosaicState.normalizeCommentAlign(host.root.getElementById('commentAlign').value),
  };
}

const extraProfileCount = () => Math.max(0, Math.min(3, Math.floor(Number(host.root.getElementById('profileExtraCount').value) || 0)));

// 저장용 원본은 trim/정규화하지 않는다. 출력용 getSettings()와 구분한다.
// 초안과 작업/보관함은 이 수집 결과를 각자의 기존 형식으로 배치한다.
function collectDraftFields(){
  return {
    fields:readControlValues(MosaicState.DRAFT_FIELDS),
    booleans:readControlBooleans(MosaicState.WORK_BOOLEAN_FIELDS)
  };
}

function collectWorkFields(){
  const {fields, booleans} = collectDraftFields();
  return {...fields, ...booleans};
}

function currentStyleValues(){
  return Object.fromEntries(MosaicState.STYLE_FIELDS.map(id => {
    const input = host.root.getElementById(id);
    return [id, input.type === 'checkbox' ? input.checked : input.value];
  }));
}
return Object.freeze({
collectDraftFields,
collectWorkFields,
currentStyleValues,
extraProfileCount,
getSettings
});
}


// Control synchronization owns change keys and character-list reentry; render position does not share its state.
function createControlSync(host){
// DOM 자체가 아니라 기능별 입력값만 기억한다. 외부 복원은 전체 무효화하고,
// 갱신 과정에서 값이 정규화되면 정규화 뒤의 값을 기준으로 다음 갱신을 판단한다.
function invalidateControlSync(){ uiControlSyncState.keys.clear(); }

function syncPreviewPalette(){
  syncUIControlsWhenChanged('palette', () => uiControlValues([
    'narrColor','charColor','userColor','emphasisColor','bgColor','dlgStyle'
  ]), host.renderThemePalette);
}

const uiControlSyncState = { keys:new Map(), syncingCharacters:false };

function uiControlValues(ids){
  return ids.map(id => {
    const input = document.getElementById(id);
    return [input.value, input.checked];
  });
}

function syncUIControlsWhenChanged(name, readValues, sync){
  const key = JSON.stringify(readValues());
  if(uiControlSyncState.keys.get(name) === key) return;
  sync();
  uiControlSyncState.keys.set(name, JSON.stringify(readValues()));
}

function profileControlPresence(){
  return ['profileChar','profileUser',...MosaicState.EXTRA_PROFILE_SLOTS.map(MosaicState.extraProfilePrefix)].map(prefix => [
    document.getElementById(`${prefix}On`).checked,
    ...['Image','Name','Desc','Tags'].map(field => Boolean(document.getElementById(prefix + field).value.trim()))
  ]);
}

// 출력 설정을 읽기 전에 관련 값이 바뀐 컨트롤 묶음만 동기화한다.
function syncRenderInputs(cards){
  syncUIControlsWhenChanged('image-background', () => uiControlValues([
    'imgUrl','imgOn','titleImageBackgroundOn','profileImageBackgroundOn','profileExtraCount',
    'profileCharImage','profileUserImage',...MosaicState.EXTRA_PROFILE_SLOTS.map(slot => `profileExtra${slot}Image`)
  ]), host.syncImageBackgroundToggleAvailability);
  syncUIControlsWhenChanged('ranges', () => [
    uiControlValues([...MosaicState.STYLE_FIELDS,...host.COVER_IMAGE_RANGE_IDS,...host.PROFILE_IMAGE_RANGE_IDS,'profileStyle','profileExtraCount','profileImageBackgroundOn']),
    profileControlPresence(), document.activeElement?.id
  ], () => {
    syncTypographyRangeLabels();
    syncCoverRangeProgress();
  });
  const usedHr = [...usedHrTypes(cards)].sort();
  syncUIControlsWhenChanged('hr', () => [usedHr, document.getElementById('advancedOn').checked],
    () => syncHrControlAvailability(cards));
  syncUIControlsWhenChanged('design', () => [
    uiControlValues([...MosaicState.STYLE_FIELDS,...MosaicState.WORK_BOOLEAN_FIELDS,
      'imgHeight','profilePlacement','profileStyle','profileExtraCount','footerAuthor','creditItems','creditPlacement']),
    profileControlPresence(), usedHr
  ], host.syncDesignSummaries);
  syncUIControlsWhenChanged('preview-style', () => uiControlValues(['cardLayout','cardBorderOn']),
    host.syncPreviewCardStyles);
  syncUIControlsWhenChanged('paragraph', () => [
    uiControlValues(['narrIndent','commentWidth','commentAlign']),
    host.hasMarkdownCardContent(), host.hasMemoCardContent(), host.hasQuoteCardContent(), host.hasBodyFoldTitleContent(),
    Boolean(document.querySelector('#cardEditors .commentEditor'))
  ], host.syncParagraphSettingsUI);
  // 본문에 새 [이름] 마커가 생기면 인물 목록을 자동 갱신 (재진입 방지)
  if(!uiControlSyncState.syncingCharacters){
    uiControlSyncState.syncingCharacters = true;
    try {
      syncUIControlsWhenChanged('characters', () => [
        cards.filter(card => card.type !== 'comment' && card.visible !== false).map(card => card.body),
        uiControlValues(['extraChars','narrColor'])
      ], host.syncCharacterList);
    } finally { uiControlSyncState.syncingCharacters = false; }
  }
}
function syncCardLayoutCheckbox(){
  const select = document.getElementById('cardLayout');
  const checkbox = document.getElementById('cardLayoutUnifiedOn');
  if(!select || !checkbox) return;
  checkbox.checked = MosaicState.normalizeCardLayout(select.value) === 'unified';
}

function profileItemGapBasePx(){
  const profileStyle = document.getElementById('profileStyle').value;
  const photoBackgroundOn = document.getElementById('profileImageBackgroundOn').checked;
  if(profileStyle !== 'showcase') return 10;
  const prefixes = ['profileChar','profileUser',
    ...MosaicState.EXTRA_PROFILE_SLOTS.filter(slot => slot <= host.extraProfileCount() + 2).map(MosaicState.extraProfilePrefix)];
  const visible = prefixes.filter(prefix => document.getElementById(`${prefix}On`).checked
    && (document.getElementById(`${prefix}Image`).value.trim()
      || ['Name','Desc','Tags'].some(field => document.getElementById(`${prefix}${field}`).value.trim())));
  const everyPhoto = visible.length > 0 && photoBackgroundOn && visible.every(prefix =>
    document.getElementById(`${prefix}Image`).value.trim());
  return everyPhoto ? 0 : 2;
}

function syncSoftBreakSpacingControl(){
  const range = document.getElementById('softBreakSpacing');
  const output = document.getElementById('softBreakSpacingVal');
  if(!range || !output) return;
  const mode = MosaicState.normalizeSoftBreakSpacing(range.value);
  const labels = { normal:'기본', relaxed:'여유', wide:'넓게' };
  output.textContent = labels[mode];
  range.setAttribute('aria-valuetext', labels[mode]);
}

const HR_CONTROL_IDS = {
  hr:['hrShape','hrOpacity','hrOpacityVal','hrLength','hrLengthVal','hrVerticalSpace','hrVerticalSpaceVal','hrResetBtn'],
  hr2:['hr2Shape','hr2Opacity','hr2OpacityVal','hr2VerticalSpace','hr2VerticalSpaceVal','hr2ResetBtn'],
  hr3:['hr3Shape','hr3Opacity','hr3OpacityVal','hr3VerticalSpace','hr3VerticalSpaceVal','hr3ResetBtn'],
  hr4:['gapHeight','gapHeightVal','hr4ResetBtn']
};

function isHrControlGroup(type){ return Boolean(HR_CONTROL_IDS[type]); }

function usedHrTypes(cards){
  const used = new Set();
  cards.filter(card => card.type === 'card').forEach(card => {
    MosaicParser.normalizeBodyHrMarkers(card.body).split('\n').forEach(line => {
      const token = line.trim().toUpperCase();
      const type = token === '[GAP]' ? 'hr4' : token.slice(1, -1).toLowerCase();
      if(token.startsWith('[') && token.endsWith(']') && HR_CONTROL_IDS[type]) used.add(type);
    });
  });
  return used;
}

function syncHrControlAvailability(cards = host.readCards()){
  const used = usedHrTypes(cards);
  const advancedOn = document.getElementById('advancedOn').checked;
  document.querySelectorAll('#advancedDesignGroup [data-hr-control]').forEach(element => {
    element.classList.toggle('isUnavailable', !used.has(element.dataset.hrControl));
  });
  Object.entries(HR_CONTROL_IDS).forEach(([type, ids]) => {
    ids.forEach(id => {
      document.getElementById(id).disabled = !used.has(type) || (id.endsWith('ResetBtn') && !advancedOn);
    });
    if(type !== 'hr4') host.syncSegmentedChoice(`${type}Shape`);
  });
}

function syncCreditDetailAvailability(){
  const creditOn = document.getElementById('creditOn').checked;
  const transparentTheme = MosaicState.outputThemeTransparent(document.getElementById('outputTheme').value);
  document.getElementById('creditAppearancePanel').classList.toggle('isUnavailable', !creditOn);
  document.getElementById('creditBorderOn').disabled = !creditOn;
  document.getElementById('creditTransparentOn').disabled = !creditOn || transparentTheme;
  document.getElementById('creditAppearanceResetBtn').disabled = !creditOn || !document.getElementById('advancedOn').checked;
  document.getElementById('creditWidth').disabled = !creditOn;
  document.getElementById('creditWidthVal').disabled = !creditOn;
  document.getElementById('creditCardGap').disabled = !creditOn;
  document.getElementById('creditCardGapVal').disabled = !creditOn;
}

function syncOutputThemeControls(){
  const mode = document.getElementById('outputTheme').value;
  const shape = MosaicState.outputThemeShape(mode);
  const transparent = MosaicState.outputThemeTransparent(mode);
  const isAngularCard = shape === 'document';
  document.querySelectorAll('[data-output-shape]').forEach(button => {
    const selected = button.dataset.outputShape === shape;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const previewShapeButton = document.getElementById('previewCardShapeBtn');
  previewShapeButton.classList.toggle('isRoundedCard', !isAngularCard);
  document.getElementById('previewCardShapeText').textContent = isAngularCard ? '각진 카드' : '둥근 카드';
  previewShapeButton.title = isAngularCard ? '둥근 카드로 변경' : '각진 카드로 변경';
  previewShapeButton.setAttribute('aria-label', isAngularCard ? '현재 각진 카드, 둥근 카드로 변경' : '현재 둥근 카드, 각진 카드로 변경');
  document.getElementById('outputTransparentOn').checked = transparent;
  const colors = document.getElementById('comboGroup');
  colors.classList.toggle('paletteUnavailable', transparent);
  const list = document.getElementById('comboList');
  list.inert = transparent;
  ['narrColor','charColor','userColor','emphasisColor','bgColor'].forEach(id => {
    document.getElementById(id).disabled = transparent;
    document.getElementById(id + 'Hex').disabled = transparent;
  });
  document.getElementById('cardCornerRadius').disabled = isAngularCard;
  document.getElementById('cardCornerRadiusVal').disabled = isAngularCard;
  document.getElementById('cardCornerRadiusRow').classList.toggle('isUnavailable', isAngularCard);
  syncCreditDetailAvailability();
}

function updateHexLabels(){
  syncOutputThemeControls();
  const transparentHint = document.getElementById('transparentThemeHint');
  if(transparentHint) transparentHint.hidden = !MosaicState.outputThemeTransparent(document.getElementById('outputTheme').value);
  ['narrColor','charColor','userColor','emphasisColor','bgColor'].forEach(id => {
    document.getElementById(id + 'Hex').value = document.getElementById(id).value;
  });
}

function syncLinkedRangeEditor(id){
  const input = document.getElementById(id);
  const editor = document.getElementById(id + 'Val');
  if(input && editor && editor !== document.activeElement) editor.value = input.value;
}

function syncCoverRangeProgress(){
  document.querySelectorAll('#tabCover .settingsForm .row > input[type="range"]').forEach(input => {
    const min = Number(input.min);
    const max = Number(input.max);
    const progress = max > min ? (Number(input.value) - min) / (max - min) * 100 : 0;
    input.style.setProperty('--type-range-progress', `${Math.max(0, Math.min(100, progress))}%`);
  });
}

function syncTypographyRangeLabels(){
  ['narrSize','narrLine','dlgSize','dlgLine','paragraphGap','narrDialogueGap','titleSize','foldTitleSize'].forEach(id => {
    const input = document.getElementById(id);
    const label = document.getElementById(id + 'Val');
    // 직접 입력 중에는 "1." 같은 소수점 입력 중간값을 덮어쓰지 않는다.
    if(input && label && label !== document.activeElement) label.value = input.value;
  });
  ['hrOpacity','hrLength','hrVerticalSpace','hr2Opacity','hr2VerticalSpace','hr3Opacity','hr3VerticalSpace','gapHeight','coverVerticalSpace','profileItemGap','profileTitleGap','coverCardGap','cardGap','creditWidth','creditCardGap','cardInlinePadding','cardBodyTopSpace','cardBodyBottomSpace','footerBodyGap','headingTopSpace','headingBetweenSpace','headingBottomSpace','cardCornerRadius','cardTitleOrnamentOpacity','coverDividerLength','cardTitlePadding','cardDividerLength'].forEach(id => {
    const input = document.getElementById(id);
    const label = document.getElementById(id + 'Val');
    if(id === 'profileItemGap'){
      input.min = String(-profileItemGapBasePx());
      if(Number(input.value) < Number(input.min)) input.value = input.min;
    }
    if(label !== document.activeElement) label.value = id === 'profileItemGap'
      ? String(Math.max(0, profileItemGapBasePx() + Number(input.value)))
      : id === 'cardInlinePadding' ? String(Number(input.value) - 22) : input.value;
    const min = Number(input.min);
    const max = Number(input.max);
    const progress = max > min ? (Number(input.value) - min) / (max - min) * 100 : 0;
    input.style.setProperty('--advanced-range-progress', `${Math.max(0, Math.min(100, progress))}%`);
  });
  syncSoftBreakSpacingControl();
  ['narrSize','narrLine','dlgSize','dlgLine','paragraphGap','narrDialogueGap','softBreakSpacing','titleSize','foldTitleSize'].forEach(id => {
    const input = document.getElementById(id);
    const min = Number(input.min);
    const max = Number(input.max);
    const progress = max > min ? (Number(input.value) - min) / (max - min) * 100 : 0;
    input.style.setProperty('--type-range-progress', `${Math.max(0, Math.min(100, progress))}%`);
  });
}
return Object.freeze({
invalidateControlSync,
isHrControlGroup,
profileItemGapBasePx,
syncCardLayoutCheckbox,
syncCoverRangeProgress,
syncCreditDetailAvailability,
syncLinkedRangeEditor,
syncTypographyRangeLabels,
updateHexLabels,
syncPreviewPalette,
syncRenderInputs
});
}

// 규칙의 임시 입력은 이 기능만 관리한다. 확정 전에는 저장 원본을 바꾸지 않는다.
function createOutputRuleEditing(host){
  let active = null;
  let errorKind = null;

  function clearError(){
    if(errorKind) host.setStatus(errorKind, '');
    errorKind = null;
  }

  function editResult(kind, original, field, value){
    const rules = host.readRules(kind);
    const rule = rules.find(item => item.id === original.id);
    if(!rule || rule.from !== original.from || rule.to !== original.to) return {stale:true};
    const next = {...rule, [field]:kind === 'name' ? value.trim() : value};
    if(!next.from || (kind === 'name' && !next.to)){
      return {error:kind === 'name' ? '현재 이름과 새 이름을 모두 입력해 주세요.' : '찾을 키워드를 입력해 주세요.'};
    }
    if(next.from.length > 80 || next.to.length > 80) return {error:'규칙의 문구는 각각 80자까지 입력할 수 있습니다.'};
    if(next.from === next.to) return {error:'바꾸기 전후의 문구를 다르게 입력해 주세요.'};
    if(rules.some(item => item.id !== rule.id && item.from === next.from)) return {error:'같은 찾을 문구의 규칙이 있습니다.'};
    return {rules, rule, next, changed:next.from !== rule.from || next.to !== rule.to};
  }

  function bindText(node, original, field, kind, refresh){
    const label = kind === 'name' ? '이름' : '키워드';
    const fieldLabel = field === 'from' ? '찾을 문구' : '바꿀 문구';
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `${label} 규칙 ${fieldLabel} 수정`);
    function start(){
      if(active) active.finish(false);
      if(!node.isConnected) return;
      clearError();
      const initial = {...original};
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'replacementRuleInput';
      input.maxLength = 80;
      input.value = initial[field];
      input.setAttribute('aria-label', `${label} 규칙 ${fieldLabel}`);
      input.title = 'Enter 적용 · Esc 취소';
      let finished = false;
      function finish(cancel, keepInvalid = false, returnFocus = false){
        if(finished) return;
        const result = !cancel && input.isConnected ? editResult(kind, initial, field, input.value) : {};
        if(result.error){
          if(keepInvalid){
            errorKind = kind;
            host.setStatus(kind, result.error);
            input.setAttribute('aria-invalid', 'true');
            return;
          }
        }
        finished = true;
        active = null;
        if(input.isConnected) input.replaceWith(node);
        if(result.changed){
          host.snapshot();
          Object.assign(result.rule, result.next);
          host.writeRules(kind, result.rules);
          Object.assign(original, result.next);
          refresh();
          host.changed();
          host.feedback(`${label} 규칙 수정 · 입력 원문 유지.`);
        }
        if(cancel) clearError();
        if(returnFocus && node.isConnected) node.focus();
      }
      active = {input, finish};
      node.replaceWith(input);
      input.addEventListener('blur', () => finish(false));
      input.addEventListener('input', () => {
        clearError();
        input.removeAttribute('aria-invalid');
      });
      input.addEventListener('keydown', event => {
        if(event.isComposing || event.keyCode === 229) return;
        if(event.key === 'Enter' || event.key === 'Escape'){
          event.preventDefault();
          event.stopPropagation();
          finish(event.key === 'Escape', true, true);
        }
      });
      input.focus();
      input.select();
    }
    node.addEventListener('click', start);
    node.addEventListener('keydown', event => {
      if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); start(); }
    });
  }

  function discard(root){
    if(active && (!root || root.contains(active.input))) active.finish(true);
    if(!root) clearError();
  }
  // 모바일 앱 전환에서도 확정한 뒤 기존 초안 저장 경로를 사용한다.
  window.addEventListener('pagehide', () => { if(active) active.finish(false); });
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden' && active) active.finish(false);
  });
  return {bindText, discard};
}

// ---------- 카드·미리보기·검색·전체 화면 ----------
const core = (() => {
const settingsReader = createSettingsReader({
  root:document,
  readExtraChars:()=>library.parseExtraChars(),
  readCreditItems:()=>credit.storedCreditItems()
});
const sourceMap = createSourceMapping({getSettings:(...args)=>settingsReader.getSettings(...args)});


function normalizeStandaloneHrInput(ta){
  const before = ta.value;
  const after = MosaicParser.normalizeBodyHrMarkers(before);
  if(after === before) return false;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  ta.value = after;
  ta.setSelectionRange(MosaicParser.normalizedBodyHrOffset(before, start), MosaicParser.normalizedBodyHrOffset(before, end));
  return true;
}

function generateHTML(includeRestoreState = false, prebuiltOutput){
  const rawOutput = prebuiltOutput === undefined
    ? MosaicRenderer.buildCard(settingsReader.getSettings(), MosaicUI.cards.all())
    : prebuiltOutput;
  const output = MosaicRenderer.stripEditorOutputMetadata(rawOutput);
  if(!includeRestoreState) return output;
  const restoreMeta = MosaicStorage.RESTORE_META_PREFIX + MosaicStorage.encodeRestoreState(MosaicUI.work.collectSlot()) + MosaicStorage.RESTORE_META_SUFFIX + '\n';
  return restoreMeta + output;
}

// 맥이면 ⌘, 그 외에는 Ctrl 로 표기 (동작은 둘 다 인식)
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl';

// 웹폰트는 선택되는 순간 한글 글리프까지 명시적으로 불러온 뒤 미리보기를 다시 그린다.
// file://로 열었을 때 첫 렌더가 대체 글꼴로 굳어 보이는 현상을 방지한다.
async function loadSelectedWebFont(selectId){
  if(!document.fonts || !document.fonts.load) return;
  const key = document.getElementById(selectId).value;
  try {
    await document.fonts.load(`16px ${MosaicRenderer.fontStack(key)}`, '가나다라마바사 대사와 나레이션');
    MosaicUI.preview.renderMarkup();
  } catch(e){ /* 로컬 글꼴이나 네트워크 미연결 시 기존 대체 글꼴 유지 */ }
}

// 저장·프리셋 호환성을 위해 기존 cardLayout 문자열 값은 유지하고,
// 화면에서는 켜고 끄는 의미가 더 분명한 단일 체크박스로 보여준다.


// 조각로그 v1.9.0 미리보기·편집 UI 모듈.

// 수명 내내 교체되지 않는 기능 루트만 잡아둔다. 렌더 때 새로 생기는 카드와
// 미리보기 자식은 캐시하지 않아 삭제된 DOM을 붙잡는 일을 피한다.
const uiElements = Object.freeze({
  preview:document.getElementById('preview'),
  previewArea:document.getElementById('previewArea'),
  previewToolbar:document.getElementById('previewToolbar'),
  previewToolbarAnchor:document.getElementById('previewToolbarAnchor'),
  previewToolbarHandle:document.getElementById('previewToolbarHandle'),
  previewFoldControls:document.getElementById('previewFoldControls'),
  previewExpandAll:document.getElementById('previewExpandAllBtn'),
  previewCollapseAll:document.getElementById('previewCollapseAllBtn'),
  previewCardNavigator:document.getElementById('previewCardNavigator'),
  previewCardNavButton:document.getElementById('previewCardNavBtn'),
  previewCardNavPanel:document.getElementById('previewCardNavPanel'),
  previewCardNavList:document.getElementById('previewCardNavList'),
  cardEditors:document.getElementById('cardEditors')
});

// 조각로그 v1.9.0 미리보기 렌더 조정기.
function renderOutputViews(settings, cards){
  const previewHTML = MosaicRenderer.buildCard(settings, cards);
  const html = generateHTML(false, previewHTML);
  document.getElementById('codeBox').value = html;
  renderPreview(previewHTML, {settings,cards});
  controlSync.syncPreviewPalette();
}

const previewPositionState = {
  pendingFocus:null,
  pendingFallbackScrollTop:null,
  revealRequest:0
};


function schedulePreviewFocusAfterRender(){
  if(previewPositionState.pendingFocus && positionSyncEnabled()){
    const getter = previewPositionState.pendingFocus;
    const fallbackScrollTop = previewPositionState.pendingFallbackScrollTop;
    const request = previewPositionState.revealRequest;
    previewPositionState.pendingFocus = null;
    previewPositionState.pendingFallbackScrollTop = null;
    requestAnimationFrame(() => {
      if(!positionSyncEnabled() || request !== previewPositionState.revealRequest) return;
      try {
        const target = getter();
        if(target) scrollPreviewIfNeeded(target);
        else if(Number.isFinite(fallbackScrollTop)) uiElements.previewArea.scrollTop = fallbackScrollTop;
      } catch(e){ /* 위치 대상이 사라졌으면 현재 위치를 유지한다. */ }
    });
  } else if(!positionSyncEnabled()){
    previewPositionState.pendingFocus = null;
    previewPositionState.pendingFallbackScrollTop = null;
  }
}

const previewRenderState = {
  frame:0,
  revision:0,
  sourceHTML:'',
  countPending:false,
  beforeFrame:null
};

function performRender(){
  previewRenderState.revision += 1;
  const cards = cardEditors.getCards();
  controlSync.syncRenderInputs(cards);
  const settings = settingsReader.getSettings();
  renderOutputViews(settings, cards);
  if(previewRenderState.countPending){
    previewRenderState.countPending = false;
    uiUpdateEffects.refreshCount(cards, settings);
  }
  schedulePreviewFocusAfterRender();
}

function render(){
  if(previewRenderState.frame){
    cancelAnimationFrame(previewRenderState.frame);
    previewRenderState.frame = 0;
  }
  previewRenderState.beforeFrame = null;
  performRender();
}

function scheduleRender(beforeFrame = null){
  // 일반 입력은 조건 없이 갱신한다. 이미지 전용 예약만 실행 직전에 편집 상태를
  // 다시 확인한다. 이미 예약된 일반 입력을 이미지 검사 조건으로 막지 않는다.
  if(!beforeFrame) previewRenderState.beforeFrame = null;
  else if(!previewRenderState.frame) previewRenderState.beforeFrame = beforeFrame;
  if(previewRenderState.frame) return;
  previewRenderState.frame = requestAnimationFrame(() => {
    previewRenderState.frame = 0;
    const check = previewRenderState.beforeFrame;
    previewRenderState.beforeFrame = null;
    if(check && check() === false) return;
    performRender();
  });
}

// UI는 렌더 예약과 DOM을 소유한다. 변경 후 렌더·카운터·저장 순서는
// app.js의 changes가 조율한다. 아래 연결은 초기화 때 주입된 명령만 사용한다.
function renderWithCount(){
  previewRenderState.countPending = true;
  render();
}

function scheduleRenderWithCount(beforeFrame){
  previewRenderState.countPending = true;
  scheduleRender(beforeFrame);
}

const uiUpdateEffects = Object.freeze({
  renderNow:render,
  renderCountLater:scheduleRenderWithCount,
  refreshCount(cards, settings){ appCommands.updateCounter(cards, settings); },
  saveLater(){ appCommands.scheduleDraftSave(); },
  settingsInput(id){ appCommands.changes.settingsInput(id); },
  liveInput(){ appCommands.changes.liveInput(); },
  controlChange(){ appCommands.changes.controlChange(); },
  committedChange(){ return appCommands.changes.committedChange(); },
  renderedDraftChange(){ appCommands.changes.renderedDraftChange(); },
  renderedSavedChange(){ return appCommands.changes.renderedSavedChange(); }
});

// 조각로그 v1.9.0 전역 작업 화면 상태와 오류 표시.
function syncSidebarFieldActive(){
  const active = document.activeElement;
  const isSidebarField = !!(active && active.matches
    && active.closest('#sidebar')
    && active.matches('input, textarea, select, [contenteditable="true"]'));
  document.body.classList.toggle('sidebarFieldActive', isSidebarField);
  if(isSidebarField){
    previewInteractions.hideSelToolbar();
    previewInteractions.hideBlockToolbar();
  }
}

function bindGlobalUIEvents(){
  bindUIFeatureEvents('global', () => {
    document.addEventListener('focusin', syncSidebarFieldActive);
    document.addEventListener('focusout', () => requestAnimationFrame(syncSidebarFieldActive));

    window.addEventListener('error', event => {
      const bar = document.getElementById('errorBar');
      if(!bar) return;
      bar.style.display = 'block';
      bar.textContent = '⚠ 오류: ' + event.message + ' — 이 메시지를 캡처해 개발자에게 전달.';
    });

    window.addEventListener('unhandledrejection', event => {
      const bar = document.getElementById('errorBar');
      if(!bar) return;
      const message = event.reason && event.reason.message
        ? event.reason.message
        : String(event.reason || '알 수 없는 비동기 오류');
      bar.style.display = 'block';
      bar.textContent = '⚠ 오류: ' + message + ' — 이 메시지를 캡처해 개발자에게 전달.';
    });
  });
}


   


// 미리보기에서 고른 부분을 본문 입력창에서도 선택해 보여줌 (미리보기 선택은 그대로 유지)
// textarea 안에서 특정 문자 위치가 실제로 몇 px 지점인지 측정 (줄바꿈까지 정확히 반영)
function caretOffsetTop(ta, index){
  const cs = getComputedStyle(ta);
  const mirror = document.createElement('div');
  const copy = ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','lineHeight',
                'textTransform','wordSpacing','textIndent','whiteSpace','wordWrap','overflowWrap',
                'paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderLeftWidth'];
  copy.forEach(p => { mirror.style[p] = cs[p]; });
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.width = ta.clientWidth + 'px';
  mirror.style.height = 'auto';
  mirror.textContent = ta.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  mirror.remove();
  return { top };
}

function revealEditorOffsetAtTop(target, start, ed, {automatic = false} = {}){
  const request = ++previewPositionState.revealRequest;
  const sourceValue = target.value;
  requestAnimationFrame(() => {
    if(!target.isConnected || (ed && !ed.isConnected)) return;
    if(request !== previewPositionState.revealRequest || target.value !== sourceValue) return;
    if(automatic && (!positionSyncEnabled() || previewLayout.isStackedLayout() || target.selectionStart !== start)) return;
    const { top } = caretOffsetTop(target, start);
    const cs = getComputedStyle(target);
    const padTop = parseFloat(cs.paddingTop) || 0;
    const borderTop = parseFloat(cs.borderTopWidth) || 0;
    if(ed && target.classList.contains('isAutoExpanded')){
      // 전체 높이 입력창에는 내부 스크롤이 없다. 선택 줄의 실제 화면 좌표로
      // 사이드바만 이동해 카드 시작점이 아닌 해당 문장을 고정 도구 아래에 놓는다.
      target.scrollTop = 0;
      scrollCardIntoSidebar(ed, target.getBoundingClientRect().top + top);
    } else {
      target.scrollTop = Math.max(0, top - padTop - borderTop);
      if(ed) scrollCardIntoSidebar(ed);
    }
    if(ed){
      ed.style.boxShadow = '0 0 0 2px var(--accent)';
      setTimeout(() => { if(ed.isConnected) ed.style.boxShadow = ''; }, 900);
    }
  });
}

function ensureBodyInputGroupOpen(){
  const group = document.getElementById('bodyInputGroup');
  if(group && !group.open) group.open = true;
}

function revealCommentInEditor(ta, raw, rawEnd){
  if(!ta) return;
  const fsOpen = document.getElementById('fsOverlay').style.display === 'block';
  if(fsOpen && document.getElementById('fsTextarea').__mirror !== ta) return;
  if(!fsOpen){
    const button = document.querySelector('.tabBtn[data-tab="tabBody"]');
    if(button && !button.classList.contains('active')) button.click();
    ensureBodyInputGroupOpen();
  }
  const target = fsOpen ? document.getElementById('fsTextarea') : ta;
  const lines = target.value.split('\n');
  if(lines[raw] === undefined) return;
  const endRaw = Math.max(raw, Math.min(Number.isInteger(rawEnd) ? rawEnd : raw, lines.length - 1));
  const start = lines.slice(0, raw).reduce((length, line) => length + line.length + 1, 0);
  const end = lines.slice(0, endRaw + 1).reduce((length, line, index) =>
    length + line.length + (index < endRaw ? 1 : 0), 0);
  const editor = ta.closest('.commentEditor');
  if(editor && getComputedStyle(ta).display === 'none'){
    const collapse = editor.querySelector('.collapseCtl');
    if(collapse) collapse.click();
  }
  target.setSelectionRange(start, Math.max(start, end));
  cardEditors.setActiveTextarea(ta);
  revealEditorOffsetAtTop(target, start, editor, {automatic:true});
}

function revealInEditor(ta, raw, text, occurrence, sourceBounds, segmented = false){
  // 본문 탭으로 전환 (전체 화면 편집 중이면 그대로 둠)
  const fsOpen = document.getElementById('fsOverlay').style.display === 'block';
  if(fsOpen && document.getElementById('fsTextarea').__mirror !== ta) return;
  if(!fsOpen){
    const btn = document.querySelector('.tabBtn[data-tab="tabBody"]');
    if(btn && !btn.classList.contains('active')) btn.click();
    ensureBodyInputGroupOpen();
  }
  const target = fsOpen ? document.getElementById('fsTextarea') : ta;
  if(!target) return;

  // 원본 줄에서 선택 글자의 위치를 찾아 같은 범위를 선택
  const lines = target.value.split('\n');
  const line = lines[raw];
  if(line === undefined) return;
  const sourceRange = sourceMap.descriptorSourceRange({ ta, raw, sourceBounds, segmented }, line, text, occurrence);
  if(segmented && !sourceRange) return;
  const lineStart = lines.slice(0, raw).reduce((a, l) => a + l.length + 1, 0);
  const start = sourceRange ? lineStart + sourceRange.start : lineStart;
  const end = sourceRange ? lineStart + sourceRange.end : lineStart + line.length;

  // 접어둔 카드 입력창이면 펼침
  const ed = target.closest('.cardEditor');
  if(ed){
    const collapse = ed.querySelector('.miniCtl');
    if(collapse && getComputedStyle(target).display === 'none') collapse.click();
  }

  // 미리보기의 선택이 풀리지 않도록 포커스는 옮기지 않고 선택 범위만 지정
  target.setSelectionRange(start, end);

  // 미리보기에서 고른 문장이 본문 입력칸의 '첫 번째 보이는 줄'에 오도록 맞춘다.
  // 전체 본문의 처음으로 보내면 선택한 문장이 가려지는 회귀가 생기므로 선택 시작점의 실제 px 위치를 쓴다.
  revealEditorOffsetAtTop(target, start, ed, {automatic:true});
}


// HTML 교체로 사라진 편집·검색·버튼 기능을 기존 순서로 연결한다.
function bindPreviewInteractions(preview){
  previewInteractions.enableBlockDrag(preview);
  if(previewSearch.isOpen()) previewSearch.pvApplySearch(true);   // 검색 중이면 강조 다시 칠함 (미리보기 DOM 전용)
  previewInteractions.decoratePreviewDirectEditors();
  previewInteractions.decorateOutputRuleOccurrences();
  previewInteractions.decorateParallelOccurrences();
  previewInteractions.bindOutputRuleInteractions();
  previewInteractions.decoratePreviewCoverImageNavigation();
  previewInteractions.decoratePreviewProfileEditors();
  previewInteractions.decoratePreviewCreditEditors();
  previewInteractions.decoratePreviewFooterEditor();
  previewInteractions.decoratePreviewCardTitlePositionLinks();
  previewLayout.decoratePreviewControls();
}


// 미리보기 갱신 순서: 이전 UI 정리 → 상태 보관 → HTML 교체 → 상태 복원 → 기능 연결.
function renderPreview(prebuiltHTML, renderInput = null){
  const preview = uiElements.preview;
  const pausedScroll = document.getElementById('fsOverlay').style.display === 'block'
    ? {top:uiElements.previewArea.scrollTop, left:uiElements.previewArea.scrollLeft} : null;
  previewInteractions.hideOutputRulePopover(); previewInteractions.hideSelToolbar();
  // 외곽 버튼은 HTML 교체 후에도 남으므로 이전 대상을 참조하는 버튼부터 제거한다.
  document.querySelectorAll('#previewWrap > .previewFloatingControl').forEach(button => button.remove());
  preview.classList.add('previewRefreshing');
  previewInteractions.hideBlockToolbar();
  const openStates = previewLayout.capturePreviewFoldState();
  previewRenderState.sourceHTML = prebuiltHTML !== undefined
    ? prebuiltHTML
    : MosaicRenderer.buildCard(settingsReader.getSettings(), cardEditors.getCards());
  const patched = patchPlainPreview(previewRenderState.sourceHTML, renderInput);
  if(!patched) preview.innerHTML = previewRenderState.sourceHTML;
  previewLayout.syncPreviewOuterBreaks();
  previewLayout.restorePreviewFoldState(openStates);
  if(patched){
    previewLayout.decoratePreviewControls();
  } else {
    bindPreviewInteractions(preview);
  }
  previewLayout.syncPreviewFoldControls();
  previewLayout.finishPreviewLayout(preview);
  if(pausedScroll){
    uiElements.previewArea.scrollTop = pausedScroll.top;
    uiElements.previewArea.scrollLeft = pausedScroll.left;
  }
}


// ---------- 편집 중인 부분을 미리보기에서 자동으로 보여주기 ----------
// 다음 렌더 직후 어떤 요소로 스크롤할지 지정 (getter는 렌더된 DOM에서 요소를 찾아 반환)
function focusPreviewOn(getter){
  if(!positionSyncEnabled()){
    previewPositionState.pendingFocus = null;
    previewPositionState.pendingFallbackScrollTop = null;
    return;
  }
  previewPositionState.pendingFocus = getter;
  // 표시 옵션을 끄는 순간 대상 DOM이 사라지면 브라우저의 스크롤 앵커가
  // 미리보기 위치를 임의로 보정할 수 있다. 그 경우에만 되돌릴 기준 위치를 기억한다.
  const previewArea = uiElements.previewArea;
  previewPositionState.pendingFallbackScrollTop = previewArea ? previewArea.scrollTop : null;
}

// 본문 입력 ↔ 미리보기 자동 이동은 편집 내용과 별개인 화면 설정으로 기억한다.
const POSITION_SYNC_KEY = 'mosaicPositionSync_v1';

const positionSyncInput = document.getElementById('positionSyncOn');

function positionSyncEnabled(){
  // 모바일 세로 배치와 전체 화면의 일시 중지는 PC용 스위치·저장값을 바꾸지 않는다.
  return !!(positionSyncInput && positionSyncInput.checked)
    && !previewLayout.isStackedLayout()
    && document.getElementById('fsOverlay').style.display !== 'block';
}

function cancelPendingPositionSync(){
  previewPositionState.revealRequest++;
  previewPositionState.pendingFocus = null;
  previewPositionState.pendingFallbackScrollTop = null;
}

function syncPositionSyncFloatingUi(){
  const on = positionSyncEnabled();
  const text = `위치 연동 ${on ? '켜짐' : '꺼짐'}`;
  document.getElementById('previewSyncText').textContent = text;
  document.getElementById('previewSyncFloat').title = text;
  positionSyncInput.setAttribute('aria-label', text);
}

function bindPositionSyncEvents(){
  bindUIFeatureEvents('position-sync', () => {
    let stacked = previewLayout.isStackedLayout();
    window.addEventListener('resize', () => {
      const next = previewLayout.isStackedLayout();
      if(next === stacked) return;
      stacked = next;
      cancelPendingPositionSync();
      syncPositionSyncFloatingUi();
    });
    positionSyncInput.addEventListener('change', () => {
      cancelPendingPositionSync();
      syncPositionSyncFloatingUi();
      try { localStorage.setItem(POSITION_SYNC_KEY, positionSyncInput.checked ? 'on' : 'off'); }
      catch(e){ /* 저장소를 쓸 수 없어도 현재 화면 설정은 유지 */ }
    });
  });
}


// 자동 추적은 화면 밖일 때만, 명시적인 클릭·이동은 중앙으로 맞춘다.
// 스크롤은 미리보기 컨테이너 안에서만 부드럽게 움직인다.
// Element.scrollIntoView()는 모든 상위 스크롤 영역과 뷰포트를 함께 조정할 수 있어,
// 좌우 분할 화면에서는 미리보기 변화가 왼쪽 사이드바 위치까지 흔드는 원인이 된다.
function scrollPreviewIfNeeded(el, force){
  if(!el || previewLayout.isStackedLayout()) return;
  const anchor = el.element ? el : null;
  el = anchor ? anchor.element : el;
  const previewArea = uiElements.previewArea;
  if(!previewArea || !previewArea.contains(el)) return;
  // 자동 본문 연동에만 접기를 연다. 명시적인 접기 버튼의 summary는 다시 열지 않는다.
  if(anchor){
    for(let parent = el.parentElement; parent && parent !== previewArea; parent = parent.parentElement){
      if(parent.tagName === 'DETAILS') parent.open = true;
    }
  }
  const areaRect = previewArea.getBoundingClientRect();
  const caretRect = anchor && anchor.rect();
  const r = caretRect || el.getBoundingClientRect();
  const margin = 40;
  const visibleTop = areaRect.top + margin;
  const visibleBottom = areaRect.bottom - margin;
  // 글자 줄이 실제 화면 안에 있으면 가장자리의 여유 영역에서도 움직이지 않는다.
  // 밖으로 벗어난 뒤에만 40px 여유를 두고 다시 들여온다.
  const visible = caretRect
    ? r.top >= areaRect.top && r.bottom <= areaRect.bottom
    : r.top >= visibleTop && r.bottom <= visibleBottom;
  if(!force && visible) return;
  const current = previewArea.scrollTop;
  const relativeTop = r.top - areaRect.top + current;
  // 타이핑·방향키는 보이는 커서를 그대로 두고 가까운 경계까지만 따라간다.
  // 클릭은 문단 전체가 아닌 해당 글자 줄을 중앙에 맞춘다.
  if(!force && anchor && !caretRect && r.height > visibleBottom - visibleTop
    && r.top <= visibleTop && r.bottom >= visibleBottom) return;
  const centeredTop = caretRect && !force
    ? current + (r.top < visibleTop ? r.top - visibleTop : r.bottom - visibleBottom)
    : relativeTop - Math.max(0, (previewArea.clientHeight - r.height) / 2);
  const maxScroll = Math.max(0, previewArea.scrollHeight - previewArea.clientHeight);
  const next = Math.max(0, Math.min(maxScroll, centeredTop));
  previewArea.scrollTo({ top:next, behavior:'smooth' });
}

// 역방향 직접 편집과 같은 출력 문단·원문 범위를 쓴다. 이미지·구분 요소만
// 렌더 그룹의 최상위 구조를 보충하며, 개수 차이로 꼬리말을 추측하지 않는다.
function previewPositionPairs(ta){
  const comment = ta.closest('.commentEditor');
  if(comment){
    const ctx = previewInteractions.previewCommentContexts().find(item => item.ta === ta);
    if(!ctx) return [];
    const entries = previewInteractions.commentDisplayEntries(ta), blocks = Array.from(ctx.commentEl.children);
    return entries.length === blocks.length ? entries.map((entry,index) => ({element:blocks[index],entry,comment:true})) : [];
  }
  const ctx = previewInteractions.previewCardContexts().find(item => item.ta === ta);
  if(!ctx) return [];
  const blocks = previewInteractions.previewSourceBlocks(ctx.cardEl), entries = sourceMap.sourceDisplayEntries(ta);
  const pairs = blocks.length === entries.length
    ? entries.flatMap((entry,index) => previewInteractions.previewSourceMatches(blocks[index],entry)
      ? [{element:blocks[index],entry}] : []) : [];
  const body = previewInteractions.previewCardBody(ctx.cardEl);
  const children = body ? Array.from(body.children).filter(block => !block.hasAttribute('data-mosaic-footer')) : [];
  const map = sourceMap.topLevelMap(sourceMap.topLevelSourceEntries(ta.value,{
    ...settingsReader.getSettings(),outputRuleExclusions:sourceMap.editorOutputRuleExclusions(ta)
  }));
  if(children.length === map.length) map.forEach((item,index) => {
    const element = children[index];
    if(item.kind !== 'line' || pairs.some(pair => pair.element === element)) return;
    // 글자 문단이 검증에서 탈락했으면 순번 폴백으로 다시 연결하지 않는다.
    if(!element.querySelector('img') && !element.hasAttribute('data-mosaic-generated')) return;
    pairs.push({element,entry:{raw:item.startRaw,rawEnd:item.startRaw},structural:true});
  });
  return pairs;
}

function previewPositionPairFor(ta, raw, column = 0){
  const pairs = previewPositionPairs(ta);
  const candidates = pairs.filter(({entry}) => raw >= entry.raw && raw <= (entry.rawEnd ?? entry.raw)
    && (!entry.rawLines || entry.rawLines.includes(raw)));
  if(candidates.length){
    const distance = ({entry}) => {
      const bounds = entry.sourceSegments?.find(segment => segment.raw === raw) || entry.sourceBounds;
      return bounds ? Math.max(bounds.start-column,column-bounds.end,0) : 0;
    };
    return candidates.reduce((best,pair) => distance(pair) < distance(best) ? pair : best);
  }
  // 빈 줄에는 가까운 실제 문단을 쓰되, 출력에서 삭제한 원문 줄은 움직이지 않는다.
  if((ta.value.split('\n')[raw] || '').trim()) return null;
  return pairs.reduce((best,pair) => !best || Math.abs(pair.entry.raw - raw) < Math.abs(best.entry.raw - raw) ? pair : best,null);
}

// 공백·BR·아래쓰기용 가상 공백은 좌표에서 빼고 실제 글자와 원문 범위를
// 대응시킨다. 출력 전용 이름/조사·치환 제외·서식·이모지의 원문 좌표를 보존한다.
function previewPositionCharacters(ta, pair){
  const lines = ta.value.split('\n'), entry = pair.entry;
  const rawLines = entry.rawLines || Array.from({length:(entry.rawEnd ?? entry.raw) - entry.raw + 1},(_,i) => entry.raw+i);
  const characters = [];
  for(const raw of rawLines){
    const line = lines[raw] || '';
    const base = lines.slice(0,raw).reduce((sum,value) => sum+value.length+1,0);
    let display;
    if(pair.comment){
      const text = entry.parts[raw-entry.raw] || '', offset = Math.max(0,line.indexOf(text));
      display = {text,map:Array.from({length:text.length},(_,i) => offset+i),ends:Array.from({length:text.length},(_,i) => offset+i+1)};
    }else{
      const renderedLine = entry.softBreak && raw !== rawLines.at(-1) ? line.replace(/\[BR\]\s*$/i,'') : line;
      display = sourceMap.outputSourceDisplayProjectionMap(renderedLine,sourceMap.outputRuleLineSettings(ta,raw));
    }
    let at = 0;
    const bounds = entry.sourceSegments?.find(segment => segment.raw === raw) || entry.sourceBounds;
    for(const char of display.text){
      const start = display.map[at], end = display.ends[at+char.length-1];
      if(!/\s/u.test(char) && start !== undefined && end !== undefined
        // 따옴표 없는 나레이션의 생성 괄호는 원문 시작점에 길이 0으로 연결된다.
        // 그 첫 기호도 남겨야 실제 DOM 글자와 좌표 배열의 순서가 어긋나지 않는다.
        && (!bounds || (start < bounds.end && (end > bounds.start || (start===end && start===bounds.start))))){
        characters.push({char:MosaicParser.normalizeQuotes(char),start:base+start,end:base+end});
      }
      at += char.length;
    }
  }
  const expected = MosaicParser.normalizeQuotes(pair.comment ? entry.parts.join('') : entry.projection || '').replace(/\s/g,'');
  if(!expected) return null;
  const text = characters.map(item => item.char).join('');
  const at = text.indexOf(expected);
  if(at < 0) return null;
  let offset = 0;
  return characters.filter(item => {const here = offset;offset += item.char.length;return here >= at && here < at+expected.length;});
}

function previewDOMCharacters(element){
  const walker = document.createTreeWalker(element,NodeFilter.SHOW_TEXT), characters = [];
  while(walker.nextNode()){
    const node = walker.currentNode;
    if(node.parentElement.closest('[data-mosaic-speaker-label="true"], [data-mosaic-generated="true"]')) continue;
    let offset = 0;
    for(const char of node.data){
      if(!/\s/u.test(char)) characters.push({char:MosaicParser.normalizeQuotes(char),node,start:offset,end:offset+char.length});
      offset += char.length;
    }
  }
  return characters;
}

function previewCaretTarget(ta, index){
  const before = ta.value.slice(0,index), raw = before.split('\n').length-1;
  const pair = previewPositionPairFor(ta,raw,before.length-before.lastIndexOf('\n')-1);
  if(!pair) return null;
  return {element:pair.element,rect:() => {
    if(pair.structural || pair.entry.image) return null;
    const source = previewPositionCharacters(ta,pair), dom = previewDOMCharacters(pair.element);
    if(!source || source.map(item => item.char).join('') !== dom.map(item => item.char).join('')) return null;
    let at = source.findIndex(item => item.start <= index && item.end > index);
    if(at < 0) at = source.reduce((best,item,position) =>
      Math.max(item.start-index,index-item.end,0) < Math.max(source[best].start-index,index-source[best].end,0) ? position : best,0);
    const point = dom[at];
    if(!point) return null;
    const range = document.createRange();
    range.setStart(point.node,point.start); range.setEnd(point.node,point.end);
    // 레이아웃 좌표가 없는 환경에서는 문단 좌표로 안전하게 폴백한다.
    if(typeof range.getClientRects !== 'function' || !range.getClientRects().length) return null;
    const rect = range.getBoundingClientRect();
    return rect.height > 0 && Number.isFinite(rect.top) && Number.isFinite(rect.bottom) ? rect : null;
  }};
}

function scrollPreviewToCaret(ta, center = false){
  if(!ta || !positionSyncEnabled() || previewLayout.isStackedLayout()) return;
  const source = ta.__mirror || ta;
  const index = ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd;
  scrollPreviewIfNeeded(previewCaretTarget(source,index),center);
}

function bindEditorPositionSyncEvents(ta){
  ta.addEventListener('click',() => scrollPreviewToCaret(ta,true));
  ta.addEventListener('keyup',event => {
    if(event.isComposing || event.keyCode === 229) return;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End'].includes(event.key)) scrollPreviewToCaret(ta);
  });
}

// 카드 편집기의 헤더·제목 입력은 본문 줄 좌표가 없으므로 카드 시작점을 직접 찾는다.
// 접기 카드는 summary, 일반 제목 카드는 제목, 제목이 비어 있으면 카드 자체를 대상으로 한다.
function previewCardStartForEditor(editor){
  if(!editor || editor.dataset.blockType === 'comment' || editor.dataset.outputVisible === 'false') return null;
  const editors = Array.from(document.querySelectorAll('#cardEditors .cardEditor'));
  const sourceIndex = editors.indexOf(editor);
  if(sourceIndex < 0) return null;
  const cardEl = previewLayout.previewParts().cards.find(card => Number(card.dataset.mosaicCardIndex) === sourceIndex);
  if(!cardEl) return null;
  if(cardEl.tagName === 'DETAILS') return cardEl.querySelector(':scope > summary') || cardEl;
  return cardEl.querySelector(':scope > [data-mosaic-card-title="true"]') || cardEl;
}

function scrollPreviewToCardEditor(editor){
  if(!positionSyncEnabled()) return;
  const target = previewCardStartForEditor(editor);
  if(target) scrollPreviewIfNeeded(target, true);
}

// 입력창에서 커서가 있는 줄을 미리보기에서 보여줌
function focusPreviewOnCaret(ta){
  if(!ta || !positionSyncEnabled()) return;
  const source = ta.__mirror || ta;
  const index = ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd;
  const value = source.value;
  focusPreviewOn(() => source.isConnected && source.value === value ? previewCaretTarget(source,index) : null);
}


function setCardDefaultsForShapeChange(previousTheme, nextTheme){
  const previousShape = MosaicState.outputThemeShape(previousTheme);
  const nextShape = MosaicState.outputThemeShape(nextTheme);
  if(previousShape === nextShape) return;
  // 카드 모양을 새로 고를 때만 이어보기와 외곽선 기본값을 적용한다.
  // 이후 체크박스와 미리보기 버튼에서 바꾼 값은 그대로 유지한다.
  document.getElementById('cardLayout').value = nextShape === 'document' ? 'unified' : 'separate';
  document.getElementById('cardBorderOn').checked = nextShape !== 'document';
  controlSync.syncCardLayoutCheckbox();
}

function chooseOutputTheme(shape, transparent){
  library.commitThemeHoverPreview();
  const outputTheme = document.getElementById('outputTheme');
  const nextTheme = MosaicState.composeOutputTheme(shape, transparent);
  setCardDefaultsForShapeChange(outputTheme.value, nextTheme);
  outputTheme.value = nextTheme;
  controlSync.updateHexLabels();
  library.renderComboList();
  library.renderPresetList();
  uiUpdateEffects.renderedSavedChange();
  appCommands.commitStyleHistory(true);
}

function bindThemeChoiceEvents(){
  bindUIFeatureEvents('theme-choice', () => {
    document.querySelectorAll('[data-output-shape]').forEach(button => {
      button.addEventListener('click', () => {
        const mode = document.getElementById('outputTheme').value;
        chooseOutputTheme(button.dataset.outputShape, MosaicState.outputThemeTransparent(mode));
      });
    });
    document.getElementById('previewCardShapeBtn').addEventListener('click', () => {
      const mode = document.getElementById('outputTheme').value;
      const nextShape = MosaicState.outputThemeShape(mode) === 'document' ? 'solid' : 'document';
      chooseOutputTheme(nextShape, MosaicState.outputThemeTransparent(mode));
    });

    document.getElementById('outputTransparentOn').addEventListener('change', event => {
      const mode = document.getElementById('outputTheme').value;
      chooseOutputTheme(MosaicState.outputThemeShape(mode), event.target.checked);
    });
  });
}


// 컬러피커 <-> 헥스코드 입력창 양방향 연동
function bindColorInputEvents(){
  bindUIFeatureEvents('color-inputs', () => {
    ['narrColor','charColor','userColor','emphasisColor','bgColor'].forEach(id => {
      const colorInput = document.getElementById(id);
      const hexInput = document.getElementById(id + 'Hex');

      colorInput.addEventListener('input', () => {
        hexInput.value = colorInput.value;
      });

      hexInput.addEventListener('input', () => {
        const normalized = MosaicState.normalizeHex(hexInput.value);
        if(normalized){
          colorInput.value = normalized;
          // HEX 입력은 연결된 color input의 input 이벤트를 자동으로 만들지 않는다.
          // 프리셋 출처 요약도 실제 색상과 동시에 다시 판정한다.
          library.updateOverwriteBtn();
          uiUpdateEffects.renderedDraftChange();
          appCommands.commitStyleHistory(false);
        }
      });

      hexInput.addEventListener('blur', () => {
        // 입력을 마쳤을 때 유효하지 않으면 현재 컬러값으로 되돌림
        const normalized = MosaicState.normalizeHex(hexInput.value);
        hexInput.value = normalized || colorInput.value;
      });
    });
  });
}

// 이미지 슬라이더 값 라벨 갱신
const extraProfileRangeIds = MosaicState.EXTRA_PROFILE_SLOTS.flatMap(slot => ['Scale','X','Y'].map(field => MosaicState.extraProfilePrefix(slot) + field));

const COVER_IMAGE_RANGE_IDS = ['imgHeight','xpos','ypos'];

const PROFILE_IMAGE_RANGE_IDS = [
  'profileCharScale','profileCharX','profileCharY',
  'profileUserScale','profileUserX','profileUserY',
  ...extraProfileRangeIds
];


function bindRangeLabelMirrors(bindingName, ids){
  bindUIFeatureEvents(bindingName, () => {
    ids.forEach(id => {
      document.getElementById(id).addEventListener('input', () => controlSync.syncLinkedRangeEditor(id));
    });
  });
}

function bindCoverRangeLabelEvents(){
  bindRangeLabelMirrors('cover-range-labels', COVER_IMAGE_RANGE_IDS);
}


function currentProfileEntityOrder(){
  const input = document.getElementById('profileEntityOrder');
  const order = MosaicState.normalizeProfileEntityOrder(
    input.value,
    settingsReader.extraProfileCount(),
    document.getElementById('profileOrder').value
  );
  input.value = JSON.stringify(order);
  return order;
}

function setProfileEntityOrder(order){
  document.getElementById('profileEntityOrder').value = JSON.stringify(MosaicState.normalizeProfileEntityOrder(
    order,
    settingsReader.extraProfileCount(),
    document.getElementById('profileOrder').value
  ));
}

function profileEntityGroup(key){
  if(key === 'bot') return document.getElementById('profileCharGroup');
  if(key === 'user') return document.getElementById('profileUserGroup');
  const match = key.match(/^extra([3-5])$/);
  return match ? document.getElementById(`profileExtra${match[1]}Group`) : null;
}

function syncProfileEntityEditors(){
  const container = document.getElementById('profileEntityEditors');
  const order = currentProfileEntityOrder();
  order.forEach((key, index) => {
    const group = profileEntityGroup(key);
    if(!group) return;
    // 같은 부모 안에서 다시 append해도 한글 조합과 포커스가 끊길 수 있다.
    // 입력 중에는 그대로 두고 실제 순서가 달라진 요소만 옮긴다.
    const current = container.querySelectorAll(':scope > [data-profile-key]')[index];
    if(current !== group) container.insertBefore(group, current || null);
  });
  order.forEach((key, index) => {
    const group = profileEntityGroup(key);
    if(!group) return;
    const up = group.querySelector('[data-profile-move="up"]');
    const down = group.querySelector('[data-profile-move="down"]');
    if(up) up.disabled = MosaicState.moveProfileEntityOrder(order, key, 'up').join('\u0000') === order.join('\u0000');
    if(down) down.disabled = MosaicState.moveProfileEntityOrder(order, key, 'down').join('\u0000') === order.join('\u0000');
  });
}

function syncExtraProfileEditors(){
  const count = settingsReader.extraProfileCount();
  MosaicState.EXTRA_PROFILE_SLOTS.forEach(slot => {
    const prefix = MosaicState.extraProfilePrefix(slot);
    const group = document.getElementById(prefix + 'Group');
    group.hidden = slot > count + 2;
    const name = document.getElementById(prefix + 'Name').value.trim() || `인물 ${slot}`;
    const title = document.getElementById(prefix + 'Title');
    title.textContent = name;
    title.title = name;
  });
  document.getElementById('profileAddBtn').disabled = count >= MosaicState.EXTRA_PROFILE_SLOTS.length;
  syncProfileEntityEditors();
}

function bindProfileRangeLabelEvents(){
  bindRangeLabelMirrors('profile-range-labels', PROFILE_IMAGE_RANGE_IDS);
}

function syncProfileImageRangeLabels(){
  PROFILE_IMAGE_RANGE_IDS.forEach(controlSync.syncLinkedRangeEditor);
}

const PROFILE_IMAGE_UI_CONFIGS = [
  { label:'BOT', inputId:'profileCharImage', buttonId:'profileCharImageAdjustBtn', panelId:'profileCharImageAdjustPanel', toggleId:'profileCharOn' },
  { label:'USER', inputId:'profileUserImage', buttonId:'profileUserImageAdjustBtn', panelId:'profileUserImageAdjustPanel', toggleId:'profileUserOn' },
  ...MosaicState.EXTRA_PROFILE_SLOTS.map(slot => ({ label:`인물 ${slot}`, inputId:`profileExtra${slot}Image`, buttonId:`profileExtra${slot}ImageAdjustBtn`, panelId:`profileExtra${slot}ImageAdjustPanel`, toggleId:`profileExtra${slot}On` })),
];

const IMAGE_BACKGROUND_TOGGLE_CONFIGS = [
  { sourceId:'imgUrl', toggleId:'titleImageBackgroundOn', visibilityId:'imgOn' }
];

function syncImageBackgroundChoice(id){
  const input = document.getElementById(id);
  const group = document.querySelector(`[data-background-control="${id}"]`);
  group.querySelectorAll('button[data-value]').forEach(button => {
    button.setAttribute('aria-pressed', String(input.checked === (button.dataset.value === 'image')));
    button.disabled = input.disabled;
  });
  const positionRow = id === 'profileImageBackgroundOn' ? 'profileTextPositionRow' : 'titleTextPositionRow';
  document.getElementById(positionRow).hidden = !input.checked;
}

function bindImageBackgroundChoiceEvents(){
  bindUIFeatureEvents('image-background-choice', () => {
    document.querySelectorAll('[data-background-control] button[data-value]').forEach(button => {
      button.addEventListener('click', () => {
        const input = document.getElementById(button.closest('[data-background-control]').dataset.backgroundControl);
        const next = button.dataset.value === 'image';
        if(input.disabled || input.checked === next) return;
        input.checked = next;
        input.dispatchEvent(new Event('input', { bubbles:true }));
        input.dispatchEvent(new Event('change', { bubbles:true }));
        syncImageBackgroundChoice(input.id);
      });
    });
    ['titleImageBackgroundOn','profileImageBackgroundOn'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => syncImageBackgroundChoice(id));
    });
  });
}

function syncImageBackgroundToggleAvailability(){
  IMAGE_BACKGROUND_TOGGLE_CONFIGS.forEach(config => {
    const source = document.getElementById(config.sourceId);
    const toggle = document.getElementById(config.toggleId);
    const imageAvailable = source.value.trim() !== '';
    const available = imageAvailable && (!config.visibilityId || document.getElementById(config.visibilityId).checked);
    // 이미지가 사라지면 저장된 ON 상태도 지워, 다시 넣었을 때 무심코 배경이 켜지지 않게 한다.
    if(!imageAvailable) toggle.checked = false;
    toggle.disabled = !available;
    toggle.closest('.imageBackgroundToggleRow').classList.toggle('isUnavailable', !available);
  });
  const profileToggle = document.getElementById('profileImageBackgroundOn');
  const profileImageAvailable = ['profileChar','profileUser',...MosaicState.EXTRA_PROFILE_SLOTS.filter(slot => slot <= settingsReader.extraProfileCount() + 2).map(MosaicState.extraProfilePrefix)].some(role => {
    const source = document.getElementById(`${role}Image`);
    return source.value.trim() !== '';
  });
  if(!profileImageAvailable) profileToggle.checked = false;
  profileToggle.disabled = !profileImageAvailable;
  profileToggle.closest('.imageBackgroundToggleRow').classList.toggle('isUnavailable', !profileImageAvailable);
  syncImageBackgroundChoice('titleImageBackgroundOn');
  syncImageBackgroundChoice('profileImageBackgroundOn');
}

function setProfileImageAdjustOpen(config, open){
  const button = document.getElementById(config.buttonId);
  const panel = document.getElementById(config.panelId);
  const next = !!open && !button.disabled;
  panel.hidden = !next;
  button.setAttribute('aria-expanded', String(next));
  button.textContent = '⚙︎';
  button.setAttribute('aria-label', `${config.label} 사진 조정 ${next ? '닫기' : '열기'}`);
  button.title = next ? '사진 조정 닫기' : '사진 조정';
}

function syncProfileImageUiState(){
  PROFILE_IMAGE_UI_CONFIGS.forEach(config => {
    const input = document.getElementById(config.inputId);
    const button = document.getElementById(config.buttonId);
    const hasImage = input.value.trim() !== '';
    button.disabled = !hasImage;
    if(!hasImage || !document.getElementById(config.toggleId).checked){
      setProfileImageAdjustOpen(config, false);
    }
  });
}

function bindProfileImageEvents(){
  bindUIFeatureEvents('profile-images', () => {
    PROFILE_IMAGE_UI_CONFIGS.forEach(config => {
      const input = document.getElementById(config.inputId);
      const button = document.getElementById(config.buttonId);
      button.addEventListener('click', () => {
        setProfileImageAdjustOpen(config, button.getAttribute('aria-expanded') !== 'true');
      });
      input.addEventListener('input', syncProfileImageUiState);
    });
  });
}

function syncCoverImageRangeLabels(){
  COVER_IMAGE_RANGE_IDS.forEach(controlSync.syncLinkedRangeEditor);
}


// 슬라이더와 숫자 입력을 양방향으로 연결해 빠른 조절과 정확한 입력을 모두 지원한다.
function bindRangeEditorEvents(){
  bindUIFeatureEvents('range-editors', () => {
    document.querySelectorAll('.rangeEditor input[data-range]').forEach(editor => {
      const range = document.getElementById(editor.dataset.range);
      if(!range) return;
      editor.addEventListener('input', () => {
        const value = Number(editor.value) - (range.id === 'profileItemGap' ? controlSync.profileItemGapBasePx()
          : range.id === 'cardInlinePadding' ? -22 : 0);
        if(!Number.isFinite(value) || value < Number(range.min) || value > Number(range.max)) return;
        range.value = String(value);
        range.dispatchEvent(new Event('input', { bubbles:true }));
      });
      editor.addEventListener('change', () => {
        const base = range.id === 'profileItemGap' ? controlSync.profileItemGapBasePx()
          : range.id === 'cardInlinePadding' ? -22 : 0;
        const value = Number(editor.value) - base;
        const safeValue = Number.isFinite(value)
          ? Math.min(Number(range.max), Math.max(Number(range.min), value))
          : Number(range.value);
        range.value = String(safeValue);
        editor.value = String(range.id === 'profileItemGap'
          ? Math.max(0, Number(range.value) + base) : Number(range.value) + base);
        range.dispatchEvent(new Event('input', { bubbles:true }));
      });
    });
  });
}

function selectedControlText(id){
  const select = document.getElementById(id);
  const option = select && select.options[select.selectedIndex];
  return option ? option.textContent.replace(/\s*\([^)]*\)\s*$/, '') : '';
}


function syncDividerLengthControlState(){
  const profileDividerOn = document.getElementById('profileOn').checked
    && !document.getElementById('profileDividerMinimal').checked;
  const controls = [
    ['coverDividerLength', document.getElementById('titleMinimal').checked && !profileDividerOn],
    ['cardDividerLength', !document.getElementById('foldDividerOn').checked]
  ];
  controls.forEach(([id, unavailable]) => {
    document.getElementById(`${id}Row`).classList.toggle('isUnavailable', unavailable);
    document.getElementById(id).disabled = unavailable;
    document.getElementById(`${id}Val`).disabled = unavailable;
  });
}

function syncProfileTitleGapControlState(){
  const unavailable = !document.getElementById('profileOn').checked
    || document.getElementById('profilePlacement').value !== 'top'
    || MosaicState.normalizeCardLayout(document.getElementById('cardLayout').value) === 'unified';
  document.getElementById('profileTitleGapRow').classList.toggle('isUnavailable', unavailable);
  document.getElementById('profileTitleGap').disabled = unavailable;
  document.getElementById('profileTitleGapVal').disabled = unavailable;
}

function syncTopProfileDetailControlState(){
  const available = document.getElementById('profileOn').checked
    && document.getElementById('profilePlacement').value === 'top';
  const activePrefixes = ['profileChar','profileUser',
    ...MosaicState.EXTRA_PROFILE_SLOTS.filter(slot => slot <= settingsReader.extraProfileCount() + 2).map(MosaicState.extraProfilePrefix)];
  const visibleProfiles = activePrefixes.filter(prefix => {
    if(!document.getElementById(`${prefix}On`).checked) return false;
    const image = document.getElementById(`${prefix}Image`).value.trim();
    return image
      || ['Name','Desc','Tags'].some(field => document.getElementById(`${prefix}${field}`).value.trim());
  }).length;
  document.getElementById('topProfileDetailPanel').classList.toggle('isUnavailable', !available);
  const background = document.getElementById('profileOuterBackground');
  background.disabled = !available;
  library.syncSegmentedChoiceControl('profileOuterBackground');
  const gapUnavailable = !available || visibleProfiles < 2;
  document.getElementById('profileItemGapRow').classList.toggle('isUnavailable', gapUnavailable);
  document.getElementById('profileItemGap').disabled = gapUnavailable;
  document.getElementById('profileItemGapVal').disabled = gapUnavailable;
}

function syncFoldAutoNumberStyleControlState(){
  const unavailable = !document.getElementById('foldTitleAutoNumber').checked;
  document.getElementById('foldAutoNumberStyleRow').classList.toggle('isUnavailable', unavailable);
  document.getElementById('foldAutoNumberStyle').disabled = unavailable;
  library.syncSegmentedChoiceControl('foldAutoNumberStyle');
}

function syncCardTitleOrnamentOpacityControlState(){
  const unavailable = !document.getElementById('foldTitleDecorationOn').checked;
  document.getElementById('cardTitleOrnamentOpacityRow').classList.toggle('isUnavailable', unavailable);
  document.getElementById('cardTitleOrnamentOpacity').disabled = unavailable;
  document.getElementById('cardTitleOrnamentOpacityVal').disabled = unavailable;
}

function syncAdvancedResetAvailability(){
  const advancedOn = document.getElementById('advancedOn').checked;
  const creditOn = document.getElementById('creditOn').checked;
  document.getElementById('advancedResetBtn').disabled = !advancedOn;
  document.querySelectorAll('#advancedDesignGroup .advancedOptionResetBtn').forEach(button => {
    const group = button.dataset.resetGroup;
    button.disabled = !advancedOn
      || (group === 'topProfile' && (!document.getElementById('profileOn').checked
        || document.getElementById('profilePlacement').value !== 'top'))
      || (group === 'creditAppearance' && !creditOn)
      || (group === 'footerSpacing' && !document.getElementById('footerOn').checked)
      || (controlSync.isHrControlGroup(group) && button.classList.contains('isUnavailable'));
  });
}

function syncDesignControlStates(){
  controlSync.syncCardLayoutCheckbox();
  library.syncMinimalChoiceControls();
  syncDividerLengthControlState();
  syncProfileTitleGapControlState();
  syncTopProfileDetailControlState();
  syncFoldAutoNumberStyleControlState();
  syncCardTitleOrnamentOpacityControlState();
  const footerUnavailable = !document.getElementById('footerOn').checked;
  document.getElementById('footerBodyGapRow').classList.toggle('isUnavailable', footerUnavailable);
  ['footerBodyGap','footerBodyGapVal'].forEach(id => {
    document.getElementById(id).disabled = footerUnavailable;
  });
  document.getElementById('advancedDesignGroup').classList.toggle(
    'isAdvancedInactive', !document.getElementById('advancedOn').checked
  );
  syncAdvancedResetAvailability();
}

function syncDesignSummaryText(){
  const font = selectedControlText('textFont');
  const dialogue = selectedControlText('dlgStyle');
  const cardWidthSelect = document.getElementById('cardWidth');
  const cardWidth = parseInt(cardWidthSelect.value, 10) || 750;
  const width = [
    `${cardWidth}px`,
    document.getElementById('cardBorderOn').checked ? '외곽선' : '',
    MosaicState.normalizeCardLayout(document.getElementById('cardLayout').value) === 'unified' ? '이어보기' : ''
  ].filter(Boolean).join(' · ');
  previewLayout.syncDesktopPreviewWidth();
  previewLayout.syncPreviewToolbarLabel();
  document.getElementById('typographyDesignSummary').textContent =
    `${font} · 본문 ${document.getElementById('narrSize').value}px · 제목 ${document.getElementById('titleSize').value}px`;
  const parallelLayout = selectedControlText('parallelTranslationLayout');
  document.getElementById('dialogueDesignSummary').textContent = dialogue;
  const parallelOff = !document.getElementById('parallelDialogueOn').checked && !document.getElementById('parallelNarrationOn').checked;
  document.getElementById('parallelTranslationSummary').textContent = parallelOff ? '미적용'
    : `${parallelLayout} · ${selectedControlText('parallelTranslationOrder')}`;
  const parallelOptions = document.getElementById('parallelTranslationOptions');
  parallelOptions.hidden = parallelOff;
  document.getElementById('layoutDesignSummary').textContent = width;

  const imageOn = document.getElementById('imgOn').checked;
  document.getElementById('imageCoverSummary').textContent = imageOn
    ? `${document.getElementById('imgHeight').value}px`
    : '';

  const titleOn = document.getElementById('logTitleOn').checked;
  document.getElementById('titleCoverSummary').textContent = titleOn
    ? (document.getElementById('titleMinimal').checked ? '구분선 숨김' : '구분선 표시')
    : '';
  const profileOn = document.getElementById('profileOn').checked;
  const profilePlacementSummary = document.getElementById('profilePlacement').value === 'top'
    ? '최상단'
    : selectedControlText('profilePlacement');
  document.getElementById('profileCoverSummary').textContent = profileOn
    ? `${selectedControlText('profileStyle')}${document.getElementById('profileDividerMinimal').checked ? ' · 선 숨김' : ''} · ${profilePlacementSummary}`
    : '';

  const footerAuthorSummary = document.getElementById('footerAuthor').value.trim();
  document.getElementById('footerCoverSummary').textContent = document.getElementById('footerOn').checked && footerAuthorSummary
    ? `©${footerAuthorSummary}`
    : '';
  const creditOn = document.getElementById('creditOn').checked;
  const creditCount = credit.storedCreditItems().filter(item => item.label.trim() || item.value.trim()).length;
  document.getElementById('creditCoverSummary').textContent = creditOn
    ? `${selectedControlText('creditPlacement')} · ${creditCount}개 항목`
    : '';
}

function syncDesignSummaries(){
  syncDesignControlStates();
  syncDesignSummaryText();
}

const PROFILE_TAG_GROUPS = [
  { masterId:'profileCharTags', editorIds:['profileCharTag1','profileCharTag2','profileCharTag3'] },
  { masterId:'profileUserTags', editorIds:['profileUserTag1','profileUserTag2','profileUserTag3'] },
  ...MosaicState.EXTRA_PROFILE_SLOTS.map(slot => ({ masterId:`profileExtra${slot}Tags`, editorIds:[1,2,3].map(index => `profileExtra${slot}Tag${index}`) })),
  { masterId:'profileRelationship', editorIds:['profileRelationship1','profileRelationship2','profileRelationship3'] },
];

function normalizeProfileTag(value){
  return String(value || '').trim().replace(/^#+\s*/, '');
}

function splitProfileTags(value){
  return Array.from(new Set(String(value || '').split(/[,，]/)
    .map(normalizeProfileTag)
    .filter(Boolean)))
    .slice(0, 3);
}

function syncProfileTagMaster(group, dispatch = true){
  const master = document.getElementById(group.masterId);
  const nextValue = group.editorIds
    .map(id => normalizeProfileTag(document.getElementById(id).value))
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  if(master.value === nextValue) return;
  master.value = nextValue;
  if(dispatch) master.dispatchEvent(new Event('input', { bubbles:true }));
}

function syncProfileTagEditorsFromMasters(){
  PROFILE_TAG_GROUPS.forEach(group => {
    const master = document.getElementById(group.masterId);
    const tags = splitProfileTags(master.value);
    master.value = tags.join(', ');
    group.editorIds.forEach((id, index) => { document.getElementById(id).value = tags[index] || ''; });
  });
}

const PROFILE_ENTITY_CONFIGS = [
  {
    label:'BOT', toggleId:'profileCharOn', groupId:'profileCharGroup', resetButtonId:'profileCharResetBtn',
    controlIds:['profileCharRole','profileCharName','profileCharTag1','profileCharTag2','profileCharTag3','profileCharDesc','profileCharImage','profileCharScale','profileCharX','profileCharY'],
    resetValues:{ profileCharRole:'BOT', profileCharName:'', profileCharTags:'', profileCharDesc:'', profileCharImage:'', profileCharScale:'100', profileCharX:'50', profileCharY:'50' }
  },
  {
    label:'USER', toggleId:'profileUserOn', groupId:'profileUserGroup', resetButtonId:'profileUserResetBtn',
    controlIds:['profileUserRole','profileUserName','profileUserTag1','profileUserTag2','profileUserTag3','profileUserDesc','profileUserImage','profileUserScale','profileUserX','profileUserY'],
    resetValues:{ profileUserRole:'USER', profileUserName:'', profileUserTags:'', profileUserDesc:'', profileUserImage:'', profileUserScale:'100', profileUserX:'50', profileUserY:'50' }
  },
  ...MosaicState.EXTRA_PROFILE_SLOTS.map(slot => {
    const prefix = MosaicState.extraProfilePrefix(slot);
    return { label:`인물 ${slot}`, toggleId:prefix + 'On', groupId:prefix + 'Group', resetButtonId:prefix + 'ResetBtn',
      controlIds:[...MosaicState.extraProfileFields(slot), ...[1,2,3].map(index => `${prefix}Tag${index}`)],
      resetValues:{ [`${prefix}Role`]:'CHAR', [`${prefix}Name`]:'', [`${prefix}Tags`]:'', [`${prefix}Desc`]:'', [`${prefix}Image`]:'', [`${prefix}Scale`]:'100', [`${prefix}X`]:'50', [`${prefix}Y`]:'50' } };
  }),
  {
    label:'관계', toggleId:'profileRelationshipOn', groupId:'profileRelationshipGroup', resetButtonId:'profileRelationshipResetBtn',
    controlIds:['profileRelationshipHeading','profileRelationship1','profileRelationship2','profileRelationship3'],
    resetValues:{ profileRelationshipHeading:MosaicState.WORK_FIELD_DEFAULTS.profileRelationshipHeading, profileRelationship:'' },
    emptyMessage:'관계는 이미 초기 상태입니다.',
    completeMessage:'관계를 초기화했습니다.'
  },
  {
    label:'상황', toggleId:'profileSituationOn', groupId:'profileSituationGroup', resetButtonId:'profileSituationResetBtn',
    controlIds:['profileSituationHeading','profileSituation'],
    resetValues:{ profileSituationHeading:MosaicState.WORK_FIELD_DEFAULTS.profileSituationHeading, profileSituation:'' },
    emptyMessage:'상황은 이미 초기 상태입니다.',
    completeMessage:'상황을 초기화했습니다.'
  }
];

function applyProfileReset(entries, message){
  appCommands.snapshotCards();
  entries.forEach(([id, value]) => {
    const control = document.getElementById(id);
    if(control.type === 'checkbox') control.checked = value;
    else control.value = value;
  });
  syncProfileTagEditorsFromMasters();
  syncProfileImageRangeLabels();
  syncCoverControlState();
  syncDesignSummaries();
  uiUpdateEffects.committedChange();
  showUndoToast(message);
}

function resetProfileEntity(config){
  if(!document.getElementById('profileOn').checked || !document.getElementById(config.toggleId).checked) return;
  const entries = Object.entries(config.resetValues);
  const changed = entries.some(([id, value]) => {
    const control = document.getElementById(id);
    return (control.type === 'checkbox' ? control.checked : control.value) !== value;
  });
  if(!changed){
    showNoticeToast(config.emptyMessage || `${config.label} 프로필은 이미 초기 상태입니다.`);
    return;
  }
  applyProfileReset(entries, config.completeMessage || `${config.label} 프로필을 초기화했습니다.`);
}

function bindProfileResetEvents(){
  bindUIFeatureEvents('profile-reset', () => {
    PROFILE_ENTITY_CONFIGS.forEach(config => {
      document.getElementById(config.resetButtonId).addEventListener('click', () => {
        resetProfileEntity(config);
      });
      const actions = document.getElementById(config.toggleId).closest('.profileSubActions');
      if(actions){
        actions.addEventListener('click', event => event.stopPropagation());
        actions.addEventListener('keydown', event => event.stopPropagation());
      }
    });
  });
}

function copyExtraProfile(fromSlot, toSlot){
  const from = MosaicState.extraProfilePrefix(fromSlot);
  const to = MosaicState.extraProfilePrefix(toSlot);
  ['Role','Image','Scale','X','Y','Name','Desc','Tags'].forEach(field => {
    document.getElementById(to + field).value = document.getElementById(from + field).value;
  });
  document.getElementById(to + 'On').checked = document.getElementById(from + 'On').checked;
}

function resetExtraProfileSlot(slot){
  const prefix = MosaicState.extraProfilePrefix(slot);
  Object.entries({ Role:'CHAR', Image:'', Scale:'100', X:'50', Y:'50', Name:'', Desc:'', Tags:'' })
    .forEach(([field,value]) => { document.getElementById(prefix + field).value = value; });
  document.getElementById(prefix + 'On').checked = true;
}

function commitExtraProfileChange(message){
  MosaicState.EXTRA_PROFILE_SLOTS.forEach(slot => {
    const status = document.getElementById(`profileExtra${slot}ImageStatus`);
    status.dataset.state = 'idle';
    status.hidden = true;
    status.textContent = '';
  });
  syncProfileTagEditorsFromMasters();
  syncProfileImageRangeLabels();
  syncExtraProfileEditors();
  syncCoverControlState();
  syncDesignSummaries();
  uiUpdateEffects.committedChange();
  showUndoToast(message);
}

function moveProfileEntity(key, direction){
  const order = currentProfileEntityOrder();
  const nextOrder = MosaicState.moveProfileEntityOrder(order, key, direction);
  if(nextOrder.join('\u0000') === order.join('\u0000')) return false;
  appCommands.snapshotCards();
  setProfileEntityOrder(nextOrder);
  syncProfileEntityEditors();
  syncCoverControlState();
  syncDesignSummaries();
  uiUpdateEffects.committedChange();
  showUndoToast('인물 순서를 변경했습니다.');
  return true;
}

function addExtraProfile(){
  const count = settingsReader.extraProfileCount();
  if(count >= MosaicState.EXTRA_PROFILE_SLOTS.length) return;
  appCommands.snapshotCards();
  const slot = count + 3;
  const order = currentProfileEntityOrder();
  resetExtraProfileSlot(slot);
  document.getElementById('profileExtraCount').value = String(count + 1);
  setProfileEntityOrder([...order, `extra${slot}`]);
  document.getElementById(`profileExtra${slot}Group`).open = true;
  commitExtraProfileChange(`인물 ${slot}을 추가했습니다.`);
}

function removeExtraProfile(slot){
  const count = settingsReader.extraProfileCount();
  if(slot < 3 || slot > count + 2) return;
  appCommands.snapshotCards();
  const nextOrder = currentProfileEntityOrder()
    .filter(key => key !== `extra${slot}`)
    .map(key => {
      const match = key.match(/^extra([3-5])$/);
      return match && Number(match[1]) > slot ? `extra${Number(match[1]) - 1}` : key;
    });
  for(let current = slot; current < count + 2; current++) copyExtraProfile(current + 1, current);
  resetExtraProfileSlot(count + 2);
  document.getElementById('profileExtraCount').value = String(count - 1);
  setProfileEntityOrder(nextOrder);
  commitExtraProfileChange(`인물 ${slot}을 삭제했습니다.`);
}

function bindProfileEntityEvents(){
  bindUIFeatureEvents('profile-entities', () => {
    document.getElementById('profileAddBtn').addEventListener('click', addExtraProfile);

    document.getElementById('profileEntityEditors').addEventListener('click', event => {
      const action = event.target.closest('[data-profile-remove], [data-profile-move]');
      if(!action || action.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      if(action.dataset.profileMove){
        moveProfileEntity(action.dataset.profileKey, action.dataset.profileMove);
        return;
      }
      const slot = Number(action.dataset.profileRemove);
      if(!action.dataset.profileRemove) return;
      removeExtraProfile(slot);
    }, true);

    MosaicState.EXTRA_PROFILE_SLOTS.forEach(slot => {
      ['Role','Name'].forEach(field => document.getElementById(`profileExtra${slot}${field}`).addEventListener('input', syncExtraProfileEditors));
    });
  });
}

function bindProfileFieldEvents(){
  bindUIFeatureEvents('profile-fields', () => {
    // 표지 섹션 헤더의 표시 스위치는 접기/펼치기와 독립적으로 작동한다.
    document.querySelectorAll('#tabCover .coverFoldActions, #tabDesign .advancedDesignGroup .coverFoldActions').forEach(actions => {
      actions.addEventListener('click', event => event.stopPropagation());
      actions.addEventListener('keydown', event => event.stopPropagation());
    });

    PROFILE_TAG_GROUPS.forEach(group => {
      group.editorIds.forEach((id, index) => {
        const editor = document.getElementById(id);
        editor.addEventListener('input', () => {
          if(/[,，]/.test(editor.value)){
            const tags = splitProfileTags(editor.value);
            group.editorIds.slice(index).forEach((targetId, offset) => {
              document.getElementById(targetId).value = tags[offset] || '';
            });
          }
          syncProfileTagMaster(group, true);
        });
        editor.addEventListener('blur', () => {
          editor.value = normalizeProfileTag(editor.value);
          syncProfileTagMaster(group, true);
        });
      });
    });

    // 이미지 URL이 바뀌면 //로 시작하는 프로토콜 상대경로에 https:를 붙여준다.
    ['imgUrl','profileCharImage','profileUserImage',...MosaicState.EXTRA_PROFILE_SLOTS.map(slot => `profileExtra${slot}Image`)].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        const input = document.getElementById(id);
        const url = MosaicState.normalizeProtocolRelativeUrl(input.value);
        if(input.value !== url){
          input.value = url;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });
  });
}

const subtitleCoupleSeparatorInput = document.getElementById('subtitleCoupleSeparator');

const subtitleCoupleSeparatorBtn = document.getElementById('subtitleCoupleSeparatorBtn');

function syncSubtitleCoupleSeparatorControl(){
  const separator = MosaicState.normalizeSubtitleCoupleSeparator(subtitleCoupleSeparatorInput.value);
  subtitleCoupleSeparatorInput.value = separator;
  subtitleCoupleSeparatorBtn.textContent = separator;
  const separators = ['×', '&', '·'];
  const next = separators[(separators.indexOf(separator) + 1) % separators.length];
  subtitleCoupleSeparatorBtn.setAttribute('aria-label', `이름 구분 기호 ${separator} · 눌러서 ${next}로 변경`);
  subtitleCoupleSeparatorBtn.title = `이름 구분 기호를 ${next}로 변경`;
}

function bindSubtitleSeparatorEvents(){
  bindUIFeatureEvents('subtitle-separator', () => {
    subtitleCoupleSeparatorInput.addEventListener('input', syncSubtitleCoupleSeparatorControl);
    subtitleCoupleSeparatorBtn.addEventListener('click', () => {
      if(subtitleCoupleSeparatorBtn.disabled) return;
      appCommands.snapshotCards();
      const separators = ['×', '&', '·'];
      const current = MosaicState.normalizeSubtitleCoupleSeparator(subtitleCoupleSeparatorInput.value);
      subtitleCoupleSeparatorInput.value = separators[(separators.indexOf(current) + 1) % separators.length];
      subtitleCoupleSeparatorInput.dispatchEvent(new Event('input', { bubbles:true }));
      showUndoToast(`이름 구분 기호를 ${subtitleCoupleSeparatorInput.value}로 변경했습니다.`);
    });
  });
}

// 모든 입력 변경시 리렌더 (헥스 입력창은 위에서 별도 처리하므로 여기선 건드리지 않음)
// 상태 필드와 기본값은 state.js의 단일 스키마를 사용한다.
const SIDEBAR_OUTPUT_IDS = new Set([...MosaicState.WORK_FIELDS, ...MosaicState.STYLE_FIELDS, ...MosaicState.WORK_BOOLEAN_FIELDS]);

// 표시 여부에 따라 미리보기 높이가 크게 바뀌는 옵션들.
// 위치 맞추기가 꺼져 있으면 브라우저의 자동 스크롤 보정까지 취소해 현재 화면을 유지한다.
const POSITION_PRESERVE_TOGGLE_IDS = new Set(['logTitleOn', 'titleMinimal', 'titleImageBackgroundOn', 'profileOn', 'profileDividerMinimal', 'profileCharOn', 'profileUserOn', ...MosaicState.EXTRA_PROFILE_SLOTS.map(slot => `profileExtra${slot}On`), 'profileImageBackgroundOn', 'profileRelationshipOn', 'profileSituationOn', 'footerOn', 'creditOn', 'creditPlacement', 'cardLayout']);


function previewProfileRoleTarget(role){
  return document.querySelector(`#preview [data-mosaic-profile-role="${role}"]`) || previewLayout.previewParts().profile;
}

function previewProfileFieldTarget(id){
  let targetId = id;
  if(/^profileExtra[3-5]Tags$/.test(id)){
    const prefix = id.slice(0, -4);
    targetId = new RegExp(`^${prefix}Tag[1-3]$`).test(document.activeElement && document.activeElement.id)
      ? document.activeElement.id : `${prefix}Tag1`;
  }else if(id === 'profileCharTags'){
    targetId = /^profileCharTag[1-3]$/.test(document.activeElement && document.activeElement.id)
      ? document.activeElement.id : 'profileCharTag1';
  }else if(id === 'profileUserTags'){
    targetId = /^profileUserTag[1-3]$/.test(document.activeElement && document.activeElement.id)
      ? document.activeElement.id : 'profileUserTag1';
  }else if(id === 'profileRelationship'){
    targetId = /^profileRelationship[1-3]$/.test(document.activeElement && document.activeElement.id)
      ? document.activeElement.id : 'profileRelationship1';
  }
  return document.querySelector(`#preview [data-mosaic-profile-field="${targetId}"]`)
    || document.querySelector(`#preview [data-mosaic-profile-image-field="${targetId}"]`)
    || previewLayout.previewParts().profile;
}

function previewCreditFieldTarget(index, field){
  if(!Number.isInteger(index) || index < 0) return previewLayout.previewParts().credit;
  const credit = previewLayout.previewParts().credit;
  if(!credit) return null;
  const preferredField = field === 'label' ? 'label' : 'value';
  return credit.querySelector(`[data-mosaic-credit-index="${index}"][data-mosaic-credit-field="${preferredField}"]`)
    || credit.querySelector(`[data-mosaic-credit-index="${index}"]`)
    || credit;
}

function activeCreditPreviewTarget(){
  const id = document.activeElement && document.activeElement.id;
  const match = String(id || '').match(/^credit(Label|Value|Url)(\d+)$/);
  if(!match) return previewLayout.previewParts().credit;
  const field = match[1] === 'Label' ? 'label' : 'value';
  return previewCreditFieldTarget(Number(match[2]), field);
}

const PREVIEW_FOCUS_MAP = {
  logNumber:  () => previewLayout.previewParts().title,
  logTitle:   () => previewLayout.previewParts().title,
  subChar:    () => previewLayout.previewParts().title,
  subUser:    () => previewLayout.previewParts().title,
  subtitleCoupleSeparator:() => previewLayout.previewParts().title,
  logSubtitle:() => previewLayout.previewParts().title,
  logTitleOn: () => previewLayout.previewParts().title,
  titleMinimal:() => previewLayout.previewParts().title,
  titleTextPosition:() => previewLayout.previewParts().title,
  imgOn:      () => previewLayout.previewParts().image,
  imgUrl:     () => previewLayout.previewParts().image,
  imgHeight:  () => previewLayout.previewParts().image,
  xpos:       () => previewLayout.previewParts().image,
  ypos:       () => previewLayout.previewParts().image,
  profileOn:  () => previewLayout.previewParts().profile,
  profileDividerMinimal:() => previewLayout.previewParts().profile,
  profileCharOn:() => previewProfileRoleTarget('bot'),
  profileUserOn:() => previewProfileRoleTarget('user'),
  profileRelationshipOn:() => previewLayout.previewParts().profile,
  profileSituationOn:() => previewLayout.previewParts().profile,
  profilePlacement:() => previewLayout.previewParts().profile,
  profileTextPosition:() => previewLayout.previewParts().profile,
  profileImageBackgroundOn:() => previewLayout.previewParts().profile,
  profileStyle:() => previewLayout.previewParts().profile,
  profileOrder:() => previewLayout.previewParts().profile,
  profileEntityOrder:() => previewLayout.previewParts().profile,
  profileCharImage:() => previewProfileFieldTarget('profileCharImage'),
  profileCharScale:() => previewProfileFieldTarget('profileCharImage'),
  profileCharX:() => previewProfileFieldTarget('profileCharImage'),
  profileCharY:() => previewProfileFieldTarget('profileCharImage'),
  profileCharName: () => previewProfileFieldTarget('profileCharName'),
  profileCharRole: () => previewProfileFieldTarget('profileCharRole'),
  profileCharDesc: () => previewProfileFieldTarget('profileCharDesc'),
  profileCharTags: () => previewProfileFieldTarget('profileCharTags'),
  profileUserImage:() => previewProfileFieldTarget('profileUserImage'),
  profileUserScale:() => previewProfileFieldTarget('profileUserImage'),
  profileUserX:() => previewProfileFieldTarget('profileUserImage'),
  profileUserY:() => previewProfileFieldTarget('profileUserImage'),
  profileUserName: () => previewProfileFieldTarget('profileUserName'),
  profileUserRole: () => previewProfileFieldTarget('profileUserRole'),
  profileUserDesc: () => previewProfileFieldTarget('profileUserDesc'),
  profileUserTags: () => previewProfileFieldTarget('profileUserTags'),
  profileRelationshipHeading:() => previewProfileFieldTarget('profileRelationshipHeading'),
  profileRelationship:() => previewProfileFieldTarget('profileRelationship'),
  profileSituationHeading:() => previewProfileFieldTarget('profileSituationHeading'),
  profileSituation:() => previewProfileFieldTarget('profileSituation'),
  // 숨긴 뒤에는 대체 대상으로 마지막 카드 전체를 반환하지 않는다.
  // 큰 카드를 중앙 정렬하며 미리보기 스크롤이 튀는 것을 막고,
  // 다시 표시한 경우에도 접힌 카드 안이라면 스크롤하거나 카드를 열지 않는다.
  footerOn: () => previewLayout.previewVisibleFooterElement(),
  footerAuthor: () => previewLayout.previewVisibleFooterElement(),
  creditOn: () => previewLayout.previewParts().credit,
  creditPlacement: () => previewLayout.previewParts().credit,
  creditItems: () => activeCreditPreviewTarget(),
};

function hasMarkdownCardContent(){
  return Array.from(document.querySelectorAll('#cardEditors .cardEditor')).some(editor => {
    if(editor.dataset.blockType === 'comment' || editor.dataset.outputVisible === 'false') return false;
    const textarea = editor.querySelector('textarea');
    if(!textarea) return false;
    // 일부 접기 제목은 아래의 '접기 제목' 정렬이 담당한다. 일반 소제목만 감지해
    // 접기 소제목밖에 없을 때 효과 없는 마크다운 버튼이 활성화되지 않게 한다.
    return /^(?:\s*\[C\]\s*)?\s*#{1,4}\s+\S/im.test(textarea.value);
  });
}

function hasQuoteCardContent(){
  return Array.from(document.querySelectorAll('#cardEditors .cardEditor')).some(editor => {
    if(editor.dataset.blockType === 'comment' || editor.dataset.outputVisible === 'false') return false;
    const textarea = editor.querySelector('textarea');
    return !!(textarea && /^(?:\s*\[C\]\s*)?\s*>(?!>)\s*(?:\[C\]\s*)?\S/im.test(textarea.value));
  });
}

function hasMemoCardContent(){
  return Array.from(document.querySelectorAll('#cardEditors .cardEditor')).some(editor => {
    if(editor.dataset.blockType === 'comment' || editor.dataset.outputVisible === 'false') return false;
    const textarea = editor.querySelector('textarea');
    return !!textarea && textarea.value.split('\n').some(line =>
      !!MosaicParser.parseBodyCommentLine(line)?.content.trim());
  });
}

function hasBodyFoldTitleContent(){
  return Array.from(document.querySelectorAll('#cardEditors .cardEditor')).some(editor => {
    if(editor.dataset.blockType === 'comment' || editor.dataset.outputVisible === 'false') return false;
    const textarea = editor.querySelector('textarea');
    return !!(textarea && /^(?:\s*\[C\]\s*)?\s*\[접기(?:\s+.*?)?\]/im.test(textarea.value));
  });
}

function syncParagraphControlAvailability(rowId, controlIds, enabled, disabledTitle){
  const row = document.getElementById(rowId);
  row.classList.toggle('isControlDisabled', !enabled);
  row.setAttribute('aria-disabled', String(!enabled));
  row.title = enabled ? '' : disabledTitle;
  controlIds.map(id => document.getElementById(id)).forEach(control => {
    control.disabled = !enabled;
    control.setAttribute('aria-disabled', String(!enabled));
  });
}

function syncParagraphSettingsUI(){
  const press = (id, value) => document.getElementById(id).setAttribute('aria-pressed', String(value));
  const narrIndent = document.getElementById('narrIndent').checked;
  press('narrIndentNone', !narrIndent);
  press('narrIndentFirst', narrIndent);
  syncParagraphControlAvailability(
    'markdownAlignRow',
    ['headingCenter'],
    hasMarkdownCardContent(),
    '카드에 마크다운 소제목을 입력하면 설정할 수 있습니다.'
  );
  syncParagraphControlAvailability(
    'memoAlignRow',
    ['memoCenter'],
    hasMemoCardContent(),
    '카드에 메모(: 내용)를 입력하면 설정할 수 있습니다.'
  );
  syncParagraphControlAvailability(
    'quoteAlignRow',
    ['quoteCenter'],
    hasQuoteCardContent(),
    '카드에 인용문을 입력하면 설정할 수 있습니다.'
  );
  syncParagraphControlAvailability(
    'bodyFoldTitleAlignRow',
    ['bodyFoldTitleCenter'],
    hasBodyFoldTitleContent(),
    '카드에 본문 접기를 입력하면 설정할 수 있습니다.'
  );
  const commentWidth = MosaicState.normalizeCommentWidth(document.getElementById('commentWidth').value);
  const commentAlign = MosaicState.normalizeCommentAlign(document.getElementById('commentAlign').value);
  press('commentWidthDefault', commentWidth === 'default');
  press('commentWidthCard', commentWidth === 'card');
  press('commentAlignLeft', commentAlign === 'left');
  press('commentAlignCenter', commentAlign === 'center');

  const hasCommentCard = !!document.querySelector('#cardEditors .commentEditor');
  syncParagraphControlAvailability(
    'commentWidthRow',
    ['commentWidthDefault','commentWidthCard'],
    hasCommentCard,
    '코멘트 카드를 추가하면 설정할 수 있습니다.'
  );
  syncParagraphControlAvailability(
    'commentAlignRow',
    ['commentAlignLeft','commentAlignCenter'],
    hasCommentCard,
    '코멘트 카드를 추가하면 설정할 수 있습니다.'
  );
}

function setParagraphOptions(nextState){
  const changed = [];
  Object.entries(nextState).forEach(([id, value]) => {
    const input = document.getElementById(id);
    const isCheckbox = input.type === 'checkbox';
    const next = isCheckbox ? !!value : String(value);
    const current = isCheckbox ? input.checked : input.value;
    if(current === next) return;
    if(isCheckbox) input.checked = next;
    else input.value = next;
    changed.push(input);
  });
  // 한 번의 선택 변경은 한 번만 렌더·저장한다.
  syncParagraphSettingsUI();
  if(changed.length) changed[0].dispatchEvent(new Event('input', { bubbles:true }));
}

function bindParagraphSettingEvents(){
  bindUIFeatureEvents('paragraph-settings', () => {
    document.getElementById('narrIndentNone').addEventListener('click', () => {
      setParagraphOptions({ narrIndent:false });
    });
    document.getElementById('narrIndentFirst').addEventListener('click', () => {
      setParagraphOptions({ narrIndent:!document.getElementById('narrIndent').checked });
    });
    document.getElementById('commentWidthDefault').addEventListener('click', () => {
      setParagraphOptions({ commentWidth:'default' });
    });
    document.getElementById('commentWidthCard').addEventListener('click', () => {
      setParagraphOptions({ commentWidth:'card' });
    });
    document.getElementById('commentAlignLeft').addEventListener('click', () => {
      setParagraphOptions({ commentAlign:'left' });
    });
    document.getElementById('commentAlignCenter').addEventListener('click', () => {
      setParagraphOptions({ commentAlign:'center' });
    });
  });
}

function bindProfileCompositionEvents(input){
  let composing = false;
  input.addEventListener('compositionstart', () => {
    composing = true;
    appCommands.deferDraftSave();
  });
  input.addEventListener('compositionend', () => {
    composing = false;
    input.dispatchEvent(new Event('input', { bubbles:true }));
  });
  return event => composing || event.isComposing;
}

function bindSidebarOutputEvents(){
  bindUIFeatureEvents('sidebar-output', () => {
    document.querySelectorAll('#sidebar input, #sidebar select, #sidebar textarea').forEach(el => {
      if(el.classList.contains('hexLabel') || !SIDEBAR_OUTPUT_IDS.has(el.id)) return;
      // 체크·해제 양쪽을 확실히 처리하기 위해 이 옵션은 아래 change 전용 처리기로 연결한다.
      if(el.id === 'foldTitleDecorationOn' || el.id === 'foldDividerOn' || el.id === 'foldTitleAutoNumber') return;
      const isComposing = /^profileExtra[3-5](?:Name|Role)$/.test(el.id)
        ? bindProfileCompositionEvents(el) : () => false;
      el.addEventListener('input', event => {
        if(isComposing(event)){
          appCommands.deferDraftSave();
          return;
        }
        if(el.id !== 'advancedOn' && el.closest('#advancedDesignGroup')){
          document.getElementById('advancedOn').checked = true;
        }
        const positionSync = positionSyncEnabled();
        const preserveViewport = !positionSync && POSITION_PRESERVE_TOGGLE_IDS.has(el.id);
        const viewportX = preserveViewport ? window.scrollX : 0;
        const viewportY = preserveViewport ? window.scrollY : 0;
        if(positionSync && PREVIEW_FOCUS_MAP[el.id]) focusPreviewOn(PREVIEW_FOCUS_MAP[el.id]);
        else if(!positionSync) previewPositionState.pendingFocus = null;
        uiUpdateEffects.settingsInput(el.id);
        if(preserveViewport){
          requestAnimationFrame(() => window.scrollTo(viewportX, viewportY));
        }
      });
    });

    // 값이 바뀌기 전에도 프로필 입력칸을 클릭하는 즉시 오른쪽의 대응 요소를 보여준다.
    document.getElementById('profileGroup').addEventListener('focusin', event => {
      if(!positionSyncEnabled()) return;
      const id = event.target && event.target.id;
      if(!id) return;
      let target = null;
      if(/^(?:profileCharTag|profileUserTag|profileExtra[3-5]Tag|profileRelationship)[1-3]$/.test(id)){
        target = previewProfileFieldTarget(id);
      }else if(PREVIEW_FOCUS_MAP[id]){
        target = PREVIEW_FOCUS_MAP[id]();
      }
      if(target) scrollPreviewIfNeeded(target, true);
    });

    document.getElementById('footerGroup').addEventListener('focusin', event => {
      if(event.target.id !== 'footerAuthor' || !positionSyncEnabled()) return;
      const target = previewLayout.previewVisibleFooterElement();
      if(target) scrollPreviewIfNeeded(target, true);
    });

    // 크레딧 URL은 별도의 출력 글자가 없으므로 내용(없으면 항목명)을 대상으로 삼는다.
    document.getElementById('creditGroup').addEventListener('focusin', event => {
      if(!positionSyncEnabled()) return;
      const id = event.target && event.target.id;
      const match = String(id || '').match(/^credit(Label|Value|Url)(\d+)$/);
      if(!match) return;
      const field = match[1] === 'Label' ? 'label' : 'value';
      const target = previewCreditFieldTarget(Number(match[2]), field);
      if(target) scrollPreviewIfNeeded(target, true);
    });

    ['foldTitleDecorationOn','foldDividerOn','foldTitleAutoNumber'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        syncDesignSummaries();
        uiUpdateEffects.renderedDraftChange();
        appCommands.commitStyleHistory(true);
      });
    });
    document.getElementById('textFont').addEventListener('change', () => loadSelectedWebFont('textFont'));
  });
}

function syncProfileEntityControlState(){
  PROFILE_ENTITY_CONFIGS.forEach(config => {
    const toggle = document.getElementById(config.toggleId);
    document.getElementById(config.resetButtonId).disabled =
      !document.getElementById('profileOn').checked || !toggle.checked;
    // OFF 상태도 시각적으로만 흐리게 표시하고 실제 입력은 받을 수 있게 둔다.
    toggle.disabled = false;
    const switchLabel = toggle.closest('.coverVisibilitySwitch');
    if(switchLabel) switchLabel.title = `${config.label} 표시 전환`;
    const group = document.getElementById(config.groupId);
    const body = group && group.querySelector('.profileSubBody');
    if(body) body.classList.toggle('isEntityDisabled', !toggle.checked);
    config.controlIds.forEach(id => {
      const control = document.getElementById(id);
      if(!control) return;
      control.disabled = false;
      const rangeEditor = document.querySelector(`.rangeEditor input[data-range="${id}"]`);
      if(rangeEditor) rangeEditor.disabled = false;
    });
  });
}

const COVER_VISIBILITY_GROUPS = [
  ['imageGroup', 'imgOn'],
  ['titleGroup', 'logTitleOn'],
  ['profileGroup', 'profileOn'],
  ['footerGroup', 'footerOn'],
  ['creditGroup', 'creditOn'],
];

function syncCoverControlState(){
  controlSync.invalidateControlSync();
  syncExtraProfileEditors();
  COVER_VISIBILITY_GROUPS.forEach(([groupId, toggleId]) => {
    document.getElementById(groupId).classList.toggle(
      'isCoverInactive', !document.getElementById(toggleId).checked
    );
  });
  syncSubtitleCoupleSeparatorControl();
  syncCoverImageRangeLabels();
  syncProfileImageRangeLabels();
  controlSync.syncCoverRangeProgress();
  // 상위 섹션의 OFF 상태는 출력만 숨긴다. 입력은 유지해 첫 조작으로 자동 ON한다.
  subtitleCoupleSeparatorBtn.disabled = false;
  syncProfileEntityControlState();
  syncProfileImageUiState();
  syncImageBackgroundToggleAvailability();
  library.syncAllSegmentedChoiceControls();
  library.syncMinimalChoiceControls();
  appCommands.updateAllImageLoadStatuses();
  syncCreditControlState();
  controlSync.syncCreditDetailAvailability();
  appCommands.syncPreviewVisibilityToggles();
}

function syncCreditControlState(){
  const area = document.getElementById('creditEditorArea');
  if(!area) return;
  const rows = Array.from(area.querySelectorAll('.creditEditorRow'));
  rows.forEach((row, index) => {
    const moveButtons = row.querySelectorAll('.creditMoveGroup .itemMoveBtn');
    const dividerButton = row.querySelector('.creditDividerBtn');
    if(dividerButton) dividerButton.disabled = index === 0;
    if(moveButtons[0]) moveButtons[0].disabled = index === 0;
    if(moveButtons[1]) moveButtons[1].disabled = index === rows.length - 1;
  });
  library.syncSegmentedChoiceControl('creditPlacement');
  credit.syncCreditPresetControls();
}

function enableVisibilityToggle(toggle){
  toggle.checked = true;
  toggle.dispatchEvent(new Event('input', { bubbles:true }));
  toggle.dispatchEvent(new Event('change', { bubbles:true }));
}

function bindVisibilityActivation(root, toggle, options = {}){
  const controlSelector = options.controlSelector || 'input, select, textarea, button, label';
  const activate = event => {
    if(toggle.checked) return;
    const target = event.target;
    if(!(target instanceof Element)) return;
    if(options.requireFoldBody && !target.closest('.foldBody')) return;
    if(target.closest('.imageBackgroundToggleRow.isUnavailable')) return;
    if(!target.closest(controlSelector)) return;
    enableVisibilityToggle(toggle);
  };
  ['pointerdown','click','input','change'].forEach(type => root.addEventListener(type, activate, true));
}

function bindCoverAndPresetEvents(){
  bindUIFeatureEvents('cover-and-presets', () => {
    // 표지의 접기 제목은 표시 상태를 바꾸지 않는다. 안쪽 설정을 조작할 때만
    // 해당 섹션을 먼저 켜고 원래의 클릭·입력 동작은 그대로 진행한다.
    COVER_VISIBILITY_GROUPS.forEach(([groupId, toggleId]) => {
      const group = document.getElementById(groupId);
      const toggle = document.getElementById(toggleId);
      bindVisibilityActivation(group, toggle, {
        requireFoldBody:true,
        controlSelector:'input, select, textarea, button, label, .creditRowHeader'
      });
    });

    // 인물·관계·상황이 자체 OFF일 때도 첫 입력으로 해당 항목만 켠다.
    PROFILE_ENTITY_CONFIGS.forEach(config => {
      const body = document.querySelector(`#${config.groupId} > .profileSubBody`);
      const toggle = document.getElementById(config.toggleId);
      bindVisibilityActivation(body, toggle);
    });
    ['imgOn','logTitleOn','profileOn','profileCharOn','profileUserOn',...MosaicState.EXTRA_PROFILE_SLOTS.map(slot => `profileExtra${slot}On`),'profileRelationshipOn','profileSituationOn','footerOn','creditOn'].forEach(id => {
      document.getElementById(id).addEventListener('change', syncCoverControlState);
    });

    document.getElementById('creditAddBtn').addEventListener('click', credit.addCreditItem);
    document.getElementById('creditPresetSelect').addEventListener('change', credit.syncCreditPresetControls);
    document.getElementById('creditPresetName').addEventListener('input', credit.syncCreditPresetControls);
    document.getElementById('creditPresetLoadBtn').addEventListener('click', credit.loadSelectedCreditPreset);
    document.getElementById('creditPresetSaveBtn').addEventListener('click', credit.saveCurrentCreditPreset);
    document.getElementById('creditPresetDeleteBtn').addEventListener('click', credit.deleteSelectedCreditPreset);
    document.getElementById('detailPresetSelect').addEventListener('change', credit.syncDetailPresetControls);
    document.getElementById('detailPresetName').addEventListener('input', credit.syncDetailPresetControls);
    document.getElementById('detailPresetLoadBtn').addEventListener('click', credit.loadSelectedDetailPreset);
    document.getElementById('detailPresetSaveBtn').addEventListener('click', credit.saveCurrentDetailPreset);
    document.getElementById('detailPresetDeleteBtn').addEventListener('click', credit.deleteSelectedDetailPreset);
  });
}


// ---------- 작업 단위 되돌리기 안전망 ----------
// 큰 작업 직전 상태를 잠시 잡아두고, 작업이 끝나면 상단 공용 기록에 전·후 상태를 함께 쌓음.
// 글자 하나하나의 입력은 브라우저 기본 Ctrl/⌘+Z가 담당한다.
const undoToastState = {
  timer:null,
  action:null
};

const UNDO_TOAST_DURATION_MS = 4000;


function collectWork(){
  return MosaicState.collectWorkState(cardEditors.getCards(), settingsReader.collectWorkFields());
}

function collectSlotWork(){
  const data = collectWork();
  data.style = settingsReader.currentStyleValues();
  return data;
}

function captureDraftUiState(){
  return {
    ...settingsReader.collectDraftFields(),
    style:settingsReader.currentStyleValues(),
    cards:cardEditors.getCards()
  };
}

// 저장된 값과 입력 UI를 복원한다. 출력 렌더링과 초안 저장은 완료 단계에서 수행한다.
function applyWorkState(data){
  previewInteractions.discardActiveDirectEdit();
  outputRuleEditing.discard();
  mobilePanelNavigation.reset();
  controlSync.invalidateControlSync();
  const savedFields = data.fields || {};
  const fields = MosaicState.normalizeRetiredCoverImageFields({
    ...savedFields, ...MosaicState.savedProfileCommonVisibility(savedFields)
  });
  MosaicState.WORK_FIELDS.forEach(id => {
    document.getElementById(id).value = fields[id] !== undefined ? fields[id] : MosaicState.WORK_FIELD_DEFAULTS[id];
  });
  credit.renderCreditItemsEditor();
  syncProfileTagEditorsFromMasters();
  renderNameRuleList();
  renderKeywordRuleList();
  Object.entries(MosaicState.WORK_BOOLEAN_DEFAULTS).forEach(([id, fallback]) => {
    document.getElementById(id).checked = id === 'profileImageBackgroundOn'
      ? MosaicState.savedProfileImageBackgroundOn(fields)
      : id === 'profileDividerMinimal' ? MosaicState.savedProfileDividerMinimal(fields)
      : (fields[id] !== undefined ? MosaicState.settingFlagOn(fields[id]) : fallback);
  });
  if(data.style && typeof data.style === 'object') library.applyStyleValues(data.style);
  syncCoverControlState();
  syncDesignSummaries();
  document.getElementById('xposVal').value = document.getElementById('xpos').value;
  document.getElementById('yposVal').value = document.getElementById('ypos').value;
  document.getElementById('imgHeightVal').value = document.getElementById('imgHeight').value;
  const fullscreenContext = fullscreen.captureFullscreenContext();
  cardEditors.clearCardEditors();
  cardEditors.setActiveTextarea(null);
  const cards = (data.cards && data.cards.length) ? data.cards : [{ body:'', folded:false, foldTitle:'' }];
  cards.forEach(c => cardEditors.addCard(c, false));
  cardEditors.restoreEditorIdentities(data.editorIds);
  fullscreen.restoreFullscreenContext(fullscreenContext);
  cardEditors.setActiveTextarea(document.getElementById('fsOverlay').style.display === 'block'
    ? document.getElementById('fsTextarea') : cardEditors.bodyCardTextareas()[0] || null);
  library.invalidateCharacterRows();
  library.syncCharList();
}

// 본문·디자인 적용이 모두 끝난 상태만 출력하고 저장한다.
function finishWorkRestore(){
  uiUpdateEffects.committedChange();
}

// HTML·보관함 불러오기는 적용과 완료를 한 번에 수행한다.
function applyWork(data){
  appCommands.replaceWork(data);
}

function dismissToast(){
  const toast = document.getElementById('undoToast');
  toast.style.display = 'none';
  clearTimeout(undoToastState.timer);
  undoToastState.timer = null;
  undoToastState.action = null;
}

function openToast(message, undoAction, showUndoButton){
  const toast = document.getElementById('undoToast');
  const undoButton = document.getElementById('undoBtn');
  document.getElementById('undoMsg').textContent = message;
  undoToastState.action = typeof undoAction === 'function' ? undoAction : null;
  undoButton.hidden = !showUndoButton;
  toast.style.display = 'flex';
  clearTimeout(undoToastState.timer);
  undoToastState.timer = setTimeout(dismissToast, UNDO_TOAST_DURATION_MS);
}

function showUndoToast(message, undoAction){
  if(typeof undoAction !== 'function') appCommands.recordCompletedAction(message);
  openToast(message, undoAction, true);
}

// 복사처럼 작업 상태를 바꾸지 않는 알림에는 되돌리기 버튼을 노출하지 않는다.
// 그렇지 않으면 사용자가 복사 취소로 오해하고 직전 편집을 되돌릴 수 있다.
function showNoticeToast(message){
  openToast(message, null, false);
}

function bindUndoToastEvents(){
  bindUIFeatureEvents('undo-toast', () => {
    document.getElementById('undoBtn').addEventListener('click', () => {
      const undoAction = undoToastState.action;
      dismissToast();
      if(undoAction){
        undoAction();
        return;
      }
      appCommands.goActionHistory(-1);
    });

    // 토스트 밖의 화면을 누르면 즉시 닫는다. pointerdown 캡처 단계에서 기존
    // 토스트만 정리하므로, 이어지는 click이 새 알림을 띄우는 동작은 방해하지 않는다.
    document.addEventListener('pointerdown', event => {
      const toast = document.getElementById('undoToast');
      if(toast.style.display !== 'flex' || toast.contains(event.target)) return;
      dismissToast();
    }, true);
  });
}

// ---------- 본문 삽입 툴바 ----------
// 커서 위치(또는 선택 영역)에 텍스트를 넣고 편집 상태를 자연스럽게 유지
function insertIntoBody(prefix, suffix, placeholder, label){
  // 마지막으로 포커스했던 카드에 삽입 (없으면 첫 카드)
  let ta = cardEditors.activeTextarea();
  const imageInsertion = !suffix && !placeholder && !!MosaicRenderer.parseBodyImageLine(prefix);
  const commentInsertion = prefix === ': ' && !suffix && !placeholder;
  // 코멘트에는 이미지 삽입만 허용하고 나머지 본문 전용 문법은 계속 차단한다.
  const sourceTextarea = ta && (ta.__mirror || ta);
  if(sourceTextarea && sourceTextarea.closest('.commentEditor') && !imageInsertion) return;
  ta = ta || document.querySelector('#cardEditors .cardEditor:not(.commentEditor) textarea');
  if(!ta) return;
  cardEditors.setActiveTextarea(ta);
  const viewports = [ta, ta.__mirror, ta.closest('#sidebar, #fsOverlay')]
    .filter(Boolean).map(element => ({element, top:element.scrollTop, left:element.scrollLeft}));
  let start = ta.selectionStart;
  let end = ta.selectionEnd;
  // 선택이 없으면 현재 줄을 보존하고 그 아래에 빈 메모를 만든다.
  // 선택이 있으면 인용처럼 선택한 내용 자체를 독립 문단의 메모로 바꾼다.
  if(commentInsertion && start === end){
    const lineEnd = ta.value.indexOf('\n', start);
    start = end = lineEnd < 0 ? ta.value.length : lineEnd;
  }
  const before = ta.value.slice(0, start);
  const after = ta.value.slice(end);
  const selected = ta.value.slice(start, end);
  // 이미지는 독립된 한 줄이어야 한다. 선택한 글자는 지우지 않고 이미지 다음 문단에 둔다.
  const middle = selected ? (imageInsertion ? '\n\n' : '') + selected : placeholder || '';
  appCommands.snapshotCards();

  // 앞뒤로 빈 줄이 없으면 자동으로 넣어서 문단 규칙(엔터 구분)이 안 깨지게 함
  const needNlBefore = before.length > 0 && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
  const needNlAfter = after.length > 0 && !after.startsWith('\n\n') ? (after.startsWith('\n') ? '\n' : '\n\n') : '';

  // 메모 문법은 한 줄씩 적용된다. 여러 줄 선택은 빈 줄을 보존하고 각 내용 줄을
  // 메모로 표시하며, 이미 메모인 줄의 콜론은 중복해서 붙이지 않는다.
  const content = commentInsertion && selected
    ? selected.split('\n').map(line => !line.trim() || MosaicParser.parseBodyCommentLine(line) ? line : prefix + line).join('\n')
    : prefix + middle + suffix;
  const inserted = needNlBefore + content + needNlAfter;
  ta.value = before + inserted + after;

  // 선택/placeholder가 없는 구분 요소도 삽입 직후로 커서를 복원한다.
  // value를 바꾼 뒤 그대로 focus하면 브라우저가 본문 끝의 커서를 따라 스크롤한다.
  if(commentInsertion && !selected){
    const pos = before.length + needNlBefore.length + prefix.length;
    ta.setSelectionRange(pos, pos);
  } else if(selected || !placeholder){
    const pos = before.length + inserted.length;
    ta.setSelectionRange(pos, pos);
  } else {
    const selStart = before.length + needNlBefore.length + prefix.length;
    ta.setSelectionRange(selStart, selStart + placeholder.length);
  }
  fullscreen.syncMirror(ta);   // 전체 화면 편집 중이면 실제 카드 입력창에도 선택 위치까지 반영
  try { ta.focus({preventScroll:true}); }
  catch(error){ ta.focus(); }
  uiUpdateEffects.committedChange();
  // 값·선택·포커스 변경과 렌더가 끝난 뒤 입력창/거울/편집 패널의 읽던 위치를 유지한다.
  viewports.forEach(({element, top, left}) => {
    if(!element.isConnected) return;
    element.scrollTop = top;
    element.scrollLeft = left;
  });
  showUndoToast(label || '본문 요소 삽입.');
}

function insertBodyImage(){
  const urlInput = prompt('이미지 주소를 입력하세요.');
  if(urlInput === null) return;
  const url = urlInput.trim();
  if(!url || /[\s\]]/.test(url)){
    showNoticeToast('공백과 ]가 없는 이미지 주소를 입력하세요.');
    return;
  }
  const widthInput = prompt('이미지 가로 크기 (10~100%)\n세로 크기는 원본 비율에 맞춰 자동 조절됩니다.', '100');
  if(widthInput === null) return;
  const parsedWidth = parseInt(String(widthInput).replace('%', '').trim(), 10);
  if(!Number.isFinite(parsedWidth) || parsedWidth < 10 || parsedWidth > 100){
    showNoticeToast('크기는 10~100 사이의 숫자로 입력하세요.');
    return;
  }
  const captionInput = prompt('캡션 (선택 사항)', '');
  if(captionInput === null) return;
  const caption = captionInput.replace(/[\r\n]+/g, ' ').trim();
  const sizeMarker = parsedWidth === 100 ? '' : ` @${parsedWidth}`;
  const captionMarker = caption ? ` | ${caption}` : '';
  insertIntoBody(`[IMG ${url}${sizeMarker}${captionMarker}]`, '', '', '이미지 삽입.');
}

// ---------- 입력창 서식 도구막대 (B / I / C) ----------
// 선택한 글자를 마커로 감싸거나(굵게·강조), 커서가 놓인 줄을 가운데 정렬한다.
function applyTextareaFormat(ta, fmt){
  if(!ta || ta.closest('.commentEditor')) return;
  if(fmt !== 'center' && !previewInteractions.FMT_WRAP[fmt]) return;
  const val = ta.value;
  const s = ta.selectionStart, e = ta.selectionEnd;
  if(fmt !== 'center' && s === e) return;
  appCommands.snapshotCards();
  let resultLabel = '';

  if(fmt === 'center'){
    // 커서가 있는 줄 전체에 [C] 토글 (인용 `> ` 뒤에 삽입)
    const lineStart = val.lastIndexOf('\n', s - 1) + 1;
    let lineEnd = val.indexOf('\n', s);
    if(lineEnd === -1) lineEnd = val.length;
    const line = val.slice(lineStart, lineEnd);
    let newLine;
    if(previewInteractions.CENTER_RE.test(line)){
      newLine = line.replace(previewInteractions.CENTER_RE, (m, q) => (q || ''));
      resultLabel = '가운데 정렬 해제.';
    } else {
      const qm = line.match(/^>(?!>)\s?/);
      newLine = qm ? qm[0] + '[C] ' + line.slice(qm[0].length) : '[C] ' + line;
      resultLabel = '가운데 정렬 적용.';
    }
    ta.value = val.slice(0, lineStart) + newLine + val.slice(lineEnd);
    const delta = newLine.length - line.length;
    ta.setSelectionRange(Math.max(lineStart, s + delta), Math.max(lineStart, e + delta));
  } else {
    const wrap = previewInteractions.FMT_WRAP[fmt];
    const sel = val.slice(s, e);
    // 새 굵기는 **로 적용하되, 기존 __ 문법도 같은 버튼으로 해제할 수 있게 유지한다.
    const wraps = fmt === 'bold' ? [wrap, '__'] : [wrap];
    let removed = false;
    for(const candidate of wraps){
      const escaped = candidate.replace(/[*]/g, '\\$&');
      const inner = new RegExp('^' + escaped + '([\\s\\S]+)' + escaped + '$');
      const m = sel.match(inner);
      if(m){
        ta.value = val.slice(0, s) + m[1] + val.slice(e);
        ta.setSelectionRange(s, s + m[1].length);
        removed = true;
        resultLabel = fmt === 'bold' ? '굵게 해제.' : '강조 해제.';
        break;
      }
      if(val.slice(Math.max(0, s - candidate.length), s) === candidate
         && val.slice(e, e + candidate.length) === candidate){
        ta.value = val.slice(0, s - candidate.length) + sel + val.slice(e + candidate.length);
        ta.setSelectionRange(s - candidate.length, s - candidate.length + sel.length);
        removed = true;
        resultLabel = fmt === 'bold' ? '굵게 해제.' : '강조 해제.';
        break;
      }
    }
    if(!removed){
      ta.value = val.slice(0, s) + wrap + sel + wrap + val.slice(e);
      ta.setSelectionRange(s + wrap.length, s + wrap.length + sel.length);
      resultLabel = fmt === 'bold' ? '굵게 적용.' : '강조 적용.';
    }
  }

  fullscreen.syncMirror(ta);
  ta.focus();
  uiUpdateEffects.committedChange();
  showUndoToast(resultLabel || '본문 서식 변경.');
}


function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function normalizedLiteralOffsets(text, query){
  return MosaicParser.literalMatchRanges(text, query).map(range => range.start);
}


function bindBodyToolEvents(){
  bindUIFeatureEvents('body-tools', () => {
document.getElementById('insertFoldBtn').addEventListener('click', () => {
  // 텍스트를 드래그해 두고 누르면 그 부분이 통째로 접기에 들어가고,
  // 선택 없이 누르면 빈 접기 틀이 들어가고 안쪽 내용이 선택 상태가 돼서 바로 타이핑하면 됨
  insertIntoBody('[접기 제목]\n\n', '\n\n[/접기]', '접힐 내용', '접기 삽입.');
});

document.getElementById('insertHrBtn').addEventListener('click', () => {
  insertIntoBody('[HR]', '', '', '구분선 삽입.');
});

document.getElementById('insertCommentBtn').addEventListener('click', () => {
  insertIntoBody(': ', '', '', '메모 삽입.');
});

document.getElementById('insertImgBtn').addEventListener('click', () => {
  insertBodyImage();
});

document.getElementById('insertQuoteBtn').addEventListener('click', () => {
  insertIntoBody('> ', '', '인용할 내용', '인용 삽입.');
});

document.getElementById('tidyBtn').addEventListener('click', () => {
  appCommands.snapshotCards();
  let changed = 0;
  cardEditors.bodyCardTextareas().forEach(ta => {
    const before = ta.value;
    let v = MosaicParser.normalizeQuotes(before).replace(/`/g, "'");
    v = MosaicParser.normalizeStandaloneHr(v);
    v = v.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');   // 폭 없는 문자 제거
    v = v.split('\n').map(l => l.replace(/\s+$/,'')).join('\n'); // 줄 끝 공백 제거
    v = v.replace(/\n{3,}/g, '\n\n');                     // 3줄 이상 빈 줄 -> 1줄
    v = v.trim();
    if(v !== before){ ta.value = v; changed++; }
  });
  uiUpdateEffects.committedChange();
  if(changed){
    showUndoToast(`정돈 완료 (${changed}개 입력 정리됨)`);
  } else {
    appCommands.discardUndoSnapshot();
    const st = document.getElementById('copyStatus');
    st.textContent = '바꿀 항목 없음.';
    setTimeout(() => { st.textContent = ''; }, 2500);
  }
});
  });
}

// 전체 화면 검색 미러에 필요한 글꼴·줄바꿈 속성.
const SEARCH_HL_PROPS = ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','lineHeight',
                       'textTransform','wordSpacing','textIndent','whiteSpace','wordWrap','overflowWrap',
                       'paddingTop','paddingRight','paddingBottom','paddingLeft'];

// 일치 부분을 metric-neutral span으로 감싼 HTML과 일치 수. 원문에서 찾은 뒤 조각별로 이스케이프 —
// 이스케이프 후 찾으면 &amp; 때문에 위치·검색어가 어긋난다.
// base: 이 텍스트 첫 일치의 전역 순번. curGlobal: 연두색으로 칠할 전역 순번(현재 선택).
// 반환의 offsets: 각 일치의 텍스트 내 시작 위치(현재 항목 스크롤·선택에 사용).
function searchHlMarkup(text, query, base, curGlobal){
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let out = '', last = 0, n = 0;
  const offsets = normalizedLiteralOffsets(text, query);
  offsets.forEach(at => {
    const isCur = (base + n) === curGlobal;
    out += esc(text.slice(last, at))
         + '<span class="searchHit' + (isCur ? ' cur' : '') + '">' + esc(text.slice(at, at + query.length)) + '</span>';
    last = at + query.length;
    n++;
  });
  out += esc(text.slice(last));
  return { html: out, count: n, offsets };
}

// 카드 시작점 또는 펼친 본문의 특정 줄을 사이드바 안에서만 스크롤한다.
// 순서 버튼의 alignStart는 화면 안에 있어도 상단에 맞춘다. 세로 배치에서만
// 페이지가 입력 패널의 스크롤을 담당하며, 기존 미리보기 위치 연동은 건드리지 않는다.
function scrollCardIntoSidebar(ed, anchorTop = null, {alignStart = false} = {}){
  if(!ed || !ed.isConnected) return;
  const stacked = previewLayout.isStackedLayout();
  if(stacked && !alignStart) return;
  const sidebar = document.getElementById('sidebar');
  const sidebarTop = document.getElementById('sidebarTop');
  const edRect = ed.getBoundingClientRect();
  const sbRect = sidebar.getBoundingClientRect();
  const margin = 12;
  const bodyToolbar = document.getElementById('bodyEditorToolbar');
  const toolbarVisible = bodyToolbar && bodyToolbar.offsetParent !== null;
  if(alignStart){
    // 이동 전의 실제 toolbar.bottom은 아직 sticky 위치가 아닐 수 있다.
    // 최종 고정 위치로 계산해 한 번의 스크롤로 카드 머리를 도구 바로 아래에 둔다.
    const headerHeight = sidebarTop ? sidebarTop.getBoundingClientRect().height : 0;
    cardEditors.syncBodyToolbarStickyOffset();
    const toolbarTop = toolbarVisible ? parseFloat(getComputedStyle(bodyToolbar).top) : 0;
    const toolbarBottom = toolbarVisible
      ? (Number.isFinite(toolbarTop) ? toolbarTop : Math.max(0, headerHeight - 2))
        + bodyToolbar.getBoundingClientRect().height
      : 0;
    const viewportTop = stacked ? 0 : sbRect.top + sidebar.clientTop;
    const desiredTop = viewportTop + Math.max(headerHeight, toolbarBottom) + margin;
    const scroller = stacked ? (document.scrollingElement || document.documentElement) : sidebar;
    const currentTop = stacked ? window.scrollY : sidebar.scrollTop;
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const nextTop = Math.max(0, Math.min(maxTop, currentTop + edRect.top - desiredTop));
    if(stacked) window.scrollTo({top:nextTop, behavior:'instant'});
    else sidebar.scrollTop = nextTop;
    return;
  }
  const headerGap = 28;  // 고정 탭 아래에 카드 헤더가 숨지 않도록 주는 여유
  // #sidebarTop은 sticky라 카드가 그 아래로 숨을 수 있다. 실제 보이는 시작점은
  // 사이드바 맨 위가 아니라 고정 헤더의 아랫선이다.
  const headerBottom = sidebarTop ? sidebarTop.getBoundingClientRect().bottom : sbRect.top;
  const toolbarBottom = toolbarVisible
    ? bodyToolbar.getBoundingClientRect().bottom
    : headerBottom;
  const desiredTop = Math.max(sbRect.top + margin, headerBottom + headerGap, toolbarBottom + margin);
  // 줄 좌표가 없으면 기존처럼 카드 헤더·입력창 시작점을 보여준다.
  if(Number.isFinite(anchorTop)){
    sidebar.scrollTop += anchorTop - desiredTop;
  } else if(edRect.top < desiredTop || edRect.bottom > sbRect.bottom - margin){
    sidebar.scrollTop += edRect.top - desiredTop;
  }
}

const NAME_RULE_LIMIT_MESSAGE = `이름 규칙은 최대 ${MosaicState.NAME_RULE_LIMIT}개까지 추가할 수 있습니다.`;

const outputRuleEditing = createOutputRuleEditing({
  readRules:kind => kind === 'name' ? nameRules() : keywordRules(),
  writeRules:(kind, rules) => kind === 'name' ? saveNameRules(rules, false) : saveKeywordRules(rules, false),
  snapshot:() => appCommands.snapshotCards(),
  changed:() => uiUpdateEffects.committedChange(),
  feedback:message => showUndoToast(message),
  setStatus:(kind, message) => { document.getElementById(kind === 'name' ? 'nameStatus' : 'keywordStatus').textContent = message; }
});

function nameRules(){
  return MosaicState.normalizeOutputRules(document.getElementById('nameRules').value, 'name');
}

function saveNameRules(rules, renderList = true){
  document.getElementById('nameRules').value = JSON.stringify(rules);
  if(renderList) renderNameRuleList();
  uiUpdateEffects.saveLater();
}

function toggleOutputRule(id, enabled, kind){
  const rules = kind === 'name' ? nameRules() : keywordRules();
  const rule = rules.find(item => item.id === id);
  if(!rule || rule.enabled === enabled) return;
  appCommands.snapshotCards();
  rule.enabled = enabled;
  if(kind === 'name') saveNameRules(rules);
  else saveKeywordRules(rules);
  uiUpdateEffects.committedChange();
  showUndoToast(`${kind === 'name' ? '이름' : '키워드'} 규칙 ${enabled ? '켜기' : '끄기'}.`);
}

function renderReplacementRuleItems(list, rules, label, undoRule, kind){
  outputRuleEditing.discard(list);
  list.replaceChildren();
  rules.forEach(rule => {
    const row = document.createElement('div');
    row.className = 'keywordRuleItem';
    row.classList.toggle('isRuleDisabled', !rule.enabled);
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.className = 'replacementRuleEnabled';
    enabled.checked = rule.enabled;
    enabled.setAttribute('aria-label', `${rule.from} ${label} 규칙 적용`);
    enabled.title = rule.enabled ? '규칙 끄기' : '규칙 켜기';
    enabled.addEventListener('change', () => toggleOutputRule(rule.id, enabled.checked, kind));
    const switchLabel = document.createElement('label');
    switchLabel.className = 'coverVisibilitySwitch';
    switchLabel.title = enabled.title;
    const track = document.createElement('span');
    track.className = 'coverVisibilitySwitchTrack';
    track.setAttribute('aria-hidden', 'true');
    switchLabel.append(enabled, track);
    const text = document.createElement('div');
    text.className = 'keywordRuleText';
    const from = document.createElement('span');
    from.className = 'replacementRuleFrom';
    const arrow = document.createElement('span');
    arrow.className = 'replacementRuleArrow';
    arrow.textContent = '→';
    arrow.setAttribute('aria-hidden', 'true');
    const to = document.createElement('span');
    to.className = 'replacementRuleTo';
    text.append(from, arrow, to);
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'keywordUndoBtn';
    undo.textContent = '×';
    undo.title = '규칙 제거';
    undo.setAttribute('aria-label', `${rule.from} ${label} 규칙 제거`);
    undo.addEventListener('click', () => undoRule(rule.id));
    const refresh = () => {
      from.textContent = rule.from;
      from.title = `${rule.from} · 클릭하여 수정`;
      to.classList.toggle('isEmptyResult', rule.to === '' || /^\s+$/.test(rule.to));
      to.textContent = rule.to === '' ? '삭제 처리' : /^\s+$/.test(rule.to) ? `공백 ${rule.to.length}칸` : rule.to;
      to.title = `${to.textContent} · 클릭하여 수정`;
      enabled.setAttribute('aria-label', `${rule.from} ${label} 규칙 적용`);
      undo.setAttribute('aria-label', `${rule.from} ${label} 규칙 제거`);
    };
    refresh();
    outputRuleEditing.bindText(from, rule, 'from', kind, refresh);
    outputRuleEditing.bindText(to, rule, 'to', kind, refresh);
    row.append(switchLabel, text, undo);
    list.appendChild(row);
  });
}

function renderNameRuleList(){
  const list = document.getElementById('nameRuleList');
  if(!list) return;
  const rules = nameRules();
  const atLimit = rules.length >= MosaicState.NAME_RULE_LIMIT;
  document.getElementById('nameReplaceBtn').disabled = atLimit;
  const status = document.getElementById('nameStatus');
  if(atLimit) status.textContent = NAME_RULE_LIMIT_MESSAGE;
  else if(status.textContent === NAME_RULE_LIMIT_MESSAGE) status.textContent = '';
  renderReplacementRuleItems(list, rules, '이름', undoNameRule, 'name');
}

function addNameRule(){
  const fromEl = document.getElementById('nameFrom');
  const toEl = document.getElementById('nameTo');
  const from = fromEl.value.trim();
  const to = toEl.value.trim();
  const status = document.getElementById('nameStatus');
  if(!from || !to){ status.textContent = '현재 이름과 새 이름을 모두 입력해 주세요.'; return; }
  if(from === to){ status.textContent = '두 이름이 같아 적용하지 않았습니다.'; return; }
  const rules = nameRules();
  if(rules.length >= MosaicState.NAME_RULE_LIMIT){ status.textContent = NAME_RULE_LIMIT_MESSAGE; return; }
  if(rules.some(rule => rule.from === from)){
    status.textContent = '같은 현재 이름의 규칙이 있습니다. 기존 규칙을 제거한 뒤 추가해 주세요.';
    return;
  }
  appCommands.snapshotCards();
  rules.push({ id:'nr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), from, to, enabled:true });
  saveNameRules(rules);
  fromEl.value = ''; toEl.value = ''; fromEl.focus();
  uiUpdateEffects.committedChange();
  showUndoToast('이름 규칙 추가 · 입력 원문 유지.');
  status.textContent = '이름 규칙 추가됨';
  if(previewSearch.isOpen() && document.getElementById('pvFindInput').value === from){
    document.getElementById('pvFindInput').value = to;
    previewSearch.pvApplySearch(false);
  }
}

function undoNameRule(id){
  const rules = nameRules();
  const rule = rules.find(item => item.id === id);
  if(!rule) return;
  appCommands.snapshotCards();
  saveNameRules(rules.filter(item => item.id !== id));
  uiUpdateEffects.committedChange();
  appCommands.recordCompletedAction(`'${rule.from} → ${rule.to}' 이름 규칙 제거.`);
  dismissToast();
  document.getElementById('nameStatus').textContent = '';
}

function bindNameRuleEvents(){
  bindUIFeatureEvents('name-rules', () => {
    document.querySelectorAll('#nameReplaceGroup [data-name-fill]').forEach(button => {
      button.addEventListener('click', () => {
        const input = document.getElementById('nameTo');
        input.value = button.dataset.nameFill;
        input.dispatchEvent(new Event('input', { bubbles:true }));
        input.focus();
        document.getElementById('nameStatus').textContent = '';
      });
    });
    document.getElementById('nameReplaceBtn').addEventListener('click', addNameRule);
    ['nameFrom','nameTo'].forEach(id => document.getElementById(id).addEventListener('keydown', event => {
      if(event.isComposing || event.keyCode === 229) return;
      if(event.key === 'Enter'){ event.preventDefault(); addNameRule(); }
    }));
  });
}

const KEYWORD_RULE_LIMIT_MESSAGE = `치환 규칙은 최대 ${MosaicState.KEYWORD_RULE_LIMIT}개까지 추가할 수 있습니다.`;

function keywordRules(){
  return MosaicState.normalizeOutputRules(document.getElementById('keywordRules').value);
}

function saveKeywordRules(rules, renderList = true){
  document.getElementById('keywordRules').value = JSON.stringify(rules);
  if(renderList) renderKeywordRuleList();
  uiUpdateEffects.saveLater();
}

function renderKeywordRuleList(){
  const list = document.getElementById('keywordRuleList');
  if(!list) return;
  const rules = keywordRules();
  const atLimit = rules.length >= MosaicState.KEYWORD_RULE_LIMIT;
  const addButton = document.getElementById('keywordAddBtn');
  const status = document.getElementById('keywordStatus');
  if(addButton) addButton.disabled = atLimit;
  if(status){
    if(atLimit) status.textContent = KEYWORD_RULE_LIMIT_MESSAGE;
    else if(status.textContent === KEYWORD_RULE_LIMIT_MESSAGE) status.textContent = '';
  }
  renderReplacementRuleItems(list, rules, '키워드', undoKeywordRule, 'keyword');
}

function addKeywordRule(){
  const fromEl = document.getElementById('keywordFrom');
  const toEl = document.getElementById('keywordTo');
  const from = fromEl.value;
  const deleting = document.getElementById('keywordAction').value === 'delete';
  const to = deleting ? '' : toEl.value;
  const st = document.getElementById('keywordStatus');
  if(!from){ st.textContent = '찾을 키워드를 입력해 주세요.'; return; }
  if(!deleting && !to){ st.textContent = '바꿀 키워드를 입력하거나 동작을 삭제로 선택해 주세요.'; return; }
  if(from === to){ st.textContent = '두 키워드가 같아 치환하지 않았습니다.'; return; }
  const rules = keywordRules();
  if(rules.length >= MosaicState.KEYWORD_RULE_LIMIT){
    st.textContent = KEYWORD_RULE_LIMIT_MESSAGE;
    renderKeywordRuleList();
    return;
  }
  if(rules.some(r => r.from === from)){
    st.textContent = '같은 찾을 키워드의 규칙이 있습니다. 기존 규칙을 제거한 뒤 추가해 주세요.';
    return;
  }
  appCommands.snapshotCards();
  rules.push({ id:'kr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), from, to, enabled:true });
  saveKeywordRules(rules);
  fromEl.value = ''; toEl.value = ''; fromEl.focus();
  uiUpdateEffects.committedChange();
  showUndoToast(`키워드 ${deleting ? '삭제' : '치환'} 규칙 추가 · 입력 원문 유지.`);
  st.textContent = `${deleting ? '삭제' : '치환'} 규칙 추가됨`;
}

function undoKeywordRule(id){
  const rules = keywordRules();
  const rule = rules.find(r => r.id === id);
  if(!rule) return;
  appCommands.snapshotCards();
  saveKeywordRules(rules.filter(r => r.id !== id));
  uiUpdateEffects.committedChange();
  appCommands.recordCompletedAction(`'${rule.from}' 키워드 규칙 제거.`);
  dismissToast();
  document.getElementById('keywordStatus').textContent = '';
}

function bindKeywordRuleEvents(){
  bindUIFeatureEvents('keyword-rules', () => {
    document.getElementById('keywordAddBtn').addEventListener('click', addKeywordRule);
    const action = document.getElementById('keywordAction');
    const fieldGroup = document.querySelector('#keywordReplaceGroup .nameFieldGroup');
    const choices = document.querySelectorAll('#keywordReplaceGroup [data-keyword-action]');
    const syncAction = () => {
      const input = document.getElementById('keywordTo');
      input.disabled = action.value === 'delete';
      input.hidden = input.disabled;
      input.placeholder = input.disabled ? '출력에서 삭제' : '바꿀 키워드';
      fieldGroup.classList.toggle('isDeleteMode', input.disabled);
      fieldGroup.querySelector('.arrowSep').hidden = input.disabled;
      choices.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.keywordAction === action.value)));
    };
    choices.forEach(button => button.addEventListener('click', () => {
      if(action.value === button.dataset.keywordAction) return;
      action.value = button.dataset.keywordAction;
      action.dispatchEvent(new Event('change'));
      document.getElementById('keywordStatus').textContent = '';
    }));
    action.addEventListener('input', syncAction);
    action.addEventListener('change', syncAction);
    syncAction();
    ['keywordFrom','keywordTo'].forEach(id => document.getElementById(id).addEventListener('keydown', event => {
      if(event.isComposing || event.keyCode === 229) return;
      if(event.key === 'Enter'){ event.preventDefault(); addKeywordRule(); }
    }));
  });
}


function focusPreviewAfterEditorInput(ta){
  if(previewInteractions.isCommitting()) previewPositionState.pendingFocus = null;
  else focusPreviewOnCaret(ta);
}


function currentPreviewSourceHTML(){ return previewRenderState.sourceHTML; }
function currentPreviewRevision(){ return previewRenderState.revision; }
function previewRenderPending(){ return !!previewRenderState.frame; }
// ---------- UI 수명주기·외부 출입구 ----------
// 기능별 이벤트 연결은 한 번만 수행한다. 다른 모듈은 아래 MosaicUI만 통해
// UI를 다루며, 이 파일 안의 상태 객체와 보조 함수에는 직접 의존하지 않는다.
const uiLifecycleState = {
  initialized:false,
  bindings:new Set()
};

function bindUIFeatureEvents(name, bind){
  if(uiLifecycleState.bindings.has(name)) return;
  bind();
  uiLifecycleState.bindings.add(name);
}

function initUI(){
  if(uiLifecycleState.initialized) return;
  bindGlobalUIEvents();
  previewInteractions.bindBlockToolbarEvents();
  previewInteractions.bindPreviewSelectionEvents();
  previewLayout.bindPreviewLayoutEvents();
  previewLayout.bindPreviewFoldEvents();
  previewLayout.bindPreviewToolbarRevealEvents();
  bindPositionSyncEvents();
  previewLayout.bindPreviewFullscreenEvents();
  previewLayout.bindPreviewToolbarLayoutEvents();
  mobilePanelNavigation.bindEvents();
  bindThemeChoiceEvents();
  bindColorInputEvents();
  bindCoverRangeLabelEvents();
  bindProfileRangeLabelEvents();
  bindImageBackgroundChoiceEvents();
  bindProfileImageEvents();
  bindRangeEditorEvents();
  bindProfileResetEvents();
  bindProfileEntityEvents();
  bindProfileFieldEvents();
  bindSubtitleSeparatorEvents();
  bindParagraphSettingEvents();
  bindSidebarOutputEvents();
  bindCoverAndPresetEvents();
  cardEditors.bindCardEditorDelegatedEvents();
  cardEditors.bindCardToolbarLayoutEvents();
  cardEditors.bindCardEditorDragEvents();
  cardEditors.bindCardCreationEvents();
  bindUndoToastEvents();
  fullscreen.bindFullscreenFormatEvents();
  fullscreen.bindFullscreenEditorEvents();
  previewSearch.bindPreviewSearchEvents();
  bindBodyToolEvents();
  bindNameRuleEvents();
  bindKeywordRuleEvents();
  uiLifecycleState.initialized = true;
}


const plainPreviewState = {key:null,template:null};

function plainPreviewKey(input){
  if(!input || previewSearch.isOpen() || uiElements.preview.contains(document.activeElement)
    || uiElements.preview.querySelector('[data-preview-edit-changed="true"]')) return null;
  const {settings,cards} = input;
  if(settings.outputTheme !== 'solid' || settings.cardLayout !== 'separate'
) return null;
  if(!cards.length || cards.some(card => card.type !== 'card' || card.visible === false || card.folded
    || card.foldTitle || !card.body.trim() || !sourceMap.isPlainSource(card.body,settings))) return null;
  return JSON.stringify([settings,cardEditors.captureEditorIdentities()]);
}

function patchPlainPreview(html,input){
  const key=plainPreviewKey(input);
  const previous=plainPreviewState.template, previousKey=plainPreviewState.key;
  plainPreviewState.key=null; plainPreviewState.template=null;
  if(!key || html.length > 6000000) return false;
  const next=document.createElement('template'); next.innerHTML=html;
  plainPreviewState.key=key; plainPreviewState.template=next;
  if(!previous || previousKey !== key) return false;
  const before=Array.from(previous.content.children), after=Array.from(next.content.children), actual=Array.from(uiElements.preview.children);
  if(before.length !== after.length || after.length !== actual.length) return false;
  const signature=node=>node.nodeType===Node.TEXT_NODE ? node.nodeValue : node.outerHTML;
  const attributes=element=>Array.from(element.attributes).map(a=>[a.name,a.value]);
  const plans=[];
  for(let i=0;i<after.length;i++){
    const oldRoot=before[i],newRoot=after[i],liveRoot=actual[i];
    if(!newRoot.hasAttribute('data-mosaic-card-index')){
      if(oldRoot.outerHTML!==newRoot.outerHTML || liveRoot.tagName!==newRoot.tagName) return false;
      continue;
    }
    if(newRoot.tagName!=='DIV' || JSON.stringify(attributes(oldRoot))!==JSON.stringify(attributes(newRoot))) return false;
    const oldBody=oldRoot.firstElementChild,newBody=newRoot.firstElementChild,liveBody=liveRoot.firstElementChild;
    if(!oldBody || !newBody || !liveBody || JSON.stringify(attributes(oldBody))!==JSON.stringify(attributes(newBody))) return false;
    if(Array.from(newBody.children).some(child=>child.tagName!=='P' && !child.hasAttribute('data-mosaic-footer'))) return false;
    const oldNodes=Array.from(oldBody.childNodes),newNodes=Array.from(newBody.childNodes),liveNodes=Array.from(liveBody.childNodes);
    if(oldNodes.length!==liveNodes.length) return false;
    let prefix=0,suffix=0;
    while(prefix<oldNodes.length && prefix<newNodes.length && signature(oldNodes[prefix])===signature(newNodes[prefix])) prefix++;
    while(suffix<oldNodes.length-prefix && suffix<newNodes.length-prefix
      && signature(oldNodes[oldNodes.length-1-suffix])===signature(newNodes[newNodes.length-1-suffix])) suffix++;
    const nodes=[...liveNodes.slice(0,prefix),...newNodes.slice(prefix,newNodes.length-suffix).map(node=>node.cloneNode(true)),...(suffix?liveNodes.slice(-suffix):[])];
    const sourceIndex=Number(newRoot.dataset.mosaicCardIndex),card=input.cards[sourceIndex],editor=uiElements.cardEditors.children[sourceIndex];
    if(!card || !editor) return false;
    const entries=sourceMap.sourceDisplayEntries(editor.querySelector('textarea'),input.settings);
    if(nodes.filter(node=>node.nodeType===Node.ELEMENT_NODE&&node.tagName==='P').length!==entries.length) return false;
    plans.push({body:liveBody,nodes,entries,textarea:editor.querySelector('textarea')});
  }
  plans.forEach(({body,nodes,entries,textarea})=>{
    if(nodes.some((node,index)=>node!==body.childNodes[index]) || nodes.length!==body.childNodes.length) body.replaceChildren(...nodes);
    Array.from(body.children).filter(node=>node.tagName==='P').forEach((block,index)=>{
      previewInteractions.enablePreviewDirectEditor(block,sourceMap.bodyEditDescriptor(textarea,entries[index]),'본문 문단 수정');
    });
  });
  return true;
}
function bindFeatureEvents(){


try {
  positionSyncInput.checked = localStorage.getItem(POSITION_SYNC_KEY) !== 'off';
} catch(e){
  positionSyncInput.checked = true;
}

syncPositionSyncFloatingUi();

document.getElementById('profileExtraEditors').innerHTML = MosaicState.EXTRA_PROFILE_SLOTS.map(slot => {
  const prefix = MosaicState.extraProfilePrefix(slot);
  const range = (field, label, min, max, step, value, unit = '') => `<div class="row"><label for="${prefix}${field}">${label}</label><input type="range" id="${prefix}${field}" min="${min}" max="${max}" step="${step}" value="${value}"><span class="rangeEditor"><input type="text" inputmode="numeric" class="rangeval" id="${prefix}${field}Val" data-range="${prefix}${field}" value="${value}" aria-label="인물 ${slot} 사진 ${label} 직접 입력">${unit ? `<span class="rangeUnit">${unit}</span>` : ''}</span></div>`;
  const key = `extra${slot}`;
  return `<details class="profileSubFold" id="${prefix}Group" data-profile-key="${key}" hidden><summary class="profileSubHead"><button type="button" class="profileRemoveBtn" data-profile-remove="${slot}" aria-label="인물 ${slot} 삭제" title="인물 삭제">×</button><span class="profileSubTitle" id="${prefix}Title">인물 ${slot}</span><span class="profileSubActions"><button type="button" class="profileMoveBtn" data-profile-move="up" data-profile-key="${key}" aria-label="인물 ${slot} 위로 이동" title="위로 이동">↑</button><button type="button" class="profileMoveBtn" data-profile-move="down" data-profile-key="${key}" aria-label="인물 ${slot} 아래로 이동" title="아래로 이동">↓</button><button type="button" class="profileResetIconBtn" id="${prefix}ResetBtn" aria-label="인물 ${slot} 초기화" title="인물 ${slot} 초기화">↺</button><label class="coverVisibilitySwitch" title="인물 ${slot} 표시 전환"><input type="checkbox" id="${prefix}On" checked aria-label="인물 ${slot} 표시"><span class="coverVisibilitySwitchTrack" aria-hidden="true"></span></label></span><span class="profileSubArrow" aria-hidden="true"></span></summary><div class="profileSubBody"><div class="row profileImageRow"><label for="${prefix}Image">이미지 URL</label><div class="profileImageField"><input type="url" id="${prefix}Image" maxlength="8192" placeholder="프로필 이미지 URL"><span class="imageLoadStatus profileImageDot" id="${prefix}ImageStatus" data-state="idle" aria-live="polite" hidden></span><button type="button" class="profileImageAdjustBtn" id="${prefix}ImageAdjustBtn" aria-label="인물 ${slot} 사진 조정 열기" title="사진 조정" aria-expanded="false" aria-controls="${prefix}ImageAdjustPanel">⚙︎</button></div></div><div class="profileImageAdjustPanel" id="${prefix}ImageAdjustPanel" hidden><div class="profileImageAdjustments" role="group" aria-label="인물 ${slot} 사진 조절">${range('Scale','배율',100,300,5,100,'%')}${range('X','가로',0,100,1,50)}${range('Y','세로',0,100,1,50)}</div></div><div class="row"><label for="${prefix}Role">라벨</label><input type="text" id="${prefix}Role" maxlength="24" value="CHAR" placeholder="CHAR"></div><div class="row"><label for="${prefix}Name">이름</label><input type="text" id="${prefix}Name" maxlength="100" placeholder="표시 이름"></div><div class="row profileTagsRow"><label id="${prefix}TagsLabel">태그</label><div class="profileTagFields" role="group" aria-labelledby="${prefix}TagsLabel"><input type="text" id="${prefix}Tag1" maxlength="150" placeholder="태그 1"><input type="text" id="${prefix}Tag2" maxlength="150" placeholder="태그 2"><input type="text" id="${prefix}Tag3" maxlength="150" placeholder="태그 3"></div><input type="hidden" id="${prefix}Tags" value=""></div><div class="row"><label for="${prefix}Desc">소개</label><textarea id="${prefix}Desc" maxlength="500" rows="2" style="min-height:58px; resize:vertical;" placeholder="한 줄 설명"></textarea></div></div></details>`;
}).join('');

syncSubtitleCoupleSeparatorControl();

MosaicState.EXTRA_PROFILE_SLOTS.forEach(slot => {
  const prefix = MosaicState.extraProfilePrefix(slot);
  PREVIEW_FOCUS_MAP[prefix + 'On'] = () => previewProfileRoleTarget(`extra${slot}`);
  PREVIEW_FOCUS_MAP[prefix + 'Role'] = () => previewProfileFieldTarget(prefix + 'Role');
  PREVIEW_FOCUS_MAP[prefix + 'Name'] = () => previewProfileFieldTarget(prefix + 'Name');
  PREVIEW_FOCUS_MAP[prefix + 'Desc'] = () => previewProfileFieldTarget(prefix + 'Desc');
  PREVIEW_FOCUS_MAP[prefix + 'Tags'] = () => previewProfileFieldTarget(prefix + 'Tags');
  ['Image','Scale','X','Y'].forEach(field => {
    PREVIEW_FOCUS_MAP[prefix + field] = () => previewProfileFieldTarget(prefix + 'Image');
  });
});

syncParagraphSettingsUI();

requestAnimationFrame(cardEditors.syncBodyToolbarStickyOffset);

renderNameRuleList();

renderKeywordRuleList();
initUI();
}
const cardEditors = createCardEditors({
snapshotCards:(...args)=>appCommands.snapshotCards(...args),
buildDocumentNavigator:(...args)=>appCommands.buildDocumentNavigator(...args),
MOD_KEY,
applyTextareaFormat,
bindEditorPositionSyncEvents,
bindUIFeatureEvents,
closePreviewCardNavigator:(...args)=>previewLayout.closePreviewCardNavigator(...args),
decoratePreviewDirectEditors:(...args)=>previewInteractions.decoratePreviewDirectEditors(...args),
focusPreviewAfterEditorInput,
focusPreviewOn,
normalizeStandaloneHrInput,
openFullscreen:(...args)=>fullscreen.openFullscreen(...args),
previewCardStartForEditor,
scrollCardIntoSidebar,
scrollPreviewToCardEditor,
showNoticeToast,
showUndoToast,
sourceMap,
syncParagraphSettingsUI,
toggleEditorPreviewFold:(...args)=>previewLayout.toggleEditorPreviewFold(...args),
uiElements,
uiUpdateEffects
});

const fullscreen = createFullscreenEditor({
snapshotCards:(...args)=>appCommands.snapshotCards(...args),
SEARCH_HL_PROPS,
applyTextareaFormat,
bindEditorPositionSyncEvents,
bindUIFeatureEvents,
cancelPendingPositionSync,
cardEditors,
caretOffsetTop,
insertBodyImage,
insertIntoBody,
normalizeStandaloneHrInput,
normalizedLiteralOffsets,
searchHlMarkup,
showUndoToast,
uiElements
});

const previewSearch = createPreviewSearch({
snapshotCards:(...args)=>appCommands.snapshotCards(...args),
cardEditors,
findBlockSource:(...args)=>previewInteractions.findBlockSource(...args),
normalizedLiteralOffsets,
previewCardContexts:(...args)=>previewInteractions.previewCardContexts(...args),
previewSourceBlocks:(...args)=>previewInteractions.previewSourceBlocks(...args),
refreshPreviewFloatingButtonLayout:(...args)=>previewLayout.refreshPreviewFloatingButtonLayout(...args),
showUndoToast,
sourceMap,
uiUpdateEffects
});

const previewSourceEdits = createPreviewSourceEdits({
sourceSegmentEditBounds:sourceMap.sourceSegmentEditBounds,
messengerEditSourceBounds:sourceMap.messengerEditSourceBounds,
replacePreviewBodyLine:sourceMap.replacePreviewBodyLine
});

const previewInteractions = createPreviewInteractions({
sourceEdits:previewSourceEdits,
snapshotCards:(...args)=>appCommands.snapshotCards(...args),
setCreditItems:(...args)=>credit.setStoredCreditItems(...args),
readCreditItems:(...args)=>credit.creditItemsFromEditor(...args),
discardUndoSnapshot:(...args)=>appCommands.discardUndoSnapshot(...args),
bindUIFeatureEvents,
cardEditors,
currentPreviewRevision,
ensureBodyInputGroupOpen,
escRe,
getSettings:(...args)=>settingsReader.getSettings(...args),
normalizeProfileTag,
positionSyncEnabled,
previewParts:(...args)=>previewLayout.previewParts(...args),
previewRenderPending,
revealCommentInEditor,
revealInEditor,
scrollCardIntoSidebar,
showNoticeToast,
showUndoToast,
sourceMap,
uiElements,
uiUpdateEffects
});


const previewLayout = createPreviewLayout({
isDesktopLayoutMirrored:(...args)=>appCommands.isDesktopLayoutMirrored(...args),
snapshotCards:(...args)=>appCommands.snapshotCards(...args),
setPreviewArcaTheme:(...args)=>appCommands.setPreviewArcaTheme(...args),
bindUIFeatureEvents,
cardEditors,
currentPreviewSourceHTML,
positionSyncEnabled,
previewInteractions,
previewRenderPending,
scrollPreviewIfNeeded,
showNoticeToast,
showUndoToast,
syncCoverControlState,
syncDesignSummaries,
uiElements,
uiUpdateEffects
});

const mobilePanelNavigation = createMobilePanelNavigation({
bindUIFeatureEvents,
isStackedLayout:previewLayout.isStackedLayout,
uiElements,
flushPreview:() => { if(previewRenderPending()) uiUpdateEffects.renderNow(); }
});

const controlSync = createControlSync({
renderThemePalette:(...args)=>library.renderCurrentThemePalette(...args),
syncCharacterList:(...args)=>library.syncCharList(...args),
syncPreviewCardStyles:(...args)=>appCommands.syncPreviewCardStyleToggles(...args),
COVER_IMAGE_RANGE_IDS,
PROFILE_IMAGE_RANGE_IDS,
hasBodyFoldTitleContent,
hasMarkdownCardContent,
hasMemoCardContent,
hasQuoteCardContent,
syncDesignSummaries,
syncImageBackgroundToggleAvailability,
syncParagraphSettingsUI,
extraProfileCount:(...args)=>settingsReader.extraProfileCount(...args),
readCards:(...args)=>cardEditors.getCards(...args),
syncSegmentedChoice:(...args)=>library.syncSegmentedChoiceControl(...args)
});

return Object.freeze({
init:initUI,
cards:Object.freeze({
    add:cardEditors.addCard,
    clear:cardEditors.clearCardEditors,
    all:cardEditors.getCards,
    textareas:cardEditors.bodyCardTextareas,
    snapshot:(...args) => appCommands.snapshotCards(...args),
    format:applyTextareaFormat,
    setDefaultsForShape:setCardDefaultsForShapeChange,
    exampleBody:cardEditors.EXAMPLE_BODY,
    activeTextarea:() => cardEditors.activeTextarea(),
    setActiveTextarea:textarea => { cardEditors.setActiveTextarea(textarea || null); }
  }),
preview:Object.freeze({
    render,
    renderWithCount,
    scheduleRefresh:uiUpdateEffects.renderCountLater,
    scheduleMarkupRefresh:scheduleRender,
    renderMarkup:renderPreview,
    focusCaret:focusPreviewOnCaret,
    revealOffsetAtTop:revealEditorOffsetAtTop,
    positionSyncEnabled,
    layoutFloatingButtons:previewLayout.layoutPreviewFloatingButtons,
    syncToolbarLabel:previewLayout.syncPreviewToolbarLabel,
    syncCommentOutset:previewLayout.syncPreviewCommentOutset,
    syncOuterBreaks:previewLayout.syncPreviewOuterBreaks,
    openSearch:previewSearch.openPreviewSearch,
    closeSearch:previewSearch.closePreviewSearch,
    setFullscreenSearchOpen:fullscreen.setFsSearchOpen,
    clearFullscreenSearch:fullscreen.fsClearSearch,
    hideSelectionToolbar:previewInteractions.hideSelToolbar,
    commitActiveEdit:previewInteractions.commitActiveDirectEdit,
    revision:() => previewRenderState.revision,
    setDirectEditReady:ready => { previewInteractions.setReady(!!ready); }
  }),
work:Object.freeze({
    collect:collectWork,
    collectSlot:collectSlotWork,
    apply:applyWork,
    applyState:applyWorkState,
    finishRestore:finishWorkRestore
  }),
feedback:Object.freeze({
    undo:showUndoToast,
    notice:showNoticeToast,
    open:openToast,
    dismiss:dismissToast
  }),
controls:Object.freeze({
    syncCover:syncCoverControlState,
    syncCredit:syncCreditControlState,
    syncDesignSummaries,
    syncImageBackgroundAvailability:syncImageBackgroundToggleAvailability,
    syncParagraphSettings:syncParagraphSettingsUI,
    syncProfileTags:syncProfileTagEditorsFromMasters,
    syncTypographyLabels:controlSync.syncTypographyRangeLabels,
    updateHexLabels:controlSync.updateHexLabels,
    renderNameRules:renderNameRuleList,
    renderKeywordRules:renderKeywordRuleList,
    selectedText:selectedControlText
  }),
workspace:Object.freeze({ setInert:fullscreen.setWorkspaceInert }),
FMT_RE:previewInteractions.FMT_RE,
IS_MAC,
MOD_KEY,
captureDraftUiState,
currentStyleValues:settingsReader.currentStyleValues,
captureEditorIdentities:cardEditors.captureEditorIdentities,
closeFullscreen:fullscreen.closeFullscreen,
extraProfileCount:settingsReader.extraProfileCount,
generateHTML,
getSettings:settingsReader.getSettings,
layoutPreviewFloatingButtons:previewLayout.layoutPreviewFloatingButtons,
openFullscreen:fullscreen.openFullscreen,
restoreEditorIdentities:cardEditors.restoreEditorIdentities,
bindFeatureEvents
});
})();

// ---------- 크레딧 편집·세부 프리셋 UI ----------
const credit = createCredit({
applyStyleValues:(...args)=>library.applyStyleValues(...args),
currentStyleValues:(...args)=>library.currentStyleValues(...args),
styleChange:(...args)=>appCommands.changes.styleChange(...args)
});

// ---------- 보관함·테마·설정 컨트롤 UI ----------
const library = createLibrary({
setArchiveDrawerOpen:(...args)=>appCommands.setArchiveDrawerOpen(...args),
committedChange:(...args)=>appCommands.changes.committedChange(...args),
commitStyleHistory:(...args)=>appCommands.commitStyleHistory(...args),
getSettings:(...args)=>core.getSettings(...args),
styleChange:(...args)=>appCommands.changes.styleChange(...args),
currentStyleValues:(...args)=>core.currentStyleValues(...args),
saveDraft:(...args)=>appCommands.saveDraft(...args),
updateHistoryButtons:(...args)=>appCommands.updateHistoryButtons(...args),
generateHTML:(...args)=>core.generateHTML(...args),
cancelStyleHistoryCommit:(...args)=>appCommands.cancelStyleHistoryCommit(...args),
recordCompletedAction:(...args)=>appCommands.recordCompletedAction(...args)
});
// Explicit public facade: adding an internal operation never exports it accidentally.
return Object.freeze({
 init(){ if(initialized) return; if(!appCommands) throw new Error('App commands required'); core.bindFeatureEvents(); credit.bindFeatureEvents(); library.bindFeatureEvents(); initialized = true; },
 cards:core.cards,
 preview:core.preview,
 work:core.work,
 feedback:core.feedback,
 controls:core.controls,
 workspace:core.workspace,
 FMT_RE:core.FMT_RE,
 IS_MAC:core.IS_MAC,
 MOD_KEY:core.MOD_KEY,
 captureEditorIdentities:core.captureEditorIdentities,
 closeFullscreen:core.closeFullscreen,
 extraProfileCount:core.extraProfileCount,
 generateHTML:core.generateHTML,
 getSettings:core.getSettings,
 layoutPreviewFloatingButtons:core.layoutPreviewFloatingButtons,
 openFullscreen:core.openFullscreen,
 restoreEditorIdentities:core.restoreEditorIdentities,
 addCreditItem:credit.addCreditItem,
 creditItemsFromEditor:credit.creditItemsFromEditor,
 deleteSelectedCreditPreset:credit.deleteSelectedCreditPreset,
 deleteSelectedDetailPreset:credit.deleteSelectedDetailPreset,
 loadSelectedCreditPreset:credit.loadSelectedCreditPreset,
 loadSelectedDetailPreset:credit.loadSelectedDetailPreset,
 renderCreditItemsEditor:credit.renderCreditItemsEditor,
 renderCreditPresetOptions:credit.renderCreditPresetOptions,
 renderDetailPresetOptions:credit.renderDetailPresetOptions,
 saveCurrentCreditPreset:credit.saveCurrentCreditPreset,
 saveCurrentDetailPreset:credit.saveCurrentDetailPreset,
 setStoredCreditItems:credit.setStoredCreditItems,
 storedCreditItems:credit.storedCreditItems,
 syncCreditPresetControls:credit.syncCreditPresetControls,
 syncDetailPresetControls:credit.syncDetailPresetControls,
 applyDraftRestorePlan:library.applyDraftRestorePlan,
 applyStyleValues:library.applyStyleValues,
 captureDraftUiState:core.captureDraftUiState,
 closeSlotExportMenu:library.closeSlotExportMenu,
 commitThemeHoverPreview:library.commitThemeHoverPreview,
 currentSavedPresetValues:library.currentSavedPresetValues,
 currentStyleValues:core.currentStyleValues,
 initializeThemeSelection:library.initializeThemeSelection,
 invalidateCharacterRows:library.invalidateCharacterRows,
 parseExtraChars:library.parseExtraChars,
 renderComboList:library.renderComboList,
 renderCurrentThemePalette:library.renderCurrentThemePalette,
 renderPresetList:library.renderPresetList,
 renderSlotList:library.renderSlotList,
 resetThemeSelection:library.resetThemeSelection,
 savedTimeLabel:library.savedTimeLabel,
 setDraftStatus:library.setDraftStatus,
 stepSelectOption:library.stepSelectOption,
 syncAllSegmentedChoiceControls:library.syncAllSegmentedChoiceControls,
 syncCharList:library.syncCharList,
 syncMinimalChoiceControls:library.syncMinimalChoiceControls,
 syncSegmentedChoiceControl:library.syncSegmentedChoiceControl,
 updateOverwriteBtn:library.updateOverwriteBtn,
 configure(commands){ if(initialized) throw new Error('UI already initialized'); appCommands = commands; }
});
})();
