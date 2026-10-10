// 조각로그 v1.8.5 렌더링·HTML 출력 모듈.

// 조각로그 v1.8.5 HTML 출력과 복원 메타데이터 코덱.
const RESTORE_META_PREFIX = '<!--MOSAIC_LOG_STATE_V1:';
const RESTORE_META_SUFFIX = '-->';

// 아카라이브가 게시글 안쪽 요소에 직접 지정하는 타이포그래피보다 출력 설정이
// 우선하도록, 렌더러가 만든 일반 인라인 선언을 직렬화 직전에 한 번만 잠근다.
// 렌더러는 값만 책임지고 우선순위 정책은 이 모듈이 전담한다.
const ARCA_DECLARED_TYPOGRAPHY_LOCKS = Object.freeze([
  'color',
  '-webkit-text-fill-color',
  'font-size',
  '-webkit-text-size-adjust',
  'text-size-adjust'
]);

const ARCA_SELECTOR_TYPOGRAPHY_LOCKS = Object.freeze([
  Object.freeze({
    selector:'[data-mosaic-quote-heading]',
    properties:Object.freeze(['font-weight', 'line-height', 'color', '-webkit-text-fill-color'])
  }),
  Object.freeze({
    selector:'[data-mosaic-footer="true"], [data-mosaic-footer="true"] [style]',
    properties:Object.freeze(['line-height', 'text-decoration'])
  }),
  Object.freeze({
    selector:'[data-mosaic-credit="true"], [data-mosaic-credit="true"] [style]',
    properties:Object.freeze([
      'color', '-webkit-text-fill-color', 'font-size', 'font-family', 'font-weight',
      'line-height', 'letter-spacing', 'text-decoration', 'border-bottom'
    ])
  })
]);

function lockArcaStyleProperty(style, property, value){
  const normalized = String(value || '').trim();
  if(!normalized) return;
  style.setProperty(property, normalized, 'important');
}

function lockOutputTypographyForArca(html){
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const isConcreteColor = value => {
    const color = String(value || '').trim();
    return color && !/^(?:inherit|initial|unset|revert(?:-layer)?|currentcolor)$/i.test(color);
  };
  const isConcreteSize = value => {
    const size = String(value || '').trim();
    return size && !/^(?:inherit|initial|unset|revert(?:-layer)?|medium)$/i.test(size);
  };
  const lockDeclaredTypography = element => {
    if(!element.style) return;
    const declaredColor = element.style.getPropertyValue('color').trim();
    const declaredFill = element.style.getPropertyValue('-webkit-text-fill-color').trim();
    const declaredSize = element.style.getPropertyValue('font-size').trim();
    const effectiveColor = isConcreteColor(declaredColor)
      ? declaredColor
      : (isConcreteColor(declaredFill) ? declaredFill : '');
    if(effectiveColor){
      lockArcaStyleProperty(element.style, 'color', effectiveColor);
      lockArcaStyleProperty(element.style, '-webkit-text-fill-color', effectiveColor);
    }
    if(isConcreteSize(declaredSize)) lockArcaStyleProperty(element.style, 'font-size', declaredSize);
    ARCA_DECLARED_TYPOGRAPHY_LOCKS.slice(3).forEach(property => {
      lockArcaStyleProperty(element.style, property, element.style.getPropertyValue(property));
    });
  };
  const lockDeclaredProperties = (element, properties) => {
    if(!element || !element.style) return;
    properties.forEach(property => {
      lockArcaStyleProperty(element.style, property, element.style.getPropertyValue(property));
    });
  };
  const lockDialogueTree = (element, inheritedColor = '', inheritedSize = '') => {
    if(!element || !element.style) return;
    const declaredColor = element.style.getPropertyValue('color').trim();
    const declaredFill = element.style.getPropertyValue('-webkit-text-fill-color').trim();
    const declaredSize = element.style.getPropertyValue('font-size').trim();
    const effectiveColor = isConcreteColor(declaredColor)
      ? declaredColor
      : (isConcreteColor(declaredFill) ? declaredFill : inheritedColor);
    const effectiveSize = isConcreteSize(declaredSize) ? declaredSize : inheritedSize;
    if(effectiveColor){
      lockArcaStyleProperty(element.style, 'color', effectiveColor);
      lockArcaStyleProperty(element.style, '-webkit-text-fill-color', effectiveColor);
    }
    if(effectiveSize) lockArcaStyleProperty(element.style, 'font-size', effectiveSize);
    Array.from(element.children).forEach(child => {
      if(child.tagName !== 'BR') lockDialogueTree(child, effectiveColor, effectiveSize);
    });
  };
  const foldTitleProperties = ['color', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'font-family'];
  const foldTitleRootProperties = ['display', 'align-items', 'justify-content', 'column-gap', 'list-style', 'padding', 'text-align'];
  const isCssWideKeyword = value => !value || /^(?:inherit|initial|unset|revert(?:-layer)?)$/i.test(value);
  const lockFoldTitleTree = (element, inherited = {}) => {
    if(!element || !element.style) return;
    const effective = {};
    foldTitleProperties.forEach(property => {
      const declared = element.style.getPropertyValue(property).trim();
      const value = isCssWideKeyword(declared) ? (inherited[property] || '') : declared;
      if(value) lockArcaStyleProperty(element.style, property, value);
      effective[property] = value;
    });
    if(effective.color) lockArcaStyleProperty(element.style, '-webkit-text-fill-color', effective.color);
    lockArcaStyleProperty(element.style, '-webkit-text-size-adjust', '100%');
    lockArcaStyleProperty(element.style, 'text-size-adjust', '100%');
    Array.from(element.children).forEach(child => {
      if(child.tagName !== 'BR') lockFoldTitleTree(child, effective);
    });
  };
  const nearestConcreteSize = element => {
    let current = element;
    while(current && current !== template.content){
      if(current.style){
        const size = current.style.getPropertyValue('font-size').trim();
        if(isConcreteSize(size)) return size;
      }
      current = current.parentElement;
    }
    return '';
  };
  const lockInlineFormatTree = root => {
    const inheritedSize = nearestConcreteSize(root.parentElement);
    if(!inheritedSize) return;
    const visit = (element, parentSize) => {
      if(!element || !element.style) return;
      const declaredSize = element.style.getPropertyValue('font-size').trim();
      const effectiveSize = isConcreteSize(declaredSize) ? declaredSize : parentSize;
      if(effectiveSize) lockArcaStyleProperty(element.style, 'font-size', effectiveSize);
      lockDeclaredProperties(element, [
        'color', '-webkit-text-fill-color', 'font-style', 'font-weight', 'line-height',
        'font-family', 'letter-spacing', '-webkit-text-size-adjust', 'text-size-adjust'
      ]);
      Array.from(element.children).forEach(child => {
        if(child.tagName !== 'BR') visit(child, effectiveSize);
      });
    };
    visit(root, inheritedSize);
  };
  Array.from(template.content.children).forEach(element => {
    if(element.hasAttribute('data-mosaic-comment-index')) return;
    lockArcaStyleProperty(element.style, '-webkit-text-size-adjust', '100%');
    lockArcaStyleProperty(element.style, 'text-size-adjust', '100%');
    lockDeclaredTypography(element);
    element.querySelectorAll('[style]').forEach(lockDeclaredTypography);
    ARCA_SELECTOR_TYPOGRAPHY_LOCKS.forEach(rule => {
      const matches = [...element.querySelectorAll(rule.selector)];
      if(element.matches(rule.selector)) matches.unshift(element);
      matches.forEach(match => lockDeclaredProperties(match, rule.properties));
    });
    element.querySelectorAll('[data-mosaic-fold-title="true"], [data-mosaic-card-title="true"]').forEach(title => {
      lockFoldTitleTree(title);
      foldTitleRootProperties.forEach(property => {
        lockArcaStyleProperty(title.style, property, title.style.getPropertyValue(property));
      });
    });
    const profileSelector = '[data-mosaic-profile="true"], [data-mosaic-title="true"]';
    const profileRoots = [...element.querySelectorAll(profileSelector)];
    if(element.matches(profileSelector)) profileRoots.unshift(element);
    profileRoots.forEach(root => lockFoldTitleTree(root, { 'font-style':'normal', 'font-weight':'400' }));
    element.querySelectorAll('strong, em, [data-mosaic-thought="true"]').forEach(lockInlineFormatTree);
    element.querySelectorAll('[data-mosaic-dialogue="true"], [data-mosaic-speaker-label="true"]').forEach(dialogue => {
      lockArcaStyleProperty(dialogue.style, '-webkit-text-size-adjust', '100%');
      lockArcaStyleProperty(dialogue.style, 'text-size-adjust', '100%');
      lockDialogueTree(dialogue);
    });
  });
  return template.innerHTML;
}

function encodeRestoreState(data){
  const bytes = new TextEncoder().encode(JSON.stringify({ app:'mosaic-log', version:1, data }));
  let binary = '';
  const chunkSize = 0x8000;
  for(let i = 0; i < bytes.length; i += chunkSize){
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function decodeRestoreState(html){
  const start = html.indexOf(RESTORE_META_PREFIX);
  if(start < 0) return null;
  const payloadStart = start + RESTORE_META_PREFIX.length;
  const end = html.indexOf(RESTORE_META_SUFFIX, payloadStart);
  if(end < 0) throw new Error('복원 데이터가 끝까지 저장되지 않았습니다.');
  const encoded = html.slice(payloadStart, end).trim();
  if(!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('복원 데이터 형식이 올바르지 않습니다.');
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for(let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const envelope = JSON.parse(new TextDecoder().decode(bytes));
  if(!envelope || envelope.app !== 'mosaic-log' || envelope.version !== 1 || !envelope.data){
    throw new Error('지원하지 않는 조각로그 복원 데이터입니다.');
  }
  return envelope.data;
}

function generateHTML(includeRestoreState = false, prebuiltOutput){
  const rawOutput = prebuiltOutput === undefined
    ? buildCard(getSettings(), MosaicUI.cards.all())
    : prebuiltOutput;
  const output = stripEditorOutputMetadata(rawOutput);
  if(!includeRestoreState) return output;
  const restoreMeta = RESTORE_META_PREFIX + encodeRestoreState(MosaicUI.work.collectSlot()) + RESTORE_META_SUFFIX + '\n';
  return restoreMeta + output;
}

// 맥이면 ⌘, 그 외에는 Ctrl 로 표기 (동작은 둘 다 인식)
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl';


function fontStack(key){
  const stacks = {
    notoSerif: "'Noto Serif KR','Nanum Myeongjo',AppleMyungjo,Batang,serif",
    notoSans: "'Noto Sans KR','Nanum Gothic','Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif",
    pretendard: "'Pretendard Variable',Pretendard,'Noto Sans KR','Nanum Gothic','Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif"
  };
  return stacks[key] || stacks.pretendard;
}

// 웹폰트는 선택되는 순간 한글 글리프까지 명시적으로 불러온 뒤 미리보기를 다시 그린다.
// file://로 열었을 때 첫 렌더가 대체 글꼴로 굳어 보이는 현상을 방지한다.
async function loadSelectedWebFont(selectId){
  if(!document.fonts || !document.fonts.load) return;
  const key = document.getElementById(selectId).value;
  try {
    await document.fonts.load(`16px ${fontStack(key)}`, '가나다라마바사 대사와 나레이션');
    MosaicUI.preview.renderMarkup();
  } catch(e){ /* 로컬 글꼴이나 네트워크 미연결 시 기존 대체 글꼴 유지 */ }
}

function resolvedParallelTranslationMode(settings){
  if(!settings.parallelTranslationSoft) return 'plain';
  const selected = settings.parallelTranslationLayout || 'auto';
  // 불러온 이전 자료나 내부 호출에서 두 값이 어긋나도 `미적용`을 우선한다.
  if(selected === 'off') return 'plain';
  if(selected === 'inline' || selected === 'stack') return selected;
  return ['softlight', 'highlight'].includes(settings.dlgStyle) ? 'inline' : 'stack';
}

// 카드·대사 표현 방식·문단 종류와 무관하게 번역 크기를 같은 기준으로 계산한다.
// 큰따옴표 대사는 대사 크기, 작은따옴표 속마음은 본문 크기의 90%를 사용한다.
function parallelTranslationSize(settings, thoughtParallel){
  const fallback = thoughtParallel ? 13.5 : 14;
  const rawSize = thoughtParallel ? settings.narrSize : settings.dlgSize;
  return Math.max(9, Math.round((parseFloat(rawSize) || fallback) * 0.9 * 10) / 10);
}

// 병행 번역 HTML은 순수 대사와 서술 혼합 문단이 모두 이 함수만 사용한다.
// 작은따옴표 속마음은 사용자가 아래쓰기를 골라도 반드시 이어쓴다.
function parallelTranslationHTML(segment, settings, color, requestedMode){
  const thoughtParallel = segment.original.startsWith("'");
  const mode = thoughtParallel ? 'inline' : requestedMode;
  const size = parallelTranslationSize(settings, thoughtParallel);
  // 번역 괄호 안의 작은따옴표는 속마음 문법이 아니라 번역 표기의 일부다.
  // 글자로 보존해야 바깥 병행 번역의 보조색·축소 크기를 그대로 유지한다.
  const content = processInline(segment.translationGroup, settings.emphasisColor, { literalSingleQuotes:true });
  const thoughtColor = /^#[0-9A-Fa-f]{6}$/.test(settings.emphasisColor || '') ? settings.emphasisColor : '#747474';
  const textColor = parallelTranslationTextColor(settings, thoughtParallel ? thoughtColor : color);
  const thoughtAttribute = thoughtParallel ? ' data-mosaic-thought="true"' : '';
  if(mode === 'inline'){
    return `${segment.betweenOriginalAndGroup}<span data-mosaic-parallel-translation="true"${thoughtAttribute} data-mosaic-parallel-translation-mode="inline" style="color:${textColor}; -webkit-text-fill-color:${textColor}; font-size:${size}px; font-weight:400; line-height:inherit; letter-spacing:-0.1px;">${content}</span>`;
  }
  return `<span data-mosaic-parallel-translation="true"${thoughtAttribute} data-mosaic-parallel-translation-mode="stack" style="display:block; margin:4px 0 0 0; padding:0; color:${textColor}; -webkit-text-fill-color:${textColor}; font-size:${size}px; font-weight:400; line-height:${settings.dlgLine}; letter-spacing:-0.1px;">${content}</span>`;
}

// 서술 혼합 문단에서는 번역 부분을 임시 토큰으로 보호한 뒤 원문의 서식을 적용한다.
// 완성된 강조 HTML에 나중에 번역 span을 복원해 속성 따옴표가 대사로 오인되는 것을 방지한다.
function prepareMixedParallelTranslations(line, settings, color, thoughtsOnly = false){
  if(!settings.parallelTranslationSoft) return { line:String(line), tokens:[] };
  const mode = resolvedParallelTranslationMode(settings);
  const source = String(line);
  const segments = parallelDialogueSegments(source).filter(segment => !thoughtsOnly || segment.original.startsWith("'"));
  if(!segments.length) return { line:source, tokens:[] };
  const tokens = [];
  let prepared = '';
  let cursor = 0;
  segments.forEach(segment => {
    prepared += source.slice(cursor, segment.start) + segment.original;
    const token = `\uE100${tokens.length}\uE101`;
    tokens.push({ token, html:parallelTranslationHTML(segment, settings, color, mode) });
    prepared += token;
    cursor = segment.end;
  });
  prepared += source.slice(cursor);
  return { line:prepared, tokens };
}

function restoreMixedParallelTranslations(content, tokens){
  return tokens.reduce((html, item) => html.split(item.token).join(item.html), content);
}

function safeHexColor(value, fallback){
  const normalized = typeof value === 'string' ? normalizeHex(value) : null;
  return normalized || fallback || '#555555';
}

// 배경색 밝기에 따라 읽기 좋은 글자색(흰/검)을 자동 선택 (옵션2 배경 강조용)
function textColorFor(hex){
  const h = hex.replace('#','');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.slice(0,2),16), g = parseInt(full.slice(2,4),16), b = parseInt(full.slice(4,6),16);
  const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
  return luminance > 0.6 ? '#1c1b1a' : '#ffffff';
}

// 카드 톤별 구조색 팔레트 (글자색은 사용자가 직접 지정, 이건 배경/테두리/구분선/소제목용)
// 두 색을 t(0~1) 비율로 혼합 (구조색 자동 파생용)
function mixHex(a, b, t){
  const pa = a.replace('#',''), pb = b.replace('#','');
  const ea = pa.length === 3 ? pa.split('').map(c=>c+c).join('') : pa;
  const eb = pb.length === 3 ? pb.split('').map(c=>c+c).join('') : pb;
  const out = [0,2,4].map(i => {
    const v = Math.round(parseInt(ea.slice(i,i+2),16) * (1-t) + parseInt(eb.slice(i,i+2),16) * t);
    return v.toString(16).padStart(2,'0');
  });
  return '#' + out.join('');
}

// 색상의 밝기는 유지하고 색조·채도만 제거한 중성 회색을 만든다.
function neutralHex(hex){
  const raw = safeHexColor(hex, '#ffffff').slice(1);
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const value = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    .toString(16).padStart(2, '0');
  return `#${value}${value}${value}`;
}

// 카드 배경과 화자색을 섞어 밝은 카드에서는 은은하게, 어두운 카드에서는
// 충분히 구분되는 색면을 만든다. 옵션2와 이름 배지가 같은 규칙을 공유한다.
function accentTint(bg, accent){
  const darkBackground = textColorFor(bg) === '#ffffff';
  return mixHex(bg, accent, darkBackground ? 0.34 : 0.18);
}

// 인용과 상태창은 같은 연한 본문색을 고정으로 사용한다.
// 밝고 어두운 카드에서 기존 상태창과 비슷한 명도를 유지하도록 혼합량만 달리한다.
function softBodyTextColor(settings, sourceColor){
  const bg = safeHexColor(settings.bgColor, '#ffffff');
  const source = safeHexColor(sourceColor, settings.narrColor || '#555555');
  const darkBackground = textColorFor(bg) === '#ffffff';
  return mixHex(source, bg, darkBackground ? 0.32 : 0.42);
}

// 병행 번역·인용·상태창이 공유하는 보조색.
// 화자색을 그대로 쓰지 않고 카드 배경과 섞어 부드럽게 만든다.
function parallelTranslationTextColor(settings, sourceColor){
  return softBodyTextColor(settings, sourceColor || settings.charColor);
}

// 상태창은 사용자가 고른 강조(보조)색을 카드 배경에 아주 옅게 섞는다.
// 어두운 카드에서는 같은 비율이 거의 보이지 않으므로 조금만 더 섞어 형태를 유지한다.
function statusAccentBackground(settings){
  const bg = safeHexColor(settings.bgColor, '#ffffff');
  const accent = safeHexColor(settings.emphasisColor, '#747474');
  const darkBackground = textColorFor(bg) === '#ffffff';
  return mixHex(bg, accent, darkBackground ? 0.15 : 0.08);
}

// 카드 배경색에서 구조색(대사 박스 배경/구분선/테두리/소제목/캡션)을 자동 파생.
// 외곽선은 기존 중성 회색 구조색을 유지한다. 내부선만 강조(보조)색이 유효할 때
// 아주 옅게 섞어 카드의 경계보다 낮은 위계로 보이게 한다. 어두운 배경에서는
// 같은 농도가 덜 보이므로 혼합량을 2% 높이고, 보조색이 없으면 기존 회색으로 돌아간다.
function tonePalette(settings){
  const bg = safeHexColor(settings.bgColor, '#ffffff');
  const isLight = textColorFor(bg) !== '#ffffff'; // 밝은 배경이면 어두운 구조색
  const to = isLight ? '#000000' : '#ffffff';
  const structuralAccent = typeof settings.emphasisColor === 'string'
    ? normalizeHex(settings.emphasisColor)
    : null;
  // 흰 카드에서는 외곽선이 보이되 너무 도드라지지 않게 하고, 색이나 명도가 들어간
  // 카드에서는 검정이 과하게 섞여 탁해지지 않도록 배경 존재감에 따라 대비를 낮춘다.
  const raw = bg.slice(1);
  const channels = [0, 2, 4].map(i => parseInt(raw.slice(i, i + 2), 16) / 255);
  const chroma = Math.max(...channels) - Math.min(...channels);
  const distanceFromWhite = channels.reduce((sum, channel) => sum + (1 - channel), 0) / 3;
  const surfacePresence = Math.min(1, Math.max(
    chroma / 0.08,
    Math.max(0, distanceFromWhite - 0.02) / 0.10
  ));
  // 정확한 흰색은 9%, 색이 뚜렷한 밝은 배경은 최저 8%로 두어
  // 흰 카드의 외곽선만 한 단계 낮추면서 배경에 따른 자동 대비는 유지한다.
  const shellMix = isLight ? 0.09 - (0.01 * surfacePresence) : 0.10;
  const shellBorder = mixHex(bg, to, shellMix);
  const divider = structuralAccent
    ? mixHex(bg, structuralAccent, isLight ? 0.13 : 0.15)
    : mixHex(bg, to, isLight ? 0.15 : 0.17);
  // 내용 장식선과 꼬리말은 카드 연결선과 역할이 다르므로 별도 토큰으로 둔다.
  // divider를 직접 연하게 만들면 표지·프로필·연결 카드의 경계까지 흐려진다.
  // 본문 [HR]은 카드 내부의 문단 경계로 즉시 인식되도록 기존보다 한 단계 진하게 둔다.
  // 외곽·연결선에 쓰는 divider와 분리되어 있어 다른 구분선의 위계에는 영향을 주지 않는다.
  const contentDivider = structuralAccent
    ? mixHex(bg, structuralAccent, isLight ? 0.16 : 0.18)
    : mixHex(bg, to, isLight ? 0.17 : 0.19);
  const sceneOrnament = structuralAccent
    ? mixHex(bg, structuralAccent, isLight ? 0.32 : 0.34)
    : mixHex(bg, to, isLight ? 0.33 : 0.35);
  // 점은 면적이 작아 같은 색도 더 흐리게 보이므로 HR3 전용으로 대비를 조금 높인다.
  const breathOrnament = structuralAccent
    ? mixHex(bg, structuralAccent, isLight ? 0.25 : 0.27)
    : mixHex(bg, to, isLight ? 0.26 : 0.28);
  const caption = mixHex(bg, to, isLight ? 0.38 : 0.52);
  // 꼬리말은 항상 구분선 없는 미니멀 서명이므로 caption보다 한 단계 연하게 둔다.
  const footerText = mixHex(bg, caption, 0.65);
  return {
    cardBg: bg,
    boxBg: mixHex(bg, to, isLight ? 0.045 : 0.07),
    divider,
    contentDivider,
    sceneOrnament,
    breathOrnament,
    footerText,
    shellBorder,
    ornament: mixHex(bg, to, advancedTransparentOpacity(settings.cardTitleOrnamentOpacity, isLight ? 0.28 : 0.42)),
    caption,
    heading: {
      1: mixHex(bg, to, 0.93),
      2: mixHex(bg, to, 0.87),
      3: mixHex(bg, to, 0.76),
      4: mixHex(bg, to, 0.60),
    }
  };
}


// 내용 간격 배율 (문단 간격/대사 여백/구분선 여백을 세트로 조절)
function spacingMult(settings){
  if(settings.spacingMode === 'compact') return 0.7;
  if(settings.spacingMode === 'relaxed') return 1.35;
  return 1;
}

// 일반 나레이션과 대사가 공유하는 단락 사이 기본 여백.
function paragraphGapPx(settings){
  const gap = Number(settings.paragraphGap);
  return Number.isFinite(gap) ? Math.min(40, Math.max(8, gap)) : 20;
}
function narrDialogueGapPx(settings){
  const gap = Number(settings.narrDialogueGap);
  return Number.isFinite(gap) ? Math.min(40, Math.max(10, gap)) : Math.max(10, paragraphGapPx(settings));
}

function normalizeCardLayout(value){
  return value === 'unified' ? 'unified' : 'separate';
}

// 저장·프리셋 호환성을 위해 기존 cardLayout 문자열 값은 유지하고,
// 화면에서는 켜고 끄는 의미가 더 분명한 단일 체크박스로 보여준다.
function syncCardLayoutCheckbox(){
  const select = document.getElementById('cardLayout');
  const checkbox = document.getElementById('cardLayoutUnifiedOn');
  if(!select || !checkbox) return;
  checkbox.checked = normalizeCardLayout(select.value) === 'unified';
}

// 카드 좌우 여백은 선택 항목을 늘리지 않고 모바일부터 데스크톱까지 한 기본값으로 쓴다.
const CARD_INLINE_PADDING = 'clamp(16px,4vw,22px)';
function advancedPercent(value, fallback = 50){
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
}
function advancedOpaqueOpacity(value){
  return Math.min(1, advancedPercent(value) / 50);
}
function advancedDecorationColor(baseColor, palette, value){
  return mixHex(baseColor, palette.heading[3], Math.max(0, (advancedPercent(value) - 50) / 50));
}
function hrLengthPercent(settings){
  const number = Number(settings.hrLength);
  return Number.isFinite(number) ? Math.max(20, Math.min(100, number)) : 100;
}
function hrVerticalSpacePx(value, fallback){
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(80, number)) : fallback;
}
function gapHeightPx(settings){
  const number = Number(settings.gapHeight);
  return Number.isFinite(number) ? Math.max(20, Math.min(100, number)) : 48;
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
function advancedTransparentOpacity(value, baseline){
  const percent = advancedPercent(value);
  return percent <= 50 ? baseline * percent / 50 : baseline + (1 - baseline) * (percent - 50) / 50;
}
function cardInlinePaddingCss(settings){
  const number = Number(settings.cardInlinePadding);
  const padding = Number.isFinite(number) ? Math.max(0, Math.min(66, number)) : 22;
  return padding === 22 ? CARD_INLINE_PADDING : `${padding}px`;
}
function cardBodyTopSpacePx(settings){
  const number = Number(settings.cardBodyTopSpace);
  return Number.isFinite(number) ? Math.max(0, Math.min(40, number)) : 0;
}
function cardBodyTopPaddingCss(minPx, fluidVw, maxPx, settings){
  const extra = cardBodyTopSpacePx(settings);
  return extra
    ? `clamp(${minPx + extra}px,calc(${fluidVw}vw + ${extra}px),${maxPx + extra}px)`
    : `clamp(${minPx}px,${fluidVw}vw,${maxPx}px)`;
}
function cardBodyBottomSpacePx(settings){
  const number = Number(settings.cardBodyBottomSpace);
  return Number.isFinite(number) ? Math.max(-28, Math.min(40, number)) : 0;
}
function headingSpacePx(value){
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(-20, Math.min(40, number)) : 0;
}
function profileItemGapDeltaPx(settings){
  const number = Number(settings.profileItemGap);
  return Number.isFinite(number) ? Math.max(-10, Math.min(40, number)) : 0;
}
function profileItemGapBasePx(){
  if(document.getElementById('profileStyle').value !== 'showcase') return 10;
  const photoBackgroundOn = document.getElementById('profileImageBackgroundOn').checked;
  const prefixes = ['profileChar','profileUser',
    ...EXTRA_PROFILE_SLOTS.filter(slot => slot <= extraProfileCount() + 2).map(extraProfilePrefix)];
  const visible = prefixes.filter(prefix => document.getElementById(`${prefix}On`).checked
    && (document.getElementById(`${prefix}Image`).value.trim()
      || ['Name','Desc','Tags'].some(field => document.getElementById(`${prefix}${field}`).value.trim())));
  const everyPhoto = visible.length > 0 && photoBackgroundOn && visible.every(prefix =>
    document.getElementById(`${prefix}Image`).value.trim());
  return everyPhoto ? 0 : 2;
}
function cardBodyBottomPaddingCss(settings, hasFooter){
  const extra = hasFooter ? 0 : cardBodyBottomSpacePx(settings);
  const minPadding = Math.max(0, 24 + extra);
  const maxPadding = Math.max(0, 30 + extra);
  return extra
    ? `clamp(${minPadding}px,calc(5vw ${extra < 0 ? '-' : '+'} ${Math.abs(extra)}px),${maxPadding}px)`
    : 'clamp(24px,5vw,30px)';
}
function cardGapPx(settings){
  const number = Number(settings.cardGap);
  return Number.isFinite(number) ? Math.max(0, Math.min(40, number)) : 20;
}
function coverCardGapPx(settings){
  const number = Number(settings.coverCardGap);
  return Number.isFinite(number) ? Math.max(0, Math.min(80, number)) : 0;
}
function profileTitleGapPx(settings){
  const number = Number(settings.profileTitleGap);
  return Number.isFinite(number) ? Math.max(-20, Math.min(80, number)) : 0;
}
function unifiedBottomSpacePx(settings){
  const number = Number(settings.unifiedBottomSpace);
  return Number.isFinite(number) ? Math.max(0, Math.min(60, number)) : 0;
}
function coverVerticalSpacePx(settings){
  const number = Number(settings.coverVerticalSpace);
  return Number.isFinite(number) ? Math.max(0, Math.min(60, number)) : 0;
}
function titleBottomPaddingPx(titleMinimal, imageBackground, spacingMultiplier, extraVerticalSpace){
  const base = titleMinimal && !imageBackground ? 12 : 20;
  return Math.round(base * spacingMultiplier) + extraVerticalSpace;
}
function cardTitlePaddingPx(settings){
  const number = Number(settings.cardTitlePadding);
  return Number.isFinite(number) ? Math.max(12, Math.min(40, number)) : 26;
}
function cardDividerLengthPercent(settings){
  const number = Number(settings.cardDividerLength);
  return Number.isFinite(number) ? Math.max(20, Math.min(100, number)) : 100;
}
function coverDividerLengthPercent(settings){
  const number = Number(settings.coverDividerLength);
  return Number.isFinite(number) ? Math.max(20, Math.min(100, number)) : 100;
}
function coverDividerTopCss(settings, color){
  const length = coverDividerLengthPercent(settings);
  return length === 100
    ? `border-top:1px solid ${color};`
    : `background-image:linear-gradient(to right, ${color}, ${color}); background-repeat:no-repeat; background-position:center top; background-size:${length}% 1px;`;
}
function appendCoverDividerLine(boundary, edge, settings, color){
  const length = coverDividerLengthPercent(settings);
  const start = (100 - length) / 2;
  const end = start + length;
  const lineImage = `linear-gradient(to right, transparent ${start}%, ${color} ${start}%, ${color} ${end}%, transparent ${end}%)`;
  // 게시판이 사진 주소를 독립적으로 처리할 수 있도록 단일 url()로 유지한다.
  // 길이 조절용 선은 사진이 아닌 기존 덮개 면에 그린다.
  const overlay = boundary.hasAttribute('data-mosaic-image-background')
    ? boundary.querySelector(':scope > [data-mosaic-photo-overlay="true"]') : null;
  const style = (overlay || boundary).style;
  const existingImage = style.backgroundImage && style.backgroundImage !== 'none'
    ? style.backgroundImage : '';
  const existingRepeat = style.backgroundRepeat || 'repeat';
  const existingPosition = style.backgroundPosition || '0% 0%';
  const existingSize = style.backgroundSize || 'auto';
  style.setProperty('background-image', existingImage ? `${lineImage}, ${existingImage}` : lineImage);
  style.setProperty('background-repeat', existingImage ? `no-repeat, ${existingRepeat}` : 'no-repeat');
  style.setProperty('background-position', existingImage ? `center ${edge}, ${existingPosition}` : `center ${edge}`);
  style.setProperty('background-size', existingImage ? `100% 1px, ${existingSize}` : '100% 1px');
}
function cardCornerRadiusPx(settings){
  const number = Number(settings.cardCornerRadius);
  return Number.isFinite(number) ? Math.max(0, Math.min(16, number)) : 16;
}

function normalizeSoftBreakSpacing(value){
  const raw = String(value === undefined || value === null ? '' : value);
  if(['normal','relaxed','wide'].includes(raw)) return raw;
  return ['normal','relaxed','wide'][Math.min(2, Math.max(0, Number.parseInt(raw, 10) || 0))];
}

function softBreakSpacingControlValue(value){
  return String(['normal','relaxed','wide'].indexOf(normalizeSoftBreakSpacing(value)));
}

function syncSoftBreakSpacingControl(){
  const range = document.getElementById('softBreakSpacing');
  const output = document.getElementById('softBreakSpacingVal');
  if(!range || !output) return;
  const mode = normalizeSoftBreakSpacing(range.value);
  const labels = { normal:'기본', relaxed:'여유', wide:'넓게' };
  output.textContent = labels[mode];
  range.setAttribute('aria-valuetext', labels[mode]);
}

// 한 줄 전체가 대괄호로 감싸지고 내부에 |가 있으면 상태창으로 인식한다.
// [인물이름] 등 기존 대괄호 문법은 |가 없으므로 영향을 받지 않는다.
function statusLineContent(line){
  const match = String(line).trim().match(/^\[\s*(.+\|.+)\s*\]$/);
  if(!match) return null;
  const content = match[1].trim();
  // 캡션에 |를 쓰는 본문 이미지 등 기존 구조 문법이 상태창으로 오인되지 않게 한다.
  if(/^(?:IMG\b|접기\b|\/접기\b|HR(?:[2-4])?\b|GAP\b)/i.test(content)) return null;
  return content;
}

// 상태창 원문은 건드리지 않고 출력할 때만 | 양옆 여백을 통일한다.
function formatStatusContent(content){
  return String(content).replace(/\s*\|\s*/g, ' | ');
}

function isStatusBodyLine(line){
  const withoutCenter = String(line).trim().replace(/^\[C\]\s*/i, '');
  return statusLineContent(withoutCenter) !== null;
}

// 소제목 레벨별 크기/굵기 (일반 소제목과 소제목 접기 헤더가 공유)
// 등록된 추가 인물 찾기 (이름은 대소문자·공백 무시하고 비교)
function findChar(settings, name){
  const list = settings.extraChars || [];
  const key = String(name).trim().toLowerCase();
  return list.find(c => c.sourceName && c.sourceName.trim().toLowerCase() === key)
    || list.find(c => (c.name || '').trim().toLowerCase() === key) || null;
}

// 대사 줄 맨 앞의 화자 마커를 떼어냄: >> / << / [인물이름]
// 반환 {speaker, line} — speaker는 'char' | 'user' | {name,color} | null
function stripSpeaker(line, settings){
  if(line.startsWith('>>')) return { speaker: 'char', line: line.slice(2).trim() };
  if(line.startsWith('<<')) return { speaker: 'user', line: line.slice(2).trim() };
  const m = line.match(/^\[([^\[\]\n]{1,24})\]\s*/);
  if(m){
    const person = findChar(settings, m[1]);
    if(person) return { speaker: person, line: line.slice(m[0].length).trim() };
  }
  return { speaker: null, line };
}

// 호출부에서 공백·정렬 접두어를 처리한 소제목의 단계와 제목을 읽는다.
// 출력과 탐색기가 동일한 1~4단계 문법을 사용하되 제목 원문은 그대로 둔다.
function parseBodyHeading(line){
  const match = String(line).match(/^(#{1,4})\s+(.+)$/);
  if(!match) return null;
  return { level:match[1].length, title:match[2] };
}

// 인용 내부의 줄에도 본문과 동일한 #~#### 소제목 문법을 적용한다.
function renderQuoteContent(text, settings){
  const renderInline = value => {
    const prepared = prepareMixedParallelTranslations(value, settings, settings.emphasisColor, true);
    return restoreMixedParallelTranslations(
      processBodyInline(prepared.line, settings.emphasisColor, { softBreakSpacing:settings.softBreakSpacing }),
      prepared.tokens
    );
  };
  const lines = String(text).split(SOFT_BREAK_TOKEN);
  if(!lines.some(line => parseBodyHeading(line.trim()))){
    return renderInline(text);
  }
  const parts = [];
  let plain = [];
  const flush = () => {
    if(plain.length){
      parts.push(renderInline(plain.join(SOFT_BREAK_TOKEN)));
      plain = [];
    }
  };
  lines.forEach((line, index) => {
    const heading = parseBodyHeading(line.trim());
    if(!heading){ plain.push(line); return; }
    flush();
    const spec = headingSpec(heading.level);
    const gap = paragraphGapPx(settings);
    const prevIsHeading = index > 0 && !!parseBodyHeading(lines[index - 1].trim());
    const nextIsHeading = index < lines.length - 1 && !!parseBodyHeading(lines[index + 1].trim());
    const top = prevIsHeading ? 0 : Math.max(0, (index ? gap : 0) + headingSpacePx(settings.headingTopSpace));
    const bottom = Math.max(0, (index < lines.length - 1 ? gap : 0)
      + headingSpacePx(nextIsHeading ? settings.headingBetweenSpace : settings.headingBottomSpace));
    parts.push(`<div data-mosaic-quote-heading="${heading.level}" data-mosaic-quote-line="${index}" style="margin:${top}px 0 ${bottom}px; font-size:${spec.size}px; font-weight:${spec.weight}; line-height:1.4; color:inherit; -webkit-text-fill-color:inherit;">${renderInline(heading.title)}</div>`);
  });
  flush();
  return parts.join('');
}

function headingSpec(level){
  return {
    1: { size: 22,   weight: 800 },
    2: { size: 19,   weight: 700 },
    3: { size: 16.5, weight: 700 },
    4: { size: 14.5, weight: 700 },
  }[level];
}

// 이미지 출력·점검·편집이 같은 문법을 사용한다.
// 편집 시 원문의 들여쓰기, [C] 접두어, 뒤쪽 공백과 따옴표를 보존한다.
function parseBodyImageLine(line){
  const source = String(line);
  const leading = source.match(/^\s*(?:\[C\]\s*)?/i)[0];
  const trailing = source.match(/\s*$/)[0];
  const body = source.slice(leading.length, source.length - trailing.length);
  const match = body.match(/^\[IMG\s+(\S+?)(?:\s+@(\d{1,3}))?(?:\s*\|\s*(.+?))?(\s*\])$/i);
  if(!match) return null;
  const rawCaption = match[3] || '';
  const caption = rawCaption.trim();
  // 문자열 검색 대신 문법이 소비한 길이로 위치를 구한다.
  // 주소에도 캡션과 같은 글자가 있어도 실제 캡션 위치를 가리킨다.
  const captionStart = caption
    ? leading.length + body.length - match[4].length - rawCaption.trimStart().length
    : null;
  return {
    leading,
    src: match[1],
    width: Math.max(10, Math.min(100, parseInt(match[2] || '100', 10))),
    caption,
    captionStart,
    captionEnd: captionStart === null ? null : captionStart + caption.length,
    trailing
  };
}

// 출력은 기존과 같이 스마트 따옴표를 정규화하되 편집 원문은 변경하지 않는다.
function parseOutputBodyImage(line){
  return parseBodyImageLine(normalizeQuotes(String(line)));
}

function buildParagraph(rawLine, settings, opts){
  opts = opts || {};
  let line = normalizeStandaloneHr(normalizeQuotes(rawLine.trim()));
  if(!line) return '';

  const pal = tonePalette(settings);
  const sm = spacingMult(settings);
  const baseParagraphGap = Math.round(paragraphGapPx(settings) * sm);
  const narrationDialogueGap = Math.round(narrDialogueGapPx(settings) * sm);
  const upper = line.toUpperCase();

  if(upper === '[HR]'){
    // 아카라이브가 <hr>의 인라인 스타일은 지워버리지만 div 스타일은 유지하는 게 확인됐으므로
    // 구분선을 div로 생성하고 모양별 장식도 인라인 스타일로 출력한다.
    const shape = normalizeHrShape(settings.hrShape);
    const color = advancedDecorationColor(pal.contentDivider, pal, settings.hrOpacity);
    const lineStyle = {
      solid: `height:1px; background-color:${color};`,
      dashed: `height:0; border-top:1px dashed ${color};`,
      star: 'display:flex; align-items:center; gap:10px;'
    }[shape];
    const star = shape === 'star'
      ? `<span aria-hidden="true" style="display:block; flex:1 1 auto; height:0; border-top:1px solid ${color};"></span><span aria-hidden="true" style="display:block; flex:0 0 auto; color:${color}; font-size:12px; line-height:1; -webkit-text-size-adjust:100%; text-size-adjust:100%;">✦</span><span aria-hidden="true" style="display:block; flex:1 1 auto; height:0; border-top:1px solid ${color};"></span>`
      : '';
    return `    <div data-mosaic-generated="true" data-mosaic-separator="hr" data-mosaic-hr-shape="${shape}" style="box-sizing:border-box; width:${hrLengthPercent(settings)}%; ${lineStyle} opacity:${advancedOpaqueOpacity(settings.hrOpacity)}; margin:${Math.round(hrVerticalSpacePx(settings.hrVerticalSpace, 26)*sm)}px auto;">${star}</div>\n`;
  }

  if(upper === '[HR2]'){
    // 장면 전환 장식은 선택한 기호를 중앙에 놓고, 테마·보조색에 맞춘 전용 색상을 쓴다.
    // 아카라이브 모바일 앱에서 장식만 자동 축소되지 않도록 크기를 요소에 직접 고정한다.
    const shape = normalizeHr2Shape(settings.hr2Shape);
    const ornament = { star:'✦', diamond:'◆', 'triple-star':'✦ ✦ ✦' }[shape];
    const ornamentSize = shape === 'triple-star' ? 10 : 12;
    const ornamentSpacing = shape === 'triple-star' ? 'padding-left:1px; letter-spacing:1px;' : '';
    const color = advancedDecorationColor(pal.sceneOrnament, pal, settings.hr2Opacity);
    return `    <div data-mosaic-generated="true" data-mosaic-separator="hr2" style="box-sizing:border-box; text-align:center; color:${color}; opacity:${advancedOpaqueOpacity(settings.hr2Opacity)}; font-size:${ornamentSize}px; ${ornamentSpacing} line-height:1; -webkit-text-size-adjust:100%; text-size-adjust:100%; margin:${Math.round(hrVerticalSpacePx(settings.hr2VerticalSpace, 48)*sm)}px 0;">${ornament}</div>\n`;
  }

  if(upper === '[HR3]'){
    // 별 장식보다 조용한 호흡 구분. 모바일 게시판의 텍스트 색상·자동 확대가
    // 점 장식을 덮지 못하도록 실제 색과 채움색, 크기를 요소 자체에 고정한다.
    const shape = normalizeHr3Shape(settings.hr3Shape);
    const ornament = { dots:'· · ·', one:'·', line:'━' }[shape];
    const spacing = shape === 'dots' ? 'padding-left:8px; letter-spacing:8px;' : 'padding-left:0; letter-spacing:0;';
    const color = advancedDecorationColor(pal.breathOrnament, pal, settings.hr3Opacity);
    return `    <div data-mosaic-generated="true" data-mosaic-separator="hr3" style="box-sizing:border-box; ${spacing} text-align:center; color:${color}; -webkit-text-fill-color:${color}; opacity:${advancedOpaqueOpacity(settings.hr3Opacity)}; font-size:17px; font-weight:600; line-height:1; margin:${Math.round(hrVerticalSpacePx(settings.hr3VerticalSpace, 36)*sm)}px 0; -webkit-text-size-adjust:100%; text-size-adjust:100%;">${ornament}</div>\n`;
  }

  if(upper === '[HR4]' || upper === '[GAP]'){
    // 기호 없는 쉼의 높이는 고급 설정의 px 값을 그대로 사용한다.
    return `    <div data-mosaic-generated="true" data-mosaic-separator="hr4" aria-hidden="true" style="height:${gapHeightPx(settings)}px;"></div>\n`;
  }

  // 가운데 정렬 접두어를 다른 본문 문법보다 먼저 해석해 [C] # 제목처럼 함께 쓸 수 있게 함.
  let forceCenter = false;
  if(/^\[C\]\s*/i.test(line)){
    forceCenter = true;
    line = line.replace(/^\[C\]\s*/i, '');
  }

  // 상태창: [ Date | Time | Location ] → 바깥 대괄호 없이 연한 보조 정보로 출력.
  const statusContent = statusLineContent(line);
  if(statusContent !== null){
    const statusDisplayContent = formatStatusContent(statusContent);
    const statusSize = Math.max(10, (parseFloat(settings.narrSize) || 14) - 1.5);
    // 본문과는 넉넉히 분리하고, 상태창이 연속될 때는 하나의 정보 묶음처럼 촘촘히 둔다.
    // 두 값 모두 사용자가 고른 단락 간격에 비례해 함께 조절된다.
    const statusOuterGap = Math.max(baseParagraphGap, Math.round(baseParagraphGap * 1.6));
    const statusStackGap = Math.max(4, Math.round(baseParagraphGap * 0.45));
    const statusMt = opts.extraTop
      ? Math.round(36 * sm)
      : (opts.isFirst ? 0 : (opts.prevIsStatus ? statusStackGap : statusOuterGap));
    const statusMb = opts.extraBottom
      ? Math.round(36 * sm)
      : (opts.isLast ? 0 : (opts.nextIsStatus ? statusStackGap : statusOuterGap));
    const statusText = softBodyTextColor(settings, safeHexColor(settings.narrColor, pal.caption));
    const statusBg = statusAccentBackground(settings);
    const statusAlign = 'center';
    return `    <div data-mosaic-status="true" style="box-sizing:border-box; margin:${statusMt}px 0 ${statusMb}px 0; padding:11px 16px; background-color:${statusBg}; border-radius:8px; text-align:${statusAlign}; color:${statusText}; font-size:${statusSize}px; font-weight:400; line-height:${settings.narrLine}; letter-spacing:0; overflow-wrap:anywhere; word-break:break-word; font-family:${fontStack(settings.narrFont)};">${processInline(statusDisplayContent, settings.emphasisColor)}</div>\n`;
  }

  // 본문 중간 이미지: [IMG 주소], [IMG 주소 @60], [IMG 주소 @60 | 캡션]
  // @뒤 숫자는 카드 폭 대비 가로 비율이며, height:auto로 원본 종횡비를 유지한다.
  const imgMatch = parseOutputBodyImage(rawLine);
  if(imgMatch){
    let src = imgMatch.src;
    if(src.startsWith('//')) src = 'https:' + src;
    const imageWidth = imgMatch.width;
    const captionText = imgMatch.caption;
    const caption = captionText ? `<p style="margin:7px 0 0 0; text-align:center; font-size:11.5px; line-height:1.5; color:${pal.caption}; letter-spacing:-0.1px; font-family:${fontStack(settings.narrFont)};">${processInline(captionText, settings.emphasisColor)}</p>` : '';
    const alt = captionText ? stripMarkers(captionText) : '';
    // 카드의 첫 요소면 위 마진을 없애되, 구분선과 맞닿은 쪽은 일반 문단과 같은
    // HR_GAP을 적용한다. 이미지의 고정 22px과 구분선 마진이 서로 축약되면서
    // 이미지 옆 간격만 좁아지던 회귀를 막는다.
    // 아카라이브가 <img>를 <p>로 감싸며 붙이는 기본 여백도 line-height/font-size 0으로 눌러줌.
    const imageGap = Math.round(22 * sm);
    const separatorGap = Math.round(36 * sm);
    const imgMt = opts.extraTop ? separatorGap : (opts.isFirst ? 0 : imageGap);
    const imgMb = opts.extraBottom ? separatorGap : imageGap;
    return `    <div style="margin:${imgMt}px 0 ${imgMb}px 0; line-height:0; font-size:0; text-align:center;"><img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" class="fr-fic fr-dib" style="width:${imageWidth}%; max-width:100%; height:auto; display:block; border-radius:10px; margin:0 auto;">${caption}</div>\n`;
  }

  // 마크다운 소제목: #, ##, ###, #### (그 이상은 인식 안 함)
  const headingMatch = parseBodyHeading(line);
  if(headingMatch){
    const level = headingMatch.level;
    const text = processInline(headingMatch.title.trim(), settings.emphasisColor);
    const spec = headingSpec(level);
    const HEADING = { size: spec.size, weight: spec.weight };
    const headingSpacing = paragraphGapPx(settings) / 20;
    // 연속 소제목 사이는 앞 소제목의 아래 여백 한 곳에서만 계산한다.
    const marginBottom = Math.max(0, (opts.extraBottom ? Math.round(36 * sm) : baseParagraphGap + Math.round(8 * sm))
      + headingSpacePx(opts.nextIsHeading ? settings.headingBetweenSpace : settings.headingBottomSpace));
    // 카드 첫 출력 제목은 #만 2px, ##~####는 0px로 붙이고,
    // 본문 중간 제목은 단계와 관계없이 20px로 통일한다.
    const firstHeadingTop = level === 1 ? 2 : 0;
    const marginTop = opts.prevIsHeading ? 0 : Math.max(0,
      Math.round((opts.extraTop ? 36 : (opts.isFirst ? firstHeadingTop : 20)) * sm * headingSpacing)
      + headingSpacePx(settings.headingTopSpace));
    const align = (forceCenter || settings.headingCenter) ? 'text-align:center; ' : '';
    return `    <p style="margin:${marginTop}px 0 ${marginBottom}px 0; ${align}color:${pal.heading[level]}; font-size:${HEADING.size}px; font-weight:${HEADING.weight}; line-height:1.4; letter-spacing:-0.2px; font-family:${fontStack(settings.narrFont)};">${text}</p>\n`;
  }

  // 인용 블록: 줄 맨 앞 '>' 하나 (+선택적 공백). '>>' 대사 표시와는 구분됨.
  const quoteMatch = line.match(/^>(?!>)\s?(.+)$/);
  if(quoteMatch){
    // 인용 안쪽의 [C]도 가운데 정렬로 인식 (> [C] 내용)
    let qInner = quoteMatch[1].trim();
    if(/^\[C\]\s*/i.test(qInner)){ forceCenter = true; qInner = qInner.replace(/^\[C\]\s*/i, ''); }
    const qSize = Math.max(9, (parseFloat(settings.narrSize) || 13.5) - 0.5);
    // 인용은 앞뒤로 넉넉히 띄워 본문과 확실히 분리 (구분선 인접 시엔 HR 여백 우선)
    const quoteNarrationGap = baseParagraphGap + Math.round(6 * sm);
    // 카드의 마지막 인용문은 카드 자체의 아래 패딩만 남겨 여백이 중복되지 않게 한다.
    // 뒤에 다른 내용이 있으면 기존 문단 간격을 유지한다.
    const qMb = opts.isLast ? 0 : (opts.extraBottom ? Math.round(36*sm) : baseParagraphGap + Math.round(8 * sm));
    const qMt = opts.extraTop ? Math.round(36*sm) : (opts.isFirst ? 0 : (opts.prevIsNarration ? quoteNarrationGap : baseParagraphGap));
    const quoteAlign = (forceCenter || settings.quoteCenter) ? 'center' : 'left';
    const sourceColor = safeHexColor(settings.narrColor, pal.caption);
    const softQuoteText = softBodyTextColor(settings, sourceColor);
    // 이어보기 접기 카드의 색면 안에서도 인용이 구분되도록 이 문맥에서만 대비를 높인다.
    const strongerQuote = settings.unifiedFoldQuoteContrast === true;
    const darkBackground = textColorFor(pal.cardBg) === '#ffffff';
    const quoteBg = strongerQuote
      ? mixHex(pal.cardBg, darkBackground ? '#ffffff' : '#000000', darkBackground ? 0.12 : 0.08)
      : pal.boxBg;
    const quoteText = strongerQuote ? mixHex(softQuoteText, sourceColor, 0.25) : softQuoteText;
    return `    <div data-mosaic-quote="true" style="margin:${qMt}px 0 ${qMb}px 0; padding:13px 16px; background-color:${quoteBg}; border-radius:8px; text-align:${quoteAlign}; color:${quoteText}; font-size:${qSize}px; font-weight:400; line-height:${settings.narrLine}; letter-spacing:0.1px; font-family:${fontStack(settings.narrFont)};">${renderQuoteContent(qInner, settings)}</div>\n`;
  }

  let overrideColor = null;
  const colorTagMatch = line.match(/^\{(#?(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}))\}\s*/);
  if(colorTagMatch){
    overrideColor = safeHexColor(colorTagMatch[1], null);
    line = line.slice(colorTagMatch[0].length).trim();
  }

  const sp = stripSpeaker(line, settings);
  const speaker = sp.speaker;
  line = sp.line;

  // 줄 전체가 정확히 "..." 로 감싸져 있으면 대사.
  // "원문" (번역)은 대사로 묶고, '속마음' (번역)은 속마음 스타일을 유지한다.
  // 큰따옴표 대사는 원문 병행의 자동 배치·이어쓰기·아래쓰기 설정을 따른다.
  // *...* 강조는 문장 안과 독립 문장 모두 같은 기울임·강조색으로 처리됨.
  const parallelTranslationMode = resolvedParallelTranslationMode(settings);
  const parallelDialogue = settings.parallelTranslationSoft ? parallelDialogueParts(line) : null;
  const isDialogueParallel = parallelDialogue && parallelDialogue.original.startsWith('"');
  const isDialogue = /^"[^"]*"$/.test(line) || Boolean(isDialogueParallel);

  // 보이는 문단 구분 요소 바로 앞/뒤는 여백을 더 띄워 단락 구분을 직관적으로 보여줌
  const HR_GAP = Math.round(36 * sm);
  const mt = opts.extraTop ? HR_GAP : 0;
  const narrationAlign = settings.narrCenter ? 'text-align:center; ' : '';

  if(isDialogue){
    let color;
    const dialogueAlign = (forceCenter || settings.dialogueCenter) ? 'text-align:center; ' : '';
    if(overrideColor){
      color = overrideColor;
    } else if(speaker && typeof speaker === 'object'){
      color = safeHexColor(speaker.color, settings.charColor); // 등록된 추가 인물
    } else if(speaker === 'user'){
      color = settings.userColor;
    } else {
      color = settings.charColor;
    }
    const dialogueSource = parallelDialogue
      ? parallelDialogue.original
      : line;
    const parallelTranslationHtml = parallelDialogue
      ? parallelTranslationHTML(parallelDialogue, settings, color, parallelTranslationMode)
      : '';
    // 연속 대사(주고받는 대화) 구간은 간격을 자동으로 좁혀 대화의 리듬을 살림
    let mb;
    if(opts.extraBottom){
      mb = HR_GAP;
    } else if(opts.tightBottom){
      mb = Math.max(6, Math.round(baseParagraphGap * 0.55));
    } else if(opts.narrDialogueBoundary){
      mb = narrationDialogueGap;
    } else {
      mb = baseParagraphGap;
    }

    // 화자 이름표: 마커가 없는 대사는 {{char}}가 기본 화자이므로 이름표도 char로 표시.
    // 등록된 인물은 그 인물의 이름이 그대로 이름표에 나옴.
    let label = '';
    let embeddedLabel = '';
    let speakerNameHtml = '';
    let mtEff = mt;
    const who = speaker || 'char';
    const speakerNameOn = (who && typeof who === 'object')
      ? settings.charSpeakerOn
      : (who === 'user' ? settings.userSpeakerOn : settings.charSpeakerOn);
    if(speakerNameOn){
      const name = (who && typeof who === 'object')
        ? who.name
        : (who === 'user'
            ? ((settings.userName || '').trim() || '{{user}}')
            : ((settings.charName || '').trim() || '{{char}}'));
      const nameHtml = processInline(name, settings.emphasisColor);
      speakerNameHtml = nameHtml;
      const labelColor = parallelTranslationTextColor(settings, color);
      const messengerUserLabelAlign = settings.dlgStyle === 'messenger' && who === 'user'
        ? ' display:block !important; width:100% !important; text-align:right !important;' : '';
      label = `      <p data-mosaic-speaker-label="true" style="margin:${mt}px 0 5px 0; color:${labelColor}; -webkit-text-fill-color:${labelColor}; font-size:10.5px; font-weight:600; line-height:1.35; letter-spacing:0.4px; font-family:${fontStack(settings.dlgFont)};">${nameHtml}</p>\n`;
      embeddedLabel = `<span data-mosaic-speaker-label="true" style="display:block; margin:0 0 5px 0; color:${labelColor}; -webkit-text-fill-color:${labelColor}; font-size:10.5px; font-weight:600; line-height:1.35; letter-spacing:0.4px;${messengerUserLabelAlign}">${nameHtml}</span>`;
      mtEff = 0;
    }

    const wrapDialogue = (html) => label
      ? `    <div style="display:flow-root; margin:0; padding:0;">\n${label}${html}    </div>\n`
      : html;

    if(settings.dlgStyle === 'highlight' || settings.dlgStyle === 'softlight'){
      // 옵션1: 배경은 카드에서 파생된 연한 색, 글자는 화자 색
      // 옵션2: 화자 색을 카드 배경과 섞은 옅은 색면 + 자동 대비 글자
      const soft = settings.dlgStyle === 'softlight';
      const bgColor = soft ? pal.boxBg : accentTint(settings.bgColor, color);
      const txtColor = soft ? color : textColorFor(bgColor);
      return wrapDialogue(`      <p data-mosaic-dialogue="true" data-mosaic-dialogue-side="${speaker === 'user' ? 'right' : 'left'}" style="margin:${mtEff}px 0 ${mb}px 0; ${dialogueAlign}font-size:${settings.dlgSize}px; font-weight:600; line-height:${settings.dlgLine}; letter-spacing:-0.2px; font-family:${fontStack(settings.dlgFont)};"><span style="background-color:${bgColor}; color:${txtColor}; -webkit-text-fill-color:${txtColor}; padding:2px 8px; border-radius:4px; box-decoration-break:clone; -webkit-box-decoration-break:clone;">${processBodyInline(dialogueSource, settings.emphasisColor, { softBreakSpacing:settings.softBreakSpacing })}</span>${parallelTranslationHtml}</p>\n`);
    }

    const dialogueHtml = processBodyInline(dialogueSource, settings.emphasisColor, { softBreakSpacing:settings.softBreakSpacing });
    const dialogueBodyHtml = parallelDialogue && parallelTranslationMode === 'inline'
      ? `<span style="display:block;">${dialogueHtml}${parallelTranslationHtml}</span>`
      : `<span style="display:block;">${dialogueHtml}</span>${parallelTranslationHtml}`;

    // 옵션3: 화자명을 옅은 화자색 배지로 압축하고 대사는 장식 없이 읽게 함
    if(settings.dlgStyle === 'badge'){
      const badgeBg = accentTint(settings.bgColor, color);
      const badgeLabel = speakerNameHtml
        ? `<span data-mosaic-speaker-label="true" style="display:inline-block; margin:0 0 7px 0; padding:2px 7px; border-radius:999px; background-color:${badgeBg}; color:${textColorFor(badgeBg)}; -webkit-text-fill-color:${textColorFor(badgeBg)}; font-size:10px; font-weight:700; line-height:1.35; letter-spacing:0.3px;">${speakerNameHtml}</span>`
        : '';
      return `    <p data-mosaic-dialogue="true" data-mosaic-dialogue-side="${speaker === 'user' ? 'right' : 'left'}" style="margin:${mt}px 0 ${mb}px 0; ${dialogueAlign}color:${color}; -webkit-text-fill-color:${color}; font-size:${settings.dlgSize}px; font-weight:600; line-height:${settings.dlgLine}; letter-spacing:-0.2px; font-family:${fontStack(settings.dlgFont)};">${badgeLabel}${dialogueBodyHtml}</p>\n`;
    }

    // 옵션4: 왼쪽에서 오른쪽으로 자연스럽게 사라지는 연한 색면
    if(settings.dlgStyle === 'gradient'){
      return `    <p data-mosaic-dialogue="true" data-mosaic-dialogue-side="${speaker === 'user' ? 'right' : 'left'}" style="margin:${mt}px 0 ${mb}px 0; ${dialogueAlign}padding:10px 14px; border-radius:6px; background:linear-gradient(90deg, ${pal.boxBg} 0%, ${pal.boxBg} 52%, transparent 100%); color:${color}; -webkit-text-fill-color:${color}; font-size:${settings.dlgSize}px; font-weight:600; line-height:${settings.dlgLine}; letter-spacing:-0.2px; font-family:${fontStack(settings.dlgFont)};">${embeddedLabel}${dialogueBodyHtml}</p>\n`;
    }

    // 옵션6: 화자별 말풍선. 기존 대사·이름표·번역 처리를 그대로 사용한다.
    if(settings.dlgStyle === 'messenger'){
      const userSide = speaker === 'user';
      const bubbleBg = accentTint(settings.bgColor, color);
      return `    <p data-mosaic-dialogue="true" data-mosaic-dialogue-side="${userSide ? 'right' : 'left'}" style="box-sizing:border-box; width:fit-content; max-width:88%; margin:${mt}px ${userSide ? '0' : 'auto'} ${mb}px ${userSide ? 'auto' : '0'}; padding:12px 16px; border:0; border-radius:${userSide ? '16px 16px 4px 16px' : '16px 16px 16px 4px'}; background-color:${bubbleBg}; text-align:left; color:${color}; -webkit-text-fill-color:${color}; font-size:${settings.dlgSize}px; font-weight:600; line-height:${settings.dlgLine}; letter-spacing:-0.2px; overflow-wrap:anywhere; font-family:${fontStack(settings.dlgFont)};">${embeddedLabel}${dialogueBodyHtml}</p>\n`;
    }

    // 옵션5: 배경이 있는 인용박스. 저장된 quote 값도 같은 형태로 표시한다.
    return `    <p data-mosaic-dialogue="true" data-mosaic-dialogue-side="${speaker === 'user' ? 'right' : 'left'}" style="margin:${mt}px 0 ${mb}px 0; ${dialogueAlign}padding:13px 18px; border-left:2px solid ${color}; background-color:${pal.boxBg}; color:${color}; -webkit-text-fill-color:${color}; font-size:${settings.dlgSize}px; font-weight:600; line-height:${settings.dlgLine}; letter-spacing:-0.2px; font-family:${fontStack(settings.dlgFont)};">${embeddedLabel}${dialogueBodyHtml}</p>\n`;
  } else {
    const mb = opts.extraBottom ? HR_GAP : (opts.narrDialogueBoundary ? narrationDialogueGap : baseParagraphGap);
    const baseColor = overrideColor
      || (speaker && typeof speaker === 'object' ? safeHexColor(speaker.color, settings.charColor)
          : (speaker === 'user' ? settings.userColor : settings.charColor));
    // 병행 번역을 임시 토큰으로 보호하고 사용자 글자를 안전한 HTML로 만든 뒤 대사 강조를 합친다.
    const preparedParallel = prepareMixedParallelTranslations(line, settings, baseColor);
    let content = processBodyInline(preparedParallel.line, settings.emphasisColor, { softBreakSpacing:settings.softBreakSpacing });

    // 옵션1·2에서는 서술이 섞인 줄이라도 "..." 부분만 골라서 대사 강조 처리.
    // 대사 바로 앞에 <<, >>를 붙이면 그 대사만 해당 화자 색으로 칠해짐 (마커는 출력에서 제거).
    // 마커가 없는 대사는 줄 맨 앞 마커/{#색} 또는 기본({{char}}) 색을 따름.
    // 옵션3·4·5의 일반 문장은 assembleBody에서 출력용 줄로 먼저 분리된다.
    // 이 분기에 남은 특수 문법 줄에서는 인라인 화자 마커만 흔적 없이 정리한다.
    if(/"[^"]*"/.test(content)){
      if(settings.dlgStyle === 'highlight' || settings.dlgStyle === 'softlight'){
        const soft = settings.dlgStyle === 'softlight';
        content = content.replace(/(&gt;&gt;|&lt;&lt;|\[([^\[\]\n]{1,24})\])?\s*("[^"]*")/g, (m, mark, personName, q) => {
          let who;
          if(mark === '&lt;&lt;') who = settings.userColor;
          else if(mark === '&gt;&gt;') who = settings.charColor;
          else if(personName){
            const p = findChar(settings, personName);
            if(!p) return m;                 // 등록되지 않은 이름이면 원문 그대로 둠
            who = p.color;
          }
          else who = baseColor;
          const bg = soft ? pal.boxBg : accentTint(settings.bgColor, who);
          const txtColor = soft ? who : textColorFor(bg);
          // 서술 안에 섞인 대사도 독립 대사와 같은 크기·행간을 사용한다. 이전에는
          // 나레이션 크기를 상속해 특히 모바일에서 대사 크기 설정이 풀린 것처럼 보였다.
          return (m.startsWith(' ') ? ' ' : '') + `<span data-mosaic-dialogue="true" style="background-color:${bg}; color:${txtColor}; -webkit-text-fill-color:${txtColor}; font-size:${settings.dlgSize}px; font-weight:600; line-height:${settings.dlgLine}; padding:1px 6px; border-radius:4px; box-decoration-break:clone; -webkit-box-decoration-break:clone;">${q}</span>`;
        });
      } else {
        // 옵션3·4·5: 인라인 화자 마커가 출력에 남지 않게 제거 (등록된 인물 이름만)
        content = content.replace(/(?:&gt;&gt;|&lt;&lt;)\s*(?=")/g, '');
        content = content.replace(/\[([^\[\]\n]{1,24})\]\s*(?=")/g, (m, name) => findChar(settings, name) ? '' : m);
      }
    }
    content = restoreMixedParallelTranslations(content, preparedParallel.tokens);

    const alignN = forceCenter ? 'text-align:center; ' : narrationAlign;
    const indentN = (settings.narrIndent && !forceCenter && !settings.narrCenter) ? 'text-indent:1em; ' : '';
    return `    <p style="margin:${mt}px 0 ${mb}px 0; ${indentN}${alignN}color:${settings.narrColor}; font-size:${settings.narrSize}px; font-weight:400; line-height:${settings.narrLine}; letter-spacing:-0.2px; font-family:${fontStack(settings.narrFont)};">${content}</p>\n`;
  }
}

const MAX_CREDIT_ITEMS = 20;
let creditDragIndex = null;
let creditDropMarker = null;

function clearCreditDragUi(){
  document.querySelectorAll('#creditEditorList .creditEditorRow').forEach(row => {
    row.classList.remove('isCreditDragging');
    row.removeAttribute('aria-grabbed');
  });
  if(creditDropMarker) creditDropMarker.remove();
  creditDropMarker = null;
  creditDragIndex = null;
}

function reorderCreditItem(from, insertionIndex){
  const items = creditItemsFromEditor();
  if(from < 0 || from >= items.length) return false;
  let target = Math.max(0, Math.min(items.length, insertionIndex));
  const [moved] = items.splice(from, 1);
  if(target > from) target--;
  if(target === from) return false;
  items.splice(target, 0, moved);
  MosaicUI.cards.snapshot();
  setStoredCreditItems(items, true);
  renderCreditItemsEditor();
  MosaicUI.feedback.undo('크레딧 항목 순서를 변경했습니다.');
  return true;
}

function finishCreditItemDrop(event){
  if(creditDragIndex === null || !creditDropMarker || !creditDropMarker.isConnected) return;
  event.preventDefault();
  event.stopPropagation();
  const list = document.getElementById('creditEditorList');
  const children = Array.from(list.children);
  const insertionIndex = children
    .slice(0, children.indexOf(creditDropMarker))
    .filter(child => child.classList && child.classList.contains('creditEditorRow'))
    .length;
  const from = creditDragIndex;
  clearCreditDragUi();
  reorderCreditItem(from, insertionIndex);
}

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

function creditItemsFromEditor(){
  return Array.from(document.querySelectorAll('#creditEditorList .creditEditorRow')).map(row => ({
    label:row.querySelector('.creditLabelInput').value,
    value:row.querySelector('.creditValueInput').value,
    url:row.querySelector('.creditUrlInput').value,
    dividerBefore:row.dataset.dividerBefore === 'true'
  }));
}

function storedCreditItems(){
  return normalizeCreditItems(document.getElementById('creditItems').value);
}

function setStoredCreditItems(items, dispatch){
  const field = document.getElementById('creditItems');
  field.value = JSON.stringify(normalizeCreditItems(items));
  if(dispatch) field.dispatchEvent(new Event('input', { bubbles:true }));
}

function syncCreditItemsField(){
  setStoredCreditItems(creditItemsFromEditor(), true);
}

function renderCreditItemsEditor(){
  const list = document.getElementById('creditEditorList');
  if(!list) return;
  const stored = storedCreditItems();
  const items = stored.length ? stored : [{ label:'', value:'', url:'', dividerBefore:false }];
  list.replaceChildren();
  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'creditEditorRow';
    row.dataset.creditIndex = String(index);
    row.dataset.dividerBefore = String(index > 0 && settingFlagOn(item.dividerBefore));

    const header = document.createElement('div');
    header.className = 'creditRowHeader';
    header.draggable = true;
    header.title = '헤더를 끌어서 크레딧 순서 변경';

    const rowTitle = document.createElement('span');
    rowTitle.className = 'creditRowTitle';
    rowTitle.textContent = `항목 ${index + 1}`;

    const label = document.createElement('input');
    label.type = 'text';
    label.id = `creditLabel${index}`;
    label.className = 'creditLabelInput';
    label.maxLength = 80;
    label.placeholder = '항목명 · 예: Model';
    label.setAttribute('aria-label', `크레딧 ${index + 1} 항목명`);
    label.value = item.label;

    const value = document.createElement('input');
    value.type = 'text';
    value.id = `creditValue${index}`;
    value.className = 'creditValueInput';
    value.maxLength = 500;
    value.placeholder = '내용';
    value.setAttribute('aria-label', `크레딧 ${index + 1} 내용`);
    value.value = item.value;

    const url = document.createElement('input');
    url.type = 'url';
    url.id = `creditUrl${index}`;
    url.className = 'creditUrlInput';
    url.maxLength = 8192;
    url.placeholder = '연결 URL · 선택';
    url.setAttribute('aria-label', `크레딧 ${index + 1} 링크`);
    url.value = item.url;

    const actions = document.createElement('div');
    actions.className = 'creditRowActions';
    const divider = document.createElement('button');
    divider.type = 'button';
    divider.className = 'creditDividerBtn uiButton';
    divider.textContent = '―';
    divider.title = index === 0 ? '첫 항목 위에는 구분선을 넣을 수 없습니다.' : '이 항목 위 구분선 표시 전환';
    divider.setAttribute('aria-label', `크레딧 ${index + 1} 위 구분선 표시 전환`);
    divider.setAttribute('aria-pressed', row.dataset.dividerBefore);
    divider.disabled = index === 0;
    const moveGroup = document.createElement('span');
    moveGroup.className = 'creditMoveGroup';
    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'itemMoveBtn uiButton';
    up.textContent = '↑';
    up.title = '항목을 위로';
    up.setAttribute('aria-label', `크레딧 ${index + 1} 위로 이동`);
    up.disabled = index === 0;
    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'itemMoveBtn uiButton';
    down.textContent = '↓';
    down.title = '항목을 아래로';
    down.setAttribute('aria-label', `크레딧 ${index + 1} 아래로 이동`);
    down.disabled = index === items.length - 1;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'creditDeleteBtn';
    remove.textContent = '×';
    remove.title = '항목 삭제';
    remove.setAttribute('aria-label', `크레딧 ${index + 1} 삭제`);
    moveGroup.append(up, down);
    actions.append(divider, moveGroup, remove);

    header.addEventListener('dragstart', event => {
      if(event.target.closest('button') || !document.getElementById('creditOn').checked){
        event.preventDefault();
        return;
      }
      creditDragIndex = index;
      creditDropMarker = document.createElement('div');
      creditDropMarker.className = 'creditDropMarker';
      creditDropMarker.setAttribute('aria-hidden', 'true');
      row.classList.add('isCreditDragging');
      row.setAttribute('aria-grabbed', 'true');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    });
    header.addEventListener('dragend', clearCreditDragUi);
    row.addEventListener('dragover', event => {
      if(creditDragIndex === null) return;
      // 끌던 항목으로 다시 돌아오면 앞서 가리키던 위치를 취소한다. 표시선이
      // 다른 자리에 남은 채 원래 항목에서 놓여 뜻밖의 순서 변경이 되는 것을 막는다.
      if(creditDragIndex === index){
        if(creditDropMarker && creditDropMarker.isConnected) creditDropMarker.remove();
        return;
      }
      event.preventDefault();
      if(event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect();
      if(event.clientY >= rect.top + rect.height / 2) row.after(creditDropMarker);
      else row.before(creditDropMarker);
    });
    row.addEventListener('drop', finishCreditItemDrop);

    [label, value, url].forEach(input => input.addEventListener('input', syncCreditItemsField));
    url.addEventListener('change', () => {
      const normalized = normalizeProtocolRelativeUrl(url.value);
      if(url.value !== normalized) url.value = normalized;
      syncCreditItemsField();
    });
    up.addEventListener('click', () => moveCreditItem(index, -1));
    down.addEventListener('click', () => moveCreditItem(index, 1));
    divider.addEventListener('click', () => {
      if(index === 0) return;
      MosaicUI.cards.snapshot();
      const enabled = row.dataset.dividerBefore !== 'true';
      row.dataset.dividerBefore = String(enabled);
      divider.setAttribute('aria-pressed', String(enabled));
      syncCreditItemsField();
      MosaicUI.feedback.undo(`크레딧 ${index + 1} 위 구분선을 ${enabled ? '표시합니다.' : '숨겼습니다.'}`);
    });
    remove.addEventListener('click', () => deleteCreditItem(index));
    const fields = document.createElement('div');
    fields.className = 'creditRowFields';
    fields.append(label, value, url);
    header.append(rowTitle, actions);
    row.append(header, fields);
    list.appendChild(row);
  });
  MosaicUI.controls.syncCredit();
}

document.getElementById('creditEditorList').addEventListener('dragover', event => {
  if(creditDragIndex === null || !creditDropMarker || !creditDropMarker.isConnected) return;
  event.preventDefault();
  if(event.dataTransfer) event.dataTransfer.dropEffect = 'move';
});
document.getElementById('creditEditorList').addEventListener('drop', finishCreditItemDrop);

function addCreditItem(){
  const items = creditItemsFromEditor();
  if(items.length >= MAX_CREDIT_ITEMS){
    MosaicUI.feedback.notice(`크레딧은 최대 ${MAX_CREDIT_ITEMS}개까지 추가할 수 있습니다.`);
    return;
  }
  MosaicUI.cards.snapshot();
  items.push({ label:'', value:'', url:'', dividerBefore:false });
  setStoredCreditItems(items, true);
  renderCreditItemsEditor();
  const next = document.querySelector('#creditEditorList .creditEditorRow:last-child .creditLabelInput');
  if(next) next.focus();
  MosaicUI.feedback.undo('크레딧 항목을 추가했습니다.');
}

function moveCreditItem(index, delta){
  const items = creditItemsFromEditor();
  const target = index + delta;
  if(target < 0 || target >= items.length) return;
  MosaicUI.cards.snapshot();
  [items[index], items[target]] = [items[target], items[index]];
  setStoredCreditItems(items, true);
  renderCreditItemsEditor();
  MosaicUI.feedback.undo('크레딧 항목 순서를 변경했습니다.');
}

function deleteCreditItem(index){
  const items = creditItemsFromEditor();
  if(index < 0 || index >= items.length) return;
  MosaicUI.cards.snapshot();
  items.splice(index, 1);
  setStoredCreditItems(items, true);
  renderCreditItemsEditor();
  MosaicUI.feedback.undo('크레딧 항목을 삭제했습니다.');
}

const CREDIT_PRESET_KEY = 'mosaicCreditItemPresets_v1';
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

function loadCreditPresets(){
  return MosaicStorage.loadProtectedPresetList(CREDIT_PRESET_KEY, sanitizeCreditPresetList, MAX_CREDIT_PRESETS);
}

function saveCreditPresets(presets){
  return MosaicStorage.saveProtectedPresetList(CREDIT_PRESET_KEY, presets, sanitizeCreditPresetList, MAX_CREDIT_PRESETS, '크레딧 프리셋');
}

function syncCreditPresetControls(){
  const selected = document.getElementById('creditPresetSelect').value !== '';
  const hasName = document.getElementById('creditPresetName').value.trim() !== '';
  document.getElementById('creditPresetLoadBtn').disabled = !selected;
  document.getElementById('creditPresetDeleteBtn').disabled = !selected;
  document.getElementById('creditPresetSaveBtn').disabled = !hasName;
}

function renderCreditPresetOptions(selectedId){
  const select = document.getElementById('creditPresetSelect');
  const presets = loadCreditPresets();
  const preferred = selectedId !== undefined ? selectedId : select.value;
  select.replaceChildren(new Option(presets === null ? '저장된 프리셋을 읽지 못함' : '저장된 프리셋 선택', ''));
  if(presets) presets.forEach(preset => select.appendChild(new Option(preset.name, preset.id)));
  select.value = presets && presets.some(preset => preset.id === preferred) ? preferred : '';
  syncCreditPresetControls();
}

function saveCurrentCreditPreset(){
  const nameInput = document.getElementById('creditPresetName');
  const name = nameInput.value.trim();
  if(!name) return;
  const items = normalizeCreditItems(creditItemsFromEditor())
    .filter(item => item.label.trim() || item.value.trim() || item.url.trim());
  if(!items.length){
    MosaicUI.feedback.notice('저장할 크레딧 항목이 없습니다.');
    return;
  }
  const presets = loadCreditPresets();
  if(presets === null){ MosaicUI.feedback.notice('크레딧 프리셋 원본을 읽지 못해 저장하지 않았습니다.'); return; }
  const existing = presets.find(preset => preset.name.toLowerCase() === name.toLowerCase());
  if(!existing && presets.length >= MAX_CREDIT_PRESETS){
    MosaicUI.feedback.notice(`크레딧 프리셋은 최대 ${MAX_CREDIT_PRESETS}개까지 저장할 수 있습니다.`);
    return;
  }
  const id = existing ? existing.id : `credit-preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const next = existing
    ? presets.map(preset => preset.id === id ? { id, name, items, updatedAt:Date.now() } : preset)
    : [...presets, { id, name, items, updatedAt:Date.now() }];
  if(!saveCreditPresets(next)) return;
  renderCreditPresetOptions(id);
  MosaicUI.feedback.notice(existing ? `'${name}' 크레딧 프리셋을 덮어썼습니다.` : `'${name}' 크레딧 프리셋을 저장했습니다.`);
}

function loadSelectedCreditPreset(){
  const id = document.getElementById('creditPresetSelect').value;
  const presets = loadCreditPresets();
  const preset = presets && presets.find(item => item.id === id);
  if(!preset) return;
  MosaicUI.cards.snapshot();
  setStoredCreditItems(preset.items, true);
  renderCreditItemsEditor();
  document.getElementById('creditPresetName').value = preset.name;
  syncCreditPresetControls();
  MosaicUI.feedback.undo(`'${preset.name}' 크레딧 항목을 불러왔습니다.`);
}

function deleteSelectedCreditPreset(){
  const id = document.getElementById('creditPresetSelect').value;
  const presets = loadCreditPresets();
  const preset = presets && presets.find(item => item.id === id);
  if(!preset || !confirm(`'${preset.name}' 크레딧 프리셋을 삭제하려면 확인을 누르세요.\n삭제 후 되돌릴 수 없습니다.`)) return;
  if(!saveCreditPresets(presets.filter(item => item.id !== id))) return;
  renderCreditPresetOptions('');
  MosaicUI.feedback.notice(`'${preset.name}' 크레딧 프리셋을 삭제했습니다.`);
}

const DETAIL_PRESET_KEY = 'mosaicDetailPresets_v1';
const MAX_DETAIL_PRESETS = 50;
const DETAIL_PRESET_FIELDS = [
  'advancedOn', 'hrShape', 'hrOpacity', 'hrLength', 'hrVerticalSpace', 'hr2Shape', 'hr2Opacity', 'hr2VerticalSpace',
  'hr3Shape', 'hr3Opacity', 'hr3VerticalSpace', 'gapHeight', 'coverVerticalSpace',
  'profileOuterBackground', 'profileItemGap', 'cardTitlePadding',
  'coverDividerLength', 'cardDividerLength', 'cardCornerRadius', 'cardTitleOrnamentOpacity', 'foldAutoNumberStyle',
  'profileTitleGap', 'coverCardGap', 'cardGap', 'unifiedBottomSpace', 'creditCardGap',
  'cardInlinePadding', 'cardBodyTopSpace', 'cardBodyBottomSpace', 'footerBodyGap', 'headingTopSpace', 'headingBetweenSpace', 'headingBottomSpace',
  'creditBorderOn', 'creditTransparentOn'
];

function sanitizeDetailPresetList(value){
  if(!Array.isArray(value)) return [];
  return value.slice(0, MAX_DETAIL_PRESETS).map((preset, index) => {
    if(!preset || typeof preset !== 'object' || Array.isArray(preset)) return null;
    const name = typeof preset.name === 'string' ? preset.name.trim().slice(0, 80) : '';
    if(!name || !preset.values || typeof preset.values !== 'object' || Array.isArray(preset.values)
      || !DETAIL_PRESET_FIELDS.some(id => Object.prototype.hasOwnProperty.call(preset.values, id))) return null;
    const safe = sanitizeImportedPreset({ name, values:preset.values });
    if(!safe) return null;
    const values = {};
    DETAIL_PRESET_FIELDS.forEach(id => { values[id] = safe.values[id]; });
    const id = typeof preset.id === 'string' && preset.id
      ? preset.id.slice(0, 120)
      : `detail-preset-${index}-${name.toLowerCase()}`;
    return { id, name, values, updatedAt:Number(preset.updatedAt) || 0 };
  }).filter(Boolean);
}

function loadDetailPresets(){
  return MosaicStorage.loadProtectedPresetList(DETAIL_PRESET_KEY, sanitizeDetailPresetList, MAX_DETAIL_PRESETS);
}

function saveDetailPresets(presets){
  return MosaicStorage.saveProtectedPresetList(DETAIL_PRESET_KEY, presets, sanitizeDetailPresetList, MAX_DETAIL_PRESETS, '세부 조정 프리셋');
}

function syncDetailPresetControls(){
  const selected = document.getElementById('detailPresetSelect').value !== '';
  const hasName = document.getElementById('detailPresetName').value.trim() !== '';
  document.getElementById('detailPresetLoadBtn').disabled = !selected;
  document.getElementById('detailPresetDeleteBtn').disabled = !selected;
  document.getElementById('detailPresetSaveBtn').disabled = !hasName;
}

function renderDetailPresetOptions(selectedId){
  const select = document.getElementById('detailPresetSelect');
  const presets = loadDetailPresets();
  const preferred = selectedId !== undefined ? selectedId : select.value;
  select.replaceChildren(new Option(presets === null ? '저장된 프리셋을 읽지 못함' : '저장된 프리셋 선택', ''));
  if(presets) presets.forEach(preset => select.appendChild(new Option(preset.name, preset.id)));
  select.value = presets && presets.some(preset => preset.id === preferred) ? preferred : '';
  syncDetailPresetControls();
}

function currentDetailPresetValues(){
  const values = {};
  DETAIL_PRESET_FIELDS.forEach(id => {
    const input = document.getElementById(id);
    values[id] = input.type === 'checkbox' ? input.checked : input.value;
  });
  return values;
}

function saveCurrentDetailPreset(){
  const nameInput = document.getElementById('detailPresetName');
  const name = nameInput.value.trim();
  if(!name) return;
  const values = currentDetailPresetValues();
  const presets = loadDetailPresets();
  if(presets === null){ MosaicUI.feedback.notice('세부 조정 프리셋 원본을 읽지 못해 저장하지 않았습니다.'); return; }
  const existing = presets.find(preset => preset.name.toLowerCase() === name.toLowerCase());
  if(!existing && presets.length >= MAX_DETAIL_PRESETS){
    MosaicUI.feedback.notice(`세부 조정 프리셋은 최대 ${MAX_DETAIL_PRESETS}개까지 저장할 수 있습니다.`);
    return;
  }
  const id = existing ? existing.id : `detail-preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const next = existing
    ? presets.map(preset => preset.id === id ? { id, name, values, updatedAt:Date.now() } : preset)
    : [...presets, { id, name, values, updatedAt:Date.now() }];
  if(!saveDetailPresets(next)) return;
  renderDetailPresetOptions(id);
  MosaicUI.feedback.notice(existing ? `'${name}' 세부 조정 프리셋을 덮어썼습니다.` : `'${name}' 세부 조정 프리셋을 저장했습니다.`);
}

function loadSelectedDetailPreset(){
  const id = document.getElementById('detailPresetSelect').value;
  const presets = loadDetailPresets();
  const preset = presets && presets.find(item => item.id === id);
  if(!preset) return;
  applyStyleValues({ ...currentStyleValues(), ...preset.values });
  MosaicUI.preview.render();
  saveDraft();
  commitStyleHistory(true);
  document.getElementById('detailPresetName').value = preset.name;
  syncDetailPresetControls();
  MosaicUI.feedback.open(`'${preset.name}' 세부 조정을 불러왔습니다.`, null, true);
}

function deleteSelectedDetailPreset(){
  const id = document.getElementById('detailPresetSelect').value;
  const presets = loadDetailPresets();
  const preset = presets && presets.find(item => item.id === id);
  if(!preset || !confirm(`'${preset.name}' 세부 조정 프리셋을 삭제하십시오.\n삭제 후 되돌릴 수 없습니다.`)) return;
  if(!saveDetailPresets(presets.filter(item => item.id !== id))) return;
  renderDetailPresetOptions('');
  MosaicUI.feedback.notice(`'${preset.name}' 세부 조정 프리셋을 삭제했습니다.`);
}

// Output settings reader lives in state.js. Keep output builders independent of input controls.




function coverImageAvailable(settings){
  return Boolean(settings.imgOn && settings.imgUrl && !settings.coverImageLoadFailed);
}

function usableProfileImage(url, loadFailed){
  return loadFailed ? '' : (url || '').trim();
}

function titleImageBackgroundEnabled(settings){
  return settings.titleImageBackgroundOn && coverImageAvailable(settings)
    && settings.logTitleOn && Boolean(
      (settings.logNumber || '').trim() || (settings.logTitle || '').trim()
      || (settings.subChar || '').trim() || (settings.subUser || '').trim()
      || (settings.logSubtitle || '').trim()
    );
}

function buildImageBlock(settings, connectedAbove = false){
  if(!coverImageAvailable(settings) || titleImageBackgroundEnabled(settings)) return '';
  // 대표 이미지: 카드들 맨 위에 항상 표시되며(접기 카드여도 보임), 첫 카드와 한 몸처럼 연결됨.
  // 위 모서리만 둥글고 아래 테두리는 없음 -> 바로 아래 첫 카드의 위 테두리와 만나 얇은 경계선 하나만 남음.
  // border를 개별 속성(left/right/top)으로 지정해 아카라이브가 축약형을 재해석해도 이중선이 생기지 않게 함.
  const pal = tonePalette(settings);
  const H = parseFloat(settings.imgHeight) || 300;
  const xValue = Number(settings.xpos);
  const yValue = Number(settings.ypos);
  const xpos = Number.isFinite(xValue) ? Math.min(100, Math.max(0, xValue)) : 50;
  const ypos = Number.isFinite(yValue) ? Math.min(100, Math.max(0, yValue)) : 0;
  const W = parseInt(settings.cardWidth) || 750;
  const outerBorder = settings.cardBorderOn === false
    ? ''
    : `border-left:1px solid ${pal.shellBorder}; border-right:1px solid ${pal.shellBorder}; ${connectedAbove ? '' : `border-top:1px solid ${pal.shellBorder};`}`;
  const radius = cardCornerRadiusPx(settings);
  return `<div data-mosaic-cover-image="true" style="width:100%; max-width:${W}px; box-sizing:border-box; margin:0 auto; height:${H}px; background-image:url('${escapeCssUrl(settings.imgUrl)}'); background-repeat:no-repeat; background-position:${xpos}% ${ypos}%; background-size:cover; ${outerBorder} border-radius:${connectedAbove ? 0 : radius}px ${connectedAbove ? 0 : radius}px 0 0;"></div>
`;
}



function foldAutoNumberText(number, style){
  if(style !== 'roman' || number < 1 || number > 3999) return String(number);
  const numerals = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let remaining = number;
  let result = '';
  numerals.forEach(([value, numeral]) => {
    while(remaining >= value){ result += numeral; remaining -= value; }
  });
  return result;
}

function foldDividerStyle(minimal, palette, settings){
  // 아카라이브와 일부 브라우저는 details를 다시 열 때 summary 뒤 콘텐츠에
  // 자체 여백·최소 높이를 되살릴 수 있다. 구분선이 제목에서 멀어지지 않도록
  // 제목 다음 본문 래퍼의 레이아웃을 인라인으로 완전히 고정한다.
  // display는 지정하지 않는다. 인라인 display:block은 닫힌 details의 기본 숨김보다
  // 우선해 아카라이브에서 접힌 본문이 다시 보일 수 있다.
  const stableLayout = 'box-sizing:border-box; width:100%; height:auto; min-height:0; margin:0; clear:both;';
  if(settingFlagOn(minimal)) return `${stableLayout} border-top:none;`;
  const length = cardDividerLengthPercent(settings);
  if(length === 100) return `${stableLayout} border-top:1px solid ${palette.divider};`;
  return `${stableLayout} border-top:none; background-image:linear-gradient(to right, ${palette.divider}, ${palette.divider}); background-repeat:no-repeat; background-position:center top; background-size:${length}% 1px;`;
}

// 접기 블록 (<details>/<summary>) — 스크립트 없이 동작하는 순수 HTML 토글.
// 배경 칩 없이 테두리와 제목 줄만으로 구성한 미니멀 스타일.
function buildFold(title, innerHTML, settings, forceCenter){
  const heading = parseBodyHeading(title);
  if(heading) return buildHeadingFold(heading.level, heading.title.trim(), innerHTML, settings, forceCenter);
  const pal = tonePalette(settings);
  const sm = spacingMult(settings);
  const inlinePadding = cardInlinePaddingCss(settings);
  const radius = Math.max(0, cardCornerRadiusPx(settings) - 4);
  const titleMinimal = settingFlagOn(settings.foldTitleMinimal);
  const bodyMinimal = settingFlagOn(settings.foldBodyMinimal);
  const ornamentOpacity = advancedOpaqueOpacity(settings.cardTitleOrnamentOpacity);
  const ornament = (!titleMinimal || !title.trim())
    ? `<span data-mosaic-generated="true" style="color:${pal.ornament}; opacity:${ornamentOpacity}; font-size:11px; margin-right:9px;">✦</span>`
    : '';
  const bodyDivider = foldDividerStyle(bodyMinimal, pal, settings);
  const bodyTopPadding = bodyMinimal ? 20 : 16;
  const align = `text-align:${(forceCenter || settings.bodyFoldTitleCenter) ? 'center' : 'left'}; `;
  return `    <details style="box-sizing:border-box; padding:0; border:1px solid ${pal.shellBorder}; border-radius:${radius}px; margin:${Math.round(20*sm)}px 0; overflow:hidden;"><summary data-mosaic-fold-title="true" style="box-sizing:border-box; width:100%; height:auto; min-height:0; margin:0; cursor:pointer; display:block; list-style:none; padding:13px ${inlinePadding}; ${align}font-size:13px; font-weight:700; color:${pal.heading[3]}; line-height:1.4; letter-spacing:-0.2px; font-family:${fontStack(settings.narrFont)};">${ornament}${processInline(title, settings.emphasisColor)}</summary><div data-mosaic-fold-body="true" style="${bodyDivider} padding:${bodyTopPadding}px ${inlinePadding} 14px;">\n${innerHTML}    </div></details>\n`;
}


// 일부 접기의 마크다운 제목 ([접기 ## 제목]): 소제목이 접기 헤더가 되는 블록 — 배경 칩 없는 미니멀 스타일
function buildHeadingFold(level, title, innerHTML, settings, forceCenter){
  const pal = tonePalette(settings);
  const sm = spacingMult(settings);
  const inlinePadding = cardInlinePaddingCss(settings);
  const radius = Math.max(0, cardCornerRadiusPx(settings) - 4);
  const spec = headingSpec(level);
  const align = `text-align:${(forceCenter || settings.bodyFoldTitleCenter) ? 'center' : 'left'}; `;
  const titleMinimal = settingFlagOn(settings.foldTitleMinimal);
  const bodyMinimal = settingFlagOn(settings.foldBodyMinimal);
  const ornamentOpacity = advancedOpaqueOpacity(settings.cardTitleOrnamentOpacity);
  const ornament = titleMinimal
    ? ''
    : `<span data-mosaic-generated="true" style="color:${pal.ornament}; opacity:${ornamentOpacity}; font-size:${Math.round(spec.size*0.62)}px; margin-right:10px;">✦</span>`;
  const bodyDivider = foldDividerStyle(bodyMinimal, pal, settings);
  const bodyTopPadding = bodyMinimal ? 22 : 18;
  return `    <details style="box-sizing:border-box; padding:0; border:1px solid ${pal.shellBorder}; border-radius:${radius}px; margin:${Math.round(24*sm)}px 0; overflow:hidden;"><summary data-mosaic-fold-title="true" style="box-sizing:border-box; width:100%; height:auto; min-height:0; margin:0; cursor:pointer; display:block; list-style:none; padding:14px ${inlinePadding}; ${align}font-size:${spec.size}px; font-weight:${spec.weight}; color:${pal.heading[level]}; line-height:1.4; letter-spacing:-0.2px; font-family:${fontStack(settings.narrFont)};">${ornament}${processInline(title, settings.emphasisColor)}</summary><div data-mosaic-fold-body="true" style="${bodyDivider} padding:${bodyTopPadding}px ${inlinePadding} 14px;">\n${innerHTML}    </div></details>\n`;
}


// 접두어({#색}, >>, <<)를 벗겨낸 뒤 줄 전체가 "..." 대사인지 판별 (연속 대사 간격용)
function isPureDialogueLine(line, settings){
  let l = normalizeQuotes(line.trim());
  const cm = l.match(/^\{(#?(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}))\}\s*/);
  if(cm) l = l.slice(cm[0].length).trim();
  if(l.startsWith('>>') || l.startsWith('<<')) l = l.slice(2).trim();
  else {
    const pm = l.match(/^\[([^\[\]\n]{1,24})\]\s*/);
    if(pm && settings && findChar(settings, pm[1])) l = l.slice(pm[0].length).trim();
  }
  const parallel = settings && settings.parallelTranslationSoft ? parallelDialogueParts(l) : null;
  return /^"[^"]*"$/.test(l)
    || Boolean(parallel && parallel.original.startsWith('"'));
}

// 옵션 3~6은 입력값을 바꾸지 않고 출력용 줄 배열에서만
// 문장 속 대사를 독립 문단으로 분리한다.
function usesSeparatedDialogueOutput(settings){
  return ['badge', 'gradient', 'box', 'messenger'].includes(settings.dlgStyle);
}

function isStructuralBodyLine(line){
  const trimmed = String(line).trim().replace(/^\[C\]\s*/i, '');
  const upper = trimmed.toUpperCase();
  return upper === '[HR]'
    || upper === '[HR2]'
    || upper === '[HR3]'
    || upper === '[HR4]'
    || upper === '[GAP]'
    || /^\[IMG\s+/i.test(trimmed)
    || /^\[접기(?:\s+.+?)?\]$/.test(trimmed)
    || /^\[\/접기\]$/.test(trimmed)
    || /^#{1,4}\s+/.test(trimmed)
    || /^>(?!>)/.test(trimmed)
    || statusLineContent(trimmed) !== null;
}

// [BR]로 이어지는 두 원문 줄을 실제 한 문단으로 합친다.
// 인용문은 첫 줄의 `>`만 문단 문법으로 남긴다. 새 입력은 다음 줄에 `>`를 붙이지
// 않지만, 이전 버전이 저장한 `> ` 연속 줄도 같은 결과가 되도록 함께 받아들인다.
function combineSoftBreakPair(left, right){
  const leftText = String(left);
  const rightText = String(right);
  if(!leftText.trim() || !rightText.trim()) return null;

  // [C]는 인용문보다 먼저 해석되는 정렬 접두어다. 따라서 `[C] > 인용`도
  // 일반 `> 인용`과 같은 문단으로 결합하되, 첫 줄의 [C]와 >는 그대로 보존한다.
  const quoteLeft = leftText.match(/^(\s*(?:\[C\]\s*)?>(?!>)\s?)(.*)$/i);
  if(quoteLeft){
    const quoteRight = rightText.match(/^\s*(?:\[C\]\s*)?>(?!>)\s?(.*)$/i);
    // 이전 버전의 자동 `>`와 새 버전의 평문 연속 줄을 모두 같은 인용문으로 처리한다.
    if(!quoteRight && (/^\s*(?:>>|<<)/.test(rightText) || isStructuralBodyLine(rightText))) return null;
    const continuation = quoteRight ? quoteRight[1] : rightText;
    if(!continuation.trim()) return null;
    return quoteLeft[1] + quoteLeft[2] + SOFT_BREAK_TOKEN + continuation.trimStart();
  }

  if(isStructuralBodyLine(leftText) || isStructuralBodyLine(rightText)) return null;
  return leftText + SOFT_BREAK_TOKEN + rightText;
}

function splitDialogueLineForOutput(rawLine, settings){
  const original = String(rawLine);
  let line = normalizeQuotes(original).trim();
  if(!usesSeparatedDialogueOutput(settings)
    || !/"[^"]*"/.test(line)
    || isPureDialogueLine(line, settings)
    || isStructuralBodyLine(line)){
    return [original];
  }

  let centerPrefix = '';
  if(/^\[C\]\s*/i.test(line)){
    centerPrefix = '[C] ';
    line = line.replace(/^\[C\]\s*/i, '');
  }

  let colorPrefix = '';
  const colorMatch = line.match(/^\{(#?(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}))\}\s*/);
  if(colorMatch){
    colorPrefix = `{${colorMatch[1]}} `;
    line = line.slice(colorMatch[0].length).trim();
  }

  // 줄 맨 앞 화자 표시는 해당 줄에서 발견되는 모든 대사의 기본 화자로 승계한다.
  let defaultSpeakerPrefix = '';
  if(line.startsWith('>>') || line.startsWith('<<')){
    defaultSpeakerPrefix = line.slice(0, 2) + ' ';
    line = line.slice(2).trim();
  } else {
    const leadingPerson = line.match(/^\[([^\[\]\n]{1,24})\]\s*/);
    if(leadingPerson && findChar(settings, leadingPerson[1])){
      defaultSpeakerPrefix = `[${leadingPerson[1]}] `;
      line = line.slice(leadingPerson[0].length).trim();
    }
  }

  const parts = [];
  let cursor = 0;
  const dialoguePattern = settings.parallelTranslationSoft
    ? /(?:(>>|<<)|\[([^\[\]\n]{1,24})\])?\s*("[^"]*")((?:\s*\(\s*[^()（）]+?\s*\)|\s*（\s*[^()（）]+?\s*）))?/g
    : /(?:(>>|<<)|\[([^\[\]\n]{1,24})\])?\s*("[^"]*")/g;
  let match;
  while((match = dialoguePattern.exec(line))){
    const inlinePerson = match[2] ? findChar(settings, match[2]) : null;
    const recognizedInlineSpeaker = Boolean(match[1] || inlinePerson);
    const quoteOffset = match[0].indexOf(match[3]);
    const quoteStart = match.index + quoteOffset;
    const segmentStart = recognizedInlineSpeaker ? match.index : quoteStart;
    const narration = line.slice(cursor, segmentStart).trim();
    if(narration) parts.push(centerPrefix + narration);

    const inlineSpeakerPrefix = match[1]
      ? match[1] + ' '
      : (inlinePerson ? `[${match[2]}] ` : '');
    parts.push(`${colorPrefix}${inlineSpeakerPrefix || defaultSpeakerPrefix}${match[3]}${match[4] || ''}`.trim());
    cursor = match.index + match[0].length;
  }

  const tail = line.slice(cursor).trim();
  if(tail) parts.push(centerPrefix + tail);
  return parts.length > 1 ? parts : [original];
}

function expandDialogueLinesForOutput(lines, settings){
  if(!usesSeparatedDialogueOutput(settings)) return lines;
  const expanded = [];
  lines.forEach(line => {
    splitDialogueLineForOutput(line, settings).forEach(part => {
      const trimmed = String(part).trim();
      if(trimmed) expanded.push(trimmed);
    });
  });
  return expanded;
}

// 출력과 미리보기 편집·이동은 같은 문단 목록을 사용한다. 빈 출력 줄을 먼저
// 제외하되, [BR]로 실제 합쳐진 원문 줄 번호는 남겨 숨긴 원문을 덮어쓰지 않는다.
function bodyRenderGroups(lines, settings){
  const visible = lines.map((line, raw) => ({raw, text:String(line).trim()}))
    .filter(entry => entry.text);
  const groups = [];
  for(let i = 0; i < visible.length; i++){
    let line = visible[i].text;
    const rawLines = [visible[i].raw];
    while(/\[BR\]\s*$/i.test(line) && i + 1 < visible.length){
      const left = line.replace(/\[BR\]\s*$/i, '');
      const right = visible[i + 1].text;
      const joined = combineSoftBreakPair(left, right);
      if(joined === null) break;
      line = joined;
      i++;
      rawLines.push(visible[i].raw);
    }
    groups.push({raw:rawLines[0], rawEnd:rawLines[rawLines.length - 1], rawLines,
      renderLines:expandDialogueLinesForOutput([line], settings)});
  }
  return groups;
}

// 한 카드 분량의 줄들을 문단 HTML로 조립 (일부 접기 포함)
function assembleBody(lines, settings){
  const renderLines = bodyRenderGroups(lines, settings).flatMap(group => group.renderLines);
  // GAP은 자체 높이와 일반 문단 여백만 사용하고, 보이는 구분 요소만 HR 전용 여백을 더한다.
  const isSep = (l) => { const u = l.toUpperCase(); return u === '[HR]' || u === '[HR2]' || u === '[HR3]'; };
  let bodyHTML = '';
  let manualBuf = null, manualTitle = '', manualForceCenter = false;   // [접기 제목] ... [/접기]

  const push = (html) => {
    if(manualBuf !== null) manualBuf += html;
    else bodyHTML += html;
  };
  const closeManual = () => {
    if(manualBuf === null) return;
    const html = buildFold(manualTitle, manualBuf, settings, manualForceCenter);
    manualBuf = null;
    manualForceCenter = false;
    push(html);
  };


  const isNarrationLine = raw => {
    if(raw === undefined) return false;
    const text = normalizeQuotes(String(raw).trim()).replace(/^\[C\]\s*/i, '');
    return !!text && !isSep(text) && !isStatusBodyLine(text)
      && !parseBodyHeading(text) && !parseOutputBodyImage(text)
      && !/^>(?!>)/.test(text) && !/^\[\/?접기(?:\s|\])/.test(text)
      && text.toUpperCase() !== '[HR4]' && text.toUpperCase() !== '[GAP]' && !isPureDialogueLine(text, settings);
  };
  const isDialogueLine = raw => raw !== undefined
    && isPureDialogueLine(String(raw).trim().replace(/^\[C\]\s*/i, ''), settings);
  const isHeadingLine = raw => raw !== undefined
    && !!parseBodyHeading(String(raw).trim().replace(/^\[C\]\s*/i, ''));
  renderLines.forEach((line, i) => {
    const centeredSyntax = /^\[C\]\s*/i.test(line);
    const structuralLine = centeredSyntax ? line.replace(/^\[C\]\s*/i, '') : line;
    // ----- 수동 접기 열기 -----
    const openMatch = structuralLine.match(/^\[접기(?:\s+(.+?))?\]$/);
    if(openMatch && manualBuf === null){
      manualTitle = (openMatch[1] || '접기').trim();
      manualForceCenter = centeredSyntax;
      manualBuf = '';
      return;
    }
    // ----- 일부 접기 닫기 -----
    if(/^\[\/접기\]$/.test(line)){
      if(manualBuf !== null){ closeManual(); return; }
      return; // 열린 접기가 없으면 무시
    }
    const isHR = isSep(line);
    const nextIsHR = !isHR && renderLines[i + 1] !== undefined && isSep(renderLines[i + 1]);
    const prevIsHR = !isHR && renderLines[i - 1] !== undefined && isSep(renderLines[i - 1]);
    const isStatus = isStatusBodyLine(line);
    const prevIsStatus = isStatus && renderLines[i - 1] !== undefined && isStatusBodyLine(renderLines[i - 1]);
    const nextIsStatus = isStatus && renderLines[i + 1] !== undefined && isStatusBodyLine(renderLines[i + 1]);
    // 연속 대사: 이 줄과 다음 줄이 모두 대사 단독 줄이면 간격을 좁혀 대화 리듬을 살림
    const tightBottom = !isHR && !nextIsHR && isPureDialogueLine(line, settings)
      && renderLines[i + 1] !== undefined && isPureDialogueLine(renderLines[i + 1], settings);
    const nextLine = renderLines[i + 1];
    const narrDialogueBoundary = (isNarrationLine(line) && isDialogueLine(nextLine))
      || (isDialogueLine(line) && isNarrationLine(nextLine));
    // 원문의 첫 줄이 아니라 실제로 출력되는 첫 요소를 기준으로 한다. 카드 앞에 빈 줄이나
    // 무시되는 닫기 마커가 있어도 첫 소제목의 위 여백이 다시 커지지 않게 한다.
    // 접기 블록 안은 자체 패딩을 가지므로 첫 요소 보정을 적용하지 않는다.
    const isFirst = bodyHTML === '' && manualBuf === null;
    const isLast = i === renderLines.length - 1;
    push(buildParagraph(line, settings, { extraBottom: nextIsHR, extraTop: prevIsHR, tightBottom, narrDialogueBoundary, isFirst, isLast, prevIsStatus, nextIsStatus,
      prevIsHeading:isHeadingLine(renderLines[i - 1]), nextIsHeading:isHeadingLine(renderLines[i + 1]),
      prevIsNarration:isNarrationLine(renderLines[i - 1]),
      }));
  });

  // 닫는 마커 없이 끝났으면 카드 끝에서 닫는다.
  closeManual();
  return bodyHTML;
}

// 로그 표제 밴드: 번호/제목/부제 — 대표 이미지 바로 아래, 첫 카드 위에 붙는 표지 영역.
// 카드 밖에 있어서 첫 카드를 접어도 이미지와 함께 항상 보임.
function buildTitleBlock(settings, hasImg, connectedAbove = false, connectedBelow = false){
  if(!settings.logTitleOn) return '';
  const num = (settings.logNumber || '').trim();
  const title = (settings.logTitle || '').trim();
  // 부제 = [캐릭터 ×/&/· 유저] · [자유 부제] — 한쪽만 있으면 그것만,
  // 둘 다 있으면 자유 부제 구분점과 같은 서식의 ·로 연결한다.
  const sc = (settings.subChar || '').trim();
  const su = (settings.subUser || '').trim();
  const free = (settings.logSubtitle || '').trim();
  const hasSubtitle = Boolean(sc || su || free);
  if(!num && !title && !hasSubtitle) return '';
  const pal = tonePalette(settings);
  const sm = spacingMult(settings);
  const imageBackground = titleImageBackgroundEnabled(settings);
  const textColor = imageBackground ? '#f8f8f8' : pal.heading[1];
  const mutedColor = imageBackground ? '#e1e1e1' : pal.caption;
  const emphasisColor = imageBackground ? '#ffffff' : settings.emphasisColor;
  const processedNum = processInline(num, emphasisColor);
  const processedTitle = processInline(title, emphasisColor);
  const processedSc = processInline(sc, emphasisColor);
  const processedSu = processInline(su, emphasisColor);
  // 부제의 BOT·USER 의미와 입력 순서는 프로필 배치 순서와 독립적이다.
  const orderedNameHTML = [sc ? processedSc : '', su ? processedSu : ''];
  const coupleSeparator = escapeTextHTML(normalizeSubtitleCoupleSeparator(settings.subtitleCoupleSeparator));
  const coupleHTML = orderedNameHTML.filter(Boolean).join(` ${coupleSeparator} `);
  const freeHTML = processInline(free, emphasisColor);
  const subHTML = coupleHTML && freeHTML
    ? `${coupleHTML} · ${freeHTML}`
    : (coupleHTML || freeHTML);
  let inner = '';
  if(num)   inner += `<p style="margin:0 0 6px 0; font-size:11px; font-weight:700; letter-spacing:3px; color:${mutedColor}; font-family:${fontStack(settings.narrFont)};">${processedNum}</p>`;
  if(title) inner += `<p style="margin:0; font-size:${settings.titleSize}px; font-weight:${settings.titleBold ? 800 : 500}; letter-spacing:-0.3px; line-height:1.35; color:${textColor}; font-family:${fontStack(settings.narrFont)};">${processedTitle}</p>`;
  if(hasSubtitle) inner += `<p style="box-sizing:border-box; width:100%; margin:${title ? 8 : 0}px 0 0 0; padding-left:0.5px; text-align:center; font-size:12px; letter-spacing:0.5px; color:${mutedColor}; font-family:${fontStack(settings.narrFont)};">${subHTML}</p>`;
  // 이미지가 있으면 이미지 아래 밀착(위 모서리 각짐, 이미지와의 경계는 옅은 선),
  // 없으면 밴드가 맨 위가 되므로 위 모서리를 둥글게
  const showOuterBorder = settings.cardBorderOn !== false;
  const outerBorderColor = imageBackground && outputThemeTransparent(settings.outputTheme)
    ? 'rgba(128,128,128,.22)' : pal.shellBorder;
  const sideBorders = showOuterBorder
    ? `border-left:1px solid ${outerBorderColor}; border-right:1px solid ${outerBorderColor};`
    : '';
  const topEdge = hasImg
    ? ``
    : `${showOuterBorder && !connectedAbove ? `border-top:1px solid ${outerBorderColor};` : ''} border-radius:${connectedAbove ? 0 : cardCornerRadiusPx(settings)}px ${connectedAbove ? 0 : cardCornerRadiusPx(settings)}px 0 0;`;
  // 단색 미니멀 표제는 하단 여백을 줄이되, 사진 배경 표제는 기본·미니멀의
  // 중심축을 같게 유지한다. 사진 높이는 같아도 하단 패딩이 달라지면 라벨이 움직인다.
  const extraVerticalSpace = coverVerticalSpacePx(settings);
  const padTop = Math.round(22*sm) + extraVerticalSpace;
  const padBottom = titleBottomPaddingPx(
    settingFlagOn(settings.titleMinimal), imageBackground, sm, extraVerticalSpace
  );
  const inlinePadding = cardInlinePaddingCss(settings);
  const W = parseInt(settings.cardWidth) || 750;
  const xValue = Number(settings.xpos);
  const yValue = Number(settings.ypos);
  const xpos = Number.isFinite(xValue) ? Math.min(100, Math.max(0, xValue)) : 50;
  const ypos = Number.isFinite(yValue) ? Math.min(100, Math.max(0, yValue)) : 0;
  const imageStyle = imageBackground
    ? `background-color:#303030; background-image:url('${escapeCssUrl(settings.imgUrl)}'); background-repeat:no-repeat; background-position:${xpos}% ${ypos}%; background-size:cover; background-clip:padding-box; overflow:hidden;`
    : `background-color:${pal.cardBg};`;
  const seamlessBottom = imageBackground && connectedBelow
    ? 'border-bottom:0 !important; border-bottom-width:0 !important; border-bottom-style:none !important; border-bottom-color:transparent !important; outline:0 !important; box-shadow:none !important; background-clip:border-box !important;'
    : '';
  const imageHeightValue = Number(settings.imgHeight);
  const imageHeight = Number.isFinite(imageHeightValue) ? Math.min(600, Math.max(100, imageHeightValue)) : 300;
  const titleContent = imageBackground
    ? `<div data-mosaic-photo-overlay="true" style="box-sizing:border-box; width:100%; padding:${padTop}px ${inlinePadding} ${padBottom}px; background-color:rgba(0,0,0,.56);"><div style="box-sizing:border-box; width:100%; height:${Math.max(0, imageHeight - padTop - padBottom)}px; display:table; table-layout:fixed;"><div style="display:table-cell; vertical-align:middle; text-align:center;">${inner}</div></div></div>`
    : inner;
  const titlePadding = imageBackground ? '0' : `${padTop}px ${inlinePadding} ${padBottom}px`;
  return `<div data-mosaic-title="true" ${imageBackground ? 'data-mosaic-image-background="true"' : ''} style="font-family:${fontStack(settings.narrFont)}; width:100%; max-width:${W}px; box-sizing:border-box; margin:0 auto; ${imageStyle} ${sideBorders} ${topEdge} ${seamlessBottom} padding:${titlePadding}; text-align:center; overflow-wrap:anywhere; word-break:break-word;">${titleContent}</div>
`;
}

// 프로필 이미지는 아카라이브가 position:absolute/overflow:hidden 조합을 정리해도
// 깨지지 않도록 단일 고정 크기 배경 요소로 출력한다. 이미지 방향을 확인한 뒤에는
// cover 기준 확대 배율도 가로·세로 사진에 맞게 안전한 background-size로 변환한다.
const profileImageDimensions = new Map();
function profileImageBackgroundSize(url, zoom){
  if(zoom <= 100) return 'cover';
  const dimensions = profileImageDimensions.get(normalizeProtocolRelativeUrl(url));
  if(!dimensions || !dimensions.width || !dimensions.height) return 'cover';
  return dimensions.width >= dimensions.height ? `auto ${zoom}%` : `${zoom}% auto`;
}

function resolveProfileJoinState({profilePlacement, showcase, portraitPhotoBackgroundOnly, profileCount, profileGap}){
  const joinedPortraitPhotos = portraitPhotoBackgroundOnly && profileGap === 0;
  const joinedCompactProfiles = !showcase && profileCount > 1 && profileGap === 0;
  const joinedShowcaseProfiles = showcase && profileCount > 1 && profileGap === 0;
  const joinedProfileItems = joinedPortraitPhotos || joinedCompactProfiles || joinedShowcaseProfiles;
  return {
    joinedPortraitPhotos,
    joinedCompactProfiles,
    joinedShowcaseProfiles,
    joinedProfileItems,
    borderlessTopProfile:profilePlacement === 'top' && joinedProfileItems
  };
}

function profileRowLengths(profileCount){
  if(profileCount <= 0) return [];
  if(profileCount <= 3) return [profileCount];
  return profileCount === 4 ? [2, 2] : [2, 3];
}

function profileLogicalRowAt(index, rowLengths){
  let start = 0;
  for(const length of rowLengths){
    if(index < start + length) return { start, length, position:index - start };
    start += length;
  }
  return { start:0, length:1, position:0 };
}

function profileDisplayRowAt(index, columns, rowLengths){
  const logical = profileLogicalRowAt(index, rowLengths);
  const offset = Math.floor(logical.position / columns) * columns;
  const start = logical.start + offset;
  const length = Math.min(columns, logical.length - offset);
  return {
    start,
    length,
    position:index - start,
    indices:Array.from({ length }, (_, position) => start + position)
  };
}

// 모서리·사진 접합선 모두 동일한 3→2→1열 행을 기준으로 판단한다.
function profileDisplayRows(columns, rowLengths){
  const rows = [];
  let start = 0;
  rowLengths.forEach(length => {
    for(let offset = 0; offset < length; offset += columns){
      rows.push(Array.from({length:Math.min(columns, length - offset)}, (_, position) =>
        start + offset + position
      ));
    }
    start += length;
  });
  return rows;
}

function profileRowSeamFlagsAt(index, columns, rowLengths, rows = profileDisplayRows(columns, rowLengths)){
  const rowIndex = rows.findIndex(row => row.includes(index));
  const row = rows[rowIndex] || [];
  const position = row.indexOf(index);
  return {
    right:position >= 0 && position < row.length - 1,
    top:rowIndex > 0
  };
}

function responsiveProfileSeamWidth(values, fallbackWidth){
  const [narrow, medium, wide] = values.map(value => Number(Boolean(value)));
  const fallback = fallbackWidth >= 690 ? wide : fallbackWidth >= 500 ? medium : narrow;
  const responsive = unit => {
    if(narrow === medium && medium === wide) return `${narrow}px`;
    const steps = [`${narrow}px`];
    const mediumDifference = medium - narrow;
    const wideDifference = wide - medium;
    if(mediumDifference){
      steps.push(`${mediumDifference > 0 ? '+' : '-'} clamp(0px, calc(100${unit} - 499px), 1px)`);
    }
    if(wideDifference){
      steps.push(`${wideDifference > 0 ? '+' : '-'} clamp(0px, calc(100${unit} - 689px), 1px)`);
    }
    return `clamp(0px, calc(${steps.join(' ')}), 1px)`;
  };
  return {
    fallback:`${fallback}px`,
    viewport:responsive('vw'),
    container:responsive('cqw')
  };
}

function profilePhotoRowJoinAt(profiles, index, columns, rowLengths, showcase){
  const hasPhotoBackground = profileIndex => {
    const profile = profiles[profileIndex];
    return Boolean(profile && profile.image && profile.backgroundOn);
  };
  // 가로로 이어졌던 사진 묶음은 1열에서 낱장으로 취급하지 않고 세로 묶음으로
  // 바꾼다. 원래 논리 행 전체가 사진이면 2~3명을 모두 잇고, 혼합 3인 행이
  // 2열에서 사진 둘만 이어졌다면 그 둘만 세로로 이어 둔다.
  if(showcase && columns === 1){
    const logical = profileLogicalRowAt(index, rowLengths);
    const logicalIndices = Array.from(
      { length:logical.length }, (_, position) => logical.start + position
    );
    let group = logicalIndices.length > 1 && logicalIndices.every(hasPhotoBackground)
      ? logicalIndices
      : [];
    if(!group.length){
      const offset = Math.floor(logical.position / 2) * 2;
      const mediumGroup = logicalIndices.slice(offset, offset + 2);
      if(mediumGroup.length > 1 && mediumGroup.every(hasPhotoBackground)) group = mediumGroup;
    }
    if(group.includes(index)){
      return {
        start:group[0],
        length:group.length,
        position:group.indexOf(index),
        indices:group,
        joined:true,
        axis:'vertical'
      };
    }
  }
  const row = profileDisplayRowAt(index, columns, rowLengths);
  const joined = showcase && row.length > 1 && row.indices.every(hasPhotoBackground);
  return { ...row, joined, axis:'horizontal' };
}

// 상단 프로필: 역할·표시 이름·정보를 분리한다.
// 아카라이브가 flex 정렬 속성을 선택적으로 제거하는 환경을 고려해 프로필 출력에는
// flex/grid를 쓰지 않고 block·inline-block·table-cell만 사용한다.
function buildProfileBlock(settings, connectedAbove, removeTopDivider, connectedBelow = false){
  if(!settings.profileOn) return '';
  const commonEnabled = settings.profileCommonOn !== false;
  const relationship = commonEnabled ? (settings.profileRelationship || '').trim() : '';
  const situation = commonEnabled ? (settings.profileSituation || '').trim().replace(/(^|[\s,，])#+(?=\S)/g, '$1') : '';
  let profiles = [
    {
      role:settings.profileCharRole ?? 'BOT', key:'bot', prefix:'profileChar',
      enabled:settings.profileCharOn !== false,
      image:usableProfileImage(settings.profileCharImage, settings.profileCharImageFailed),
      backgroundOn:settings.profileImageBackgroundOn,
      scale:settings.profileCharScale,
      x:settings.profileCharX,
      y:settings.profileCharY,
      name:(settings.profileCharName || '').trim(),
      desc:(settings.profileCharDesc || '').trim(),
      tags:(settings.profileCharTags || '').trim(),
      color:settings.charColor
    },
    {
      role:settings.profileUserRole ?? 'USER', key:'user', prefix:'profileUser',
      enabled:settings.profileUserOn !== false,
      image:usableProfileImage(settings.profileUserImage, settings.profileUserImageFailed),
      backgroundOn:settings.profileImageBackgroundOn,
      scale:settings.profileUserScale,
      x:settings.profileUserX,
      y:settings.profileUserY,
      name:(settings.profileUserName || '').trim(),
      desc:(settings.profileUserDesc || '').trim(),
      tags:(settings.profileUserTags || '').trim(),
      color:settings.userColor
    }
  ];
  profiles.push(...(settings.profileExtras || []).slice(0, 3).map(extra => ({
    ...extra,
    image:usableProfileImage(extra.image, extra.imageFailed),
    backgroundOn:settings.profileImageBackgroundOn,
    color:settings.narrColor || '#555555'
  })));
  const profileOrder = normalizeProfileEntityOrder(
    settings.profileEntityOrder,
    (settings.profileExtras || []).length,
    settings.profileOrder
  );
  const profilesByKey = new Map(profiles.map(profile => [profile.key, profile]));
  profiles = profileOrder
    .map(key => profilesByKey.get(key))
    .filter(profile => profile && profile.enabled && (profile.image || profile.name || profile.desc || profile.tags));
  if(!profiles.length && !relationship && !situation) return '';

  const pal = tonePalette(settings);
  const commonBoxBg = mixHex(pal.cardBg, pal.boxBg, 0.52);
  const W = parseInt(settings.cardWidth) || 750;
  const cardRadius = cardCornerRadiusPx(settings);
  const showcase = settings.profileStyle === 'showcase';
  const large = settings.profileStyle === 'portrait' || showcase;
  const portraitPhotoBackgroundOnly = showcase && profiles.length > 0
    && profiles.every(profile => profile.image && profile.backgroundOn);
  const responsivePortraitBackground = portraitPhotoBackgroundOnly && profiles.length > 1;
  const defaultProfileGap = showcase ? (portraitPhotoBackgroundOnly ? 0 : 2) : 10;
  const profileGap = settings.profilePlacement === 'top' && profiles.length > 1
    ? Math.max(0, defaultProfileGap + profileItemGapDeltaPx(settings))
    : defaultProfileGap;
  const {
    joinedPortraitPhotos,
    joinedCompactProfiles,
    joinedShowcaseProfiles,
    joinedProfileItems,
    borderlessTopProfile
  } = resolveProfileJoinState({
    profilePlacement:settings.profilePlacement,
    showcase,
    portraitPhotoBackgroundOnly,
    profileCount:profiles.length,
    profileGap
  });
  // 기본 포트레이트는 기존처럼 투명하다. 사진 배경의 단색 대체 면과
  // 간격 0으로 묶인 면만 회색을 유지하며, 기본 스타일까지 덮지 않는다.
  const profileCardBg = showcase && !settings.profileImageBackgroundOn && !joinedShowcaseProfiles
    ? 'transparent' : pal.boxBg;
  const showOuterBorder = settings.cardBorderOn !== false && !borderlessTopProfile;
  const border = showOuterBorder
    ? (connectedAbove
        ? `border-left:1px solid ${pal.shellBorder}; border-right:1px solid ${pal.shellBorder}; ${connectedBelow ? '' : `border-bottom:1px solid ${pal.shellBorder};`} ${removeTopDivider ? '' : coverDividerTopCss(settings, pal.divider)}`
        : (connectedBelow
            ? `border-left:1px solid ${pal.shellBorder}; border-right:1px solid ${pal.shellBorder}; border-top:1px solid ${pal.shellBorder};`
            : `border:1px solid ${pal.shellBorder};`))
    : (connectedAbove && !removeTopDivider ? coverDividerTopCss(settings, pal.divider) : '');
  const radius = connectedAbove && connectedBelow ? '0' : (connectedAbove
    ? `0 0 ${cardRadius}px ${cardRadius}px`
    : (connectedBelow ? `${cardRadius}px ${cardRadius}px 0 0` : `${cardRadius}px`));
  const transparentProfileOuter = settings.profilePlacement === 'top'
    && settings.profileOuterBackground === 'transparent';
  const multiline = text => processInline(text, settings.emphasisColor).replace(/\r?\n/g, '<br>');
  const safeScale = value => {
    const scale = Number(value);
    return Number.isFinite(scale) ? Math.min(300, Math.max(100, Math.round(scale / 5) * 5)) : 100;
  };
  const safePosition = value => {
    const position = Number(value);
    return Number.isFinite(position) ? Math.min(100, Math.max(0, Math.round(position))) : 50;
  };
  const formatTags = raw => Array.from(new Set(String(raw).split(/[,，]/)
    .map(tag => tag.trim().replace(/^#+\s*/, ''))
    .filter(Boolean)))
    .slice(0, 3);
  // 750px 카드의 3열 칸은 안쪽 여백을 빼면 약 230~250px이다.
  // 2열의 각 칸이 그보다 좁아지지 않도록 안쪽 폭 500px까지 유지한다.
  const twoColumnContentBreakpoint = 500;
  const baseProfileCardHeight = large ? 116 : 80;
  // flex/grid 없이도 같은 줄의 카드 높이를 맞출 수 있도록, 출력 전에 각 프로필의
  // 이름·태그·정보가 차지할 줄 수를 보수적으로 계산한다. 아카라이브가 반응형 CSS를
  // 일부 정리해도 모든 카드에는 같은 최소 높이 숫자가 직접 들어가므로 결과가 유지된다.
  const visualTextWidth = (value, fontSize) => Array.from(stripMarkers(String(value || '')))
    .reduce((width, char) => {
      if(/\s/.test(char)) return width + fontSize * 0.35;
      if(/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u3400-\u9fff]/.test(char)) return width + fontSize;
      return width + fontSize * 0.58;
    }, 0);
  const estimatedWrappedLines = (value, availableWidth, fontSize) => String(value || '')
    .split(/\r?\n/)
    .reduce((lines, line) => lines + Math.max(1, Math.ceil(visualTextWidth(line, fontSize) / Math.max(40, availableWidth))), 0);
  const estimatedTagLines = (raw, availableWidth, fontSize) => {
    const widths = formatTags(raw).map(tag => visualTextWidth(tag, fontSize) + 13);
    if(!widths.length) return 0;
    let lines = 1;
    let used = 0;
    widths.forEach(width => {
      if(used > 0 && used + width > availableWidth){
        lines += 1;
        used = width;
      }else{
        used += width;
      }
    });
    return lines;
  };
  const estimatedUsableWidth = Math.max(280, Math.min(W, 750) - 40);
  const estimatedItemWidth = profiles.length > 1
    ? Math.max(190, (estimatedUsableWidth - profileGap * 2) / (profiles.length >= 3 ? 3 : 2))
    : estimatedUsableWidth;
  const estimateProfileCardHeight = profile => {
    const size = showcase ? 150 : (large ? 88 : 56);
    const imageTextSpacing = large ? 12 : 10;
    const cardInnerWidth = Math.max(120, estimatedItemWidth - 28);
    const textWidth = profile.image && profile.backgroundOn
      ? cardInnerWidth
      : showcase
      ? cardInnerWidth
      : (profile.image
        ? Math.max(80, cardInnerWidth - size - imageTextSpacing)
        : cardInnerWidth);
    const nameSize = large ? 14 : 12.5;
    const tagSize = large ? 10.5 : 10;
    const descSize = large ? 12 : 11.5;
    const tagsList = formatTags(profile.tags);
    let textHeight = settings.profileMinimal ? 0 : 9 * 1.35 + 3;
    if(profile.name) textHeight += estimatedWrappedLines(profile.name, textWidth, nameSize) * nameSize * 1.4;
    if(tagsList.length){
      if(profile.name) textHeight += 6;
      textHeight += estimatedTagLines(profile.tags, textWidth, tagSize) * tagSize * 1.5;
    }
    if(profile.desc){
      if(profile.name || tagsList.length) textHeight += 6;
      textHeight += estimatedWrappedLines(profile.desc, textWidth, descSize) * descSize * 1.55;
    }
    const verticalPadding = profile.image && profile.backgroundOn
      ? 16
      : showcase && profile.image
      ? 16
      : (profile.image ? (large ? 14 : 12) : (large ? 15 : 12));
    const contentHeight = profile.image && profile.backgroundOn
      ? textHeight
      : showcase && profile.image
      ? size + 10 + textHeight
      : Math.max(profile.image ? size : 0, textHeight);
    return Math.ceil(Math.max(baseProfileCardHeight, contentHeight + verticalPadding * 2 + 2));
  };
  const showcaseHasMixedImages = showcase
    && profiles.length > 1
    && profiles.some(profile => Boolean(profile.image))
    && profiles.some(profile => !profile.image);
  const sharedProfileCardHeight = profiles.length > 1 && (!showcase || showcaseHasMixedImages || responsivePortraitBackground)
    ? Math.max(baseProfileCardHeight, ...profiles.map(estimateProfileCardHeight))
    : baseProfileCardHeight;
  // 넓은 화면은 3 / 2+2 / 2+3을 따른다. DOM 행을 강제로 분리하지 않아
  // 중간 폭에서는 전체 인물이 2명씩 다시 흐르고, 안쪽 폭 500px 미만에서 한 명씩 놓인다.
  const rowLengths = profileRowLengths(profiles.length);
  const displayRows = [1, 2, 3].map(columns => profileDisplayRows(columns, rowLengths));
  const rowForIndex = index => profileLogicalRowAt(index, rowLengths);
  const partialPortraitPhotoRows = showcase && !portraitPhotoBackgroundOnly
    && profiles.some((profile, profileIndex) => profile.image && profile.backgroundOn
      && [1, 2, 3].some(columns => profilePhotoRowJoinAt(
        profiles, profileIndex, columns, rowLengths, showcase
      ).joined));
  const joinedProfileRadius = joinedProfileItems
    ? Math.max(0, cardRadius - (showOuterBorder ? 1 : 0)) : 0;
  const joinedProfileTopRadius = !connectedAbove ? joinedProfileRadius : 0;
  const joinedProfileBottomRadius = !connectedBelow && !relationship && !situation
    ? joinedProfileRadius : 0;
  const profileCornerWidth = W - (showOuterBorder ? 2 : 0);
  const profileSeamFallbackWidth = profileCornerWidth;
  const responsiveProfileLength = (values, maximum) => {
    const [narrow, medium, wide] = values;
    const fallback = profileCornerWidth >= 690 ? wide
      : profileCornerWidth >= twoColumnContentBreakpoint ? medium : narrow;
    if(narrow === medium && medium === wide){
      return { fallback:`${fallback}px`, responsive:`${narrow}px` };
    }
    const steps = [`${narrow}px`];
    const mediumDifference = medium - narrow;
    const wideDifference = wide - medium;
    if(mediumDifference){
      steps.push(`${mediumDifference > 0 ? '+' : '-'} clamp(0px, calc(100cqw - 499px), ${Math.abs(mediumDifference)}px)`);
    }
    if(wideDifference){
      steps.push(`${wideDifference > 0 ? '+' : '-'} clamp(0px, calc(100cqw - 689px), ${Math.abs(wideDifference)}px)`);
    }
    return {
      fallback:`${fallback}px`,
      responsive:`clamp(0px, calc(${steps.join(' ')}), ${maximum}px)`
    };
  };
  const partialPortraitLayoutAt = index => {
    const rows = [1, 2, 3].map(columns => profilePhotoRowJoinAt(
      profiles, index, columns, rowLengths, showcase
    ));
    return {
      rows,
      possible:!portraitPhotoBackgroundOnly && rows.some(row => row.joined)
    };
  };
  const partialPortraitItemCss = index => {
    const layout = partialPortraitLayoutAt(index);
    if(!layout.possible) return { wrapper:'', radius:'', seam:'' };
    const horizontalPadding = side => layout.rows.map((row, rowIndex) => {
      const columns = rowIndex + 1;
      if(columns === 1) return 0;
      if(!row.joined) return columns === 1 ? 0 : profileGap / 2;
      return side === 'left'
        ? (row.position === 0 ? profileGap / 2 : 0)
        : (row.position === row.length - 1 ? profileGap / 2 : 0);
    });
    const leftPadding = responsiveProfileLength(horizontalPadding('left'), profileGap / 2);
    const rightPadding = responsiveProfileLength(horizontalPadding('right'), profileGap / 2);
    const bottomPadding = responsiveProfileLength(layout.rows.map(row =>
      row.joined && row.axis === 'vertical' && row.position < row.length - 1
        ? 0 : profileGap
    ), profileGap);
    const radiusValues = key => layout.rows.map(row => {
      if(!row.joined) return 10;
      if(row.axis === 'vertical'){
        return key.startsWith('top')
          ? (row.position === 0 ? 10 : 0)
          : (row.position === row.length - 1 ? 10 : 0);
      }
      return key.endsWith('Left')
        ? (row.position === 0 ? 10 : 0)
        : (row.position === row.length - 1 ? 10 : 0);
    });
    const topLeftRadius = responsiveProfileLength(radiusValues('topLeft'), 10);
    const topRightRadius = responsiveProfileLength(radiusValues('topRight'), 10);
    const bottomRightRadius = responsiveProfileLength(radiusValues('bottomRight'), 10);
    const bottomLeftRadius = responsiveProfileLength(radiusValues('bottomLeft'), 10);
    const rightSeam = responsiveProfileSeamWidth(layout.rows.map(row =>
      row.joined && row.axis === 'horizontal' && row.position < row.length - 1
    ), profileSeamFallbackWidth);
    const bottomSeam = responsiveProfileSeamWidth(layout.rows.map(row =>
      row.joined && row.axis === 'vertical' && row.position < row.length - 1
    ), profileSeamFallbackWidth);
    const seamColor = 'rgba(128,128,128,.22)';
    return {
      wrapper:`padding-top:0; padding-bottom:${bottomPadding.fallback}; padding-bottom:${bottomPadding.responsive}; padding-left:${leftPadding.fallback}; padding-left:${leftPadding.responsive}; padding-right:${rightPadding.fallback}; padding-right:${rightPadding.responsive};`,
      radius:`border-radius:${topLeftRadius.fallback} ${topRightRadius.fallback} ${bottomRightRadius.fallback} ${bottomLeftRadius.fallback}; border-radius:${topLeftRadius.responsive} ${topRightRadius.responsive} ${bottomRightRadius.responsive} ${bottomLeftRadius.responsive};`,
      seam:`border-right:${rightSeam.fallback} solid ${seamColor}; border-right-width:${rightSeam.viewport}; border-right-width:${rightSeam.container}; border-bottom:${bottomSeam.fallback} solid ${seamColor}; border-bottom-width:${bottomSeam.viewport}; border-bottom-width:${bottomSeam.container};`
    };
  };
  // 브라우저가 게시용 inline style을 직렬화하면 cqw 선언과 고정 폴백이 한
  // border-radius 값으로 합쳐질 수 있다. 구형 모바일 WebView에서는 그 값 전체가
  // 무효가 되므로, 보이는 사진·배경 요소에 vw 기반 모서리를 직접 둔다.
  const profileCornersAt = (index, columns) => {
    const rows = displayRows[columns - 1];
    const first = rows[0] || [];
    const last = rows[rows.length - 1] || [];
    return {
      topLeft:index === first[0], topRight:index === first[first.length - 1],
      bottomLeft:index === last[0], bottomRight:index === last[last.length - 1]
    };
  };
  const profileCornerCss = index => {
    if(!joinedProfileRadius) return '';
    const layouts = [profileCornersAt(index, 1), profileCornersAt(index, 2), profileCornersAt(index, 3)];
    const cornerValue = (key, radius) => {
      if(!radius) return '0px';
      const values = layouts.slice(0, profileCornerWidth < 500 ? 1 : profileCornerWidth < 690 ? 2 : 3)
        .map(layout => Number(layout[key]));
      if(values.every(value => value === values[0])) return values[0] ? `${radius}px` : '0px';
      const rising = breakpoint => `clamp(0px,calc(10000vw - ${breakpoint * 100 - 16}px),${radius}px)`;
      const falling = breakpoint => `clamp(0px,calc(${breakpoint * 100}px - 10000vw),${radius}px)`;
      if(values.length === 2) return values[0] ? falling(500) : rising(500);
      if(values[0] === values[1]) return values[1] ? falling(690) : rising(690);
      if(values[1] === values[2]) return values[0] ? falling(500) : rising(500);
      return values[1]
        ? `min(${rising(500)},${falling(690)})`
        : `max(${falling(500)},${rising(690)})`;
    };
    return `border-radius:${cornerValue('topLeft', joinedProfileTopRadius)} ${cornerValue('topRight', joinedProfileTopRadius)} ${cornerValue('bottomRight', joinedProfileBottomRadius)} ${cornerValue('bottomLeft', joinedProfileBottomRadius)};`;
  };
  const previewCornerTokens = (index, columns) => {
    if(!joinedProfileRadius) return '';
    const corners = profileCornersAt(index, columns);
    return [
      joinedProfileTopRadius && corners.topLeft ? 'tl' : '',
      joinedProfileTopRadius && corners.topRight ? 'tr' : '',
      joinedProfileBottomRadius && corners.bottomRight ? 'br' : '',
      joinedProfileBottomRadius && corners.bottomLeft ? 'bl' : ''
    ].filter(Boolean).join(' ');
  };
  // 간격 0으로 한 덩어리가 된 프로필은 사진 면이 닿는 변에만 반투명선을
  // 그린다. 사진 없는 회색 카드끼리는 미니·클래식·포트레이트 모두 한 면으로 잇는다.
  const joinedProfileSeam = index => {
    const joinedMixedShowcase = joinedShowcaseProfiles && !portraitPhotoBackgroundOnly;
    if(!joinedCompactProfiles && !joinedMixedShowcase) return '';
    const hasPhotoBackground = profileIndex => Boolean(profiles[profileIndex].image && profiles[profileIndex].backgroundOn);
    const flagsAt = columns => {
      const rows = displayRows[columns - 1];
      const rowIndex = rows.findIndex(row => row.includes(index));
      const row = rows[rowIndex];
      const position = row.indexOf(index);
      const rightNeighbor = row[position + 1];
      const right = rightNeighbor !== undefined
        && (hasPhotoBackground(index) || hasPhotoBackground(rightNeighbor));
      const nextRow = rows[rowIndex + 1];
      const bottom = Boolean(nextRow && (hasPhotoBackground(index)
        || nextRow.some((candidate, candidatePosition) =>
          hasPhotoBackground(candidate)
          && position / row.length < (candidatePosition + 1) / nextRow.length
          && (position + 1) / row.length > candidatePosition / nextRow.length)));
      return { right, bottom };
    };
    const narrow = flagsAt(1);
    const medium = flagsAt(2);
    const wide = flagsAt(3);
    const fallback = W - (showOuterBorder ? 2 : 0) >= 690 ? wide
      : W - (showOuterBorder ? 2 : 0) >= twoColumnContentBreakpoint ? medium : narrow;
    const rightWidth = responsiveProfileSeamWidth(
      [narrow.right, medium.right, wide.right], profileSeamFallbackWidth
    );
    const bottomWidth = responsiveProfileSeamWidth(
      [narrow.bottom, medium.bottom, wide.bottom], profileSeamFallbackWidth
    );
    const seamColor = 'rgba(128,128,128,.22)';
    return `border-right:${Number(fallback.right)}px solid ${seamColor}; border-right-width:${rightWidth.viewport}; border-right-width:${rightWidth.container}; border-bottom:${Number(fallback.bottom)}px solid ${seamColor}; border-bottom-width:${bottomWidth.viewport}; border-bottom-width:${bottomWidth.container};`;
  };
  const profileItems = profiles.map((profile, profileIndex) => {
    const profileFieldPrefix = profile.prefix;
    const row = rowForIndex(profileIndex);
    const cornerCss = profileCornerCss(profileIndex);
    const imageBackground = Boolean(profile.image && profile.backgroundOn);
    const partialPortraitCss = imageBackground
      ? partialPortraitItemCss(profileIndex)
      : { wrapper:'', radius:'', seam:'' };
    const textAlign = showcase || imageBackground ? 'center' : (profile.image ? 'left' : 'center');
    const emphasisColor = imageBackground ? '#ffffff' : settings.emphasisColor;
    const nameColor = imageBackground ? '#ffffff' : profile.color;
    const secondaryColor = imageBackground ? '#eeeeee' : softBodyTextColor(settings, profile.color);
    const role = settings.profileMinimal || !profile.role.trim()
      ? ''
      : `<p data-mosaic-profile-field="${profileFieldPrefix}Role" style="margin:0 0 3px; color:${secondaryColor}; font-size:9px; font-weight:700; line-height:1.35; letter-spacing:1.4px; text-align:${textAlign};">${escapeHTML(profile.role)}</p>`;
    const profileNameHTML = processInline(profile.name, emphasisColor).replace(/\r?\n/g, '<br>');
    const name = profile.name
      ? `<p data-mosaic-profile-field="${profileFieldPrefix}Name" style="margin:0; color:${nameColor}; font-size:${large ? 14 : 12.5}px; font-weight:700; line-height:1.4; letter-spacing:-0.1px; text-align:${textAlign};">${profileNameHTML}</p>`
      : '';
    const tagsList = formatTags(profile.tags);
    const chipBg = imageBackground ? 'rgba(0,0,0,.38)' : accentTint(settings.bgColor, profile.color);
    // 아카라이브 편집기는 문장 서식을 바꿀 때 인접한 동일 스타일 span과 보이지 않는
    // 구분 요소까지 정리해 하나의 span으로 합칠 수 있다. 칩과 칩 목록을 각각 독립 div로
    // 만들면 인라인 서식 병합이 블록 경계를 넘을 수 없어 세 칩의 배경과 간격이 보존된다.
    const tags = tagsList.length
      ? `<div style="margin:${profile.name ? 6 : 0}px 0 -3px; color:${nameColor}; font-size:${large ? 10.5 : 10}px; font-weight:400; line-height:1.5; letter-spacing:-0.1px; text-align:${textAlign};">${tagsList.map((tag, tagIndex) => `<div data-mosaic-profile-field="${profileFieldPrefix}Tag${tagIndex + 1}" style="display:inline-block; margin:0 3px 3px 0; padding:1px 5px; border-radius:999px; background-color:${chipBg}; line-height:1.5; vertical-align:top; white-space:nowrap;">${processInline(tag, emphasisColor)}</div>`).join('')}</div>`
      : '';
    const desc = profile.desc
      ? `<p data-mosaic-profile-field="${profileFieldPrefix}Desc" style="box-sizing:border-box; width:100%; margin:${profile.name || tagsList.length ? 6 : 0}px 0 0; color:${secondaryColor}; font-size:${large ? 12 : 11.5}px; font-weight:400; line-height:1.55; letter-spacing:-0.1px; text-align:${textAlign}; overflow-wrap:anywhere; word-break:break-word; white-space:normal; font-family:${fontStack(settings.narrFont)};">${processInline(profile.desc, emphasisColor).replace(/\r?\n/g, '<br>')}</p>`
      : '';
    const text = `${role}${name}${tags}${desc}`;
    // 3칸 행은 안쪽 폭 690px 이상에서 3열, 500~689px에서 2열, 그 아래에서 1열이다.
    // 2칸 행은 안쪽 폭 500px에서 2열→1열로 바뀐다. 출력 HTML에서도 동작한다.
    // 첫 width:100%는 min()/max()가 제거되는 구형 WebView의 안전 폴백이다.
    const twoColumnBreakpoint = twoColumnContentBreakpoint + profileGap;
    const threeColumnBreakpoint = 690 + profileGap;
    // 홀수 인원의 마지막 카드는 2열에서 혼자 남으므로 한 명짜리 카드처럼 전폭을 쓴다.
    const fillsTwoColumnRow = row.length === 3
      && profileIndex === profiles.length - 1 && profiles.length % 2 === 1;
    const responsiveItemWidth = fillsTwoColumnRow
      ? `max(33.333333%, min(100%, calc(${threeColumnBreakpoint * 1000}px - 100000%)))`
      : row.length === 3
      ? `max(33.333333%, min(50%, calc(${threeColumnBreakpoint * 1000}px - 100000%)), min(100%, calc(${twoColumnBreakpoint * 1000}px - 100000%)))`
      : row.length === 2
      ? `max(50%, min(100%, calc(${twoColumnBreakpoint * 1000}px - 100000%)))`
      : '100%';
    // 모든 항목에 같은 절반 패딩을 주고 안쪽 격자를 그만큼 확장하면, 실제 카드의
    // 양끝은 원래 위치를 유지하면서 3열·2열·1열 어느 배치에서도 틈이 고르게 난다.
    const itemHalfGap = `clamp(0px, calc(100000% - ${(twoColumnBreakpoint - 1) * 1000}px), ${profileGap / 2}px)`;
    const itemOuterStyle = `box-sizing:border-box; width:100%; width:${responsiveItemWidth}; min-width:0; max-width:100%; display:inline-block; vertical-align:top; ${joinedProfileItems ? 'padding:0;' : partialPortraitCss.wrapper || `padding:0 ${itemHalfGap} ${profileGap}px;`} ${cornerCss ? `${cornerCss} overflow:hidden; --mosaic-profile-top-radius:${joinedProfileTopRadius}px; --mosaic-profile-bottom-radius:${joinedProfileBottomRadius}px;` : ''}`;
    const previewCorners = joinedProfileRadius
      ? `data-mosaic-profile-corners-narrow="${previewCornerTokens(profileIndex, 1)}" data-mosaic-profile-corners-medium="${previewCornerTokens(profileIndex, 2)}" data-mosaic-profile-corners-wide="${previewCornerTokens(profileIndex, 3)}" ` : '';
    const wrapProfileItem = content => `<div data-mosaic-profile-item="true" ${previewCorners}data-mosaic-profile-columns="${row.length}" ${fillsTwoColumnRow ? 'data-mosaic-profile-row-fill="true" ' : ''}data-mosaic-profile-role="${profile.key}" style="${itemOuterStyle}">${content}</div>`;
    const compactSeam = joinedProfileSeam(profileIndex);
    const compactRadius = joinedProfileItems ? 0 : 10;
    if(!profile.image){
      // iOS WebView는 width:100%인 CSS table 자체에 좌우 패딩이 있으면 그 패딩을
      // 표 폭 바깥에 다시 더해 내용을 오른쪽으로 민다. 패딩은 일반 block에 두고,
      // 패딩 없는 안쪽 table-cell만 세로 중앙 정렬에 사용한다.
      const emptyProfilePadding = large ? 15 : 12;
      const emptyProfileInnerHeight = Math.max(large ? 86 : 56, sharedProfileCardHeight - emptyProfilePadding * 2);
      return wrapProfileItem(`<div style="box-sizing:border-box; width:100%; min-height:${sharedProfileCardHeight}px; display:block; padding:${emptyProfilePadding}px 14px; background-color:${profileCardBg}; border-radius:${compactRadius}px; ${cornerCss}${compactSeam} text-align:center; word-break:break-word;"><div style="box-sizing:border-box; width:100%; min-height:${emptyProfileInnerHeight}px; height:${emptyProfileInnerHeight}px; display:table; table-layout:fixed;"><div style="display:table-cell; vertical-align:middle; text-align:center; font-family:${fontStack(settings.narrFont)};">${text}</div></div></div>`);
    }
    const size = showcase ? 150 : (large ? 88 : 56);
    const zoom = safeScale(profile.scale);
    const imageX = safePosition(profile.x);
    const imageY = safePosition(profile.y);
    const imagePosition = `${imageX}% ${imageY}%`;
    if(imageBackground){
      const backgroundPadding = large ? 16 : 14;
      const stackedHeight = Math.max(184, sharedProfileCardHeight);
      const wideHeight = showcase ? Math.max(216, sharedProfileCardHeight) : sharedProfileCardHeight;
      const stackedInnerHeight = Math.max(large ? 86 : 56, stackedHeight - backgroundPadding * 2);
      const wideInnerHeight = Math.max(large ? 86 : 56, wideHeight - backgroundPadding * 2);
      // 행마다 같은 열 전환 경계에서 여러 칸은 216px, 한 칸으로 쌓이면 184px이 된다.
      // cqw가 제거되는 환경에서는 세로 배치 높이를 안전한 기본값으로 남긴다.
      const heightBreakpoint = twoColumnContentBreakpoint;
      const responsiveHeight = (narrow, wide) => `clamp(${narrow}px, calc(10000cqw - ${heightBreakpoint * 100 - 100 - narrow}px), ${wide}px)`;
      const outerHeightCss = responsivePortraitBackground
        ? `min-height:${stackedHeight}px; min-height:${responsiveHeight(stackedHeight, wideHeight)};`
        : `min-height:${wideHeight}px;`;
      const innerHeightCss = responsivePortraitBackground
        ? `min-height:${stackedInnerHeight}px; min-height:${responsiveHeight(stackedInnerHeight, wideInnerHeight)}; height:${stackedInnerHeight}px; height:${responsiveHeight(stackedInnerHeight, wideInnerHeight)};`
        : `min-height:${wideInnerHeight}px; height:${wideInnerHeight}px;`;
      // 한 줄에 3→2→1명 또는 2→1명으로 바뀌어도 실제로 닿는 변에만 선을 둔다.
      // 가로선은 윗줄 사진의 아래 테두리가 아니라 다음 줄 사진의 위 테두리에 둔다.
      // 아래 사진이 나중에 칠해져도 선이 가려지지 않으며 사진 높이도 그대로다.
      // cqw가 없는 환경에서는 현재 카드 폭을 기준으로 계산한 선을 폴백으로 쓴다.
      const seamLayouts = [1, 2, 3].map(columns =>
        profileRowSeamFlagsAt(profileIndex, columns, rowLengths, displayRows[columns - 1])
      );
      const rightSeam = responsiveProfileSeamWidth(
        seamLayouts.map(layout => layout.right), profileSeamFallbackWidth
      );
      const topSeam = responsiveProfileSeamWidth(
        seamLayouts.map(layout => layout.top), profileSeamFallbackWidth
      );
      // 사진은 선 아래까지 칠하고, 접합선만 반투명하게 얹는다.
      const photoJointColor = 'rgba(128,128,128,.22)';
      const photoJointBorder = joinedPortraitPhotos && profiles.length > 1
        ? `border-right:${rightSeam.fallback} solid ${photoJointColor}; border-right-width:${rightSeam.viewport}; border-right-width:${rightSeam.container}; border-top:${topSeam.fallback} solid ${photoJointColor}; border-top-width:${topSeam.viewport}; border-top-width:${topSeam.container};`
        : joinedShowcaseProfiles ? '' : partialPortraitCss.seam;
      const textVerticalAlign = settings.profileTextPosition === 'top' ? 'top'
        : settings.profileTextPosition === 'bottom' ? 'bottom' : 'middle';
      return wrapProfileItem(`<div data-mosaic-image-background="true" data-mosaic-profile-image-field="${profileFieldPrefix}Image" style="box-sizing:border-box; width:100%; ${outerHeightCss} display:block; padding:0; background-color:#303030; background-image:url('${escapeCssUrl(profile.image)}'); background-repeat:no-repeat; background-position:${imagePosition}; background-size:${profileImageBackgroundSize(profile.image, zoom)}; background-origin:border-box; border-radius:${joinedProfileItems ? 0 : portraitPhotoBackgroundOnly ? cardRadius : 10}px; ${partialPortraitCss.radius}${cornerCss}${photoJointBorder}${compactSeam} text-align:center; overflow:hidden; overflow-wrap:anywhere; word-break:break-word;"><div data-mosaic-photo-overlay="true" style="box-sizing:border-box; width:100%; padding:${backgroundPadding}px 14px; background-color:rgba(0,0,0,.58);"><div style="box-sizing:border-box; width:100%; ${innerHeightCss} display:table; table-layout:fixed;"><div style="display:table-cell; vertical-align:${textVerticalAlign}; text-align:center; font-family:${fontStack(settings.narrFont)};">${text}</div></div></div></div>`);
    }
    const imageRadius = showcase ? '12px' : (large ? '10px' : '50%');
    const image = `<div data-mosaic-profile-image-field="${profileFieldPrefix}Image" aria-hidden="true" style="display:${showcase ? 'inline-block' : 'block'}; width:${size}px; min-width:${size}px; max-width:${size}px; height:${size}px; min-height:${size}px; max-height:${size}px; margin:0; vertical-align:top; background-color:${pal.boxBg}; background-image:url('${escapeCssUrl(profile.image)}'); background-repeat:no-repeat; background-position:${imagePosition}; background-size:${profileImageBackgroundSize(profile.image, zoom)}; border-radius:${imageRadius};"></div>`;
    if(showcase){
      const showcaseContent = `${image}<div style="box-sizing:border-box; width:100%; margin-top:10px; font-family:${fontStack(settings.narrFont)}; text-align:center;">${text}</div>`;
      if(showcaseHasMixedImages){
        const showcaseInnerHeight = Math.max(size, sharedProfileCardHeight - 32);
        return wrapProfileItem(`<div style="box-sizing:border-box; width:100%; min-height:${sharedProfileCardHeight}px; padding:16px 14px; background-color:${profileCardBg}; border-radius:${compactRadius}px; ${cornerCss}${compactSeam} overflow-wrap:anywhere; word-break:break-word; text-align:center;"><div style="box-sizing:border-box; width:100%; min-height:${showcaseInnerHeight}px; height:${showcaseInnerHeight}px; display:table; table-layout:fixed;"><div style="display:table-cell; vertical-align:middle; text-align:center;"><div style="box-sizing:border-box; width:100%; text-align:center;">${showcaseContent}</div></div></div></div>`);
      }
      return wrapProfileItem(`<div style="box-sizing:border-box; width:100%; padding:16px 14px; background-color:${profileCardBg}; border-radius:${compactRadius}px; ${cornerCss}${compactSeam} overflow-wrap:anywhere; word-break:break-word; text-align:center;">${showcaseContent}</div>`);
    }
    const imageTextSpacing = large ? 12 : 10;
    const imageColumnWidth = size + imageTextSpacing;
    // 미니·클래식은 사진 칸과 실제 텍스트 폭을 하나의 inline-table로 묶어 카드의
    // 정중앙에 놓는다. 기존 width:100% 표는 남는 텍스트 셀까지 묶음 폭으로 계산해
    // 사진이 있는 프로필만 왼쪽으로 치우쳐 보였다. 실제 table 태그는 사용하지 않아
    // 아카라이브의 게시판 표 테두리 스타일도 적용되지 않는다.
    const imageProfilePadding = large ? 14 : 12;
    const imageProfileInnerHeight = Math.max(size, sharedProfileCardHeight - imageProfilePadding * 2);
    return wrapProfileItem(`<div style="box-sizing:border-box; width:100%; min-height:${sharedProfileCardHeight}px; padding:${imageProfilePadding}px 14px; background-color:${profileCardBg}; border-radius:${compactRadius}px; ${cornerCss}${compactSeam} overflow-wrap:anywhere; word-break:break-word; text-align:center;"><div style="box-sizing:border-box; width:100%; min-height:${imageProfileInnerHeight}px; height:${imageProfileInnerHeight}px; display:table; table-layout:fixed;"><div style="display:table-cell; vertical-align:middle; text-align:center;"><div style="box-sizing:border-box; width:auto; max-width:100%; display:inline-table; table-layout:auto; margin:0; vertical-align:middle; text-align:left;"><div style="box-sizing:border-box; display:table-cell; width:${imageColumnWidth}px; padding-right:${imageTextSpacing}px; vertical-align:middle;">${image}</div><div style="box-sizing:border-box; display:table-cell; width:auto; vertical-align:middle; font-family:${fontStack(settings.narrFont)}; overflow-wrap:anywhere; word-break:break-word;">${text}</div></div></div></div></div>`);
  });

  // 항목을 하나의 흐름에 놓아 최대 5명까지 2+3→2+2+1로 접힌다.
  const profileBreakpoint = rowLengths.some(length => length === 3) ? 690 : twoColumnContentBreakpoint;
  const outerHalfGap = `clamp(0px, calc(100000% - ${(twoColumnContentBreakpoint - 1) * 1000}px), ${profileGap / 2}px)`;
  const profileGrid = profileItems.length
    ? `<div data-mosaic-profile-grid="true" style="box-sizing:border-box; ${joinedProfileItems ? 'width:100%; margin-left:0; margin-bottom:0;' : `width:calc(100% + ${outerHalfGap} + ${outerHalfGap}); margin-left:calc(0px - ${outerHalfGap}); margin-bottom:-${profileGap}px;`} display:block; text-align:center; font-size:0; white-space:normal;">${profileItems.join('')}</div>`
    : '';
  const profileItemsRow = profileGrid
    // 행의 잘림은 보조 안전망이다. 실제 윗·아랫모서리는 사진/배경 면에 직접 둔다.
    ? `<div data-mosaic-profile-items="true" data-mosaic-profile-breakpoint="${profileBreakpoint}" style="box-sizing:border-box; width:100%; ${showcase ? 'max-width:100%; display:inline-block; vertical-align:top;' : 'display:block;'} ${responsivePortraitBackground || joinedProfileItems || partialPortraitPhotoRows ? 'container-type:inline-size;' : ''} ${joinedProfileTopRadius ? `border-radius:${joinedProfileTopRadius}px ${joinedProfileTopRadius}px 0 0;` : ''} overflow:hidden; text-align:center; font-size:0; white-space:normal;">${profileGrid}</div>`
    : '';
  // 아카라이브는 display:flex는 남기면서 justify-content를 무력화하는 경우가 있어
  // 포트레이트 묶음 전체가 왼쪽으로 치우친다. flex를 완전히 제거하고 게시판에서도
  // 안정적으로 유지되는 text-align:center + inline-block 조합만 사용한다.
  const profileRow = profileItemsRow
    ? (showcase
        ? `<div style="box-sizing:border-box; width:100%; display:block; text-align:center; font-size:0; white-space:normal;">${profileItemsRow}</div>`
        : profileItemsRow)
    : '';

  const relationshipItems = relationship
    .split(/[,，]/)
    .map(item => item.trim().replace(/^#+\s*/, ''))
    .filter(Boolean)
    .slice(0, 3);
  const relationshipDots = relationshipItems
    .map((item, index) => `<span data-mosaic-profile-field="profileRelationship${index + 1}">${multiline(item)}</span>`)
    .join(`<span aria-hidden="true" style="margin:0 5px;">·</span>`);
  const relationshipTextLength = relationshipItems
    .map(item => stripMarkers(item))
    .join(' · ')
    .length;
  const minimalRelationshipIsLong = relationshipTextLength > 30;
  const minimalRelationshipWrap = minimalRelationshipIsLong
    ? 'white-space:normal; overflow-wrap:normal !important; word-break:keep-all !important;'
    : 'white-space:nowrap; overflow-wrap:normal !important; word-break:keep-all !important;';

  // 아카라이브의 게시판 전역 table 스타일은 실제 table/td에 테두리를 강제로 만들고
  // 가운데 셀을 다시 압축한다. 구조 요소를 한 개의 일반 블록으로 줄이고, 블록 중앙에
  // 0.5px 배경선을 그린 뒤 문구 배경으로 가운데만 가리면 외부 table/flex CSS와 무관하게
  // 미리보기와 같은 간격을 유지할 수 있다.
  const minimalLineColor = mixHex(pal.cardBg, pal.divider, 0.82);
  const minimalRelationshipMaxWidth = minimalRelationshipIsLong ? 'max-width:60%;' : '';
  const minimalRelationshipRow = relationship
    ? `<div style="box-sizing:border-box; width:100%; margin:0; padding:0; border:0; text-align:center; background-color:transparent; ${transparentProfileOuter ? '' : `background-image:linear-gradient(to right, ${minimalLineColor}, ${minimalLineColor}); background-position:center center; background-repeat:no-repeat; background-size:100% 0.5px;`}"><span style="box-sizing:border-box; display:inline-block; ${minimalRelationshipMaxWidth} margin:0; padding:0 8px; border:0; background-color:${transparentProfileOuter ? 'transparent' : pal.cardBg} !important; color:${pal.caption}; font-size:10.5px; font-weight:400; line-height:1.3; letter-spacing:-0.1px; text-align:center; ${minimalRelationshipWrap}">${relationshipDots}</span></div>`
    : '';
  const minimalSituationRow = situation
    ? `<p data-mosaic-profile-field="profileSituation" style="margin:${relationship ? 8 : 0}px 0 0; color:${pal.caption}; font-size:11.5px; font-weight:400; line-height:1.6; letter-spacing:-0.1px; text-align:center;">${multiline(situation)}</p>`
    : '';

  const commonItems = settings.profileMinimal
    ? ((relationship || situation)
        ? `<div style="box-sizing:border-box; width:100%; padding:3px 14px 2px; text-align:center; word-break:break-word; font-size:0; font-family:${fontStack(settings.narrFont)};"><div style="box-sizing:border-box; width:100%; max-width:640px; display:inline-block; vertical-align:top; text-align:center;">${minimalRelationshipRow}${minimalSituationRow}</div></div>`
        : '')
    : [
        relationship
          ? `<div style="width:100%;"><div style="box-sizing:border-box; width:100%; padding:10px 14px 11px; background-color:${commonBoxBg}; border-radius:10px; text-align:center; word-break:break-word; font-family:${fontStack(settings.narrFont)};"><p style="margin:0 0 6px; color:${pal.caption}; font-size:9px; font-weight:700; line-height:1.35; letter-spacing:1.4px; text-align:center;">RELATIONSHIP</p><p style="margin:0; color:${pal.caption}; font-size:10.5px; font-weight:400; line-height:1.3; letter-spacing:-0.1px; text-align:center;">${relationshipDots}</p></div></div>`
          : '',
        situation
          ? `<div style="width:100%; margin-top:${relationship ? 10 : 0}px;"><div style="box-sizing:border-box; width:100%; padding:12px 14px; background-color:${commonBoxBg}; border-radius:10px; text-align:center; word-break:break-word;"><div style="font-family:${fontStack(settings.narrFont)};"><p style="margin:0 0 5px; color:${pal.caption}; font-size:9px; font-weight:700; line-height:1.35; letter-spacing:1.4px; text-align:center;">SITUATION</p><p data-mosaic-profile-field="profileSituation" style="margin:0; color:${pal.caption}; font-size:11.5px; font-weight:400; line-height:1.6; letter-spacing:-0.1px; text-align:center;">${multiline(situation)}</p></div></div></div>`
          : ''
      ].join('');

  const commonSection = commonItems
    ? `<div style="box-sizing:border-box; width:100%; margin-top:${profileRow ? 10 : 0}px; ${joinedProfileItems ? 'padding:0 clamp(14px,3.5vw,20px) clamp(14px,3vw,18px);' : ''}">${commonItems}</div>`
    : '';
  // 표제 아래에서도 최상단 프로필과 같은 위아래 여백을 쓴다. 사진 유무나
  // 스타일에 따라 한쪽만 압축하면 이어보기에서 마지막 줄 여백이 다시 달라진다.
  const outerPadding = joinedProfileItems
    ? 'padding:0;'
    : relationship || situation
    ? 'padding:16px 18px; padding:clamp(14px,3vw,18px) clamp(14px,3.5vw,20px);'
    : 'padding:19px 18px; padding:clamp(17px,3vw,21px) clamp(14px,3.5vw,20px);';
  const bottomMargin = settings.profilePlacement === 'top' && normalizeCardLayout(settings.cardLayout) !== 'unified'
    ? 20 + profileTitleGapPx(settings)
    : 20;
  // 간격 없는 카드가 바깥 면을 전부 덮을 때는 뒤의 카드색이 둥근 모서리 바깥에
  // 네모난 쐐기처럼 남지 않게 한다. 선택한 카드색은 각 인물의 실제 면에 유지된다.
  const outerBackground = transparentProfileOuter || (borderlessTopProfile && joinedProfileItems && !commonItems)
    ? 'transparent' : pal.cardBg;
  const photoReachesProfileEdge = joinedProfileItems && profiles.length > 0 && !commonItems
    && profiles.every(profile => profile.image && profile.backgroundOn);
  // 바깥 잘림은 보조 안전망이며, 게시판 모바일의 모서리는 실제 면이 직접 그린다.
  return `<div data-mosaic-profile="true" ${borderlessTopProfile ? 'data-mosaic-borderless-top="true" ' : ''}${photoReachesProfileEdge ? 'data-mosaic-photo-profile="true" ' : ''}style="font-family:${fontStack(settings.narrFont)}; display:block; width:100%; max-width:${W}px; box-sizing:border-box; margin:0 auto ${bottomMargin}px; ${border} border-radius:${radius}; background-color:${outerBackground}; ${outerPadding} overflow:hidden;"><div style="display:block; box-sizing:border-box; width:100%;">${profileRow}${commonSection}</div></div>\n`;
}


function footerSpacing(settings){
  const number = Number(settings.footerBodyGap);
  const extra = Number.isFinite(number) ? Math.max(-60, Math.min(80, number)) : 0;
  const total = Math.max(0, Math.max(0, Math.round(28 * spacingMult(settings)) + cardBodyBottomSpacePx(settings)) + 14 + extra);
  const paddingTop = Math.min(14, total);
  return { marginTop:total - paddingTop, paddingTop };
}

function buildFooter(settings){
  if(!settings.footerOn) return '';
  // 도구 이름만 공식 페이지로 연결하고, 작성자 표기는 링크 밖에 둔다.
  // 게시판의 기본 링크색이 덮어쓰지 못하도록 링크와 내부 글자에 현재 꼬리말색을 직접 지정한다.
  const author = (settings.footerAuthor || '').trim();
  const pal = tonePalette(settings);
  // 꼬리말은 항상 낮은 위계의 미니멀 서명으로 출력한다.
  const footerColor = pal.footerText;
  // 선은 없애되 기존 여백은 유지해 본문과 너무 가까워지지 않게 한다.
  const { marginTop, paddingTop:topPadding } = footerSpacing(settings);
  // 작은 꼬리말 크기 유지
  const footerFontSize = 10.5;
  // 모바일 Safari와 게시판의 링크 자동 확대가 상속 글자 크기를 따로 키우지 못하도록
  // 링크·내부 글자·작성자 모두 동일한 구체 크기와 text-size-adjust를 직접 가진다.
  const fixedTextStyle = `font-size:${footerFontSize}px; line-height:1.5; -webkit-text-size-adjust:100%; text-size-adjust:100%;`;
  const linkStyle = `color:${footerColor}; -webkit-text-fill-color:${footerColor}; text-decoration:none; ${fixedTextStyle}`;
  const toolText = `<span style="${linkStyle}">조각로그</span>`;
  const toolLink = outputThemeTransparent(settings.outputTheme)
    ? toolText
    : `<a href="https://arca.live/b/characterai/176749943" target="_blank" rel="noopener noreferrer" style="${linkStyle}">${toolText}</a>`;
  const authorText = author ? ` <span style="color:${footerColor}; -webkit-text-fill-color:${footerColor}; ${fixedTextStyle}">©${processInline(author, settings.emphasisColor)}</span>` : '';
  return `    <div data-mosaic-footer="true" style="margin-top:${marginTop}px; padding-top:${topPadding}px; text-align:center; color:${footerColor}; font-size:${footerFontSize}px; line-height:1.5; letter-spacing:0.3px; font-family:${fontStack(settings.narrFont)}; -webkit-text-size-adjust:100%; text-size-adjust:100%;">${toolLink}${authorText}</div>\n`;
}

function buildCreditLink(contentHTML, rawUrl, color){
  const href = normalizeHttpLinkUrl(rawUrl);
  if(!href) return contentHTML;
  // URL 동작은 유지하되 게시판 기본 링크 장식까지 덮어 크레딧의 낮은 위계를 유지한다.
  const style = `color:${color}; -webkit-text-fill-color:${color}; text-decoration:none; border-bottom:none; font-family:inherit; font-size:inherit; font-weight:inherit; line-height:inherit; letter-spacing:inherit;`;
  return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" style="${style}"><span style="${style}">${contentHTML}</span></a>`;
}

function normalizeCreditPlacement(value){
  return value === 'top' ? 'top' : 'bottom';
}

// 모바일 게시판이 셀의 색을 재해석해도 실제 텍스트에는 지정 색을 유지한다.
function buildCreditText(contentHTML, color){
  return `<span style="color:${color}; -webkit-text-fill-color:${color}; font-size:inherit; font-family:inherit; font-weight:inherit; line-height:inherit; letter-spacing:inherit;">${contentHTML}</span>`;
}

const CREDIT_SURFACE = '#f4f4f4';

function creditBackground(settings){
  return settingFlagOn(settings.creditTransparentOn) ? 'transparent' : CREDIT_SURFACE;
}

function buildCredit(settings){
  if(!settings.creditOn) return '';
  const items = normalizeCreditItems(settings.creditItems).map((item, sourceIndex) => ({
    label:item.label.trim(),
    value:item.value.trim(),
    url:normalizeHttpLinkUrl(item.url),
    dividerBefore:item.dividerBefore,
    sourceIndex
  })).filter(item => item.label || item.value);
  if(!items.length) return '';

  const pal = tonePalette(settings);
  const cardWidth = parseInt(settings.cardWidth) || 750;
  const requestedCreditWidth = Number(settings.creditWidth);
  const creditWidth = Math.min(cardWidth, Number.isFinite(requestedCreditWidth) && requestedCreditWidth >= 200
    ? Math.min(900, requestedCreditWidth) : 380);
  const neutralCardBg = neutralHex(pal.cardBg);
  const darkBackground = textColorFor(neutralCardBg) === '#ffffff';
  const creditNeutral = darkBackground ? '#ffffff' : '#000000';
  const transparentCredit = settingFlagOn(settings.creditTransparentOn) || outputThemeTransparent(settings.outputTheme);
  const creditBg = outputThemeTransparent(settings.outputTheme) ? 'transparent' : creditBackground(settings);
  const creditBorder = 'rgba(128,128,128,.22)';
  const creditDivider = mixHex(pal.boxBg, creditNeutral, darkBackground ? 0.07 : 0.045);
  const labelColor = !transparentCredit && darkBackground ? '#777777'
    : mixHex(pal.caption, pal.cardBg, darkBackground ? 0.04 : 0.08);
  const valueColor = !transparentCredit && darkBackground ? '#555555'
    : mixHex(pal.heading[3], pal.cardBg, darkBackground ? 0.08 : 0.14);
  const font = fontStack(settings.narrFont);
  const creditPadding = '9px 14px 3px';
  const rows = items.map((item, renderedIndex) => {
    const labelText = escapeTextHTML(item.label);
    const valueText = escapeTextHTML(item.value);
    const linkedValue = item.url
      ? buildCreditLink(valueText, item.url, valueColor)
      : buildCreditText(valueText, valueColor);
    const divider = renderedIndex > 0 && settingFlagOn(item.dividerBefore)
      ? `<div data-mosaic-generated="true" data-mosaic-credit-divider-before="${item.sourceIndex}" aria-hidden="true" style="box-sizing:border-box; width:100%; height:1px; margin:7px 0 9px; padding:0; border:0; background-color:${creditDivider} !important;"></div>`
      : '';
    if(!item.label || !item.value){
      const labelOnly = Boolean(item.label);
      const field = labelOnly ? 'label' : 'value';
      const color = labelOnly ? labelColor : valueColor;
      const content = labelOnly
        ? (item.url ? buildCreditLink(labelText, item.url, labelColor) : buildCreditText(labelText, labelColor))
        : linkedValue;
      const textStyle = labelOnly
        ? 'text-align:left; font-size:9.5px; font-weight:600; letter-spacing:0.35px;'
        : 'text-align:right; font-size:10.5px; font-weight:400; letter-spacing:-0.05px;';
      return `${divider}<div data-mosaic-credit-row="${item.sourceIndex}" data-mosaic-credit-index="${item.sourceIndex}" data-mosaic-credit-field="${field}" style="box-sizing:border-box; width:100%; margin:0 0 6px; color:${color}; -webkit-text-fill-color:${color}; ${textStyle} line-height:1.55; overflow-wrap:anywhere; word-break:break-word;">${content}</div>`;
    }
    return `${divider}<div data-mosaic-credit-row="${item.sourceIndex}" style="display:table; table-layout:fixed; box-sizing:border-box; width:100%; margin:0 0 6px;"><div style="display:table-row;"><div data-mosaic-credit-index="${item.sourceIndex}" data-mosaic-credit-field="label" style="display:table-cell; width:34%; padding:0 12px 0 0; vertical-align:top; color:${labelColor}; -webkit-text-fill-color:${labelColor}; font-size:9.5px; font-weight:600; line-height:1.55; letter-spacing:0.35px; overflow-wrap:anywhere; word-break:break-word;">${buildCreditText(labelText, labelColor)}</div><div data-mosaic-credit-index="${item.sourceIndex}" data-mosaic-credit-field="value" style="display:table-cell; width:66%; padding:0; vertical-align:top; text-align:right; color:${valueColor}; -webkit-text-fill-color:${valueColor}; font-size:10.5px; font-weight:400; line-height:1.55; letter-spacing:-0.05px; overflow-wrap:anywhere; word-break:break-word;">${linkedValue}</div></div></div>`;
  }).join('');

  const gap = Math.max(18, Math.min(80, Number(settings.creditCardGap) || 40));
  const creditMargin = normalizeCreditPlacement(settings.creditPlacement) === 'top'
    ? `0 auto ${gap}px`
    : `${gap}px auto 0`;
  return `<div data-mosaic-credit="true" style="box-sizing:border-box; width:100%; max-width:${creditWidth}px; margin:${creditMargin}; padding:${creditPadding}; border:${settingFlagOn(settings.creditBorderOn) ? `1px solid ${creditBorder}` : '0'}; border-radius:0; background-color:${creditBg}; color:${valueColor}; font-family:${font}; -webkit-text-size-adjust:100%; text-size-adjust:100%;">${rows}</div>\n`;
}

// 코멘트는 본문 문법을 해석하지 않되, Shift+Enter가 남긴 줄 끝 [BR]만
// 같은 문단 안의 줄바꿈으로 처리한다. 각 조각은 이후 반드시 escapeTextHTML을
// 거치므로 다른 카드 문법이나 HTML이 이 경로로 실행되지 않는다.
function commentParagraphEntries(value){
  const lines = String(value || '').split('\n');
  const entries = [];
  for(let raw = 0; raw < lines.length; raw++){
    let rawEnd = raw;
    let current = String(lines[rawEnd]).trim();
    if(!current) continue;
    const parts = [];
    while(/\[BR\]\s*$/i.test(current) && rawEnd + 1 < lines.length){
      parts.push(current.replace(/\[BR\]\s*$/i, '').trim());
      rawEnd++;
      current = String(lines[rawEnd]).trim();
    }
    parts.push(current);
    entries.push({ raw, rawEnd, parts });
    raw = rawEnd;
  }
  return entries;
}

function buildCommentBlock(comment, settings){
  const paragraphStyle = settings.commentAlign === 'center' ? ' style="text-align:center;"' : '';
  const paragraphs = commentParagraphEntries(comment.body)
    .map(entry => `<p${paragraphStyle}>${entry.parts.map(escapeTextHTML).join('<br>')}</p>`);
  if(!paragraphs.length) return '';
  // 카드 디자인과 섞이지 않도록 배경·외곽선은 두지 않는다. 기본·가운데는
  // 아카라이브 게시글 폭 전체를, 카드 폭만 현재 설정의 max-width를 사용한다.
  const widthStyle = settings.commentWidth === 'card'
    ? `width:100%; max-width:${parseInt(settings.cardWidth) || 750}px; box-sizing:border-box; margin:36px auto;`
    : 'display:block; width:100%; max-width:none; box-sizing:border-box; margin:36px 0;';
  const alignStyle = settings.commentAlign === 'center' ? ' text-align:center;' : '';
  return `<div data-mosaic-comment-index="${comment.sourceIndex}" data-mosaic-comment-width="${settings.commentWidth}" data-mosaic-comment-align="${settings.commentAlign}" style="${widthStyle}${alignStyle}">${paragraphs.join('\n')}</div>`;
}

function placeCoverDividerBeforeLeadingComment(html, settings){
  if(settingFlagOn(settings.titleMinimal)) return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  const sections = Array.from(template.content.children);
  const firstBodyIndex = sections.findIndex(section =>
    section.hasAttribute('data-mosaic-card-index') || section.hasAttribute('data-mosaic-comment-index')
  );
  if(firstBodyIndex < 0 || !sections[firstBodyIndex].hasAttribute('data-mosaic-comment-index')) return html;
  const titleIndex = sections.findIndex(section => section.hasAttribute('data-mosaic-title'));
  if(titleIndex < 0 || titleIndex >= firstBodyIndex) return html;
  const boundary = sections.slice(titleIndex, firstBodyIndex).filter(section =>
    section.hasAttribute('data-mosaic-title') || section.hasAttribute('data-mosaic-profile')
  ).pop();
  if(!boundary) return html;
  boundary.style.setProperty('border-bottom', '0');
  appendCoverDividerLine(boundary, 'bottom', settings, tonePalette(settings).divider);
  return template.innerHTML;
}

function resolveIntroBoundaryLayout({
  profileBoundary,
  bottomMargin,
  coverCardGap,
  cardGap,
  standaloneTopProfile
}){
  const adjustedMargin = profileBoundary
    ? (standaloneTopProfile && coverCardGap === 0 ? cardGap : coverCardGap)
    : Math.max(0, bottomMargin + coverCardGap);
  return {
    adjustedMargin,
    flattenProfile:profileBoundary && adjustedMargin === 0 && !standaloneTopProfile
  };
}

function addCoverCardGapAfterIntro(html, settings, standaloneTopProfile = false){
  const extra = coverCardGapPx(settings);
  const template = document.createElement('template');
  template.innerHTML = html;
  const boundary = template.content.lastElementChild;
  if(!boundary) return html;
  const profileBoundary = boundary.hasAttribute('data-mosaic-profile');
  const bottomMargin = Number.parseFloat(boundary.style.marginBottom) || 0;
  const { adjustedMargin, flattenProfile } = resolveIntroBoundaryLayout({
    profileBoundary,
    bottomMargin,
    coverCardGap:extra,
    cardGap:cardGapPx(settings),
    standaloneTopProfile
  });
  if(adjustedMargin === bottomMargin && !flattenProfile) return html;
  boundary.style.setProperty('margin-bottom', `${adjustedMargin}px`);
  if(flattenProfile){
    boundary.style.setProperty('border-bottom', '0');
    boundary.style.setProperty('border-bottom-left-radius', '0');
    boundary.style.setProperty('border-bottom-right-radius', '0');
  }
  // 프로필은 이미 독립 카드의 하단선과 모서리를 가진다. 표제·이미지가 마지막이면
  // 벌어진 간격 위에서 카드가 열린 채 끝나지 않도록 하단 경계를 마무리한다.
  if(adjustedMargin > 0 && !profileBoundary){
    const radius = cardCornerRadiusPx(settings);
    boundary.style.setProperty('border-bottom-left-radius', `${radius}px`);
    boundary.style.setProperty('border-bottom-right-radius', `${radius}px`);
    const titleDivider = boundary.hasAttribute('data-mosaic-title') && !settingFlagOn(settings.titleMinimal);
    if(titleDivider && outputThemeShape(settings.outputTheme) !== 'document'){
      appendCoverDividerLine(boundary, 'bottom', settings, tonePalette(settings).divider);
    }else if(settings.cardBorderOn !== false){
      boundary.style.setProperty('border-bottom', `1px solid ${tonePalette(settings).shellBorder}`);
    }
  }
  return template.innerHTML;
}

// 통합 카드는 새 부모 요소를 씌우지 않고 최상위 블록의 외곽선을 이어 붙인다.
// 미리보기의 카드별 위치 연동·직접 편집·복사 기능이 최상위 형제 구조를 사용하므로,
// DOM 계층을 유지하면서도 출력에서는 하나의 배경과 외곽 카드처럼 보이게 한다.
// 이어보기의 바깥 여백과 카드 경계 여백을 한 곳에서 결정한다.
function unifiedCardSpacing({folded, previousKind, nextKind, introDivider, afterImageWithoutTitle, afterImageBackedTitle, introGap = 0, cardGap, unifiedBottomSpace = 0}){
  const previousCard = previousKind === 'plain' || previousKind === 'fold';
  const nextCard = nextKind === 'plain' || nextKind === 'fold';
  const addedHalfGap = (cardGap - 20) / 2;
  const baseTop = previousCard
    ? (folded && previousKind === 'fold' ? 8 : 40) + addedHalfGap
    : folded ? (previousKind === 'none' || introDivider || afterImageWithoutTitle || afterImageBackedTitle ? 24 : 8) : 0;
  const top = baseTop + (previousKind === 'intro' ? introGap : 0);
  const bottom = nextCard
    ? (folded && nextKind === 'fold' ? 8 : 40) + addedHalfGap
    : nextKind === 'none' ? (folded ? 24 : 0) : 8;
  return {top:Math.max(0, top), bottom:Math.max(0, bottom) + (nextKind === 'none' ? unifiedBottomSpace : 0), trimTop:previousCard && !(folded && previousKind === 'fold'),
    trimBottom:nextCard && !(folded && nextKind === 'fold')};
}

function applyUnifiedCardLayout(html, settings){
  if(normalizeCardLayout(settings && settings.cardLayout) !== 'unified') return html;
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  // 출력 직전에도 한 번 더 확인해 손상된 초안이나 외부 호출이 코멘트를 합치지 못하게 한다.
  if(template.content.querySelector('[data-mosaic-comment-index]')) return template.innerHTML;
  const sections = Array.from(template.content.children).filter(element =>
    !element.hidden && element.getAttribute('aria-hidden') !== 'true'
  );
  if(!sections.length) return template.innerHTML;

  const pal = tonePalette(settings);
  const width = parseInt(settings.cardWidth) || 750;
  const cardRadius = cardCornerRadiusPx(settings);
  const showOuterBorder = settings.cardBorderOn !== false;
  // 접기 카드는 제목만 강조하지 않고 제목과 본문을 같은 낮은 위계의 색면으로 묶는다.
  // 최상위 details 구조는 유지하고 내부만 들여 위치 연동·직접 편집 대상이 바뀌지 않게 한다.
  const foldPanelBg = mixHex(pal.cardBg, pal.boxBg, 0.55);
  const cardSeparator = mixHex(pal.cardBg, pal.shellBorder, 0.75);
  const firstBodyIndex = sections.findIndex(section => section.hasAttribute('data-mosaic-card-index'));
  // 통합 카드의 도입부와 본문은 성격이 다르므로 마지막 표제·프로필 아래에만
  // 한 번 경계를 둔다. 대표 이미지만 있는 경우에는 이미지 끝이 이미 경계가 되므로
  // 별도 선을 만들지 않는다. 프로필을 위에 배치한 경우도 실제 출력 순서를 따른다.
  const introCandidates = firstBodyIndex > 0
    ? sections.slice(0, firstBodyIndex).filter(section =>
        section.hasAttribute('data-mosaic-title') || section.hasAttribute('data-mosaic-profile')
      )
    : [];
  const introBoundary = introCandidates.length
    ? introCandidates[introCandidates.length - 1]
    : null;
  const hasUnifiedTitle = introCandidates.some(section => section.hasAttribute('data-mosaic-title'));
  const imageTitleTouchesBody = firstBodyIndex > 0
    && sections[firstBodyIndex - 1] === introBoundary
    && introBoundary.hasAttribute('data-mosaic-image-background')
    && coverCardGapPx(settings) === 0;
  const showIntroBoundary = hasUnifiedTitle && !settingFlagOn(settings.titleMinimal)
    && !imageTitleTouchesBody;
  sections.forEach((section, index) => {
    const first = index === 0;
    const last = index === sections.length - 1;
    const bodyCard = section.hasAttribute('data-mosaic-card-index');
    const previousSection = index > 0 ? sections[index - 1] : null;
    const nextSection = index < sections.length - 1 ? sections[index + 1] : null;
    const previousBodyCard = !!(previousSection && previousSection.hasAttribute('data-mosaic-card-index'));
    const foldedCard = bodyCard && section.tagName === 'DETAILS';
    const previousFoldedCard = previousBodyCard && previousSection.tagName === 'DETAILS';
    section.dataset.mosaicUnifiedItem = 'true';
    section.style.setProperty('box-sizing', 'border-box');
    section.style.setProperty('width', '100%');
    section.style.setProperty('max-width', `${width}px`);
    section.style.setProperty('margin', '0 auto');
    const transparentTopProfile = section.hasAttribute('data-mosaic-profile')
      && settings.profilePlacement === 'top' && settings.profileOuterBackground === 'transparent';
    section.style.setProperty('background-color', transparentTopProfile ? 'transparent' : pal.cardBg);
    section.style.setProperty('border', '0');
    // 개별 카드에서 그린 표지선은 이어보기의 공통 경계선으로 다시 그린다.
    if(bodyCard || section.hasAttribute('data-mosaic-profile')) section.style.removeProperty('background-image');
    if(foldedCard){
      const summary = section.querySelector(':scope > summary');
      const foldBody = section.querySelector(':scope > [data-mosaic-fold-body="true"]');
      section.style.setProperty('padding', '0 16px');
      const innerRadius = Math.max(0, cardRadius - 6);
      const innerJointRadius = Math.min(2, innerRadius);
      if(summary){
        summary.style.setProperty('background-color', foldPanelBg);
        summary.style.setProperty('border-radius', `${innerRadius}px ${innerRadius}px ${innerJointRadius}px ${innerJointRadius}px`);
      }
      if(foldBody){
        foldBody.style.setProperty('background-color', foldPanelBg);
        foldBody.style.setProperty('border-radius', `${innerJointRadius}px ${innerJointRadius}px ${innerRadius}px ${innerRadius}px`);
      }
    }
    // 색면만으로 충분히 구분되는 접기 카드끼리는 선을 생략한다. 그 밖의 카드 경계에는
    // 내부 구분선과 혼동되지 않도록 카드 폭의 중앙 24%에만 짧은 선을 그린다.
    if(bodyCard && previousBodyCard && !(foldedCard && previousFoldedCard)){
      section.style.setProperty('background-image', `linear-gradient(to right, transparent 38%, ${cardSeparator} 38%, ${cardSeparator} 62%, transparent 62%)`);
      section.style.setProperty('background-repeat', 'no-repeat');
      section.style.setProperty('background-position', 'center top');
      section.style.setProperty('background-size', '100% 1px');
    }
    if(showOuterBorder && !section.hasAttribute('data-mosaic-borderless-top')){
      const borderColor = section.hasAttribute('data-mosaic-image-background')
        && outputThemeTransparent(settings.outputTheme)
        ? 'rgba(128,128,128,.22)' : pal.shellBorder;
      section.style.setProperty('border-left', `1px solid ${borderColor}`);
      section.style.setProperty('border-right', `1px solid ${borderColor}`);
      if(first) section.style.setProperty('border-top', `1px solid ${borderColor}`);
      if(last) section.style.setProperty('border-bottom', `1px solid ${borderColor}`);
    }
    // 일반 표제는 표지 묶음의 마지막 요소 아래 선으로 본문과 구분한다.
    // 표제 미니멀을 켜면 그 선도 함께 없애 표지와 본문을 여백만으로 잇는다.
    if(showIntroBoundary && section === introBoundary){
      // 일반 보기의 표지·첫 카드 연결선과 같은 내부 구분선 색을 사용한다.
      const length = coverDividerLengthPercent(settings);
      if(length === 100) section.style.setProperty('border-bottom', `1px solid ${pal.divider}`);
      else {
        // 표제에 대표 이미지 배경이 있으면 background-image를 선으로 덮어쓰지 않는다.
        // 별도 선 요소는 사진·단색 표제·프로필 아래에서 같은 길이로 표시된다.
        appendCoverDividerLine(section, 'bottom', settings, pal.divider);
      }
    }
    section.style.setProperty('border-radius', sections.length === 1
      ? `${cardRadius}px`
      : (first ? `${cardRadius}px ${cardRadius}px 0 0` : (last ? `0 0 ${cardRadius}px ${cardRadius}px` : '0')));
    section.style.setProperty('overflow', 'hidden');
  });
  // 표제 ↔ 본문 여백은 첫 카드 앞에 둔다. 사진 배경 표제의 패딩을 늘리면
  // 이미지 높이만 커지고 실제로 보이는 두 카드 사이 간격은 그대로 남는다.
  // 카드 경계의 여백은 여기서 한 번만 결정한다. 본문 래퍼의 padding과
  // 끝 문단의 margin을 중복 합산하지 않아 구분선 양쪽을 같은 40px로 맞춘다.
  const trimBoundary = (card, edge) => {
    if(card.tagName === 'DETAILS') return; // 접기 카드의 색면 바깥을 기준으로 한다.
    const wrapper = edge === 'top' ? card.firstElementChild : card.lastElementChild;
    if(!wrapper) return;
    const hasFooter = edge === 'bottom' && !!wrapper.querySelector(':scope > [data-mosaic-footer="true"]');
    // 제목 높이를 직접 조절한 카드에서는 이어보기의 여백 정리가 제목 패딩을 지우지 않는다.
    if(edge === 'top' && wrapper.hasAttribute('data-mosaic-card-title') && cardTitlePaddingPx(settings) !== 26) return;
    wrapper.style.setProperty(`padding-${edge}`, edge === 'top' && !wrapper.hasAttribute('data-mosaic-card-title')
      ? `${cardBodyTopSpacePx(settings)}px`
      : edge === 'bottom' ? `${hasFooter ? 0 : Math.max(0, cardBodyBottomSpacePx(settings))}px` : '0');
    let content = edge === 'top' ? wrapper.firstElementChild : wrapper.lastElementChild;
    if(wrapper.hasAttribute('data-mosaic-card-title')) return;
    while(content){
      content.style.setProperty(`margin-${edge}`, '0');
      // 화자 이름이 있는 대사의 투명 래퍼 내부 margin도 경계에 포함된다.
      if(content.style.display !== 'flow-root') break;
      content = edge === 'top' ? content.firstElementChild : content.lastElementChild;
    }
  };
  const sectionKind = section => !section ? 'none'
    : section.hasAttribute('data-mosaic-card-index') ? (section.tagName === 'DETAILS' ? 'fold' : 'plain') : 'intro';
  sections.forEach((card, index) => {
    if(!card.hasAttribute('data-mosaic-card-index')) return;
    const previous = sections[index - 1];
    const spacing = unifiedCardSpacing({
      folded:card.tagName === 'DETAILS',
      previousKind:sectionKind(previous), nextKind:sectionKind(sections[index + 1]),
      cardGap:cardGapPx(settings),
      unifiedBottomSpace:unifiedBottomSpacePx(settings),
      introDivider:showIntroBoundary && previous === introBoundary,
      afterImageWithoutTitle:!hasUnifiedTitle && !!(previous && previous.hasAttribute('data-mosaic-cover-image')),
      afterImageBackedTitle:!!(previous && previous.hasAttribute('data-mosaic-title') && previous.hasAttribute('data-mosaic-image-background')),
      introGap:index === firstBodyIndex && introBoundary ? coverCardGapPx(settings) : 0
    });
    if(spacing.trimTop) trimBoundary(card, 'top');
    if(spacing.trimBottom) trimBoundary(card, 'bottom');
    card.style.setProperty('padding-top', `${spacing.top}px`);
    card.style.setProperty('padding-bottom', `${spacing.bottom}px`);
  });
  return template.innerHTML;
}

// 미리보기의 카드-입력창 연결과 반응형 보정에만 쓰는 data-mosaic-* 표식은
// 아카라이브 게시글이나 개별 복사본에는 필요 없다. 미리보기 원본에는 보존하고,
// 실제 배포 HTML을 만들 때만 제거해 편집기 내부 상태가 출력물에 새지 않게 한다.
function stripEditorOutputMetadata(html){
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  template.content.querySelectorAll('*').forEach(element => {
    Array.from(element.attributes).forEach(attribute => {
      if(attribute.name.startsWith('data-mosaic-')) element.removeAttribute(attribute.name);
    });
    if(element.style){
      element.style.removeProperty('--mosaic-profile-top-radius');
      element.style.removeProperty('--mosaic-profile-bottom-radius');
    }
  });
  return template.innerHTML;
}

function shouldRemoveImageTitleBodySeam({imageBackedTitle, nextExists, gap}){
  return Boolean(imageBackedTitle && nextExists && gap === 0);
}

function splitCssBackgroundLayers(value){
  const layers = [];
  let depth = 0, quote = '', start = 0;
  for(let index = 0; index < value.length; index++){
    const char = value[index];
    if(quote){
      if(char === '\\') index++;
      else if(char === quote) quote = '';
    }else if(char === '"' || char === "'") quote = char;
    else if(char === '(') depth++;
    else if(char === ')') depth--;
    else if(char === ',' && depth === 0){ layers.push(value.slice(start, index).trim()); start = index + 1; }
  }
  layers.push(value.slice(start).trim());
  return layers;
}

function removeCoverEdgeBackgroundLine(element, edge){
  const style = element.style;
  const images = splitCssBackgroundLayers(style.backgroundImage || '');
  const properties = ['background-size','background-position','background-repeat'];
  const lists = properties.map(property => splitCssBackgroundLayers(style.getPropertyValue(property) || ''));
  const keep = images.map((image, index) => {
    const size = lists[0][index % lists[0].length];
    const position = lists[1][index % lists[1].length];
    return !(image.includes('linear-gradient') && !image.includes('url(')
      && /(?:^|\s)(?:0?\.5|1|2)px$/.test(size) && position.includes(edge));
  });
  if(keep.every(Boolean)) return;
  style.setProperty('background-image', images.filter((_, index) => keep[index]).join(', ') || 'none', 'important');
  properties.forEach((property, propertyIndex) => {
    const list = lists[propertyIndex];
    style.setProperty(property, images.map((_, index) => list[index % list.length])
      .filter((_, index) => keep[index]).join(', ') || (property === 'background-repeat' ? 'no-repeat' : 'auto'), 'important');
  });
}

function clearCoverEdge(element, edge){
  element.style.setProperty(`border-${edge}`, '0', 'important');
  element.style.setProperty(`border-${edge}-width`, '0', 'important');
  element.style.setProperty(`border-${edge}-style`, 'none', 'important');
  element.style.setProperty(`border-${edge}-color`, 'transparent', 'important');
  element.style.setProperty('outline', '0', 'important');
  element.style.setProperty('box-shadow', 'none', 'important');
  removeCoverEdgeBackgroundLine(element, edge);
  const overlay = element.querySelector(':scope > [data-mosaic-photo-overlay="true"]');
  if(overlay) removeCoverEdgeBackgroundLine(overlay, edge);
}

// 이웃한 두 영역의 사진 접합 규칙은 여기서 한 번 결정한다.
function resolveCoverProfileBoundary(first, second, settings){
  const isProfile = section => section.hasAttribute('data-mosaic-profile');
  const isPhotoCover = section => section.hasAttribute('data-mosaic-cover-image')
    || (section.hasAttribute('data-mosaic-title') && section.hasAttribute('data-mosaic-image-background'));
  const profileFirst = isProfile(first) && isPhotoCover(second);
  const photoFirst = isPhotoCover(first) && isProfile(second);
  // 일반 사진/단색/공통 설명은 사진 접합면이 아니다. 프로필 끝까지 배경사진이
  // 채워진 경우에만 사진끼리 닿는 선을 만든다. 사진 표제의 아래는 계속 선 없이 잇는다.
  const profileHasPhotoEdge = (profileFirst ? first : second).hasAttribute('data-mosaic-photo-profile');
  const joinPhoto = profileHasPhotoEdge && (profileFirst
    ? normalizeCardLayout(settings.cardLayout) === 'unified' || profileTitleGapPx(settings) === -20
    : photoFirst && !first.hasAttribute('data-mosaic-title'));
  const nextIsBody = second.hasAttribute('data-mosaic-card-index') || second.hasAttribute('data-mosaic-comment-index');
  const gap = Math.max(0, Number.parseFloat(first.style.marginBottom) || 0)
    + Math.max(0, Number.parseFloat(second.style.marginTop) || 0)
    + (nextIsBody ? coverCardGapPx(settings) : 0);
  return {
    photo:joinPhoto ? (profileFirst ? second : first) : null,
    photoEdge:profileFirst ? 'top' : 'bottom',
    removeImageSeam:shouldRemoveImageTitleBodySeam({
      imageBackedTitle:first.hasAttribute('data-mosaic-title') && first.hasAttribute('data-mosaic-image-background'),
      nextExists:true, gap
    })
  };
}

// 색상만 호스트 문서에 맡긴다. 타이포그래피 잠금과 이미지/레이아웃은 유지한다.
function transparentOutput(html, settings){
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('*').forEach(el => {
    // 투명 테마의 일반 배경은 비우되, 포트레이트 사진 사이 틈만 외곽선과
    // 같은 반투명 구조색으로 남긴다. 이 처리가 없으면 틈이 다시 흰색으로 보인다.
    if(el.hasAttribute('data-mosaic-photo-gap')){
      el.style.setProperty('background-color', 'rgba(128,128,128,.22)', 'important');
      return;
    }
    // 사진 위의 흰 글자와 균일한 검은 오버레이는 투명 테마에서도 유지한다.
    if(el.closest('[data-mosaic-image-background="true"]')){
      // 사진 배경 자체의 외곽선은 다른 카드처럼 투명 테마의 중성선으로 맞춘다.
      if(el.hasAttribute('data-mosaic-image-background')){
        const imageStyle = el.style;
        // 사진이 반투명 테두리 아래까지 칠해지면 같은 선색이어도 프로필보다
        // 어둡게 보인다. 테두리 밑에는 카드 밖의 배경이 비치도록 제한한다.
        if(el.hasAttribute('data-mosaic-title')) imageStyle.setProperty('background-clip', 'padding-box', 'important');
        // 표제의 바깥선은 생성·이어보기 배치에서 각각 축약형으로 다시 쓰인다.
        // 색상 단독 선언에 의존하지 않고 실제 선 자체를 마지막에 확정한다.
        if(el.hasAttribute('data-mosaic-title') && settings.cardBorderOn !== false){
          ['left', 'right'].forEach(edge => {
            imageStyle.setProperty(`border-${edge}`, '1px solid rgba(128,128,128,.22)', 'important');
          });
        }
        ['top','right','bottom','left'].forEach(edge => {
          imageStyle.setProperty(`border-${edge}-color`, 'rgba(128,128,128,.22)', 'important');
        });
      }
      return;
    }
    const style = el.style;
    const image = style.backgroundImage;
    // em 단위 줄바꿈 여백은 구분선이 아니다. 실제 px 높이만 판정한다.
    const thinRule = /^(?:\d+(?:\.\d+)?|\.\d+)px$/.test(style.height)
      && parseFloat(style.height) > 0 && parseFloat(style.height) <= 2;
    // 게시판의 라이트/다크 글자색 규칙이 적용되도록 색상 선언 자체를 비운다.
    style.removeProperty('color');
    style.removeProperty('-webkit-text-fill-color');
    el.removeAttribute('color');
    style.setProperty('background-color', thinRule ? 'rgba(128,128,128,.22)' : 'transparent', 'important');
    // URL 이미지는 보존하고 색상 장식만 무채색으로 바꾼다.
    if(image && !image.includes('url(')){
      const lineImage = thinRule || /(?:^|\s)(?:0?\.5|1|2)px$/.test(style.backgroundSize);
      style.setProperty('background-image', lineImage
        ? image.replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi, 'rgba(128,128,128,.22)') : 'none', 'important');
    }
    if(style.border || style.borderColor || style.borderTop || style.borderBottom || style.borderLeft || style.borderRight){
      style.setProperty('border-color', 'rgba(128,128,128,.22)', 'important');
    }
    if(style.boxShadow) style.setProperty('box-shadow', 'none', 'important');
    if(style.textShadow) style.setProperty('text-shadow', 'none', 'important');
  });
  // 투명 구분선도 게시판의 본문(p) 라이트/다크 규칙을 받는다.
  // 색상을 고정하지 않고 실선은 currentColor, 장식은 기본 글자색을 사용한다.
  template.content.querySelectorAll('[data-mosaic-separator="hr"], [data-mosaic-separator="hr2"], [data-mosaic-separator="hr3"]').forEach(separator => {
    const paragraph = document.createElement('p');
    Array.from(separator.attributes).forEach(attribute => paragraph.setAttribute(attribute.name, attribute.value));
    paragraph.innerHTML = separator.innerHTML;
    paragraph.style.removeProperty('color');
    paragraph.style.removeProperty('-webkit-text-fill-color');
    const type = separator.dataset.mosaicSeparator;
    const chosenOpacity = settings[type === 'hr' ? 'hrOpacity' : type === 'hr2' ? 'hr2Opacity' : 'hr3Opacity'];
    paragraph.style.setProperty('opacity', String(advancedTransparentOpacity(chosenOpacity, type === 'hr3' ? .32 : .22)));
    if(type === 'hr'){
      if(paragraph.dataset.mosaicHrShape === 'star'){
        paragraph.style.setProperty('background-color', 'transparent', 'important');
        [paragraph.firstElementChild, paragraph.lastElementChild].forEach(rule => {
          if(rule) rule.style.setProperty('border-top-color', 'currentColor', 'important');
        });
      }else if(paragraph.style.borderTopStyle && paragraph.style.borderTopStyle !== 'none'){
        paragraph.style.setProperty('border-top-color', 'currentColor', 'important');
        paragraph.style.setProperty('background-color', 'transparent', 'important');
      }else{
        paragraph.style.setProperty('background-color', 'currentColor', 'important');
      }
    }
    separator.replaceWith(paragraph);
  });
  // 투명 테마에서도 옵션 6의 말풍선 형태는 약한 무채색 면으로 구분한다.
  template.content.querySelectorAll('p[data-mosaic-dialogue-side]').forEach(dialogue => {
    if(dialogue.style.width === 'fit-content'){
      dialogue.style.setProperty('background-color', 'rgba(128,128,128,.10)', 'important');
    }
  });
  // 투명 테마의 인용만 모노 클래식 기본 인용색을 사용한다. 강조만 진한 회색으로 구분한다.
  template.content.querySelectorAll('[data-mosaic-quote="true"]').forEach(quote => {
    quote.style.setProperty('background-color', '#f4f4f4', 'important');
    [quote, ...quote.querySelectorAll('*')].forEach(el => {
      const color = el.closest('em, [data-mosaic-thought]') ? '#707070' : '#9c9c9c';
      el.style.setProperty('color', color, 'important');
      el.style.setProperty('-webkit-text-fill-color', color, 'important');
    });
  });
  return template.innerHTML;
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
function specialThemeOutput(html, mode, settings){
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('*').forEach(el => {
    if(el.closest('[data-mosaic-comment-index]')) return;
    const style = el.style;
    style.setProperty('box-shadow', 'none', 'important');
    style.setProperty('text-shadow', 'none', 'important');
    style.setProperty('border-radius', '0', 'important');

  });
  if(mode === 'document'){
    const palette = tonePalette(settings);
    // 카드 외곽선과 별개로, 일반 표제의 본문 연결선은 보존한다.
    const title = template.content.querySelector('[data-mosaic-title]');
    template.content.querySelectorAll('[data-mosaic-card-index], [data-mosaic-profile], [data-mosaic-credit]').forEach(el => {
      // 각진 테마도 외곽선 토글이 켜져 있으면 프로필의 바깥선을 보존한다.
      if(!el.style.backgroundImage.includes('url(')) el.style.setProperty('background-image', 'none', 'important');
      const transparentTopProfile = el.hasAttribute('data-mosaic-profile')
        && settings.profilePlacement === 'top' && settings.profileOuterBackground === 'transparent';
      el.style.setProperty('background-color', transparentTopProfile ? 'transparent'
        : el.hasAttribute('data-mosaic-credit') ? creditBackground(settings)
        : safeHexColor(settings.bgColor, '#faf9f5'), 'important');
    });
    template.content.querySelectorAll('summary, [data-mosaic-fold-body]').forEach(el => {
      el.style.setProperty('background-color', safeHexColor(settings.bgColor, '#faf9f5'), 'important');
    });
    template.content.querySelectorAll('summary').forEach(el => {
      el.style.setProperty('text-align', 'left');
      const showDivider = !settingFlagOn(settings.foldDividerMinimal);
      const dividerLength = cardDividerLengthPercent(settings);
      el.style.setProperty('border-bottom', showDivider && dividerLength === 100 ? `1px solid ${palette.divider}` : 'none', 'important');
      if(showDivider && dividerLength < 100){
        el.style.setProperty('background-image', `linear-gradient(to right, ${palette.divider}, ${palette.divider})`, 'important');
        el.style.setProperty('background-repeat', 'no-repeat', 'important');
        el.style.setProperty('background-position', 'center bottom', 'important');
        el.style.setProperty('background-size', `${dividerLength}% 1px`, 'important');
      }
      const body = el.nextElementSibling;
      if(body && body.hasAttribute('data-mosaic-fold-body')){
        body.style.setProperty('border-top', 'none', 'important');
        body.style.setProperty('background-image', 'none', 'important');
      }
    });
    template.content.querySelectorAll('[data-mosaic-quote]').forEach(el => {
      el.style.setProperty('background-color', palette.boxBg, 'important');
    });
    // 각진 카드의 표지선은 개별/이어보기 모두 실제 선 요소로 그린다.
    // 배경 이미지와 border는 각진 테마의 장식 정리에서 제거되므로 여기서 최종 경계를 정한다.
    if(title && !settingFlagOn(settings.titleMinimal)){
      const sections = Array.from(template.content.children);
      const titleIndex = sections.indexOf(title);
      const firstBodyIndex = sections.findIndex(section =>
        section.hasAttribute('data-mosaic-card-index') || section.hasAttribute('data-mosaic-comment-index')
      );
      const imageTitleTouchesBody = firstBodyIndex === titleIndex + 1
        && title.hasAttribute('data-mosaic-image-background')
        && sections[firstBodyIndex].hasAttribute('data-mosaic-card-index')
        && coverCardGapPx(settings) === 0;
      if(firstBodyIndex > titleIndex && !imageTitleTouchesBody){
        const firstBody = sections[firstBodyIndex];
        const attachedProfile = sections.slice(titleIndex + 1, firstBodyIndex)
          .filter(section => section.hasAttribute('data-mosaic-profile')).pop();
        const unified = firstBody.hasAttribute('data-mosaic-unified-item');
        const commentFirst = firstBody.hasAttribute('data-mosaic-comment-index');
        const boundary = unified || commentFirst
          ? (attachedProfile || title)
          : (attachedProfile || firstBody);
        const edge = unified || commentFirst ? 'bottom' : 'top';
        boundary.style.setProperty(`border-${edge}`, '0', 'important');
        if(boundary.style.backgroundImage.includes('linear-gradient') && !boundary.style.backgroundImage.includes('url(')){
          boundary.style.setProperty('background-image', 'none', 'important');
        }
        // 닫힌 details는 summary 이외의 자식을 숨긴다. 표지선을 details에
        // 덧붙이면 미니멀 해제 후에도 선이 보이지 않으므로 항상 보이는 제목에 둔다.
        const lineHost = edge === 'top' && boundary === firstBody && firstBody.tagName === 'DETAILS'
          ? (firstBody.querySelector(':scope > summary') || firstBody)
          : boundary;
        appendCoverDividerLine(lineHost, edge, settings, palette.divider);
      }
    }
  }
  return template.innerHTML;
}

// 테마 처리 뒤 한 단계에서 사진·프로필 접합선을 확정한다.
// 사진 표지의 아래는 선 없이 잇고, 나머지 사진 접합선은 기존 인라인 border를 유지한다.
function finalizeCoverProfileBoundaries(html, settings){
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const sections = Array.from(template.content.children).filter(section =>
    !section.hidden && section.getAttribute('aria-hidden') !== 'true'
  );
  const isPhotoCover = section => section.hasAttribute('data-mosaic-cover-image')
    || (section.hasAttribute('data-mosaic-title') && section.hasAttribute('data-mosaic-image-background'));
  const photoEdgeColor = 'rgba(128,128,128,.22)';
  const colorProbe = document.createElement('span');
  colorProbe.style.color = tonePalette(settings).shellBorder;
  const shellColor = colorProbe.style.color;
  colorProbe.style.color = photoEdgeColor;
  const normalizedPhotoColor = colorProbe.style.color;
  sections.forEach(section => {
    if(!isPhotoCover(section) && !section.hasAttribute('data-mosaic-photo-profile')) return;
    // 실제로 그려지는 외곽선만 바꾼다. 표지선이나 꺼진 외곽선을 새로 만들지 않는다.
    ['top','right','bottom','left'].forEach(edge => {
      const style = section.style;
      const borderWidth = style.getPropertyValue(`border-${edge}-width`);
      const borderStyle = style.getPropertyValue(`border-${edge}-style`);
      if(!borderWidth || borderWidth === '0px' || borderStyle === 'none') return;
      colorProbe.style.color = style.getPropertyValue(`border-${edge}-color`);
      if(colorProbe.style.color === shellColor || colorProbe.style.color === normalizedPhotoColor){
        style.setProperty(`border-${edge}-color`, photoEdgeColor, 'important');
      }
    });
  });
  const boundaries = sections.slice(0, -1).map((first, index) =>
    resolveCoverProfileBoundary(first, sections[index + 1], settings)
  );
  boundaries.forEach(({ photo, photoEdge:edge }, index) => {
    const second = sections[index + 1];
    if(photo && edge === 'bottom'){
      // 일반 표제의 기존 위쪽 구분선과 중복되지 않게 새 사진 선으로 교체한다.
      second.style.setProperty('border-top', '0');
      if(second.style.backgroundImage.includes('linear-gradient')
        && !second.style.backgroundImage.includes('url(')) second.style.removeProperty('background-image');
    }
    if(photo){
      photo.style.setProperty(`border-${edge}`, `1px solid ${photoEdgeColor}`, 'important');
      photo.style.setProperty(`border-${edge}-width`, '1px', 'important');
      photo.style.setProperty(`border-${edge}-style`, 'solid', 'important');
      photo.style.setProperty(`border-${edge}-color`, photoEdgeColor, 'important');
    }
  });
  // CSS 축약형·!important의 기존 직렬화 결과를 유지한다. 판단은 다시 하지 않는다.
  template.innerHTML = template.innerHTML;
  const finalSections = Array.from(template.content.children).filter(section =>
    !section.hidden && section.getAttribute('aria-hidden') !== 'true'
  );
  boundaries.forEach(({ removeImageSeam }, index) => {
    if(!removeImageSeam) return;
    const title = finalSections[index], body = finalSections[index + 1];
    clearCoverEdge(title, 'bottom');
    title.style.setProperty('background-clip', 'border-box', 'important');
    clearCoverEdge(body, 'top');
    const heading = body.querySelector(':scope > summary, :scope > [data-mosaic-card-title="true"]');
    if(heading) clearCoverEdge(heading, 'top');
    Array.from(title.children).forEach(child => {
      if(child.getAttribute('aria-hidden') !== 'true') return;
      if(child.style.position === 'absolute' && child.style.bottom === '0px'
        && (child.style.height === '1px' || child.style.height === '0.5px')) child.remove();
    });
  });
  return template.innerHTML;
}

// 숨길 때의 편집 상태를 기억한다. 숨긴 상태에서도 수동 펼치기는 허용한다.
function syncHiddenEditorCollapse(ed, collapseBtn, hiding){
  if(hiding) ed.dataset.collapsedBeforeHide = String(ed.classList.contains('isCollapsed'));
  const collapsed = hiding || ed.dataset.collapsedBeforeHide === 'true';
  if(ed.classList.contains('isCollapsed') !== collapsed) collapseBtn.click();
  if(!hiding) delete ed.dataset.collapsedBeforeHide;
}

function buildCard(settings, sourceCards){
  settings = MosaicParser.outputRuleSettings(settings);
  sourceCards = sourceCards.map(card => card.type === 'comment' ? card
    : {...card,body:MosaicParser.applyOutputTextRules(card.body,settings)});
  const pal = tonePalette(settings);
  const unifiedLayout = normalizeCardLayout(settings.cardLayout) === 'unified';

  // 입력 카드 목록은 호출자가 넘긴다. 출력 생성 중 편집창을 다시 읽지 않는다.
  const firstVisibleSourceIndex = sourceCards.findIndex(card => card.type !== 'comment' && card.visible !== false);
  let cardList = sourceCards
    .map((c, sourceIndex) => ({
      sourceIndex,
      type: c.type === 'comment' ? 'comment' : 'card',
      lines: c.body.split('\n').map(l => l.trim()).filter(l => l !== ''),
      folded: settingFlagOn(c.folded),
      foldTitle: (c.cardTitle !== undefined ? c.cardTitle : (c.foldTitle || '')).trim(),
      visible: c.visible !== false,
    }))
    .filter(c => c.type === 'card' && c.visible && c.lines.length > 0); // 숨긴 카드와 내용이 빈 카드는 출력에서 제외
  // 보이는 카드가 하나라도 있으면 기존의 빈 카드 폴백을 유지한다. 모든 카드가 숨김이면
  // 본문 카드를 새로 만들지 않아 눈 토글의 의미대로 출력에서 완전히 제외한다.
  if(cardList.length === 0 && firstVisibleSourceIndex >= 0){
    cardList = [{ sourceIndex:firstVisibleSourceIndex, lines:[], folded:false, foldTitle:'' }];
  }

  // 배경 이미지는 아카라이브가 썸네일로 인식하지 못하므로, 대표 이미지가 있으면
  // 맨 앞에 크기 0짜리 숨김 <img>를 항상 넣어 글 목록 썸네일로 잡히게 함 (레이아웃 영향 없음)
  let recognitionImg = '';
  if(coverImageAvailable(settings)){
    // 아카라이브의 확대 뷰어는 0px 이미지도 갤러리 대상으로 수집한다. 그 결과
    // 대표 이미지가 먼저여도, 독립 프로필이 먼저여도 다음 시각 블록 위에 확대 아이콘이
    // 떠버린다. 서버의 대표 썸네일 탐색용 <img>는 남기되 모든 배치에서 완전히 숨기고,
    // 뷰어가 이미지로 꾸미는 데 사용하는 fr-* 클래스도 붙이지 않는다.
    recognitionImg = `<div hidden aria-hidden="true" style="display:none !important; width:0; height:0; margin:0; padding:0; overflow:hidden; line-height:0;"><img src="${escapeAttr(settings.imgUrl)}" alt="" hidden style="display:none !important; width:0; height:0; margin:0;"></div>\n`;
  }

  // 대표 이미지와 표제 밴드는 모든 카드 '위'에 항상 표시 — 카드를 접어도 보이고, 첫 카드와 한 몸처럼 연결됨
  let imgBlock = buildImageBlock(settings);
  const hasImg = imgBlock !== '';
  let titleBand = buildTitleBlock(settings, hasImg);
  const hasTitle = titleBand !== '';
  // 표제 미니멀의 하단 경계선뿐 아니라, 표제가 꺼져 대표 이미지와 프로필이 직접
  // 맞닿는 경우의 프로필 상단선도 제거해 두 영역이 하나의 카드처럼 이어지게 한다.
  const profileAtTop = settings.profilePlacement === 'top';
  // 이어보기는 나중에 최상위 프로필의 아래 모서리를 펴지만, 안쪽 인물 카드는
  // 그 단계에서 바뀌지 않는다. 아래에 실제 섹션이 있으면 생성할 때 함께 펴 둔다.
  const unifiedTopProfileContinues = unifiedLayout && (hasImg || hasTitle || cardList.length > 0);
  const originalTopProfileBlock = profileAtTop
    ? buildProfileBlock(settings, false, false, unifiedTopProfileContinues)
    : '';
  const joinTopProfile = !!originalTopProfileBlock && !unifiedLayout
    && profileTitleGapPx(settings) === -20 && (hasImg || hasTitle);
  if(joinTopProfile){
    if(hasImg) imgBlock = buildImageBlock(settings, true);
    else titleBand = buildTitleBlock(settings, false, true);
  }
  const compactProfileTopSpacing = !profileAtTop && hasTitle && settings.titleMinimal;
  const removeProfileTopDivider = !profileAtTop && (compactProfileTopSpacing || (hasImg && !hasTitle));
  const topProfileBlock = joinTopProfile
    ? buildProfileBlock(settings, false, false, true)
    : originalTopProfileBlock;
  const attachedProfileBlock = profileAtTop
    ? ''
    : buildProfileBlock(settings, hasImg || hasTitle, removeProfileTopDivider, unifiedLayout && cardList.length > 0);
  const hasAttachedProfile = attachedProfileBlock !== '';
  const visibleComments = sourceCards
    .map((comment, sourceIndex) => ({ ...comment, sourceIndex }))
    .filter(comment => comment.type === 'comment' && comment.visible !== false && String(comment.body || '').trim());
  const firstBodySourceIndex = unifiedLayout
    ? (cardList.length ? cardList[0].sourceIndex : Number.POSITIVE_INFINITY)
    : Math.min(
        cardList.length ? cardList[0].sourceIndex : Number.POSITIVE_INFINITY,
        visibleComments.length ? visibleComments[0].sourceIndex : Number.POSITIVE_INFINITY
      );

  const foldDividerMinimal = settingFlagOn(settings.foldDividerMinimal);
  const cardInlinePadding = cardInlinePaddingCss(settings);
  const titledBodyTopPadding = foldDividerMinimal
    ? cardBodyTopPaddingCss(12, 2.5, 16, settings)
    : cardBodyTopPaddingCss(20, 4, 24, settings);
  const plainBodyTopPadding = cardBodyTopPaddingCss(20, 4, 26, settings);
  const cardGap = cardGapPx(settings);
  const coverCardGap = coverCardGapPx(settings);
  const imageTitleTouchesBody = hasTitle && !hasAttachedProfile
    && titleImageBackgroundEnabled(settings) && coverCardGap === 0
    && cardList.length > 0 && cardList[0].sourceIndex === firstBodySourceIndex;
  if(imageTitleTouchesBody){
    // 후처리용 data 속성이 제거된 아카라이브 복사본에서도 하단 경계가
    // 살아나지 않도록 사진 표제 자체에 접합 상태를 직접 기록한다.
    titleBand = buildTitleBlock(settings, hasImg, joinTopProfile && !hasImg, true);
  }
  const cardOrnamentOpacity = advancedOpaqueOpacity(settings.cardTitleOrnamentOpacity);
  let blankFoldNumber = 0;
  const cards = cardList.map((card, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === cardList.length - 1;
    const previousCard = cardList[idx - 1];
    const nextCard = cardList[idx + 1];
    const joinedAbove = !unifiedLayout && cardGap === 0 && !!previousCard
      && !visibleComments.some(comment => comment.sourceIndex > previousCard.sourceIndex && comment.sourceIndex < card.sourceIndex);
    const joinedBelow = !unifiedLayout && cardGap === 0 && !!nextCard
      && !visibleComments.some(comment => comment.sourceIndex > card.sourceIndex && comment.sourceIndex < nextCard.sourceIndex);
    const connected = isFirst && card.sourceIndex === firstBodySourceIndex
      && (hasImg || hasTitle || hasAttachedProfile) && (coverCardGap === 0 || unifiedLayout); // 간격 0일 때 도입부와 외곽선을 잇는다.
    // 전역 옵션 하나로 모든 접기 카드와 본문 내부 접기의 제목 아래 구분선을 함께 제어한다.
    const bodySettings = Object.assign({}, settings, {
      foldBodyMinimal: foldDividerMinimal,
      unifiedFoldQuoteContrast: unifiedLayout && card.folded
    });
    const bodyHTML = assembleBody(card.lines, bodySettings);
    const footer = isLast ? buildFooter(settings) : '';
    const cardBodyBottomPadding = cardBodyBottomPaddingCss(settings, Boolean(footer));
    const marginCss = isFirst ? '0 auto' : `${cardGap}px auto 0 auto`;
    // 연결된 첫 카드는 위 모서리를 각지게 해서 이미지와 하나의 틀처럼 이어지게 함
    const cardRadius = cardCornerRadiusPx(settings);
    const topRadius = connected || joinedAbove ? 0 : cardRadius;
    const bottomRadius = joinedBelow ? 0 : cardRadius;
    const radius = `${topRadius}px ${topRadius}px ${bottomRadius}px ${bottomRadius}px`;
    const W = parseInt(settings.cardWidth) || 750;
    // 대표 이미지나 사진 배경 표제가 본문에 바로 붙으면 접합선 없이 한 면으로 잇는다.
    const noTopLine = connected && ((hasTitle && settings.titleMinimal)
      || (hasImg && !hasTitle) || imageTitleTouchesBody);
    const showOuterBorder = settings.cardBorderOn !== false;
    // 표제 밴드와 본문 카드가 하나의 카드처럼 보이도록 외곽선은
    // 모두 표제·이미지에 쓰는 옅은 보조색 외곽선으로 통일한다.
    const shellOuterColor = pal.shellBorder;
    let borderCss = '';
    if(showOuterBorder){
      if(joinedAbove || noTopLine){
        borderCss = `border-left:1px solid ${shellOuterColor}; border-right:1px solid ${shellOuterColor}; border-bottom:1px solid ${shellOuterColor};`;
      }else if(connected){
        borderCss = `border-left:1px solid ${shellOuterColor}; border-right:1px solid ${shellOuterColor}; border-bottom:1px solid ${shellOuterColor}; ${coverDividerTopCss(settings, pal.divider)}`;
      }else{
        borderCss = `border:1px solid ${shellOuterColor};`;
      }
      if(joinedBelow) borderCss += ' border-bottom:0;';
    } else if(connected && !noTopLine){
      // 이미지·표제와 카드 사이의 선은 외곽선이 아니라 내부 경계이므로 유지한다.
      borderCss = coverDividerTopCss(settings, pal.divider);
    }
    const shellStyle = `width:100%; max-width:${W}px; box-sizing:border-box; margin:${marginCss}; ${borderCss} border-radius:${radius}; background-color:${pal.cardBg}; padding:0; overflow:hidden; overflow-wrap:anywhere; word-break:break-word;`;

    if(card.folded){
      // 접기 카드: 카드 틀 전체가 details. 헤더는 배경 없는 깔끔한 제목 줄 하나.
      // 표지(간지) 스타일: 삼각형 마커 제거(list-style:none + display:block), 가운데 정렬,
      // 넉넉한 여백, 제목 양옆 ✦ 장식. 열면 제목 아래 구분선이 나타나 본문과 나뉨.
      const foldTitle = card.foldTitle || '';
      const autoFoldTitle = settingFlagOn(settings.foldTitleAutoNumber) && !foldTitle.trim()
        ? foldAutoNumberText(++blankFoldNumber, settings.foldAutoNumberStyle)
        : '';
      const visibleFoldTitle = foldTitle.trim() || autoFoldTitle;
      const minimalFoldTitle = settingFlagOn(settings.foldTitleMinimal);
      // 제목이 비어 ✦ ✦ ✦만 보이는 카드 헤더는 일반 제목 장식보다 아주 살짝 연하게 둔다.
      const foldOrnamentColor = visibleFoldTitle
        ? pal.ornament
        : mixHex(pal.ornament, pal.cardBg, 0.12);
      const foldTitleHTML = visibleFoldTitle
        ? `<span style="min-width:0; line-height:1.35;">${processInline(visibleFoldTitle, settings.emphasisColor)}</span>`
        : `<span data-mosaic-generated="true" style="color:${foldOrnamentColor}; opacity:${cardOrnamentOpacity}; font-size:12px; line-height:1;">✦</span>`;
      const foldLeftOrnament = minimalFoldTitle
        ? ''
        : `<span data-mosaic-generated="true" style="flex:0 0 auto; color:${foldOrnamentColor}; opacity:${cardOrnamentOpacity}; font-size:12px; line-height:1;">✦</span>`;
      const foldRightOrnament = minimalFoldTitle
        ? ''
        : `<span data-mosaic-generated="true" style="flex:0 0 auto; color:${foldOrnamentColor}; opacity:${cardOrnamentOpacity}; font-size:12px; line-height:1;">✦</span>`;
      const foldBodyBorder = foldDividerStyle(foldDividerMinimal, pal, settings);
      const foldBodyPadding = `${titledBodyTopPadding} ${cardInlinePadding} ${cardBodyBottomPadding}`;
      return `<details data-mosaic-card-index="${card.sourceIndex}" style="${shellStyle}"><summary data-mosaic-fold-title="true" style="box-sizing:border-box; width:100%; height:auto; min-height:0; margin:0; cursor:pointer; display:flex; align-items:center; justify-content:center; column-gap:14px; list-style:none; padding:${cardTitlePaddingPx(settings)}px ${cardInlinePadding}; text-align:center; font-size:${settings.foldTitleSize}px; font-weight:${settings.foldTitleBold ? 700 : 500}; color:${pal.heading[2]}; line-height:1.35; letter-spacing:-0.2px; font-family:${fontStack(settings.narrFont)};">${foldLeftOrnament}${foldTitleHTML}${foldRightOrnament}</summary>
  <div data-mosaic-fold-body="true" style="${foldBodyBorder} padding:${foldBodyPadding};">
${bodyHTML}${footer}  </div>
</details>`;
    }
    const cardTitle = (card.foldTitle || '').trim();
    if(cardTitle){
      const minimalCardTitle = settingFlagOn(settings.foldTitleMinimal);
      const cardTitleHTML = `<span style="min-width:0; line-height:1.35;">${processInline(cardTitle, settings.emphasisColor)}</span>`;
      const cardLeftOrnament = minimalCardTitle
        ? ''
        : `<span data-mosaic-generated="true" style="flex:0 0 auto; color:${pal.ornament}; opacity:${cardOrnamentOpacity}; font-size:12px; line-height:1;">✦</span>`;
      const cardRightOrnament = minimalCardTitle
        ? ''
        : `<span data-mosaic-generated="true" style="flex:0 0 auto; color:${pal.ornament}; opacity:${cardOrnamentOpacity}; font-size:12px; line-height:1;">✦</span>`;
      const cardBodyBorder = foldDividerStyle(foldDividerMinimal, pal, settings);
      const cardBodyPadding = `${titledBodyTopPadding} ${cardInlinePadding} ${cardBodyBottomPadding}`;
      return `<div data-mosaic-card-index="${card.sourceIndex}" style="${shellStyle}">
  <div data-mosaic-card-title="true" style="display:flex; align-items:center; justify-content:center; column-gap:14px; padding:${cardTitlePaddingPx(settings)}px ${cardInlinePadding}; text-align:center; font-size:${settings.foldTitleSize}px; font-weight:${settings.foldTitleBold ? 700 : 500}; color:${pal.heading[2]}; line-height:1.35; letter-spacing:-0.2px; font-family:${fontStack(settings.narrFont)};">${cardLeftOrnament}${cardTitleHTML}${cardRightOrnament}</div>
  <div style="box-sizing:border-box; ${cardBodyBorder} padding:${cardBodyPadding};">
${bodyHTML}${footer}  </div>
</div>`;
    }
    return `<div data-mosaic-card-index="${card.sourceIndex}" style="${shellStyle}">
  <div style="box-sizing:border-box; padding:${plainBodyTopPadding} ${cardInlinePadding} ${cardBodyBottomPadding};">
${bodyHTML}${footer}  </div>
</div>`;
  });

  const renderedCards = new Map(cardList.map((card, index) => [card.sourceIndex, cards[index]]));
  const renderedComments = new Map(visibleComments.map(comment => [comment.sourceIndex, buildCommentBlock(comment, settings)]));
  const orderedBody = sourceCards.map((block, sourceIndex) =>
    block.type === 'comment' ? renderedComments.get(sourceIndex) : renderedCards.get(sourceIndex)
  ).filter(Boolean);
  const renderedCardFlow = cardList.map(card => renderedCards.get(card.sourceIndex)).filter(Boolean);
  const renderedCommentFlow = visibleComments.map(comment => renderedComments.get(comment.sourceIndex)).filter(Boolean);

  // 꼬리말은 마지막 본문 카드 안에 붙인다. 통합 모드의 코멘트는 본문 뒤에 모으되,
  // 크레딧은 코멘트 유무와 관계없이 사용자가 선택한 최상단·최하단에 둔다.
  const credit = buildCredit(settings);
  const creditAtTop = normalizeCreditPlacement(settings.creditPlacement) === 'top';
  const topCredit = creditAtTop ? credit : '';
  const bottomCredit = creditAtTop ? '' : credit;
  const introFlow = topProfileBlock + imgBlock + titleBand + attachedProfileBlock;
  const directFirstCard = cardList.length && cardList[0].sourceIndex === firstBodySourceIndex;
  // 표제·대표 이미지 없이 최상단 프로필만 앞에 놓인 경우에는 그 프로필이
  // 본문 도입부에 붙은 조각이 아니라 독립 카드다. 이어보기 OFF에서는 기본 카드
  // 간격을 보장하고, 간격을 0으로 줄여도 독립 카드의 하단선·둥근 모서리는 남긴다.
  const standaloneTopProfileBeforeBody = !unifiedLayout && profileAtTop
    && Boolean(topProfileBlock) && !hasImg && !hasTitle;
  const spacedIntroFlow = !unifiedLayout && directFirstCard
    ? addCoverCardGapAfterIntro(introFlow, settings, standaloneTopProfileBeforeBody)
    : introFlow;
  const mainFlow = spacedIntroFlow + (unifiedLayout ? renderedCardFlow : orderedBody).join('\n');
  const arrangedMainFlow = unifiedLayout
    ? applyUnifiedCardLayout(mainFlow, settings)
    : (outputThemeShape(settings.outputTheme) === 'document'
      ? mainFlow
      : placeCoverDividerBeforeLeadingComment(mainFlow, settings));
  const collectedComments = unifiedLayout && renderedCommentFlow.length
    ? `\n${renderedCommentFlow.join('\n')}` : '';
  const output = recognitionImg + topCredit + arrangedMainFlow + collectedComments + bottomCredit;
  const lockedOutput = lockOutputTypographyForArca(output);
  const shapedOutput = outputThemeShape(settings.outputTheme) === 'document'
    ? specialThemeOutput(lockedOutput, 'document', settings)
    : lockedOutput;
  const themedOutput = outputThemeTransparent(settings.outputTheme)
    ? transparentOutput(shapedOutput, settings)
    : shapedOutput;
  return finalizeCoverProfileBoundaries(themedOutput, settings);
}

// 편집 UI가 출력 구현의 내부 전역을 하나씩 붙잡지 않도록 공개 경계를 고정한다.
const MosaicRenderer = Object.freeze({
  MOD_KEY,
  addCreditItem,
  assembleBody,
  bodyRenderGroups,
  buildCard,
  buildParagraph,
  combineSoftBreakPair,
  commentParagraphEntries,
  composeOutputTheme,
  creditItemsFromEditor,
  deleteSelectedCreditPreset,
  deleteSelectedDetailPreset,
  expandDialogueLinesForOutput,
  findChar,
  formatStatusContent,
  generateHTML,
  isStatusBodyLine,
  isStructuralBodyLine,
  loadSelectedCreditPreset,
  loadSelectedDetailPreset,
  loadSelectedWebFont,
  normalizeCardLayout,
  normalizeCreditPlacement,
  outputThemeShape,
  outputThemeTransparent,
  parseBodyHeading,
  parseBodyImageLine,
  profileItemGapBasePx,
  renderCreditItemsEditor,
  renderCreditPresetOptions,
  renderDetailPresetOptions,
  saveCurrentCreditPreset,
  saveCurrentDetailPreset,
  setStoredCreditItems,
  splitDialogueLineForOutput,
  statusLineContent,
  storedCreditItems,
  stripEditorOutputMetadata,
  syncCardLayoutCheckbox,
  syncCreditPresetControls,
  syncDetailPresetControls,
  syncHiddenEditorCollapse,
  syncSoftBreakSpacingControl
});
