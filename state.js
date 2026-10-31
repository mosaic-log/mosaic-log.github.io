// 조각로그 v1.9.0 · 상태 스키마·검증·호환 변환 (DOM 비의존)
// 개조 길잡이: 기본값 DEFAULT_STYLE · 타입 STYLE_SCHEMA · 작업 필드 WORK_FIELDS/WORK_BOOLEAN_DEFAULTS.
// Dependencies: none
globalThis.MosaicState = (() => {
'use strict';
// 조각로그 v1.9.0 상태 스키마.
// 필드 이름·기본값·수집 규칙을 한곳에 두어 저장, 복원, 히스토리가 같은 계약을 사용한다.
const APP_VERSION = '1.9.7';

// 여러 런타임 모듈이 함께 쓰는 값 정규화는 가장 먼저 로드되는 상태 계층이 소유한다.
// UI에 두면 parser/renderer/storage가 화면 모듈의 전역 함수에 역으로 의존하게 된다.
function normalizeProtocolRelativeUrl(value){
  const url = String(value || '').trim();
  return url.startsWith('//') ? 'https:' + url : url;
}

// 폐기한 기본 표지 주소만 복원에서 제외한다. 사용자가 넣은 이미지와 다른 작업 필드는 보존한다.
function normalizeRetiredCoverImageFields(fields){
  let url;
  try { url = new URL(normalizeProtocolRelativeUrl(fields.imgUrl)); }
  catch(error){ return fields; }
  if(!['http:', 'https:'].includes(url.protocol)
    || url.host !== 'mosaic-log.github.io' || url.pathname !== '/Top_image.png') return fields;
  return { ...fields, imgUrl:'', imgOn:false, titleImageBackgroundOn:false };
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

// 저장된 옛 식별자도 같은 중립색 메신저의 출력·편집 규칙으로 읽는다.
function isMessengerDialogueStyle(value){
  return value === 'messenger' || value === 'messenger2';
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

const WORK_FIELDS = ['imgUrl','imgHeight','xpos','ypos','charName','userName','extraChars','footerAuthor','creditItems','creditPlacement','logNumber','logTitle','subChar','subUser','subtitleCoupleSeparator','logSubtitle','titleTextPosition','profilePlacement','profileTextPosition','profileStyle','profileOrder','profileEntityOrder','profileExtraCount','profileCharRole','profileCharImage','profileCharScale','profileCharX','profileCharY','profileCharName','profileCharDesc','profileCharTags','profileUserRole','profileUserImage','profileUserScale','profileUserX','profileUserY','profileUserName','profileUserDesc','profileUserTags',...EXTRA_PROFILE_SLOTS.flatMap(extraProfileFields),'profileRelationshipHeading','profileRelationship','profileSituationHeading','profileSituation','nameRules','keywordRules'];

const WORK_FIELD_DEFAULTS = Object.freeze({
  imgUrl:'', imgHeight:'300', xpos:'50', ypos:'0',
  charName:'', userName:'', extraChars:'[]', footerAuthor:'', creditItems:'[]', creditPlacement:'bottom',
  logNumber:'', logTitle:'', subChar:'', subUser:'', subtitleCoupleSeparator:'×', logSubtitle:'', titleTextPosition:'center',
  profilePlacement:'below', profileTextPosition:'center', profileStyle:'compact', profileOrder:'bot-user', profileEntityOrder:'["bot","user"]', profileExtraCount:'0', profileCharRole:'BOT', profileCharImage:'', profileCharScale:'100', profileCharX:'50', profileCharY:'50', profileCharName:'', profileCharDesc:'', profileCharTags:'', profileUserRole:'USER', profileUserImage:'', profileUserScale:'100', profileUserX:'50', profileUserY:'50', profileUserName:'', profileUserDesc:'', profileUserTags:'', profileRelationshipHeading:'RELATIONSHIP', profileRelationship:'', profileSituationHeading:'SITUATION', profileSituation:'',
  ...Object.fromEntries(EXTRA_PROFILE_SLOTS.flatMap(slot => {
    const prefix = extraProfilePrefix(slot);
    return [['Role','CHAR'],['Image',''],['Scale','100'],['X','50'],['Y','50'],['Name',''],['Desc',''],['Tags','']].map(([field,value]) => [prefix + field,value]);
  })),
  nameRules:'[]', keywordRules:'[]'
});

const WORK_BOOLEAN_DEFAULTS = Object.freeze({
  logTitleOn:false, titleMinimal:false, titleImageBackgroundOn:false, imgOn:false, profileOn:false, profileDividerMinimal:false,
  profileCharOn:true, profileUserOn:true, profileImageBackgroundOn:false,
  ...Object.fromEntries(EXTRA_PROFILE_SLOTS.map(slot => [`profileExtra${slot}On`, true])),
  profileRelationshipOn:true, profileSituationOn:true, footerOn:true, creditOn:false
});

const WORK_BOOLEAN_FIELDS = Object.freeze(Object.keys(WORK_BOOLEAN_DEFAULTS));



const DEFAULT_STYLE = Object.freeze({
  parallelDialogueOn:true, parallelNarrationOn:false,
  parallelTranslationOrder:'original', parallelTranslationBrackets:'show',
  textFont: 'pretendard', narrSize: '14', narrLine: '1.6', narrColor: '#555555',
  dlgStyle: 'softlight', dlgSize: '14', dlgLine: '1.6', paragraphGap: '20', narrDialogueGap: '20', softBreakSpacing: '0',
  titleSize: '21', titleBold: true, foldTitleSize: '16', foldTitleBold: true, foldTitleDecorationOn: true, foldDividerOn: true, foldTitleAutoNumber: false,
  charColor: '#222222', userColor: '#707070', emphasisColor: '#747474',
  outputTheme: 'solid', cardLayout: 'separate', spacingMode: 'normal', cardWidth: '750', cardBorderOn: true, bgColor: '#ffffff',
  advancedOn:false, hrShape:'solid', hrOpacity:'55', hrLength:'100', hrVerticalSpace:'26', hr2Shape:'star', hr2Opacity:'50', hr2VerticalSpace:'48', hr3Shape:'dots', hr3Opacity:'65', hr3VerticalSpace:'36', gapHeight:'48', coverVerticalSpace:'0',
  profileOuterBackground:'filled', profileItemGap:'0', profileTitleGap:'0', coverCardGap:'0', cardGap:'20', unifiedBottomSpace:'0', creditWidth:'380', creditCardGap:'40', cardInlinePadding:'22', cardBodyTopSpace:'0', cardBodyBottomSpace:'0', headingTopSpace:'0', headingBetweenSpace:'0', headingBottomSpace:'0', cardCornerRadius:'16', cardTitleOrnamentOpacity:'50', foldAutoNumberStyle:'arabic', coverDividerLength:'100', cardTitlePadding:'26', cardDividerLength:'100', creditBorderOn:false, creditTransparentOn:false,
  footerBodyGap:'0',
  narrIndent: false, narrCenter: false, headingCenter: false, dialogueCenter: false, memoCenter: false, quoteCenter: false, bodyFoldTitleCenter: false, commentWidth: 'default', commentAlign: 'left', parallelTranslationLayout: 'auto', charSpeakerOn: false, userSpeakerOn: false
});

const STYLE_FIELDS = Object.freeze(Object.keys(DEFAULT_STYLE));
const STYLE_SCHEMA = Object.freeze({
  outputTheme:Object.freeze({"type":"select","tagName":"SELECT","min":"","max":"","options":["solid","document","transparent","document-transparent"]}),
  textFont:Object.freeze({"type":"select","tagName":"SELECT","min":"","max":"","options":["pretendard","notoSans","notoSerif"]}),
  narrSize:Object.freeze({"type":"range","tagName":"INPUT","min":"9","max":"24","options":[]}),
  narrLine:Object.freeze({"type":"range","tagName":"INPUT","min":"1","max":"3","options":[]}),
  narrColor:Object.freeze({"type":"color","tagName":"INPUT","min":"","max":"","options":[]}),
  dlgStyle:Object.freeze({"type":"select","tagName":"SELECT","min":"","max":"","options":["softlight","highlight","badge","gradient","quote-bg","box","messenger2"]}),
  dlgSize:Object.freeze({"type":"range","tagName":"INPUT","min":"9","max":"24","options":[]}),
  dlgLine:Object.freeze({"type":"range","tagName":"INPUT","min":"1","max":"3","options":[]}),
  paragraphGap:Object.freeze({"type":"range","tagName":"INPUT","min":"8","max":"40","options":[]}),
  narrDialogueGap:Object.freeze({"type":"range","tagName":"INPUT","min":"10","max":"40","options":[]}),
  softBreakSpacing:Object.freeze({"type":"range","tagName":"INPUT","min":"0","max":"2","options":[]}),
  titleSize:Object.freeze({"type":"range","tagName":"INPUT","min":"16","max":"36","options":[]}),
  titleBold:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[]}),
  foldTitleSize:Object.freeze({"type":"range","tagName":"INPUT","min":"11","max":"24","options":[]}),
  foldTitleBold:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[]}),
  foldTitleDecorationOn:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[]}),
  foldDividerOn:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[]}),
  foldTitleAutoNumber:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[]}),
  charColor:Object.freeze({"type":"color","tagName":"INPUT","min":"","max":"","options":[]}),
  userColor:Object.freeze({"type":"color","tagName":"INPUT","min":"","max":"","options":[]}),
  emphasisColor:Object.freeze({"type":"color","tagName":"INPUT","min":"","max":"","options":[]}),
  cardLayout:Object.freeze({"type":"select","tagName":"SELECT","min":"","max":"","options":["separate","unified"]}),
  spacingMode:Object.freeze({"type":"select","tagName":"SELECT","min":"","max":"","options":["compact","normal","relaxed"]}),
  cardWidth:Object.freeze({"type":"select","tagName":"SELECT","min":"","max":"","options":["620","680","750","900"]}),
  cardBorderOn:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[]}),
  bgColor:Object.freeze({"type":"color","tagName":"INPUT","min":"","max":"","options":[]}),
  advancedOn:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[],"detailPreset":true}),
  hrShape:Object.freeze({"type":"select","tagName":"SELECT","min":"","max":"","options":["solid","dashed","star"],"detailPreset":true}),
  hrOpacity:Object.freeze({"type":"range","tagName":"INPUT","min":"0","max":"100","options":[],"detailPreset":true}),
  hrLength:Object.freeze({"type":"range","tagName":"INPUT","min":"20","max":"100","options":[],"detailPreset":true}),
  hrVerticalSpace:Object.freeze({"type":"range","tagName":"INPUT","min":"0","max":"80","options":[],"detailPreset":true}),
  hr2Shape:Object.freeze({"type":"select","tagName":"SELECT","min":"","max":"","options":["star","diamond","triple-star"],"detailPreset":true}),
  hr2Opacity:Object.freeze({"type":"range","tagName":"INPUT","min":"0","max":"100","options":[],"detailPreset":true}),
  hr2VerticalSpace:Object.freeze({"type":"range","tagName":"INPUT","min":"0","max":"80","options":[],"detailPreset":true}),
  hr3Shape:Object.freeze({"type":"select","tagName":"SELECT","min":"","max":"","options":["dots","one","line"],"detailPreset":true}),
  hr3Opacity:Object.freeze({"type":"range","tagName":"INPUT","min":"0","max":"100","options":[],"detailPreset":true}),
  hr3VerticalSpace:Object.freeze({"type":"range","tagName":"INPUT","min":"0","max":"80","options":[],"detailPreset":true}),
  gapHeight:Object.freeze({"type":"range","tagName":"INPUT","min":"20","max":"100","options":[],"detailPreset":true}),
  coverVerticalSpace:Object.freeze({"type":"range","tagName":"INPUT","min":"0","max":"60","options":[],"detailPreset":true}),
  profileOuterBackground:Object.freeze({"type":"select","tagName":"SELECT","min":"","max":"","options":["filled","transparent"],"detailPreset":true}),
  profileItemGap:Object.freeze({"type":"range","tagName":"INPUT","min":"-10","max":"40","options":[],"detailPreset":true}),
  profileTitleGap:Object.freeze({"type":"range","tagName":"INPUT","min":"-20","max":"80","options":[],"detailPreset":true}),
  coverCardGap:Object.freeze({"type":"range","tagName":"INPUT","min":"0","max":"80","options":[],"detailPreset":true}),
  cardGap:Object.freeze({"type":"range","tagName":"INPUT","min":"0","max":"40","options":[],"detailPreset":true}),
  unifiedBottomSpace:Object.freeze({"type":"hidden","tagName":"INPUT","min":"0","max":"60","options":[],"detailPreset":true}),
  creditWidth:Object.freeze({"type":"range","tagName":"INPUT","min":"200","max":"900","options":[],"detailPreset":true}),
  creditCardGap:Object.freeze({"type":"range","tagName":"INPUT","min":"18","max":"80","options":[],"detailPreset":true}),
  cardInlinePadding:Object.freeze({"type":"range","tagName":"INPUT","min":"0","max":"66","options":[],"detailPreset":true}),
  cardBodyTopSpace:Object.freeze({"type":"range","tagName":"INPUT","min":"-44","max":"40","options":[],"detailPreset":true}),
  cardBodyBottomSpace:Object.freeze({"type":"range","tagName":"INPUT","min":"-44","max":"40","options":[],"detailPreset":true}),
  footerBodyGap:Object.freeze({"type":"range","tagName":"INPUT","min":"-60","max":"80","options":[],"detailPreset":true}),
  headingTopSpace:Object.freeze({"type":"range","tagName":"INPUT","min":"-20","max":"40","options":[],"detailPreset":true}),
  headingBetweenSpace:Object.freeze({"type":"range","tagName":"INPUT","min":"-20","max":"40","options":[],"detailPreset":true}),
  headingBottomSpace:Object.freeze({"type":"range","tagName":"INPUT","min":"-20","max":"40","options":[],"detailPreset":true}),
  cardCornerRadius:Object.freeze({"type":"range","tagName":"INPUT","min":"0","max":"16","options":[],"detailPreset":true}),
  cardTitleOrnamentOpacity:Object.freeze({"type":"range","tagName":"INPUT","min":"0","max":"100","options":[],"detailPreset":true}),
  foldAutoNumberStyle:Object.freeze({"type":"select","tagName":"SELECT","min":"","max":"","options":["arabic","roman"],"detailPreset":true}),
  coverDividerLength:Object.freeze({"type":"range","tagName":"INPUT","min":"20","max":"100","options":[],"detailPreset":true}),
  cardTitlePadding:Object.freeze({"type":"range","tagName":"INPUT","min":"12","max":"40","options":[],"detailPreset":true}),
  cardDividerLength:Object.freeze({"type":"range","tagName":"INPUT","min":"20","max":"100","options":[],"detailPreset":true}),
  creditBorderOn:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[],"detailPreset":true}),
  creditTransparentOn:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[],"detailPreset":true}),
  narrIndent:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[]}),
  narrCenter:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[]}),
  headingCenter:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[]}),
  dialogueCenter:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[]}),
  memoCenter:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[]}),
  quoteCenter:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[]}),
  bodyFoldTitleCenter:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[]}),
  commentWidth:Object.freeze({"type":"hidden","tagName":"INPUT","min":"","max":"","options":[]}),
  commentAlign:Object.freeze({"type":"hidden","tagName":"INPUT","min":"","max":"","options":[]}),
  parallelTranslationLayout:Object.freeze({"type":"select","tagName":"SELECT","min":"","max":"","options":["auto","inline","stack"]}),
  charSpeakerOn:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[]}),
  userSpeakerOn:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[]}),
  parallelTranslationOrder:Object.freeze({"type":"select","tagName":"SELECT","min":"","max":"","options":["original","translation"]}),
  parallelTranslationBrackets:Object.freeze({"type":"select","tagName":"SELECT","min":"","max":"","options":["show","hide"]}),
  parallelDialogueOn:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[]}),
  parallelNarrationOn:Object.freeze({"type":"checkbox","tagName":"INPUT","min":"","max":"","options":[]})
});

function settingFlagOn(value){
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

// 관계·상황을 나누기 전 자료의 공통 표시값은 새 두 항목이 누락된 경우에만 이어받는다.
function savedProfileCommonVisibility(fields){
  const enabled = id => fields[id] !== undefined ? settingFlagOn(fields[id])
    : fields.profileCommonOn !== undefined ? settingFlagOn(fields.profileCommonOn)
    : WORK_BOOLEAN_DEFAULTS[id];
  return {
    profileRelationshipOn:enabled('profileRelationshipOn'),
    profileSituationOn:enabled('profileSituationOn')
  };
}

function savedProfileDividerMinimal(fields){
  return settingFlagOn(fields.profileDividerMinimal);
}

function savedProfileImageBackgroundOn(fields){
  if(fields.profileImageBackgroundOn !== undefined) return settingFlagOn(fields.profileImageBackgroundOn);
  return settingFlagOn(fields.profileCharImageBackgroundOn)
    || settingFlagOn(fields.profileUserImageBackgroundOn);
}

function collectWorkState(cards, fields){
  return {cards, fields:{...fields}};
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

// 예외는 규칙과 원문 위치를 함께 확인한다. 동일 문구의 다른 출현에는 옮기지 않는다.
function normalizeOutputRuleExclusions(value, body){
  if(!Array.isArray(value)) return [];
  const seen = new Set();
  return value.slice(0,1000).filter(item => {
    if(!item || !['name','keyword'].includes(item.kind)
      || typeof item.ruleId !== 'string' || !item.ruleId || item.ruleId.length > 160
      || typeof item.from !== 'string' || !item.from || item.from.length > 80
      || typeof item.to !== 'string' || item.to.length > 80
      || !Number.isInteger(item.start) || !Number.isInteger(item.end)
      || item.start < 0 || item.end <= item.start || item.end > body.length
      || typeof item.text !== 'string' || body.slice(item.start,item.end) !== item.text) return false;
    const key = JSON.stringify([item.kind,item.ruleId,item.from,item.to,item.start,item.end]);
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(({kind,ruleId,from,to,start,end,text}) => ({kind,ruleId,from,to,start,end,text}));
}

function rebaseOutputRuleExclusions(value, before, after){
  return rebaseTextRangeExclusions(value,before,after,normalizeOutputRuleExclusions);
}

function normalizeParallelExclusions(value,body){
  if(!Array.isArray(value))return [];
  const seen=new Set();
  return value.slice(0,1000).filter(item=>{
    if(!item || !['dialogue','narration'].includes(item.kind) || !Number.isInteger(item.start) || !Number.isInteger(item.end)
      || item.start<0 || item.end<=item.start || item.end>body.length || typeof item.text!=='string' || body.slice(item.start,item.end)!==item.text)return false;
    const key=JSON.stringify([item.kind,item.start,item.end]);if(seen.has(key))return false;seen.add(key);return true;
  }).map(({kind,start,end,text})=>({kind,start,end,text}));
}

function rebaseParallelExclusions(value,before,after){
  return rebaseTextRangeExclusions(value,before,after,normalizeParallelExclusions);
}

// iOS 15 Safari에서도 파싱되도록 뒤쪽 조건 검사를 문자 비교로 처리한다.
// 건너뛴 후보의 닫는 *가 다음 강조의 시작일 수 있으므로 한 글자만 전진한다.
function emphasisMatches(value, combined = false){
  const source = String(value);
  const pattern = combined
    ? /\*\*\*([^*\n]+?)\*\*\*|\*([^*\n]+?)\*(?!\*)/g
    : /\*([^*\n]+?)\*(?!\*)/g;
  const matches = [];
  let match;
  while((match = pattern.exec(source)) !== null){
    if((!combined || match[2] !== undefined) && source[match.index - 1] === '*'){
      pattern.lastIndex = match.index + 1;
      continue;
    }
    matches.push(match);
  }
  return matches;
}

function rebaseTextRangeExclusions(value,before,after,normalize){
  const items = normalize(value,before);
  if(before === after) return items;
  if(!items.length) return [];
  // B/I/C처럼 글자 자체를 바꾸지 않는 서식 편집은 원문 글자 인덱스로 옮긴다.
  const formattingProjection = body => {
    const hidden = new Set();
    const mask = (start,end) => {for(let i=start;i<end;i++) hidden.add(i);};
    for(const [pattern,width] of [[/\*\*\*([^*\n]+?)\*\*\*/g,3],[/\*\*([^*\n]+?)\*\*/g,2],[/__(.+?)__/g,2]]){
      let match; while((match = pattern.exec(body)) !== null){ mask(match.index,match.index+width); mask(match.index+match[0].length-width,match.index+match[0].length); }
    }
    for(const match of emphasisMatches(body)){ mask(match.index,match.index+1); mask(match.index+match[0].length-1,match.index+match[0].length); }
    let match; const center = /^(?:>(?!>)\s*)?\[C\]\s*/gim;
    while((match = center.exec(body)) !== null){ const at = match.index+match[0].indexOf('[C]'); mask(at,match.index+match[0].length); }
    let text = ''; const map = [];
    for(let i=0;i<body.length;i++) if(!hidden.has(i)){text += body[i];map.push(i);}
    return {text,map};
  };
  const oldFormat = formattingProjection(before), newFormat = formattingProjection(after);
  if(oldFormat.text === newFormat.text){
    return normalize(items.flatMap(item => {
      const at = oldFormat.map.indexOf(item.start), end = oldFormat.map.indexOf(item.end-1);
      if(at < 0 || end < at) return [];
      const moved = {...item,start:newFormat.map[at],end:newFormat.map[end]+1};
      return after.slice(moved.start,moved.end) === item.text ? [moved] : [];
    }),after);
  }
  let prefix = 0, suffix = 0;
  while(prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let fullSuffix = 0;
  while(fullSuffix < before.length && fullSuffix < after.length
    && before[before.length-1-fullSuffix] === after[after.length-1-fullSuffix]) fullSuffix++;
  while(suffix < before.length-prefix && suffix < after.length-prefix
    && before[before.length-1-suffix] === after[after.length-1-suffix]) suffix++;
  const delta = after.length-before.length;
  const ambiguousStart = Math.min(before.length,after.length)-fullSuffix;
  const ambiguousEnd = prefix+Math.max(0,before.length-after.length);
  const ambiguous = prefix+fullSuffix > Math.min(before.length,after.length);
  return normalize(items.flatMap(item => ambiguous && item.start < ambiguousEnd && item.end > ambiguousStart ? [] : item.end <= prefix ? [item]
    : item.start >= before.length-suffix ? [{...item,start:item.start+delta,end:item.end+delta}] : []),after);
}

function normalizeSubtitleCoupleSeparator(value){
  return ['×', '&', '·'].includes(value) ? value : '×';
}

function normalizeCardLayout(value){
  return value === 'unified' ? 'unified' : 'separate';
}

function advancedPercent(value, fallback = 50){
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
}

function normalizeHrShape(value){
  if(value === 'dotted') return 'star';
  return ['solid','dashed','star'].includes(value) ? value : 'solid';
}

function normalizeHr2Shape(value){
  if(value === 'circle') return 'triple-star';
  return ['star','diamond','triple-star'].includes(value) ? value : 'star';
}

function normalizeHr3Shape(value){
  return ['dots','one','line'].includes(value) ? value : 'dots';
}

function normalizeSoftBreakSpacing(value){
  const raw = String(value === undefined || value === null ? '' : value);
  if(['normal','relaxed','wide'].includes(raw)) return raw;
  return ['normal','relaxed','wide'][Math.min(2, Math.max(0, Number.parseInt(raw, 10) || 0))];
}

function softBreakSpacingControlValue(value){
  return String(['normal','relaxed','wide'].indexOf(normalizeSoftBreakSpacing(value)));
}

const MAX_CREDIT_ITEMS = 20;

function normalizeCreditItems(value){
  let source = value;
  if(typeof source === 'string'){
    try { source = JSON.parse(source || '[]'); }
    catch(e){ source = []; }
  }
  if(!Array.isArray(source)) return [];
  return source.slice(0, MAX_CREDIT_ITEMS).map((item, index) => {
    const row = item && typeof item === 'object' ? item : {};
    return {
      label:String(row.label || '').slice(0, 80),
      value:String(row.value || '').slice(0, 500),
      url:String(row.url || '').slice(0, 8192),
      dividerBefore:index > 0 && settingFlagOn(row.dividerBefore)
    };
  });
}

const MAX_CREDIT_PRESETS = 50;

function sanitizeCreditPresetList(value){
  if(!Array.isArray(value)) return [];
  return value.slice(0, MAX_CREDIT_PRESETS).map((preset, index) => {
    if(!preset || typeof preset !== 'object' || Array.isArray(preset)) return null;
    const name = typeof preset.name === 'string' ? preset.name.trim().slice(0, 80) : '';
    if(!name || !Array.isArray(preset.items)) return null;
    const items = normalizeCreditItems(preset.items)
      .filter(item => item.label.trim() || item.value.trim() || item.url.trim());
    if(!items.length) return null;
    const id = typeof preset.id === 'string' && preset.id
      ? preset.id.slice(0, 120)
      : `credit-preset-${index}-${name.toLowerCase()}`;
    return { id, name, items, updatedAt:Number(preset.updatedAt) || 0 };
  }).filter(Boolean);
}

const MAX_DETAIL_PRESETS = 50;

const DETAIL_PRESET_FIELDS = Object.freeze(STYLE_FIELDS.filter(id => STYLE_SCHEMA[id].detailPreset));

function normalizeCreditPlacement(value){
  return value === 'top' ? 'top' : 'bottom';
}

// 특수 테마는 내용과 접기 동작을 보존하고 출력 장식만 바꾼다.
function normalizeOutputTheme(value){
  return ['transparent', 'document', 'document-transparent'].includes(value) ? value : 'solid';
}

function outputThemeShape(value){
  return ['document', 'document-transparent'].includes(value) ? 'document' : 'solid';
}

function outputThemeTransparent(value){
  return ['transparent', 'document-transparent'].includes(value);
}

function composeOutputTheme(shape, transparent){
  return shape === 'document'
    ? (transparent ? 'document-transparent' : 'document')
    : (transparent ? 'transparent' : 'solid');
}

// ---------- 출력 전용 이름·키워드 규칙 ----------
// 실제 치환은 파서에서 처리한다. UI는 원문 대신 규칙만 저장·활성화한다.
const NAME_RULE_LIMIT = 20;

// ---------- 키워드 치환 ----------
// 원문에서 매번 다시 계산하므로 여러 규칙의 결과가 같아도 허용한다.
const KEYWORD_RULE_LIMIT = 20;

const MAX_CARD_CHARS = 500000;

const MAX_WORK_BLOCKS = 200;

const MAX_TOTAL_BODY_CHARS = 2000000;

const MAX_FOLD_TITLE_CHARS = 200;

function sanitizeImportedWork(data){
  if(!data || !Array.isArray(data.cards) || data.cards.length > MAX_WORK_BLOCKS) return null;
  const cards = [];
  let totalBodyChars = 0;
  for(const card of data.cards){
    let type = 'card';
    if(typeof card === 'object' && card !== null){
      if(card.type !== undefined && !['card','comment'].includes(card.type)) return null;
      type = card.type === 'comment' ? 'comment' : 'card';
      if(card.folded !== undefined && typeof card.folded !== 'boolean') return null;
      if(card.foldTitle !== undefined && typeof card.foldTitle !== 'string') return null;
      if(card.foldMinimal !== undefined && typeof card.foldMinimal !== 'boolean') return null;
      if(card.visible !== undefined && typeof card.visible !== 'boolean') return null;
      if(card.bodyCenter !== undefined && typeof card.bodyCenter !== 'boolean') return null;
    }
    const body = typeof card === 'string' ? card : card && card.body;
    const foldTitle = typeof card === 'object' && typeof card.foldTitle === 'string' ? card.foldTitle : '';
    if(typeof body !== 'string' || body.length > MAX_CARD_CHARS || foldTitle.length > MAX_FOLD_TITLE_CHARS) return null;
    if(card.outputRuleExclusions !== undefined && (!Array.isArray(card.outputRuleExclusions)
      || type === 'comment' || normalizeOutputRuleExclusions(card.outputRuleExclusions,body).length !== card.outputRuleExclusions.length)) return null;
    if(card.parallelExclusions !== undefined && (!Array.isArray(card.parallelExclusions) || type === 'comment'
      || normalizeParallelExclusions(card.parallelExclusions,body).length !== card.parallelExclusions.length)) return null;
    totalBodyChars += body.length;
    if(totalBodyChars > MAX_TOTAL_BODY_CHARS) return null;
    const visible = typeof card !== 'object' || card.visible !== false;
    cards.push(type === 'comment'
      ? { type:'comment', body, visible }
      : {
          type:'card',
          body,
          folded: typeof card === 'object' && !!card.folded,
          foldTitle,
          foldMinimal: typeof card === 'object' && !!card.foldMinimal,
          visible,
          ...(typeof card === 'object' && card.bodyCenter === true ? {bodyCenter:true} : {}),
          ...(card.outputRuleExclusions?.length ? {outputRuleExclusions:normalizeOutputRuleExclusions(card.outputRuleExclusions,body)} : {}),
          ...(card.parallelExclusions?.length ? {parallelExclusions:normalizeParallelExclusions(card.parallelExclusions,body)} : {})
        });
  }
  const source = data.fields && typeof data.fields === 'object' && !Array.isArray(data.fields) ? data.fields : {};
  const fields = {};
  for(const id of WORK_FIELDS){
    if(source[id] === undefined) continue;
    if(typeof source[id] !== 'string' && typeof source[id] !== 'number') return null;
    const value = String(source[id]);
    if(id === 'profilePlacement' && !['below','top'].includes(value)) return null;
    if(['profileTextPosition','titleTextPosition'].includes(id) && !['top','center','bottom'].includes(value)) return null;
    if(id === 'creditPlacement' && !['top','bottom'].includes(value)) return null;
    if(id === 'profileStyle' && !['compact','portrait','showcase'].includes(value)) return null;
    if(id === 'profileOrder' && !['bot-user','user-bot'].includes(value)) return null;
    if(id === 'subtitleCoupleSeparator' && !['×','&','·'].includes(value)) return null;
    if(/^(?:profileChar|profileUser|profileExtra[3-5])Scale$/.test(id)){
      const scale = Number(value);
      if(!Number.isFinite(scale) || scale < 100 || scale > 300) return null;
    }
    if(/^(?:profileChar|profileUser|profileExtra[3-5])[XY]$/.test(id)){
      const position = Number(value);
      if(!Number.isFinite(position) || position < 0 || position > 100) return null;
    }
    if(id === 'profileExtraCount' && !/^[0-3]$/.test(value)) return null;
    if(/^(?:profileChar|profileUser|profileExtra[3-5])Role$/.test(id) && value.length > 24) return null;
    const limit = (id === 'imgUrl' || /^(?:profileChar|profileUser|profileExtra[3-5])Image$/.test(id))
      ? 8192
      : ((id === 'extraChars' || id === 'creditItems') ? 200000 : 5000);
    if(value.length > limit) return null;
    if(['profileRelationshipHeading','profileSituationHeading'].includes(id) && value.length > 80) return null;
    fields[id] = value;
  }
  const importedExtraCount = Math.max(0, Math.min(3, Number(fields.profileExtraCount) || 0));
  if(fields.profileEntityOrder !== undefined){
    try {
      const parsed = JSON.parse(fields.profileEntityOrder);
      if(!Array.isArray(parsed) || parsed.some(key => typeof key !== 'string')) return null;
    } catch(e){ return null; }
  }
  // 옛 파일의 bot-user/user-bot 값은 새 자유 순서표의 초기값으로 승계한다.
  fields.profileEntityOrder = JSON.stringify(normalizeProfileEntityOrder(
    fields.profileEntityOrder,
    importedExtraCount,
    fields.profileOrder || 'bot-user'
  ));
  let invalidBoolean = false;
  WORK_BOOLEAN_FIELDS.forEach(id => {
    if(source[id] !== undefined){
      if(typeof source[id] !== 'boolean') invalidBoolean = true;
      else fields[id] = source[id];
    }
  });
  if(invalidBoolean) return null;
  if(source.profileCommonOn !== undefined && typeof source.profileCommonOn !== 'boolean') return null;
  Object.assign(fields, savedProfileCommonVisibility(source));
  fields.profileDividerMinimal = savedProfileDividerMinimal(source);
  if(source.profileImageBackgroundOn === undefined){
    for(const legacyId of ['profileCharImageBackgroundOn','profileUserImageBackgroundOn']){
      if(source[legacyId] !== undefined && typeof source[legacyId] !== 'boolean') return null;
    }
    fields.profileImageBackgroundOn = savedProfileImageBackgroundOn(source);
  }
  if(fields.extraChars !== undefined){
    try {
      const cleanChars = sanitizeExtraCharList(JSON.parse(fields.extraChars));
      if(!cleanChars) return null;
      fields.extraChars = JSON.stringify(cleanChars);
    }
    catch(e){ return null; }
  }
  if(fields.creditItems !== undefined){
    try {
      const items = JSON.parse(fields.creditItems);
      if(!Array.isArray(items) || items.length > MAX_CREDIT_ITEMS) return null;
      const cleaned = items.map((item, index) => {
        if(!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('invalid credit item');
        if(typeof item.label !== 'string' || typeof item.value !== 'string' || typeof item.url !== 'string') throw new Error('invalid credit fields');
        if(item.dividerBefore !== undefined && typeof item.dividerBefore !== 'boolean') throw new Error('invalid credit divider');
        if(item.label.length > 80 || item.value.length > 500 || item.url.length > 8192) throw new Error('credit field too long');
        return { label:item.label, value:item.value, url:item.url, dividerBefore:index > 0 && item.dividerBefore === true };
      });
      fields.creditItems = JSON.stringify(cleaned);
    }
    catch(e){ return null; }
  }
  if(fields.nameRules !== undefined){
    try {
      const rules = JSON.parse(fields.nameRules);
      if(!Array.isArray(rules) || rules.length > 20) return null;
      const cleaned = rules.map((rule, index) => {
        if(!rule || typeof rule !== 'object' || Array.isArray(rule)
          || typeof rule.from !== 'string' || typeof rule.to !== 'string'
          || !rule.from || !rule.to || rule.from.length > 80 || rule.to.length > 80) throw new Error('invalid name rule');
        if(rule.enabled !== undefined && typeof rule.enabled !== 'boolean') throw new Error('invalid name rule state');
        const id = typeof rule.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(rule.id)
          ? rule.id : `nr_import_${index}`;
        return { id, from:rule.from, to:rule.to, ...(rule.enabled !== undefined ? {enabled:rule.enabled} : {}) };
      });
      fields.nameRules = JSON.stringify(cleaned);
    } catch(e){ return null; }
  }
  if(fields.keywordRules !== undefined){
    try {
      const rules = JSON.parse(fields.keywordRules);
      if(!Array.isArray(rules) || rules.length > KEYWORD_RULE_LIMIT) return null;
      const cleaned = rules.map((rule, index) => {
        if(!rule || typeof rule !== 'object' || Array.isArray(rule)
          || typeof rule.from !== 'string' || typeof rule.to !== 'string'
          || !rule.from || rule.from.length > 80 || rule.to.length > 80) throw new Error('invalid keyword rule');
        if(rule.enabled !== undefined && typeof rule.enabled !== 'boolean') throw new Error('invalid keyword rule state');
        const id = typeof rule.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(rule.id)
          ? rule.id : `kr_import_${index}`;
        return { id, from:rule.from, to:rule.to, ...(rule.enabled !== undefined ? {enabled:rule.enabled} : {}) };
      });
      fields.keywordRules = JSON.stringify(cleaned);
    } catch(e){ return null; }
  }
  const legacyFoldDividerMinimal = cards.some(card => card.type !== 'comment' && settingFlagOn(card.foldMinimal));
  const out = { cards: cards.length ? cards : [{ type:'card', body:'', folded:false, foldTitle:'', foldMinimal:false, visible:true }], fields };
  if(data.style !== undefined){
    const style = sanitizeImportedPreset({ name:'보관함', values:data.style });
    if(!style) return null;
    out.style = style.values;
    // 카드별 미니멀 저장값은 현재의 전체 접기 구분선 옵션으로 합친다.
    if(data.style.foldDividerOn === undefined && data.style.foldDividerMinimal === undefined && legacyFoldDividerMinimal){
      out.style.foldDividerOn = false;
    }
  } else {
    out.style = { ...DEFAULT_STYLE, foldDividerOn: !legacyFoldDividerMinimal };
  }
  return out;
}

// ---------- 초안 자동 저장 ----------
// 본문/이미지 관련 입력을 이 브라우저(localStorage)에 자동 저장해서,
// 창을 닫거나 새로고침해도 작업 내용이 유지되게 함.
const DRAFT_KEY = 'logGenDraft_v1';

// 초안과 보관함은 같은 작업 필드 스키마를 공유한다. 별도 배열을 복제하면 새 필드가
// 한쪽 저장 경로에서 빠질 수 있으므로 WORK_FIELDS를 단일 기준으로 사용한다.
const DRAFT_FIELDS = WORK_FIELDS;

const THEME_COLOR_FIELDS = ['bgColor', 'narrColor', 'emphasisColor', 'charColor', 'userColor'];

const SAVED_PRESET_FIELDS = [...THEME_COLOR_FIELDS, 'outputTheme', 'dlgStyle'];

// ---------- 추가 인물 (본문에서 자동 감지) ----------
// 본문에 [이름]"대사" 를 쓰면 그 이름이 자동으로 인물 목록에 나타난다.
// 색은 처음엔 나레이션 글자색과 같고, 사용자가 고른 색은 extraChars에 기억된다.

function sanitizeExtraCharList(value){
  if(!Array.isArray(value) || value.length > 100) return null;
  const clean = [];
  const seen = new Set();
  for(const item of value){
    if(!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const color = typeof item.color === 'string' ? normalizeHex(item.color) : null;
    if(!name || name.length > 24 || /[\[\]\u0000-\u001F\u007F]/.test(name) || !color) return null;
    const key = name.toLowerCase();
    if(seen.has(key)) continue;
    seen.add(key);
    clean.push({ name, color });
  }
  return clean;
}

// 외부 프리셋 파일의 값을 실제 컨트롤 형식과 범위에 맞는지 확인한다.
// 알 수 없는 필드는 버리고, 누락된 최신 필드는 기본값으로 채운다.
// 알려진 필드 하나라도 잘못되면 해당 프리셋을 거부한다.
function sanitizeImportedPreset(preset){
  if(!preset || typeof preset.name !== 'string' || !preset.name.trim() || preset.name.length > 80
     || /[\u0000-\u001F\u007F]/.test(preset.name)
     || !preset.values || typeof preset.values !== 'object' || Array.isArray(preset.values)) return null;
  const clean = { ...DEFAULT_STYLE };
  // 나레이션·대사 폰트가 따로 저장돼 있으면 나레이션 값을 우선해 전체 폰트로 읽는다.
  const sourceValues = migrateStyleValues(preset.values, true);
  if(!sourceValues) return null;
  if(['dotted','double','fade','end-dots'].includes(sourceValues.hrShape)){
    sourceValues.hrShape = normalizeHrShape(sourceValues.hrShape);
  }
  if(['circle','line'].includes(sourceValues.hr2Shape)) sourceValues.hr2Shape = normalizeHr2Shape(sourceValues.hr2Shape);
  if(sourceValues.hr3Shape === 'diamond') sourceValues.hr3Shape = normalizeHr3Shape(sourceValues.hr3Shape);
  if(sourceValues.advancedOn === undefined){
    ['hrOpacity','hr2Opacity','hr3Opacity'].forEach(id => {
      const number = Number(sourceValues[id]);
      if(sourceValues[id] !== undefined && Number.isFinite(number) && number >= 0 && number <= 100) {
        sourceValues[id] = String(number / 2);
      }
    });
    sourceValues.advancedOn = true;
  }
  // 이전 버전의 원문 병행 체크박스를 현재 드롭다운 값으로 변환한다.
  // 검증 전에 옮겨야 `끔`이 DEFAULT_STYLE의 자동 배치로 덮이지 않는다.
  if(sourceValues.paragraphGap === undefined) sourceValues.paragraphGap = DEFAULT_STYLE.paragraphGap;
  if(sourceValues.narrDialogueGap === undefined) sourceValues.narrDialogueGap = sourceValues.paragraphGap;
  if(sourceValues.softBreakSpacing === undefined) sourceValues.softBreakSpacing = DEFAULT_STYLE.softBreakSpacing;
  if(sourceValues.cardLayout === undefined) sourceValues.cardLayout = DEFAULT_STYLE.cardLayout;
  if(!['0','1','2','normal','relaxed','wide'].includes(String(sourceValues.softBreakSpacing))) return null;
  sourceValues.softBreakSpacing = softBreakSpacingControlValue(sourceValues.softBreakSpacing);
  let found = 0;
  for(const id of STYLE_FIELDS){
    if(sourceValues[id] === undefined) continue;
    const el = STYLE_SCHEMA[id];
    const raw = sourceValues[id];
    if(el.type === 'checkbox'){
      if(typeof raw !== 'boolean') return null;
      clean[id] = raw;
    } else if(el.type === 'color'){
      const color = typeof raw === 'string' ? normalizeHex(raw) : null;
      if(!color) return null;
      clean[id] = color;
    } else if(el.type === 'range' || id === 'unifiedBottomSpace'){
      // 화면의 동적 최솟값은 현재 작업의 사진 상태에 따라 달라진다. 저장값의 유효 범위는 고정이다.
      const n = Number(raw), min = id === 'profileItemGap' ? -10 : Number(el.min), max = Number(el.max);
      const raisedMinimum = id === 'creditCardGap'
        || (id === 'coverCardGap' && n >= -20);
      const previousTitleHeight = id === 'cardTitlePadding' && n <= 60;
      const previousCardGap = id === 'cardGap' && n <= 80;
      const previousUnifiedBottomSpace = id === 'unifiedBottomSpace' && n >= 0 && n <= 80;
      const previousCornerRadius = id === 'cardCornerRadius' && n <= 32;
      const previousGapHeight = id === 'gapHeight' && n >= 16 && n <= 144;
      const previousNarrDialogueGap = id === 'narrDialogueGap' && n >= 0 && n < min;
      if(!Number.isFinite(n) || (n < min && !raisedMinimum && !previousGapHeight && !previousNarrDialogueGap) || (n > max && !previousTitleHeight && !previousCardGap && !previousUnifiedBottomSpace && !previousCornerRadius && !previousGapHeight)) return null;
      clean[id] = (id === 'titleSize' || id === 'foldTitleSize')
        ? String(Math.round(n))
        : String(Math.max(min, Math.min(max, n)));
    } else if(el.tagName === 'SELECT'){
      const value = String(raw);
      if(el.options.includes(value)){
        clean[id] = value;
      } else if(id === 'parallelTranslationLayout' && value === 'off'){
        clean[id] = 'auto';
      } else if(id === 'dlgStyle' && value === 'split'){
        // 저장된 split 표현은 이름 배지 방식으로 읽는다.
        clean[id] = 'badge';
      } else if(id === 'dlgStyle' && value === 'quote'){
        // 저장된 quote 표현은 기존 인용선(box) 방식으로 읽는다.
        clean[id] = 'box';
      } else if(id === 'textFont'){
        // 더 이상 제공하지 않는 서체만 안전한 기본값으로 교체한다.
        clean[id] = DEFAULT_STYLE[id];
      } else {
        return null;
      }
    } else {
      if(typeof raw !== 'string') return null;
      if(id === 'commentWidth' && !['default','card'].includes(raw)) return null;
      if(id === 'commentAlign' && !['left','center'].includes(raw)) return null;
      clean[id] = raw;
    }
    found++;
  }
  // 알려진 필드의 타입 검증을 마친 뒤 옛 전역 OFF를 새 범위 설정에 옮긴다.
  if(sourceValues.parallelTranslationLayout === 'off'){
    clean.parallelDialogueOn = false;
    clean.parallelNarrationOn = false;
  }
  return found ? { name: preset.name.trim(), values: clean } : null;
}
// A shared migration runs before either draft hydration or imported-data validation.
function migrateStyleValues(input, strict = false){
  const values = {...input};
  const dialogueStyles = {messenger:'messenger2', split:'badge', quote:'box'};
  if(Object.hasOwn(dialogueStyles, values.dlgStyle)) values.dlgStyle = dialogueStyles[values.dlgStyle];
  for(const [current, legacy] of [['foldTitleDecorationOn','foldTitleMinimal'],['foldDividerOn','foldDividerMinimal']]){
    if(values[current] === undefined && values[legacy] !== undefined){
      if(strict && typeof values[legacy] !== 'boolean') return null;
      values[current] = !settingFlagOn(values[legacy]);
    }
  }
  if(values.textFont === undefined) values.textFont = values.narrFont !== undefined ? values.narrFont : values.dlgFont;
  if(values.parallelTranslationSoft !== undefined){
    if(strict && typeof values.parallelTranslationSoft !== 'boolean') return null;
    if(!settingFlagOn(values.parallelTranslationSoft)) values.parallelTranslationLayout = 'off';
    else if(values.parallelTranslationLayout === undefined) values.parallelTranslationLayout = 'auto';
  }
  if(values.commentWidth === undefined) values.commentWidth = values.commentLayout === 'card' ? 'card' : DEFAULT_STYLE.commentWidth;
  if(values.commentAlign === undefined) values.commentAlign = values.commentLayout === 'center' ? 'center' : DEFAULT_STYLE.commentAlign;
  if(values.creditTransparentOn === undefined && values.creditOpacity !== undefined) values.creditTransparentOn = Number(values.creditOpacity) === 0;
  return values;
}

return Object.freeze({
APP_VERSION,
EXTRA_PROFILE_SLOTS,
emphasisMatches,
STYLE_FIELDS,
WORK_BOOLEAN_DEFAULTS,
WORK_BOOLEAN_FIELDS,
WORK_FIELDS,
WORK_FIELD_DEFAULTS,
collectWorkState,
extraProfileFields,
extraProfilePrefix,
isMessengerDialogueStyle,
moveProfileEntityOrder,
normalizeCommentAlign,
normalizeCommentWidth,
normalizeHex,
normalizeOutputRules,
normalizeOutputRuleExclusions,
rebaseOutputRuleExclusions,
normalizeParallelExclusions,
rebaseParallelExclusions,
normalizeProfileEntityOrder,
normalizeProtocolRelativeUrl,
normalizeRetiredCoverImageFields,
savedProfileImageBackgroundOn,
savedProfileDividerMinimal,
savedProfileCommonVisibility,
settingFlagOn,
DEFAULT_STYLE,
DETAIL_PRESET_FIELDS,
DRAFT_FIELDS,
DRAFT_KEY,
KEYWORD_RULE_LIMIT,
MAX_CREDIT_ITEMS,
MAX_CREDIT_PRESETS,
MAX_DETAIL_PRESETS,
MAX_WORK_BLOCKS,
NAME_RULE_LIMIT,
SAVED_PRESET_FIELDS,
STYLE_SCHEMA,
THEME_COLOR_FIELDS,
advancedPercent,
composeOutputTheme,
migrateStyleValues,
normalizeCardLayout,
normalizeCreditItems,
normalizeCreditPlacement,
normalizeHr2Shape,
normalizeHr3Shape,
normalizeHrShape,
normalizeOutputTheme,
normalizeSoftBreakSpacing,
normalizeSubtitleCoupleSeparator,
outputThemeShape,
outputThemeTransparent,
sanitizeCreditPresetList,
sanitizeExtraCharList,
sanitizeImportedPreset,
sanitizeImportedWork,
softBreakSpacingControlValue
});
})();
