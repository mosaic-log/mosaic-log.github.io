// 조각로그 v1.8.4 상태 스키마.
// 필드 이름·기본값·수집 규칙을 한곳에 두어 저장, 복원, 히스토리가 같은 계약을 사용한다.
const APP_VERSION = '1.8.4';

// 여러 런타임 모듈이 함께 쓰는 값 정규화는 가장 먼저 로드되는 상태 계층이 소유한다.
// UI에 두면 parser/renderer/storage가 화면 모듈의 전역 함수에 역으로 의존하게 된다.
function normalizeProtocolRelativeUrl(value){
  const url = String(value || '').trim();
  return url.startsWith('//') ? 'https:' + url : url;
}

function normalizeHex(raw){
  let value = String(raw || '').trim();
  if(!value.startsWith('#')) value = '#' + value;
  if(/^#[0-9A-Fa-f]{3}$/.test(value)){
    value = '#' + value[1] + value[1] + value[2] + value[2] + value[3] + value[3];
  }
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value.toLowerCase() : null;
}

function normalizeCommentWidth(value){
  return ['default','card'].includes(value) ? value : 'default';
}

function normalizeCommentAlign(value){
  return ['left','center'].includes(value) ? value : 'left';
}

const EXTRA_PROFILE_SLOTS = [3, 4, 5];
const extraProfilePrefix = slot => `profileExtra${slot}`;
const profileEntityKeys = extraCount => [
  'bot', 'user',
  ...EXTRA_PROFILE_SLOTS.slice(0, Math.max(0, Math.min(3, Number(extraCount) || 0)))
    .map(slot => `extra${slot}`)
];
function normalizeProfileEntityOrder(value, extraCount, legacyOrder = 'bot-user'){
  const available = profileEntityKeys(extraCount);
  let requested = value;
  if(typeof requested === 'string'){
    try { requested = JSON.parse(requested); }
    catch(e){ requested = []; }
  }
  if(!Array.isArray(requested)) requested = [];
  const legacy = legacyOrder === 'user-bot' ? ['user', 'bot'] : ['bot', 'user'];
  const normalized = [];
  [...requested, ...legacy, ...available].forEach(key => {
    if(available.includes(key) && !normalized.includes(key)) normalized.push(key);
  });
  // 포트레이트 첫 행을 안정적으로 유지하도록 BOT·USER는 언제나 첫 두 칸에 둔다.
  // 둘의 상대 순서와 추가 인물끼리의 상대 순서는 저장된 값을 그대로 보존한다.
  const botIndex = normalized.indexOf('bot');
  const userIndex = normalized.indexOf('user');
  const coreOrder = botIndex < userIndex ? ['bot', 'user'] : ['user', 'bot'];
  return [...coreOrder, ...normalized.filter(key => key !== 'bot' && key !== 'user')];
}

function moveProfileEntityOrder(order, key, direction){
  const step = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
  const next = Array.isArray(order) ? [...order] : [];
  const fromIndex = next.indexOf(key);
  const toIndex = fromIndex + step;
  if(!step || fromIndex < 0 || toIndex < 0 || toIndex >= next.length) return next;

  const coreKeys = ['bot', 'user'];
  const isCore = coreKeys.includes(key);
  const neighbor = next[toIndex];
  if(isCore && coreKeys.includes(neighbor)){
    [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
    return next;
  }
  if(isCore || toIndex < 2 || coreKeys.includes(neighbor)) return next;

  [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
  return next;
}
const extraProfileFields = slot => {
  const prefix = extraProfilePrefix(slot);
  return ['Role','Image','Scale','X','Y','Name','Desc','Tags'].map(field => prefix + field);
};

const WORK_FIELDS = ['imgUrl','imgHeight','xpos','ypos','charName','userName','extraChars','footerAuthor','creditItems','creditPlacement','logNumber','logTitle','subChar','subUser','subtitleCoupleSeparator','logSubtitle','profilePlacement','profileTextPosition','profileStyle','profileOrder','profileEntityOrder','profileExtraCount','profileCharRole','profileCharImage','profileCharScale','profileCharX','profileCharY','profileCharName','profileCharDesc','profileCharTags','profileUserRole','profileUserImage','profileUserScale','profileUserX','profileUserY','profileUserName','profileUserDesc','profileUserTags',...EXTRA_PROFILE_SLOTS.flatMap(extraProfileFields),'profileRelationship','profileSituation','nameRules','keywordRules'];

const WORK_FIELD_DEFAULTS = Object.freeze({
  imgUrl:'', imgHeight:'300', xpos:'50', ypos:'0',
  charName:'', userName:'', extraChars:'[]', footerAuthor:'', creditItems:'[]', creditPlacement:'bottom',
  logNumber:'', logTitle:'', subChar:'', subUser:'', subtitleCoupleSeparator:'×', logSubtitle:'',
  profilePlacement:'below', profileTextPosition:'center', profileStyle:'compact', profileOrder:'bot-user', profileEntityOrder:'["bot","user"]', profileExtraCount:'0', profileCharRole:'BOT', profileCharImage:'', profileCharScale:'100', profileCharX:'50', profileCharY:'50', profileCharName:'', profileCharDesc:'', profileCharTags:'', profileUserRole:'USER', profileUserImage:'', profileUserScale:'100', profileUserX:'50', profileUserY:'50', profileUserName:'', profileUserDesc:'', profileUserTags:'', profileRelationship:'', profileSituation:'',
  ...Object.fromEntries(EXTRA_PROFILE_SLOTS.flatMap(slot => {
    const prefix = extraProfilePrefix(slot);
    return [['Role','CHAR'],['Image',''],['Scale','100'],['X','50'],['Y','50'],['Name',''],['Desc',''],['Tags','']].map(([field,value]) => [prefix + field,value]);
  })),
  nameRules:'[]', keywordRules:'[]'
});

const WORK_BOOLEAN_DEFAULTS = Object.freeze({
  logTitleOn:false, titleMinimal:false, titleImageBackgroundOn:false, imgOn:false, profileOn:false, profileMinimal:false,
  profileCharOn:true, profileUserOn:true, profileImageBackgroundOn:false,
  ...Object.fromEntries(EXTRA_PROFILE_SLOTS.map(slot => [`profileExtra${slot}On`, true])),
  profileCommonOn:true, footerOn:true, creditOn:false
});

const WORK_BOOLEAN_FIELDS = Object.freeze(Object.keys(WORK_BOOLEAN_DEFAULTS));

const STYLE_FIELDS = ['outputTheme','textFont','narrSize','narrLine','narrColor','dlgStyle','dlgSize','dlgLine','paragraphGap','narrDialogueGap','softBreakSpacing','titleSize','titleBold','foldTitleSize','foldTitleBold','foldTitleDecorationOn','foldDividerOn','foldTitleAutoNumber','charColor','userColor','emphasisColor','cardLayout','spacingMode','cardWidth','cardBorderOn','bgColor','advancedOn','hrShape','hrOpacity','hrLength','hrVerticalSpace','hr2Shape','hr2Opacity','hr2VerticalSpace','hr3Shape','hr3Opacity','hr3VerticalSpace','gapHeight','coverVerticalSpace','profileOuterBackground','profileItemGap','profileTitleGap','coverCardGap','cardGap','unifiedBottomSpace','creditWidth','creditCardGap','cardInlinePadding','cardBodyTopSpace','cardBodyBottomSpace','footerBodyGap','headingTopSpace','headingBetweenSpace','headingBottomSpace','cardCornerRadius','cardTitleOrnamentOpacity','foldAutoNumberStyle','coverDividerLength','cardTitlePadding','cardDividerLength','creditBorderOn','creditTransparentOn','narrIndent','narrCenter','headingCenter','dialogueCenter','quoteCenter','bodyFoldTitleCenter','commentWidth','commentAlign','parallelTranslationLayout','charSpeakerOn','userSpeakerOn'];

const DEFAULT_STYLE = Object.freeze({
  textFont: 'pretendard', narrSize: '14', narrLine: '1.7', narrColor: '#555555',
  dlgStyle: 'softlight', dlgSize: '14', dlgLine: '1.7', paragraphGap: '20', narrDialogueGap: '20', softBreakSpacing: '0',
  titleSize: '21', titleBold: true, foldTitleSize: '16', foldTitleBold: true, foldTitleDecorationOn: true, foldDividerOn: true, foldTitleAutoNumber: false,
  charColor: '#222222', userColor: '#707070', emphasisColor: '#747474',
  outputTheme: 'solid', cardLayout: 'separate', spacingMode: 'normal', cardWidth: '750', cardBorderOn: true, bgColor: '#ffffff',
  advancedOn:true, hrShape:'solid', hrOpacity:'50', hrLength:'100', hrVerticalSpace:'26', hr2Shape:'star', hr2Opacity:'50', hr2VerticalSpace:'48', hr3Shape:'dots', hr3Opacity:'50', hr3VerticalSpace:'36', gapHeight:'48', coverVerticalSpace:'0',
  profileOuterBackground:'filled', profileItemGap:'0', profileTitleGap:'0', coverCardGap:'0', cardGap:'20', unifiedBottomSpace:'0', creditWidth:'380', creditCardGap:'40', cardInlinePadding:'22', cardBodyTopSpace:'0', cardBodyBottomSpace:'0', headingTopSpace:'0', headingBetweenSpace:'0', headingBottomSpace:'0', cardCornerRadius:'16', cardTitleOrnamentOpacity:'50', foldAutoNumberStyle:'arabic', coverDividerLength:'100', cardTitlePadding:'26', cardDividerLength:'100', creditBorderOn:false, creditTransparentOn:false,
  footerBodyGap:'0',
  narrIndent: false, narrCenter: false, headingCenter: false, dialogueCenter: false, quoteCenter: false, bodyFoldTitleCenter: false, commentWidth: 'default', commentAlign: 'left', parallelTranslationLayout: 'auto', charSpeakerOn: false, userSpeakerOn: false
});

function settingFlagOn(value){
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

function savedProfileImageBackgroundOn(fields){
  if(fields.profileImageBackgroundOn !== undefined) return settingFlagOn(fields.profileImageBackgroundOn);
  return settingFlagOn(fields.profileCharImageBackgroundOn)
    || settingFlagOn(fields.profileUserImageBackgroundOn);
}

function readControlValues(ids, root = document){
  return Object.fromEntries(ids.map(id => [id, root.getElementById(id).value]));
}

function readControlBooleans(ids, root = document){
  return Object.fromEntries(ids.map(id => [id, root.getElementById(id).checked]));
}

function collectWorkState(cards, root = document){
  return {
    cards,
    fields:{
      ...readControlValues(WORK_FIELDS, root),
      ...readControlBooleans(WORK_BOOLEAN_FIELDS, root)
    }
  };
}

// 저장 원문과 출력 규칙은 별개다. 옛 규칙의 enabled 생략은 사용 중으로 읽는다.
function normalizeOutputRules(value, kind = 'keyword'){
  try {
    const rules = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    if(!Array.isArray(rules)) return [];
    const seen = new Set();
    return rules.filter(rule => rule && typeof rule.from === 'string' && rule.from
      && typeof rule.to === 'string' && (kind !== 'name' || rule.to)
      && rule.from.length <= 80 && rule.to.length <= 80).slice(0,20).map((rule,index) => {
      let id = typeof rule.id === 'string' && rule.id ? rule.id : `${kind === 'name' ? 'nr' : 'kr'}_legacy_${index}`;
      while(seen.has(id)) id += `_${index}`;
      seen.add(id);
      return {id,from:rule.from,to:rule.to,enabled:rule.enabled !== false};
    });
  } catch(e){ return []; }
}

// 출력 설정 읽기는 상태 스키마와 같은 책임으로 묶는다.

// Output settings are read here; app.js consumes the resulting settings object.
function getSettings(){
  const textFont = document.getElementById('textFont').value;
  const advancedOn = document.getElementById('advancedOn').checked;
  const coverImageStatus = document.getElementById('imageLoadStatus');
  const currentExtraProfileCount = extraProfileCount();
  return {
    imgOn: document.getElementById('imgOn').checked,
    imgUrl: document.getElementById('imgUrl').value.trim(),
    // URL은 저장·복원용 원본으로 그대로 남기고, 현재 검사 실패 여부만 렌더 모델에
    // 일시적으로 전달한다. 이 값은 초안이나 내보낸 복원 데이터에는 저장하지 않는다.
    coverImageLoadFailed:Boolean(coverImageStatus && coverImageStatus.dataset.state === 'error'),
    imgHeight: document.getElementById('imgHeight').value,
    xpos: document.getElementById('xpos').value,
    ypos: document.getElementById('ypos').value,
    narrFont: textFont,
    narrSize: document.getElementById('narrSize').value,
    narrLine: document.getElementById('narrLine').value,
    narrColor: document.getElementById('narrColor').value,
    dlgStyle: document.getElementById('dlgStyle').value,
    dlgFont: textFont,
    dlgSize: document.getElementById('dlgSize').value,
    dlgLine: document.getElementById('dlgLine').value,
    titleSize: document.getElementById('titleSize').value,
    titleBold: document.getElementById('titleBold').checked,
    foldTitleSize: document.getElementById('foldTitleSize').value,
    foldTitleBold: document.getElementById('foldTitleBold').checked,
    foldTitleMinimal: !document.getElementById('foldTitleDecorationOn').checked,
    foldDividerMinimal: !document.getElementById('foldDividerOn').checked,
    foldTitleAutoNumber: document.getElementById('foldTitleAutoNumber').checked,
    charColor: document.getElementById('charColor').value,
    userColor: document.getElementById('userColor').value,
    emphasisColor: document.getElementById('emphasisColor').value,
    parallelTranslationSoft: document.getElementById('parallelTranslationLayout').value !== 'off',
    parallelTranslationLayout: document.getElementById('parallelTranslationLayout').value,
    charSpeakerOn: document.getElementById('charSpeakerOn').checked,
    userSpeakerOn: document.getElementById('userSpeakerOn').checked,
    extraChars: parseExtraChars(),
    charName: document.getElementById('charName').value,
    userName: document.getElementById('userName').value,
    nameRules: normalizeOutputRules(document.getElementById('nameRules').value, 'name'),
    keywordRules: normalizeOutputRules(document.getElementById('keywordRules').value),
    footerOn: document.getElementById('footerOn').checked,
    footerAuthor: document.getElementById('footerAuthor').value,
    creditOn: document.getElementById('creditOn').checked,
    creditPlacement: normalizeCreditPlacement(document.getElementById('creditPlacement').value),
    creditItems: storedCreditItems(),
    logTitleOn: document.getElementById('logTitleOn').checked,
    titleMinimal: document.getElementById('titleMinimal').checked,
    titleImageBackgroundOn: document.getElementById('titleImageBackgroundOn').checked,
    logNumber: document.getElementById('logNumber').value,
    logTitle: document.getElementById('logTitle').value,
    subChar: document.getElementById('subChar').value,
    subUser: document.getElementById('subUser').value,
    subtitleCoupleSeparator: normalizeSubtitleCoupleSeparator(document.getElementById('subtitleCoupleSeparator').value),
    logSubtitle: document.getElementById('logSubtitle').value,
    profileOn: document.getElementById('profileOn').checked,
    profileMinimal: document.getElementById('profileMinimal').checked,
    profileCharOn: document.getElementById('profileCharOn').checked,
    profileUserOn: document.getElementById('profileUserOn').checked,
    profileCommonOn: document.getElementById('profileCommonOn').checked,
    profilePlacement: document.getElementById('profilePlacement').value,
    profileTextPosition: document.getElementById('profileTextPosition').value,
    profileStyle: document.getElementById('profileStyle').value,
    profileOrder: document.getElementById('profileOrder').value,
    profileEntityOrder: normalizeProfileEntityOrder(
      document.getElementById('profileEntityOrder').value,
      currentExtraProfileCount,
      document.getElementById('profileOrder').value
    ),
    profileExtraCount: currentExtraProfileCount,
    profileExtras: EXTRA_PROFILE_SLOTS.filter(slot => slot <= currentExtraProfileCount + 2).map(slot => {
      const prefix = extraProfilePrefix(slot);
      const read = field => document.getElementById(prefix + field).value;
      return { key:`extra${slot}`, prefix, enabled:document.getElementById(prefix + 'On').checked,
        role:read('Role'), image:normalizeProtocolRelativeUrl(read('Image')),
        imageFailed:document.getElementById(prefix + 'ImageStatus')?.dataset?.state === 'error',
        scale:read('Scale'), x:read('X'), y:read('Y'),
        name:read('Name'), desc:read('Desc'), tags:read('Tags') };
    }),
    profileImageBackgroundOn: document.getElementById('profileImageBackgroundOn').checked,
    profileCharRole: document.getElementById('profileCharRole').value,
    profileCharImage: normalizeProtocolRelativeUrl(document.getElementById('profileCharImage').value),
    profileCharImageFailed: document.getElementById('profileCharImageStatus')?.dataset?.state === 'error',
    profileCharScale: document.getElementById('profileCharScale').value,
    profileCharX: document.getElementById('profileCharX').value,
    profileCharY: document.getElementById('profileCharY').value,
    profileCharName: document.getElementById('profileCharName').value,
    profileCharDesc: document.getElementById('profileCharDesc').value,
    profileCharTags: document.getElementById('profileCharTags').value,
    profileUserRole: document.getElementById('profileUserRole').value,
    profileUserImage: normalizeProtocolRelativeUrl(document.getElementById('profileUserImage').value),
    profileUserImageFailed: document.getElementById('profileUserImageStatus')?.dataset?.state === 'error',
    profileUserScale: document.getElementById('profileUserScale').value,
    profileUserX: document.getElementById('profileUserX').value,
    profileUserY: document.getElementById('profileUserY').value,
    profileUserName: document.getElementById('profileUserName').value,
    profileUserDesc: document.getElementById('profileUserDesc').value,
    profileUserTags: document.getElementById('profileUserTags').value,
    profileRelationship: document.getElementById('profileRelationship').value,
    profileSituation: document.getElementById('profileSituation').value,
    paragraphGap: document.getElementById('paragraphGap').value,
    narrDialogueGap: document.getElementById('narrDialogueGap').value,
    softBreakSpacing: normalizeSoftBreakSpacing(document.getElementById('softBreakSpacing').value),
    outputTheme: document.getElementById('outputTheme').value,
    cardLayout: normalizeCardLayout(document.getElementById('cardLayout').value),
    spacingMode: document.getElementById('spacingMode').value,
    cardWidth: document.getElementById('cardWidth').value,
    cardBorderOn: document.getElementById('cardBorderOn').checked,
    bgColor: document.getElementById('bgColor').value,
    advancedOn,
    hrShape: advancedOn ? document.getElementById('hrShape').value : 'solid',
    hrOpacity: advancedOn ? document.getElementById('hrOpacity').value : '50',
    hrLength: advancedOn ? document.getElementById('hrLength').value : '100',
    hrVerticalSpace: advancedOn ? document.getElementById('hrVerticalSpace').value : '26',
    hr2Shape: advancedOn ? document.getElementById('hr2Shape').value : 'star',
    hr2Opacity: advancedOn ? document.getElementById('hr2Opacity').value : '50',
    hr2VerticalSpace: advancedOn ? document.getElementById('hr2VerticalSpace').value : '48',
    hr3Shape: advancedOn ? document.getElementById('hr3Shape').value : 'dots',
    hr3Opacity: advancedOn ? document.getElementById('hr3Opacity').value : '50',
    hr3VerticalSpace: advancedOn ? document.getElementById('hr3VerticalSpace').value : '36',
    gapHeight: advancedOn ? document.getElementById('gapHeight').value : '48',
    coverVerticalSpace: advancedOn ? document.getElementById('coverVerticalSpace').value : '0',
    profileOuterBackground: advancedOn && document.getElementById('profilePlacement').value === 'top'
      ? document.getElementById('profileOuterBackground').value : 'filled',
    profileItemGap: advancedOn && document.getElementById('profilePlacement').value === 'top'
      ? document.getElementById('profileItemGap').value : '0',
    profileTitleGap: advancedOn ? document.getElementById('profileTitleGap').value : '0',
    coverCardGap: advancedOn ? document.getElementById('coverCardGap').value : '0',
    cardGap: advancedOn ? document.getElementById('cardGap').value : '20',
    unifiedBottomSpace: advancedOn ? document.getElementById('unifiedBottomSpace').value : '0',
    creditWidth: advancedOn ? document.getElementById('creditWidth').value : '380',
    creditCardGap: advancedOn ? document.getElementById('creditCardGap').value : '40',
    cardInlinePadding: advancedOn ? document.getElementById('cardInlinePadding').value : '22',
    cardBodyTopSpace: advancedOn ? document.getElementById('cardBodyTopSpace').value : '0',
    cardBodyBottomSpace: advancedOn ? document.getElementById('cardBodyBottomSpace').value : '0',
    footerBodyGap: advancedOn ? document.getElementById('footerBodyGap').value : '0',
    headingTopSpace: advancedOn ? document.getElementById('headingTopSpace').value : '0',
    headingBetweenSpace: advancedOn ? document.getElementById('headingBetweenSpace').value : '0',
    headingBottomSpace: advancedOn ? document.getElementById('headingBottomSpace').value : '0',
    cardTitlePadding: advancedOn ? document.getElementById('cardTitlePadding').value : '26',
    coverDividerLength: advancedOn ? document.getElementById('coverDividerLength').value : '100',
    cardDividerLength: advancedOn ? document.getElementById('cardDividerLength').value : '100',
    cardCornerRadius: advancedOn ? document.getElementById('cardCornerRadius').value : '16',
    cardTitleOrnamentOpacity: advancedOn && document.getElementById('foldTitleDecorationOn').checked
      ? document.getElementById('cardTitleOrnamentOpacity').value : '50',
    foldAutoNumberStyle: advancedOn && document.getElementById('foldTitleAutoNumber').checked
      ? document.getElementById('foldAutoNumberStyle').value : 'arabic',
    creditBorderOn: advancedOn && document.getElementById('creditBorderOn').checked,
    creditTransparentOn: advancedOn && document.getElementById('creditTransparentOn').checked,
    narrIndent: document.getElementById('narrIndent').checked,
    narrCenter: document.getElementById('narrCenter').checked,
    headingCenter: document.getElementById('headingCenter').checked,
    dialogueCenter: document.getElementById('dialogueCenter').checked,
    quoteCenter: document.getElementById('quoteCenter').checked,
    bodyFoldTitleCenter: document.getElementById('bodyFoldTitleCenter').checked,
    commentWidth: normalizeCommentWidth(document.getElementById('commentWidth').value),
    commentAlign: normalizeCommentAlign(document.getElementById('commentAlign').value),
  };
}

// 다른 런타임 파일은 흩어진 전역 이름 대신 이 책임 경계를 통해 상태 스키마를 쓴다.
const MosaicState = Object.freeze({
  APP_VERSION,
  EXTRA_PROFILE_SLOTS,
  STYLE_FIELDS,
  WORK_BOOLEAN_DEFAULTS,
  WORK_BOOLEAN_FIELDS,
  WORK_FIELDS,
  WORK_FIELD_DEFAULTS,
  collectWorkState,
  extraProfileFields,
  extraProfilePrefix,
  getSettings,
  moveProfileEntityOrder,
  normalizeCommentAlign,
  normalizeCommentWidth,
  normalizeHex,
  normalizeOutputRules,
  normalizeProfileEntityOrder,
  normalizeProtocolRelativeUrl,
  savedProfileImageBackgroundOn,
  settingFlagOn
});
