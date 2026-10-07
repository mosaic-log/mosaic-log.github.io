// 조각로그 v1.8.2 미리보기·편집 UI 모듈.

// 수명 내내 교체되지 않는 기능 루트만 잡아둔다. 렌더 때 새로 생기는 카드와
// 미리보기 자식은 캐시하지 않아 삭제된 DOM을 붙잡는 일을 피한다.
const uiElements = Object.freeze({
  preview:document.getElementById('preview'),
  previewArea:document.getElementById('previewArea'),
  cardEditors:document.getElementById('cardEditors')
});

// 조각로그 v1.8.2 미리보기 렌더 조정기.
function renderOutputViews(settings, cards){
  const previewHTML = MosaicRenderer.buildCard(settings, cards);
  const html = MosaicRenderer.generateHTML(false, previewHTML);
  document.getElementById('codeBox').value = html;
  renderPreview(previewHTML);
  syncUIControlsWhenChanged('palette', () => uiControlValues([
    'narrColor','charColor','userColor','emphasisColor','bgColor','dlgStyle'
  ]), MosaicStorage.renderCurrentThemePalette);
}

const previewPositionState = {
  syncingCharacters:false,
  pendingFocus:null,
  pendingFallbackScrollTop:null,
  fullscreenScrollTop:0,
  toolbarSyncFrame:null
};

function schedulePreviewFocusAfterRender(){
  if(previewPositionState.pendingFocus && positionSyncEnabled()){
    const getter = previewPositionState.pendingFocus;
    const fallbackScrollTop = previewPositionState.pendingFallbackScrollTop;
    previewPositionState.pendingFocus = null;
    previewPositionState.pendingFallbackScrollTop = null;
    requestAnimationFrame(() => {
      if(!positionSyncEnabled()) return;
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
  const cards = getCards();
  syncRenderInputs(cards);
  const settings = MosaicState.getSettings();
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

// 화면 변경이 일으키는 렌더·카운터·초안 저장의 즉시/지연 순서를 한곳에서
// 관리한다. 각 기능은 의도에 맞는 이름을 골라 호출하고 저장 시점을 재조립하지 않는다.
const uiUpdateEffects = Object.freeze({
  renderNow(){ render(); },
  renderLater(beforeFrame){ scheduleRender(beforeFrame); },
  refreshCount(cards, settings){ MosaicApp.updateCounter(cards, settings); },
  saveNow(){ MosaicStorage.saveDraft(); },
  saveLater(){ MosaicStorage.scheduleDraftSave(); },
  renderCountLater(beforeFrame){
    previewRenderState.countPending = true;
    uiUpdateEffects.renderLater(beforeFrame);
  },
  liveInput(){
    uiUpdateEffects.renderCountLater();
    uiUpdateEffects.saveLater();
  },
  controlChange(){
    previewRenderState.countPending = true;
    uiUpdateEffects.renderNow();
    uiUpdateEffects.saveLater();
  },
  committedChange(){
    previewRenderState.countPending = true;
    uiUpdateEffects.renderNow();
    uiUpdateEffects.saveNow();
  },
  renderedDraftChange(){
    uiUpdateEffects.renderNow();
    uiUpdateEffects.saveLater();
  },
  renderedSavedChange(){
    uiUpdateEffects.renderNow();
    uiUpdateEffects.saveNow();
  }
});

// 조각로그 v1.8.2 전역 작업 화면 상태와 오류 표시.
function syncSidebarFieldActive(){
  const active = document.activeElement;
  const isSidebarField = !!(active && active.matches
    && active.closest('#sidebar')
    && active.matches('input, textarea, select, [contenteditable="true"]'));
  document.body.classList.toggle('sidebarFieldActive', isSidebarField);
  if(isSidebarField){
    hideSelToolbar();
    hideBlockToolbar();
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

const previewEditState = {
  drag:null,
  selection:null,
  block:null,
  ready:false,
  committing:false
};

// ---------- 미리보기에서 선택해 서식 적용 ----------
// 미리보기 글자를 드래그하면 작은 도구막대가 뜨고, 굵게/강조를 본문에 바로 적용함.
// 이미 서식이 걸린 부분을 고르면 해당 버튼이 켜지고, 다시 누르면 서식이 해제된다.
// 최상위 문단(접기 블록 밖)만 대상으로 하며, 선택한 글자를 원본 줄에서 찾아 마커로 감싼다.
const FMT_WRAP = { bold: '**', emphasis: '*' };
const FMT_TAG = { bold: 'STRONG', emphasis: 'EM' };
const FMT_RE = {
  // 새 입력은 **만 만들지만, 기존 로그의 __ 굵기도 읽고 해제할 수 있게 남긴다.
  bold: /__(.+?)__|\*\*(.+?)\*\*/g,
  emphasis: /\*\*\*([^*\n]+?)\*\*\*|(?<!\*)\*([^*\n]+?)\*(?!\*)/g
};
const CENTER_RE = /^(>\s?)?\[C\]\s*/i;   // 줄 맨 앞 또는 인용 뒤의 [C]
const previewDirectEditDescriptors = new WeakMap();

function maskInlineFormatMarkers(value, mask){
  const normalized = String(value);
  [
    { re:/\*\*\*([^*\n]+?)\*\*\*/g, width:3 },
    { re:/\*\*([^*\n]+?)\*\*/g, width:2 },
    { re:/__(.+?)__/g, width:2 },
    { re:/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, width:1 }
  ].forEach(({ re, width }) => {
    let match;
    while((match = re.exec(normalized)) !== null){
      mask(match.index, match.index + width);
      mask(match.index + match[0].length - width, match.index + match[0].length);
    }
  });
}

// MosaicRenderer.buildParagraph/MosaicRenderer.assembleBody와 같은 순서로 문법을 해석한다. 화면에 숨겨지는 구간은
// 원문 인덱스를 유지한 채 기록하고, 제목·인용문 안의 화자처럼 보이는 글자는 그대로 둔다.
function sourceProjectionMeta(line){
  const normalized = MosaicParser.normalizeQuotes(String(line));
  const currentSettings = MosaicState.getSettings();
  const hidden = [];
  const hide = (start, end) => {
    if(end > start) hidden.push([Math.max(0, start), Math.min(normalized.length, end)]);
  };
  const leading = normalized.match(/^\s*/);
  let offset = leading ? leading[0].length : 0;
  hide(0, offset);
  const trailing = normalized.match(/\s*$/);
  if(trailing) hide(normalized.length - trailing[0].length, normalized.length);
  let rest = normalized.slice(offset);

  // 출력 텍스트가 없는 구조 문법.
  if(/^\[(?:HR(?:[2-4])?|GAP)\]\s*$/i.test(rest) || /^\[\/접기\]\s*$/.test(rest)){
    hide(offset, normalized.length);
    return { normalized, hidden, start: normalized.length, maskInlineSpeakers:false };
  }

  // 수동 접기 제목: 대괄호와 '접기'만 숨기고 사용자가 쓴 제목은 보이게 둔다.
  const fold = rest.match(/^(?:\[C\]\s*)?\[접기(?:\s+(.+?))?\]\s*$/i);
  if(fold){
    if(!fold[1]){
      hide(offset, normalized.length);
      return { normalized, hidden, start: normalized.length, maskInlineSpeakers:false };
    }
    // 제목 문자열이 [C]나 [접기] 문법 안의 글자와 같아도 첫 일치 위치를 잘못
    // 선택하지 않도록, 문법 접두어의 실제 길이로 제목 시작점을 계산한다.
    const titlePrefix = rest.match(/^(?:\[C\]\s*)?\[접기\s+/i);
    const titleAt = titlePrefix ? titlePrefix[0].length : rest.indexOf(fold[1]);
    const visibleTitle = fold[1].trim();
    const heading = MosaicRenderer.parseBodyHeading(visibleTitle);
    const headingPrefixLength = heading ? visibleTitle.match(/^#{1,4}\s+/)[0].length : 0;
    hide(offset, offset + titleAt + headingPrefixLength);
    hide(offset + titleAt + visibleTitle.length, normalized.length);
    return { normalized, hidden, start: offset + titleAt + headingPrefixLength, maskInlineSpeakers:false };
  }

  // 가운데 정렬은 이미지·소제목·인용보다 먼저 처리된다.
  const centered = rest.match(/^\[C\]\s*/i);
  if(centered){
    hide(offset, offset + centered[0].length);
    offset += centered[0].length;
    rest = normalized.slice(offset);
  }

  // 상태창은 출력에서 바깥 대괄호와 그 안쪽 여백만 숨긴다.
  const statusText = MosaicRenderer.statusLineContent(rest);
  if(statusText !== null){
    const textAt = rest.indexOf(statusText);
    hide(offset, offset + textAt);
    hide(offset + textAt + statusText.length, normalized.length);
    return { normalized, hidden, start: offset + textAt, maskInlineSpeakers:false };
  }

  // 공통 파서의 원문 범위로 캡션만 남긴다. 주소 안의 동일한 글자는 숨긴다.
  const image = MosaicRenderer.parseBodyImageLine(normalized);
  if(image){
    if(image.captionStart === null){
      hide(offset, normalized.length);
      return { normalized, hidden, start: normalized.length, maskInlineSpeakers:false };
    }
    hide(offset, image.captionStart);
    hide(image.captionEnd, normalized.length);
    return { normalized, hidden, start: image.captionStart, maskInlineSpeakers:false };
  }

  // 일반 소제목과 소제목 접기는 접두어 뒤 제목을 그대로 출력한다.
  const heading = rest.match(/^(#{1,4})\s+(.+)$/);
  if(heading){
    // 제목이 # 자체로 시작해도 마커를 제목으로 오인하지 않게 접두어 길이를 사용한다.
    const headingPrefix = rest.match(/^#{1,4}\s+/);
    const textAt = headingPrefix ? headingPrefix[0].length : rest.indexOf(heading[2]);
    hide(offset, offset + textAt);
    return { normalized, hidden, start: offset + textAt, maskInlineSpeakers:false };
  }

  // 인용 안에서는 선택적인 [C]까지만 문법이고, 이후 문자는 모두 실제 본문이다.
  const quote = rest.match(/^>(?!>)\s*/);
  if(quote){
    hide(offset, offset + quote[0].length);
    offset += quote[0].length;
    rest = normalized.slice(offset);
    const innerCenter = rest.match(/^\[C\]\s*/i);
    if(innerCenter){
      hide(offset, offset + innerCenter[0].length);
      offset += innerCenter[0].length;
    }
    return { normalized, hidden, start: offset, maskInlineSpeakers:false };
  }

  // 일반 문단/대사에서만 색상·화자 접두어를 소비한다.
  const color = rest.match(/^\{#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})\}\s*/);
  if(color){
    hide(offset, offset + color[0].length);
    offset += color[0].length;
    rest = normalized.slice(offset);
  }
  const fixedSpeaker = rest.match(/^(?:>>|<<)\s*/);
  if(fixedSpeaker){
    hide(offset, offset + fixedSpeaker[0].length);
    offset += fixedSpeaker[0].length;
  } else {
    const named = rest.match(/^\[([^\[\]\n]{1,24})\]\s*(?=["“‘'])/);
    if(named && MosaicRenderer.findChar(currentSettings, named[1])){
      hide(offset, offset + named[0].length);
      offset += named[0].length;
    }
  }
  // 이어쓰기와 아래쓰기 모두 번역 괄호를 실제 화면에 표시한다.
  // 편집·검색 투영에서도 괄호를 숨기지 않아 화면 글자와 원문 인덱스를 일치시킨다.
  return { normalized, hidden, start: offset, maskInlineSpeakers:true };
}

function sourceContentStart(line){
  return sourceProjectionMeta(line).start;
}

function lineSearchProjection(line){
  const meta = sourceProjectionMeta(line);
  const normalized = meta.normalized;
  const chars = normalized.split('');
  const mask = (start, end) => {
    for(let i = Math.max(0, start); i < Math.min(chars.length, end); i++) chars[i] = '\u0000';
  };
  meta.hidden.forEach(range => mask(range[0], range[1]));

  let m;
  // 일반 문단 중간의 화자 마커만 화면에서 사라진다. 제목·인용문에서는 글자 그대로다.
  if(meta.maskInlineSpeakers){
    const settings = MosaicState.getSettings();
    const speakerRe = /(>>|<<|\[([^\[\]\n]{1,24})\])\s*(?=["“‘'])/g;
    while((m = speakerRe.exec(normalized)) !== null){
      const known = m[1] === '>>' || m[1] === '<<' || !!MosaicRenderer.findChar(settings, m[2]);
      if(known) mask(m.index, m.index + m[0].length);
    }
  }

  // 인라인 서식 기호는 보이지 않지만 내용의 원문 인덱스는 그대로 유지한다.
  // 미리보기 직접 편집에서도 출력 파서와 같은 ** / __ / *** 문법을 사용한다.
  maskInlineFormatMarkers(normalized, mask);
  return chars.join('');
}

// 상태창은 출력할 때 `|` 양옆 공백을 통일하므로 화면 문자열의 길이가 원문과 달라질 수 있다.
// 화면의 각 글자가 원문의 어느 인덱스에서 왔는지 함께 만들어 드래그 범위를 정확히 되돌린다.
function sourceDisplayProjectionMap(line){
  const projection = lineSearchProjection(line);
  const items = [];
  for(let i = 0; i < projection.length; i++){
    if(projection[i] !== '\u0000') items.push({ char:projection[i], raw:i });
  }
  if(!MosaicRenderer.isStatusBodyLine(line)){
    return { text:items.map(item => item.char).join(''), map:items.map(item => item.raw) };
  }

  const parts = [[]];
  const pipes = [];
  items.forEach(item => {
    if(item.char === '|'){
      pipes.push(item);
      parts.push([]);
    }else{
      parts[parts.length - 1].push(item);
    }
  });
  const out = [];
  const map = [];
  parts.forEach((part, index) => {
    let start = 0;
    let end = part.length;
    if(index > 0) while(start < end && /\s/.test(part[start].char)) start++;
    if(index < parts.length - 1) while(end > start && /\s/.test(part[end - 1].char)) end--;
    part.slice(start, end).forEach(item => { out.push(item.char); map.push(item.raw); });
    if(index < pipes.length){
      const pipe = pipes[index];
      out.push(' ', '|', ' ');
      map.push(pipe.raw, pipe.raw, pipe.raw + 1);
    }
  });
  return { text:out.join(''), map };
}

function findSourceRange(line, text, occurrence, caseInsensitive){
  const ranges = findAllSourceRanges(line, text, caseInsensitive);
  return ranges[Math.max(0, occurrence || 0)] || null;
}

function findAllSourceRanges(line, text, caseInsensitive){
  if(!text) return [];
  const display = sourceDisplayProjectionMap(line);
  const normalizedText = MosaicParser.normalizeQuotes(String(text)).replace(/\u00a0/g, ' ').trim();
  if(!normalizedText) return [];
  const hay = caseInsensitive ? display.text.toLowerCase() : display.text;
  const needle = caseInsensitive ? normalizedText.toLowerCase() : normalizedText;
  const ranges = [];
  let from = 0;
  let at = hay.indexOf(needle, from);
  while(at !== -1){
    const last = at + needle.length - 1;
    if(display.map[at] !== undefined && display.map[last] !== undefined){
      ranges.push({ start:display.map[at], end:display.map[last] + 1 });
    }
    from = at + Math.max(1, needle.length);
    at = hay.indexOf(needle, from);
  }
  return ranges;
}

// 대치 범위가 굵게·강조 구간의 경계를 가로지르면 남은 한쪽 마커가 본문에
// 노출될 수 있다. 해당 서식쌍만 걷어낸 뒤 원래 범위를 새 인덱스로 옮긴다.
function prepareSourceRangeReplacement(line, sourceRange){
  const raw = String(line);
  const remove = new Set();
  [
    { re:/__(.+?)__/g, width:2 },
    { re:/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, width:1 }
  ].forEach(({ re, width }) => {
    let match;
    while((match = re.exec(raw)) !== null){
      const innerStart = match.index + width;
      const innerEnd = match.index + match[0].length - width;
      const overlaps = sourceRange.start < innerEnd && sourceRange.end > innerStart;
      const fullyInside = sourceRange.start >= innerStart && sourceRange.end <= innerEnd;
      if(!overlaps || fullyInside) continue;
      for(let i = match.index; i < match.index + width; i++) remove.add(i);
      for(let i = innerEnd; i < innerEnd + width; i++) remove.add(i);
    }
  });
  if(!remove.size) return { line:raw, range:sourceRange };
  let clean = '';
  let cleanStart = 0;
  let cleanEnd = 0;
  for(let i = 0; i < raw.length; i++){
    if(i < sourceRange.start && !remove.has(i)) cleanStart++;
    if(i < sourceRange.end && !remove.has(i)) cleanEnd++;
    if(!remove.has(i)) clean += raw[i];
  }
  return { line:clean, range:{ start:cleanStart, end:cleanEnd } };
}

function replaceSourceRange(line, sourceRange, replacement){
  const prepared = prepareSourceRangeReplacement(line, sourceRange);
  return prepared.line.slice(0, prepared.range.start)
    + replacement
    + prepared.line.slice(prepared.range.end);
}

function comparableFormattedText(value){
  return MosaicRenderer.formatStatusContent(MosaicParser.stripMarkers(MosaicParser.normalizeQuotes(String(value)))).trim();
}

function hideSelToolbar(){
  const bar = document.getElementById('selToolbar');
  bar.style.display = 'none';
  bar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
  previewEditState.selection = null;
}

function hideBlockToolbar(){
  const bar = document.getElementById('blockToolbar');
  bar.style.display = 'none';
  previewEditState.block = null;
}

function showBlockToolbar(ctx){
  hideSelToolbar();
  // 구분선·이미지의 mousedown은 기본 포커스 이동을 막는다. 왼쪽 입력창 포커스가
  // 남아 도구막대가 숨겨지지 않도록 미리보기 메뉴를 열기 전에 해제한다.
  const active = document.activeElement;
  if(active && active.closest && active.closest('#sidebar')) active.blur();
  document.body.classList.remove('sidebarFieldActive');
  previewEditState.block = ctx;
  const bar = document.getElementById('blockToolbar');
  const isImage = ctx.type === 'img';
  const isHeading = ctx.type === 'heading';
  bar.setAttribute('aria-label', isHeading ? '마크다운 소제목 단계 변경' : (isImage ? '본문 이미지 편집' : '문단 구분 요소 편집'));
  bar.querySelectorAll('[data-separator-type]').forEach(button => {
    const isSeparator = !isImage && !isHeading;
    const isCurrent = isSeparator && button.dataset.separatorType === ctx.type;
    button.hidden = !isSeparator;
    button.classList.toggle('active', isCurrent);
    button.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
  });
  bar.querySelector('[data-block-action="ratio"]').hidden = !isImage;
  bar.querySelector('[data-block-action="caption"]').hidden = !isImage;
  bar.querySelector('[data-block-action="delete"]').hidden = isHeading;
  bar.querySelectorAll('[data-heading-level]').forEach(button => {
    const level = Number(button.dataset.headingLevel);
    button.hidden = !isHeading;
    button.classList.toggle('active', isHeading && level === ctx.level);
    button.setAttribute('aria-pressed', isHeading && level === ctx.level ? 'true' : 'false');
  });
  let r = ctx.block.getBoundingClientRect();
  if(isHeading){
    // 전체 너비의 문단 박스 대신 실제 소제목 글자 영역을 기준으로 배치한다.
    const range = document.createRange();
    range.selectNodeContents(ctx.block);
    const textRect = range.getBoundingClientRect();
    if(textRect.width && textRect.height) r = textRect;
  }
  bar.style.display = 'flex';
  const bw = bar.offsetWidth || 100;
  const above = r.top - bar.offsetHeight - 8;
  // 소제목은 글자 중앙 위에, 이미지·구분선은 블록 중앙 위에 배치한다.
  const preferredLeft = r.left + r.width / 2 - bw / 2;
  bar.style.left = Math.max(8, Math.min(window.innerWidth - bw - 8, preferredLeft)) + 'px';
  bar.style.top = Math.max(8, Math.min(window.innerHeight - bar.offsetHeight - 8, above > 8 ? above : r.bottom + 8)) + 'px';
}

function editSeparatorText(text, raw, type, action){
  const lines = text.split('\n');
  if(lines[raw] === undefined) return null;
  const token = lines[raw].match(/^(\s*)\[(?:HR(?:[2-4])?|GAP)\](\s*)$/i);
  if(!token) return null;
  const variants = [
    { type:'hr', token:'[HR]', label:'구분선' },
    { type:'hr2', token:'[HR2]', label:'장면 전환' },
    { type:'hr3', token:'[HR3]', label:'호흡 구분' },
    { type:'hr4', token:'[HR4]', label:'여백' }
  ];
  const current = variants.findIndex(item => item.type === type);
  if(current < 0) return null;
  let message;
  if(String(action).startsWith('separator-')){
    const targetType = String(action).slice('separator-'.length);
    const next = variants.find(item => item.type === targetType);
    const legacyGap = /^\s*\[GAP\]\s*$/i.test(lines[raw]);
    if(!next || (next.type === variants[current].type && !(legacyGap && targetType === 'hr4'))) return null;
    lines[raw] = token[1] + next.token + token[2];
    message = legacyGap && targetType === 'hr4'
      ? '여백 문법을 [HR4]로 변경.'
      : `${variants[current].label}을 ${next.label}으로 변경.`;
  }else if(action === 'delete'){
    lines.splice(raw, 1);
    message = `${variants[current].label} 삭제.`;
  }else return null;
  return {
    text: lines.join('\n'),
    message
  };
}

function editHeadingLevelText(text, raw, action){
  const levelMatch = String(action).match(/^heading-([1-4])$/);
  if(!levelMatch) return null;
  const nextLevel = Number(levelMatch[1]);
  const lines = text.split('\n');
  if(lines[raw] === undefined) return null;
  // 정렬·일부 접기 표시는 그대로 두고 제목의 # 개수만 바꾼다.
  const token = lines[raw].match(/^(\s*(?:\[C\]\s*)?(?:>(?!>)\s*(?:\[C\]\s*)?)?(?:\[접기\s+)?)(#{1,4})(\s+)(.+?)(\s*)$/i);
  if(!token) return null;
  const currentLevel = token[2].length;
  if(currentLevel === nextLevel){
    lines[raw] = token[1] + token[4] + token[5];
    return { text:lines.join('\n'), message:'소제목 표시 해제.' };
  }
  lines[raw] = token[1] + '#'.repeat(nextLevel) + token[3] + token[4] + token[5];
  return {
    text:lines.join('\n'),
    message:`소제목 단계를 ${'#'.repeat(nextLevel)}로 변경.`
  };
}

function buildBodyImageLine(parsed, width, caption){
  const sizeMarker = width === 100 ? '' : ` @${width}`;
  const captionMarker = caption ? ` | ${caption}` : '';
  return `${parsed.leading}[IMG ${parsed.src}${sizeMarker}${captionMarker}]${parsed.trailing}`;
}

function editBodyImageText(text, raw, action){
  const lines = text.split('\n');
  if(lines[raw] === undefined) return null;
  const parsed = MosaicRenderer.parseBodyImageLine(lines[raw]);
  if(!parsed) return null;

  if(action === 'delete'){
    lines.splice(raw, 1);
    return { text:lines.join('\n'), message:'본문 이미지 삭제.' };
  }

  if(action === 'ratio'){
    const input = prompt('이미지 가로 비율 (10~100%)\n세로 크기는 원본 비율에 맞춰 자동 조절됩니다.', String(parsed.width));
    if(input === null) return null;
    const width = Number(String(input).replace('%', '').trim());
    if(!Number.isInteger(width) || width < 10 || width > 100){
      showNoticeToast('비율은 10~100 사이의 정수로 입력하세요.');
      return null;
    }
    lines[raw] = buildBodyImageLine(parsed, width, parsed.caption);
    return { text:lines.join('\n'), message:`이미지 비율을 ${width}%로 변경.` };
  }

  if(action === 'caption'){
    const input = prompt('이미지 캡션\n빈칸으로 저장하면 캡션이 삭제됩니다.', parsed.caption);
    if(input === null) return null;
    const caption = input.replace(/[\r\n]+/g, ' ').trim();
    lines[raw] = buildBodyImageLine(parsed, parsed.width, caption);
    return { text:lines.join('\n'), message:caption ? '이미지 캡션 수정.' : '이미지 캡션 삭제.' };
  }

  return null;
}

function finishBlockToolbarAction(action){
  if(!previewEditState.block) return;
  const { ta, raw, type } = previewEditState.block;
  const result = type === 'heading'
    ? editHeadingLevelText(ta.value, raw, action)
    : (type === 'img'
        ? editBodyImageText(ta.value, raw, action)
        : editSeparatorText(ta.value, raw, type, action));
  if(!result){ hideBlockToolbar(); return; }
  MosaicStorage.snapshotCards();
  ta.value = result.text;
  hideBlockToolbar();
  uiUpdateEffects.committedChange();
  showUndoToast(result.message);
}

function bindBlockToolbarEvents(){
  bindUIFeatureEvents('block-toolbar', () => {
    document.querySelectorAll('#blockToolbar button').forEach(btn => {
      btn.addEventListener('mousedown', e => e.preventDefault());
      btn.addEventListener('click', () => finishBlockToolbarAction(btn.dataset.blockAction));
    });
  });
}

// 선택 영역을 감싸고 있는 서식 태그(<strong>/<em>)를 블록 안에서 찾음
function activeFormatEl(node, tagName, block){
  let el = node.nodeType === 3 ? node.parentElement : node;
  while(el && el !== block){
    if(el.tagName === tagName) return el;
    el = el.parentElement;
  }
  return null;
}

function previewCardContexts(){
  const preview = uiElements.preview;
  const editors = Array.from(document.querySelectorAll('#cardEditors .cardEditor'));
  // 출력 순서를 추측하지 않고 MosaicRenderer.buildCard가 기록한 원래 카드 번호로 직접 연결한다.
  // 빈 카드·접기·카드 제목이 중간에 섞여도 다른 카드 textarea로 밀리지 않는다.
  return Array.from(preview.querySelectorAll(':scope > [data-mosaic-card-index]')).map(cardEl => {
    const sourceIndex = Number(cardEl.dataset.mosaicCardIndex);
    const ed = Number.isInteger(sourceIndex) ? editors[sourceIndex] : null;
    return {
      cardEl,
      sourceIndex,
      ed:ed || null,
      ta:ed ? ed.querySelector('textarea') : null
    };
  }).filter(ctx => ctx.ta);
}

function previewCommentContexts(){
  const preview = uiElements.preview;
  const editors = Array.from(document.querySelectorAll('#cardEditors .cardEditor'));
  return Array.from(preview.querySelectorAll(':scope > [data-mosaic-comment-index]')).map(commentEl => {
    const sourceIndex = Number(commentEl.dataset.mosaicCommentIndex);
    const ed = Number.isInteger(sourceIndex) ? editors[sourceIndex] : null;
    const validEditor = ed && ed.dataset.blockType === 'comment' ? ed : null;
    return {
      commentEl,
      sourceIndex,
      ed:validEditor,
      ta:validEditor ? validEditor.querySelector('textarea') : null
    };
  }).filter(ctx => ctx.ta);
}

// 코멘트의 [BR] 연결 구간은 미리보기에서 하나의 <p>가 되므로 같은 원문 범위와 연결한다.
function commentDisplayEntries(ta){
  return MosaicRenderer.commentParagraphEntries(ta.value);
}

function previewCardBody(cardEl){
  if(!cardEl) return null;
  if(cardEl.tagName === 'DETAILS') return cardEl.querySelector(':scope > div');
  return cardEl.querySelector(':scope > div:not([data-mosaic-card-title="true"])');
}

// 미리보기에서 실제 본문 글자를 가진 최소 블록만 수집한다.
// 바깥 카드·접기 컨테이너와 화자 이름표·꼬리말·장식은 원문 줄과 대응하지 않는다.
function previewSourceBlocks(cardEl){
  const cardSummary = cardEl.tagName === 'DETAILS' && cardEl.firstElementChild
    && cardEl.firstElementChild.tagName === 'SUMMARY' ? cardEl.firstElementChild : null;
  return Array.from(cardEl.querySelectorAll('p, summary, div')).filter(el => {
    if(el === cardSummary) return false;
    if(el.matches('[data-mosaic-quote="true"]')) return true;
    if(el.closest('[data-mosaic-quote="true"]')) return false;
    if(el.matches('[data-mosaic-card-title="true"], [data-mosaic-speaker-label="true"], [data-mosaic-footer="true"], [data-mosaic-credit="true"], [data-mosaic-generated="true"]')) return false;
    if(el.closest('[data-mosaic-card-title="true"], [data-mosaic-speaker-label="true"], [data-mosaic-footer="true"], [data-mosaic-credit="true"], [data-mosaic-generated="true"]')) return false;
    if(el.tagName === 'DIV' && el.querySelector('p, summary, div')) return false;
    return el.textContent.trim() !== '';
  });
}

// 원문 줄 가운데 화면에 실제로 글자가 생기는 줄만 출력 순서 그대로 모은다.
// 제목 없는 수동 접기는 기본 제목이 생성되므로 정렬용 항목은 남기되 직접 편집은 막는다.
function sourceDisplayEntries(ta){
  const result = [];
  const settings = MosaicState.getSettings();
  const sourceLines = ta.value.split('\n');
  for(let raw = 0; raw < sourceLines.length; raw++){
    let line = sourceLines[raw];
    const trimmed = line.trim();
    if(!trimmed) continue;
    if(/^(?:\[C\]\s*)?\[접기\]\s*$/i.test(trimmed)){
      result.push({ raw, editable:false });
      continue;
    }

    // [BR]로 이어진 여러 원문 줄은 미리보기에서 하나의 문단이므로 직접 편집도
    // 하나의 항목으로 묶는다. 구조 문법·빈 줄 앞에서는 결합하지 않는다.
    let rawEnd = raw;
    let combinedLine = line;
    while(/\[BR\]\s*$/i.test(combinedLine) && rawEnd + 1 < sourceLines.length){
      const left = combinedLine.replace(/\[BR\]\s*$/i, '');
      const right = sourceLines[rawEnd + 1];
      const joined = MosaicRenderer.combineSoftBreakPair(left, right);
      if(joined === null) break;
      combinedLine = joined;
      rawEnd++;
    }
    if(rawEnd > raw){
      const renderLines = MosaicRenderer.expandDialogueLinesForOutput([combinedLine], settings);
      renderLines.forEach(renderLine => {
        const projection = sourceDisplayProjectionMap(renderLine).text
          .split(MosaicParser.SOFT_BREAK_TOKEN).join('\n').trim();
        if(!projection) return;
        result.push({
          raw,
          rawEnd,
          editable:renderLines.length === 1,
          renderLine,
          projection,
          occurrence:0,
          sourceBounds:null,
          segmented:false,
          softBreak:true
        });
      });
      raw = rawEnd;
      continue;
    }
    // 대사 옵션 3–5는 한 원문 줄 안의 서술과 대사를 여러 출력 문단으로 나눈다.
    // 미리보기 편집 연결도 같은 분할 결과를 사용해야 HR 등 구조 요소 뒤에서
    // 문단 인덱스가 밀리지 않는다.
    const renderLines = MosaicRenderer.expandDialogueLinesForOutput([line], settings);
    let sourceCursor = 0;
    renderLines.forEach(renderLine => {
      const projection = sourceDisplayProjectionMap(renderLine).text.trim();
      if(!projection) return;
      const ranges = findAllSourceRanges(line, projection, false);
      let occurrence = ranges.findIndex(range => range.start >= sourceCursor);
      if(occurrence < 0) occurrence = 0;
      const sourceBounds = ranges[occurrence] || null;
      if(sourceBounds) sourceCursor = sourceBounds.end;
      result.push({
        raw,
        rawEnd:raw,
        editable:true,
        renderLine,
        projection,
        occurrence,
        sourceBounds,
        segmented:renderLines.length > 1
      });
    });
  }
  return result;
}

// 미리보기 최소 글자 블록과 원문 줄은 렌더 순서가 같다.
// 이 순서 매핑은 접기 내부·접기 제목까지 포함해 최상위 블록만 보던 누락을 피한다.
function findBlockSource(node){
  const originEl = node && node.nodeType === 1 ? node : node && node.parentElement;
  if(!originEl || originEl.closest('[data-mosaic-speaker-label="true"], [data-mosaic-footer="true"], [data-mosaic-credit="true"], [data-mosaic-generated="true"]')) return null;
  const ctx = previewCardContexts().find(item => item.cardEl.contains(node));
  if(!ctx) return null;
  const blocks = previewSourceBlocks(ctx.cardEl);
  const block = blocks.find(item => item.contains(node));
  if(!block) return null;
  const entry = sourceDisplayEntries(ctx.ta)[blocks.indexOf(block)];
  if(!entry || !entry.editable) return null;
  return {
    ta:ctx.ta,
    block,
    raw:entry.raw,
    rawEnd:entry.rawEnd === undefined ? entry.raw : entry.rawEnd,
    softBreak:!!entry.softBreak,
    segmented:!!entry.segmented,
    sourceBounds:entry.sourceBounds || null
  };
}

// ---------- 미리보기에서 직접 글자 편집 ----------
// 출력 HTML 문자열에는 편집 속성을 넣지 않고, 미리보기 DOM을 그린 뒤에만 연결한다.
// 따라서 복사·다운로드되는 HTML에는 contenteditable이나 연결 정보가 섞이지 않는다.
function inlineEditProjection(value){
  const normalized = MosaicParser.normalizeQuotes(String(value));
  const chars = normalized.split('');
  const mask = (start, end) => {
    for(let i = start; i < end && i < chars.length; i++) chars[i] = '\u0000';
  };
  maskInlineFormatMarkers(normalized, mask);
  return chars.join('');
}

// 보이는 글자만 비교해 바뀐 구간을 원문에 되돌린다.
// [C], >, #, 화자, 색상, 굵게·강조 마커처럼 화면에 안 보이는 문법은 그대로 둔다.
function replaceVisibleUsingProjection(rawValue, nextVisible, projection, preserveLineBreaks = false){
  const raw = String(rawValue);
  const projected = projection === undefined ? lineSearchProjection(raw) : projection;
  const rawIndexes = [];
  let oldVisible = '';
  for(let i = 0; i < projected.length; i++){
    if(projected[i] === '\u0000') continue;
    oldVisible += projected[i];
    rawIndexes.push(i);
  }
  const normalizedNext = MosaicParser.normalizeQuotes(String(nextVisible))
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n');
  const next = preserveLineBreaks
    ? normalizedNext.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{2,}/g, '\n').trim()
    : normalizedNext.replace(/\s*\n\s*/g, ' ').trim();
  if(next === oldVisible.trim()) return raw;
  if(!next) return '';

  const old = oldVisible.trim();
  let prefix = 0;
  while(prefix < old.length && prefix < next.length && old[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while(suffix < old.length - prefix && suffix < next.length - prefix
    && old[old.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;

  // projection의 앞뒤 공백은 원문 문법처럼 숨겨질 수 있으므로, 화면 문자열의 실제 시작을 맞춘다.
  const projectedVisible = projected.replace(/\u0000/g, '');
  const leftTrim = projectedVisible.length - projectedVisible.trimStart().length;
  const visibleIndexes = rawIndexes.slice(leftTrim, rawIndexes.length - (projectedVisible.length - projectedVisible.trimEnd().length));
  const replaceStart = prefix < visibleIndexes.length
    ? visibleIndexes[prefix]
    : (visibleIndexes.length ? visibleIndexes[visibleIndexes.length - 1] + 1 : sourceContentStart(raw));
  const oldEnd = old.length - suffix;
  const replaceEnd = oldEnd > prefix && visibleIndexes[oldEnd - 1] !== undefined
    ? visibleIndexes[oldEnd - 1] + 1
    : replaceStart;
  const inserted = next.slice(prefix, next.length - suffix);
  return (raw.slice(0, replaceStart) + inserted + raw.slice(replaceEnd))
    .replace(/____/g, '')
    .replace(/\*\*\*\*/g, '');
}

function replacePreviewBodyLine(rawLine, nextVisible){
  const raw = String(rawLine);
  let core = raw.trim();
  const centerMatch = core.match(/^\[C\]\s*/i);
  if(centerMatch){
    core = core.slice(centerMatch[0].length);
  }
  if(MosaicRenderer.statusLineContent(core) !== null){
    const clean = String(nextVisible).replace(/\u00a0/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
    if(!clean) return '';
    // 상태창은 화면에서만 | 공백이 정리된다. 보이는 글자가 그대로라면 원문의
    // __...__ / *...* 등 혼합 문법을 건드리지 않는다.
    if(clean === sourceDisplayProjectionMap(raw).text.trim()) return raw;
    return replaceVisibleUsingProjection(raw, clean, lineSearchProjection(raw));
  }
  return replaceVisibleUsingProjection(raw, nextVisible, lineSearchProjection(raw));
}

function previewEditableText(el, preserveLineBreaks){
  const clone = el.cloneNode(true);
  clone.querySelectorAll('[data-mosaic-speaker-label="true"], [data-mosaic-generated="true"]')
    .forEach(node => node.remove());
  // 아래쓰기로 표시되는 병행 번역은 DOM상 인접 span이라 textContent에서 두 문장이
  // 붙어 버린다. 원문의 두 내용 사이 공백과 동일하게 한 칸을 보존한다.
  clone.querySelectorAll('[data-mosaic-parallel-translation-mode="stack"]')
    .forEach(node => node.before(document.createTextNode(' ')));
  if(preserveLineBreaks){
    clone.querySelectorAll('br').forEach(node => node.replaceWith(document.createTextNode('\n')));
    return clone.textContent
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }
  return clone.textContent.replace(/\u00a0/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
}

// 한 원문 줄이 여러 미리보기 문단으로 분리된 경우에는 검색 범위를 해당 조각으로
// 제한한다. 같은 문장이 앞뒤에 반복돼도 다른 조각을 수정하지 않게 한다.
function descriptorSourceRange(descriptor, line, text, occurrence){
  const bounds = descriptor && descriptor.sourceBounds;
  if(bounds && Number.isInteger(bounds.start) && Number.isInteger(bounds.end)){
    const segment = line.slice(bounds.start, bounds.end);
    const local = findSourceRange(segment, text, occurrence, false);
    if(local) return { start:bounds.start + local.start, end:bounds.start + local.end };
    // 자동 분리된 대사는 반드시 자기 원문 조각 안에서만 수정한다.
    // 조각 검색에 실패했을 때 줄 전체로 되돌아가면 같은 문장이 인접 조각에서
    // 발견되어 엉뚱한 대사에 서식이나 편집 내용이 적용될 수 있다.
    if(descriptor && descriptor.segmented) return null;
  }
  return findSourceRange(line, text, occurrence, false);
}

// [BR] 문단은 여러 원문 줄이 미리보기의 한 블록으로 합쳐진다. 선택한 글자가
// 첫 줄이 아닌 경우에도 결합 순서대로 각 원문 줄의 후보를 세어 실제 줄과 범위를 찾는다.
function descriptorSelectionSource(descriptor, text, occurrence){
  if(!descriptor || !descriptor.ta) return null;
  const lines = descriptor.ta.value.split('\n');
  const rawStart = descriptor.raw;
  const rawEnd = Math.max(rawStart, Number.isInteger(descriptor.rawEnd) ? descriptor.rawEnd : rawStart);
  if(descriptor.softBreak && rawEnd > rawStart){
    let remaining = Math.max(0, occurrence || 0);
    for(let raw = rawStart; raw <= rawEnd; raw++){
      const line = lines[raw];
      if(line === undefined) continue;
      const ranges = findAllSourceRanges(line, text, false);
      if(remaining < ranges.length){
        return { raw, range:ranges[remaining], occurrence:remaining, sourceBounds:null, segmented:false };
      }
      remaining -= ranges.length;
    }
    return null;
  }
  const line = lines[rawStart];
  if(line === undefined) return null;
  const range = descriptorSourceRange(descriptor, line, text, occurrence);
  return range ? {
    raw:rawStart,
    range,
    occurrence,
    sourceBounds:descriptor.sourceBounds || null,
    segmented:!!descriptor.segmented
  } : null;
}

function revealCoverControl(ids){
  const list = Array.isArray(ids) ? ids : [ids];
  const input = list.map(id => document.getElementById(id)).find(Boolean);
  if(!input) return;
  const btn = document.querySelector('.tabBtn[data-tab="tabCover"]');
  if(btn && !btn.classList.contains('active')) btn.click();
  requestAnimationFrame(() => {
    const sidebar = document.getElementById('sidebar');
    const sidebarTop = document.getElementById('sidebarTop');
    const target = input.closest('.row') || input;
    const targetRect = target.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    const headerBottom = sidebarTop ? sidebarTop.getBoundingClientRect().bottom : sidebarRect.top;
    const desiredTop = Math.max(sidebarRect.top + 12, headerBottom + 20);
    if(targetRect.top < desiredTop || targetRect.bottom > sidebarRect.bottom - 12){
      sidebar.scrollTop += targetRect.top - desiredTop;
    }
    target.style.boxShadow = '0 0 0 2px var(--accent)';
    setTimeout(() => { target.style.boxShadow = ''; }, 900);
    if(typeof input.setSelectionRange === 'function') input.setSelectionRange(0, input.value.length);
  });
}

function revealProfileControl(id){
  const input = document.getElementById(id);
  if(!input) return;
  const coverTab = document.getElementById('tabBtnCover');
  if(coverTab && !coverTab.classList.contains('active')) coverTab.click();
  const profileGroup = document.getElementById('profileGroup');
  if(profileGroup) profileGroup.open = true;
  const extraSlot = String(id).match(/^profileExtra([3-6])/);
  const subgroupId = extraSlot ? `profileExtra${extraSlot[1]}Group` : id.startsWith('profileChar')
    ? 'profileCharGroup'
    : (id.startsWith('profileUser') ? 'profileUserGroup' : 'profileCommonGroup');
  const subgroup = document.getElementById(subgroupId);
  if(subgroup) subgroup.open = true;
  requestAnimationFrame(() => {
    if(!positionSyncEnabled() || !input.isConnected) return;
    const sidebar = document.getElementById('sidebar');
    const sidebarTop = document.getElementById('sidebarTop');
    const target = input.closest('.row') || input;
    const targetRect = target.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    const headerBottom = sidebarTop ? sidebarTop.getBoundingClientRect().bottom : sidebarRect.top;
    const desiredTop = Math.max(sidebarRect.top + 12, headerBottom + 20);
    if(targetRect.top < desiredTop || targetRect.bottom > sidebarRect.bottom - 12){
      sidebar.scrollTop += targetRect.top - desiredTop;
    }
    target.style.boxShadow = '0 0 0 2px var(--accent)';
    setTimeout(() => { if(target.isConnected) target.style.boxShadow = ''; }, 900);
  });
}

function creditEditorInput(index, field){
  if(!Number.isInteger(index) || index < 0) return null;
  const row = document.querySelector(`#creditEditorList .creditEditorRow[data-credit-index="${index}"]`);
  if(!row) return null;
  const selector = field === 'label' ? '.creditLabelInput'
    : (field === 'url' ? '.creditUrlInput' : '.creditValueInput');
  return row.querySelector(selector);
}

function revealCreditControl(index, field){
  const input = creditEditorInput(index, field);
  if(!input) return;
  const coverTab = document.getElementById('tabBtnCover');
  if(coverTab && !coverTab.classList.contains('active')) coverTab.click();
  const creditGroup = document.getElementById('creditGroup');
  if(creditGroup) creditGroup.open = true;
  requestAnimationFrame(() => {
    if(!positionSyncEnabled() || !input.isConnected) return;
    const sidebar = document.getElementById('sidebar');
    const sidebarTop = document.getElementById('sidebarTop');
    const row = input.closest('.creditEditorRow');
    const target = row || input;
    const targetRect = target.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    const headerBottom = sidebarTop ? sidebarTop.getBoundingClientRect().bottom : sidebarRect.top;
    const desiredTop = Math.max(sidebarRect.top + 12, headerBottom + 20);
    if(targetRect.top < desiredTop || targetRect.bottom > sidebarRect.bottom - 12){
      sidebar.scrollTop += targetRect.top - desiredTop;
    }
    input.style.boxShadow = '0 0 0 2px var(--accent)';
    setTimeout(() => { if(input.isConnected) input.style.boxShadow = ''; }, 900);
  });
}

// 위치 맞추기가 켜져 있으면 미리보기 직접 편집도 기존 양방향 연결에 참여한다.
// 포커스는 미리보기에 둔 채 왼쪽 탭·카드·원문 줄만 찾아 보여준다.
function syncDirectEditPosition(el, descriptor){
  if(descriptor.type === 'body' || descriptor.type === 'comment'){
    cardEditorState.activeTextarea = descriptor.ta;
    syncBodyOnlyToolbarAvailability({ target:descriptor.ta });
  }
  if(!positionSyncEnabled()) return;
  if(descriptor.type === 'cover'){
    revealCoverControl(descriptor.id);
    return;
  }
  if(descriptor.type === 'coverSubtitle'){
    revealCoverControl(descriptor.ids);
    return;
  }
  if(descriptor.type === 'profile'){
    revealProfileControl(descriptor.id);
    return;
  }
  if(descriptor.type === 'credit'){
    revealCreditControl(descriptor.index, descriptor.field);
    return;
  }
  if(descriptor.type === 'body'){
    revealInEditor(
      descriptor.ta,
      descriptor.raw,
      previewEditableText(el, true),
      0,
      descriptor.sourceBounds,
      descriptor.segmented
    );
    return;
  }
  if(descriptor.type === 'comment'){
    revealCommentInEditor(descriptor.ta, descriptor.raw, descriptor.rawEnd);
  }
}

function commitPreviewCoverEdit(el, descriptor, next){
  const input = document.getElementById(descriptor.id);
  if(!input) return;
  const updated = replaceVisibleUsingProjection(input.value, next, inlineEditProjection(input.value));
  if(updated === input.value) return;
  previewEditState.committing = true;
  MosaicStorage.snapshotCards();
  input.value = updated;
  input.dispatchEvent(new Event('input', { bubbles:true }));
  showUndoToast('미리보기에서 표지 수정.');
  previewEditState.committing = false;
  return;
}

function commitPreviewSubtitleEdit(el, descriptor, next){
  const ids = descriptor.ids || [];
  const values = {};
  const hasCouple = ids.includes('subChar') || ids.includes('subUser');
  const hasFree = ids.includes('logSubtitle');
  let coupleText = hasCouple ? next : '';
  let freeText = hasFree ? next : '';
  if(hasCouple && hasFree){
    // 이름 구분 기호도 ·일 수 있으므로 자유 부제 앞의 마지막 구분점을 사용한다.
    const spacedDividerAt = next.lastIndexOf(' · ');
    const dividerAt = spacedDividerAt >= 0 ? spacedDividerAt : next.lastIndexOf('·');
    if(dividerAt >= 0){
      const dividerLength = spacedDividerAt >= 0 ? 3 : 1;
      coupleText = next.slice(0, dividerAt).trim();
      freeText = next.slice(dividerAt + dividerLength).trim();
    }else{
      // 보호 기호를 우회해 ·가 사라져도 이름과 자유 부제를 한 값으로 합치지 않는다.
      const currentNames = [
        document.getElementById('subChar').value,
        document.getElementById('subUser').value
      ];
      const separator = MosaicParser.normalizeSubtitleCoupleSeparator(document.getElementById('subtitleCoupleSeparator').value);
      coupleText = currentNames
        .filter(value => value.trim()).join(` ${separator} `);
      freeText = document.getElementById('logSubtitle').value;
    }
  }
  if(ids.includes('subChar') && ids.includes('subUser')){
    const separator = MosaicParser.normalizeSubtitleCoupleSeparator(document.getElementById('subtitleCoupleSeparator').value);
    const divider = coupleText.match(new RegExp(`\\s+${escRe(separator)}\\s+|${escRe(separator)}`));
    if(divider){
      const at = divider.index;
      const first = coupleText.slice(0, at).trim();
      const second = coupleText.slice(at + divider[0].length).trim();
      values.subChar = first;
      values.subUser = second;
    }else{
      // 보호 기호를 우회해 구분 기호가 사라져도 두 입력값을 합치지 않는다.
      // 기존 값을 그대로 보존해 두 이름이 중복되는 회귀를 막는다.
      values.subChar = document.getElementById('subChar').value;
      values.subUser = document.getElementById('subUser').value;
    }
  }else if(ids.includes('subChar')){
    values.subChar = coupleText;
  }else if(ids.includes('subUser')){
    values.subUser = coupleText;
  }
  if(hasFree) values.logSubtitle = freeText;
  Object.keys(values).forEach(id => {
    const input = document.getElementById(id);
    values[id] = replaceVisibleUsingProjection(input.value, values[id], inlineEditProjection(input.value));
  });
  const changed = Object.entries(values).some(([id, value]) => document.getElementById(id).value !== value);
  if(!changed) return;
  previewEditState.committing = true;
  MosaicStorage.snapshotCards();
  Object.entries(values).forEach(([id, value]) => { document.getElementById(id).value = value; });
  const trigger = document.getElementById(Object.keys(values)[0]);
  if(trigger) trigger.dispatchEvent(new Event('input', { bubbles:true }));
  showUndoToast('미리보기에서 부제 수정.');
  previewEditState.committing = false;
  return;
}

function commitPreviewProfileEdit(el, descriptor, next){
  const input = document.getElementById(descriptor.id);
  if(!input) return;
  const visible = descriptor.normalizeTag ? normalizeProfileTag(next) : next;
  const updated = replaceVisibleUsingProjection(
    input.value,
    visible,
    inlineEditProjection(input.value),
    descriptor.multiline === true
  );
  if(updated === input.value) return;
  previewEditState.committing = true;
  try {
    MosaicStorage.snapshotCards();
    input.value = updated;
    input.dispatchEvent(new Event('input', { bubbles:true }));
    showUndoToast('미리보기에서 프로필 수정.');
  } finally {
    previewEditState.committing = false;
  }
  return;
}

function commitPreviewCreditEdit(el, descriptor, next){
  const input = creditEditorInput(descriptor.index, descriptor.field);
  if(!input) return;
  const updated = String(next).slice(0, Number(input.maxLength) > 0 ? Number(input.maxLength) : 500);
  const staged = el.dataset.previewCreditStaged === 'true';
  if(updated === input.value && !staged) return;
  previewEditState.committing = true;
  try {
    // 입력 중 이미 원본 필드에 임시 동기화했다면 그때 만든 수정 전 스냅샷을 보존한다.
    // blur에서 다시 스냅샷을 만들면 실행 취소 기준도 수정 후 값으로 덮일 수 있다.
    if(!staged) MosaicStorage.snapshotCards();
    input.value = updated;
    MosaicRenderer.setStoredCreditItems(MosaicRenderer.creditItemsFromEditor(), true);
    showUndoToast(`미리보기에서 크레딧 ${descriptor.field === 'label' ? '항목명' : '내용'} 수정.`);
  } finally {
    delete el.dataset.previewCreditStaged;
    previewEditState.committing = false;
  }
  return;
}

function commitPreviewCommentEdit(el, descriptor, next){
  const owningContext = previewCommentContexts().find(ctx => ctx.commentEl.contains(el));
  if(!owningContext || owningContext.ta !== descriptor.ta){
    // 다시 렌더된 오래된 문단이 다른 코멘트 원문을 덮어쓰지 않게 한다.
    uiUpdateEffects.renderNow();
    return;
  }
  const ta = descriptor.ta;
  const lines = ta ? ta.value.split('\n') : [];
  if(!ta || lines[descriptor.raw] === undefined) return;
  const rawEnd = Math.max(descriptor.raw, Number.isInteger(descriptor.rawEnd) ? descriptor.rawEnd : descriptor.raw);
  const updatedGroup = next.split('\n').join('[BR]\n');
  const oldGroup = lines.slice(descriptor.raw, rawEnd + 1).join('\n');
  if(updatedGroup === oldGroup) return;
  previewEditState.committing = true;
  MosaicStorage.snapshotCards();
  const replacementLines = updatedGroup ? updatedGroup.split('\n') : [];
  lines.splice(descriptor.raw, rawEnd - descriptor.raw + 1, ...replacementLines);
  ta.value = lines.join('\n');
  cardEditorState.activeTextarea = ta;
  ta.dispatchEvent(new Event('input', { bubbles:true }));
  showUndoToast('미리보기에서 코멘트 수정.');
  previewEditState.committing = false;
  return;
}

function commitPreviewBodyEdit(el, descriptor, next){
  const owningContext = previewCardContexts().find(ctx => ctx.cardEl.contains(el));
  if(!owningContext || owningContext.ta !== descriptor.ta){
    // 연결이 바뀐 오래된 미리보기 요소는 절대 다른 카드 원문에 저장하지 않는다.
    uiUpdateEffects.renderNow();
    return;
  }
  const ta = descriptor.ta;
  const lines = ta ? ta.value.split('\n') : [];
  if(!ta || lines[descriptor.raw] === undefined) return;
  const rawLine = lines[descriptor.raw];
  const rawEnd = Math.max(descriptor.raw, Number.isInteger(descriptor.rawEnd) ? descriptor.rawEnd : descriptor.raw);
  if(!descriptor.segmented && (descriptor.softBreak || next.includes('\n'))){
    const nextParts = next.split('\n');
    const oldParts = lines.slice(descriptor.raw, rawEnd + 1)
      .map(part => part.replace(/\[BR\]\s*$/i, ''));
    const updatedGroup = nextParts.map((part, index) => {
      // 기존 각 줄의 [C]·화자·색상·강조 문법은 가능한 한 그대로 유지하고,
      // 새로 생긴 줄만 보이는 글자를 원문으로 사용한다.
      if(oldParts[index] !== undefined) return replacePreviewBodyLine(oldParts[index], part);
      return part;
    }).join('[BR]\n');
    const oldGroup = lines.slice(descriptor.raw, rawEnd + 1).join('\n');
    if(updatedGroup === oldGroup) return;
    previewEditState.committing = true;
    MosaicStorage.snapshotCards();
    const replacementLines = updatedGroup ? updatedGroup.split('\n') : [];
    lines.splice(descriptor.raw, rawEnd - descriptor.raw + 1, ...replacementLines);
    ta.value = lines.join('\n');
    cardEditorState.activeTextarea = ta;
    ta.dispatchEvent(new Event('input', { bubbles:true }));
    showUndoToast('미리보기에서 같은 문단 줄바꿈 수정.');
    previewEditState.committing = false;
    return;
  }
  let updated;
  if(descriptor.segmented && descriptor.sourceBounds){
    const start = descriptor.sourceBounds.start;
    const end = descriptor.sourceBounds.end;
    const segment = rawLine.slice(start, end);
    const nextSegment = replaceVisibleUsingProjection(segment, next, lineSearchProjection(segment));
    updated = rawLine.slice(0, start) + nextSegment + rawLine.slice(end);
  }else{
    updated = replacePreviewBodyLine(rawLine, next);
  }
  if(updated === lines[descriptor.raw]) return;
  previewEditState.committing = true;
  MosaicStorage.snapshotCards();
  if(!descriptor.segmented && updated === '') lines.splice(descriptor.raw, 1);
  else lines[descriptor.raw] = updated;
  ta.value = lines.join('\n');
  cardEditorState.activeTextarea = ta;
  ta.dispatchEvent(new Event('input', { bubbles:true }));
  showUndoToast('미리보기에서 본문 수정.');
  previewEditState.committing = false;
}

function commitPreviewDirectEdit(el, descriptor){
  if(previewEditState.committing) return;
  const preservesLineBreaks = descriptor.type === 'body' || descriptor.type === 'comment' || descriptor.multiline === true;
  const next = previewEditableText(el, preservesLineBreaks);
  switch(descriptor.type){
    case 'cover': return commitPreviewCoverEdit(el, descriptor, next);
    case 'coverSubtitle': return commitPreviewSubtitleEdit(el, descriptor, next);
    case 'profile': return commitPreviewProfileEdit(el, descriptor, next);
    case 'credit': return commitPreviewCreditEdit(el, descriptor, next);
    case 'comment': return commitPreviewCommentEdit(el, descriptor, next);
    default: return commitPreviewBodyEdit(el, descriptor, next);
  }
}
function previewSelectionDetails(el, formatNode){
  let text = '';
  let before = '';
  if(formatNode){
    text = formatNode.textContent || '';
    const pre = document.createRange();
    pre.selectNodeContents(el);
    try { pre.setEndBefore(formatNode); } catch(e){ return null; }
    before = pre.toString();
  }else{
    const sel = window.getSelection();
    if(!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if(!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null;
    text = sel.toString();
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    before = pre.toString();
  }
  text = text.replace(/\u00a0/g, ' ').trim();
  if(!text) return null;
  let occurrence = 0;
  let from = 0;
  let at = before.indexOf(text, from);
  while(at !== -1){
    occurrence++;
    from = at + Math.max(1, text.length);
    at = before.indexOf(text, from);
  }
  return { text, occurrence };
}

// 브라우저가 contenteditable 내부에 자체 <b>/<i>를 넣더라도 DOM에만 남겨두지 않고
// 반드시 대응하는 본문 원문 줄의 **...** / *...* 문법으로 변환한다.
function applyPreviewFormatToSource(el, descriptor, fmt, details){
  if(previewEditState.committing || !descriptor || descriptor.type !== 'body' || !details) return false;
  const owningContext = previewCardContexts().find(ctx => ctx.cardEl.contains(el));
  if(!owningContext || owningContext.ta !== descriptor.ta) return false;
  const ta = descriptor.ta;
  const lines = ta ? ta.value.split('\n') : [];
  const resolved = descriptorSelectionSource(descriptor, details.text, details.occurrence);
  if(!resolved) return false;
  const raw = resolved.raw;
  const line = lines[raw];
  if(line === undefined) return false;
  const sourceRange = resolved.range;
  const wrap = FMT_WRAP[fmt];
  if(!wrap) return false;

  let nextLine = '';
  let removed = false;
  const re = new RegExp(FMT_RE[fmt].source, 'g');
  let match;
  while((match = re.exec(line)) !== null){
    const innerStart = match.index + wrap.length;
    const innerEnd = match.index + match[0].length - wrap.length;
    if(sourceRange.start >= innerStart && sourceRange.end <= innerEnd){
      nextLine = line.slice(0, match.index) + MosaicParser.formatMatchContent(fmt, match) + line.slice(match.index + match[0].length);
      removed = true;
      break;
    }
  }
  if(!nextLine){
    const selectedSource = line.slice(sourceRange.start, sourceRange.end);
    nextLine = line.slice(0, sourceRange.start) + wrap + selectedSource + wrap + line.slice(sourceRange.end);
  }
  if(nextLine === line) return false;

  previewEditState.committing = true;
  try {
    MosaicStorage.snapshotCards();
    lines[raw] = nextLine;
    ta.value = lines.join('\n');
    cardEditorState.activeTextarea = ta;
    ta.dispatchEvent(new Event('input', { bubbles:true }));
    showUndoToast(`${fmt === 'bold' ? '굵게' : '강조'} 서식 ${removed ? '해제' : '적용'}.`);
  } finally {
    previewEditState.committing = false;
  }
  return true;
}

function wrapPreviewTextTokenAt(el, offset, token, key, label){
  if(offset < 0 || el.querySelector(`[data-preview-protected-token="${key}"]`)) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  let consumed = 0;
  while((node = walker.nextNode())){
    const end = consumed + node.nodeValue.length;
    if(offset < consumed || offset >= end){
      consumed = end;
      continue;
    }
    const at = offset - consumed;
    if(node.nodeValue.slice(at, at + token.length) !== token) return;
    const before = node.nodeValue.slice(0, at);
    const after = node.nodeValue.slice(at + token.length);
    const divider = document.createElement('span');
    divider.dataset.previewProtectedToken = key;
    divider.setAttribute('contenteditable', 'false');
    divider.setAttribute('aria-label', label);
    divider.textContent = token;
    const fragment = document.createDocumentFragment();
    if(before) fragment.appendChild(document.createTextNode(before));
    fragment.appendChild(divider);
    if(after) fragment.appendChild(document.createTextNode(after));
    node.parentNode.replaceChild(fragment, node);
    return;
  }
}

function protectPreviewSubtitleDividers(el, keys){
  if(!el || !Array.isArray(keys) || !keys.length) return;
  let text = el.textContent;
  if(keys.includes('subtitle-couple-divider')){
    const token = MosaicParser.normalizeSubtitleCoupleSeparator(document.getElementById('subtitleCoupleSeparator').value);
    const spacedAt = text.indexOf(` ${token} `);
    const offset = spacedAt >= 0 ? spacedAt + 1 : text.indexOf(token);
    wrapPreviewTextTokenAt(el, offset, token, 'subtitle-couple-divider', '이름 구분 기호');
  }
  if(keys.includes('subtitle-free-divider')){
    text = el.textContent;
    // 이름 사이에도 ·를 선택할 수 있으므로 자유 부제 앞의 마지막 점을 보호한다.
    const spacedAt = text.lastIndexOf(' · ');
    const offset = spacedAt >= 0 ? spacedAt + 1 : text.lastIndexOf('·');
    wrapPreviewTextTokenAt(el, offset, '·', 'subtitle-free-divider', '자유 부제 구분 기호');
  }
}

function previewSelectionOffsets(el){
  const selection = window.getSelection();
  if(!selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if(!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null;
  const beforeStart = document.createRange();
  beforeStart.selectNodeContents(el);
  beforeStart.setEnd(range.startContainer, range.startOffset);
  const beforeEnd = document.createRange();
  beforeEnd.selectNodeContents(el);
  beforeEnd.setEnd(range.endContainer, range.endOffset);
  return { start:beforeStart.toString().length, end:beforeEnd.toString().length };
}

// contenteditable 문단의 시작에서 Backspace, 끝에서 Delete를 누르면 브라우저가
// 이웃 문단 DOM을 합칠 수 있다. 그 상태에서 blur 저장이 실행되면 현재 문단이 아닌
// 인용문의 마지막 줄이나 구분선 너머 문단까지 수정 범위로 오인할 수 있으므로,
// 문단 경계를 넘는 삭제만 막고 문단 내부 선택 삭제는 그대로 허용한다.
function previewBoundaryDeleteBlocked(el, inputType){
  // 모바일 편집기와 단어·행 단위 삭제도 같은 경계를 넘을 수 있다.
  const direction = String(inputType).match(/^delete(?:Content|Word|SoftLine|HardLine)(Backward|Forward)$/i);
  if(!direction) return false;
  const selection = previewSelectionOffsets(el);
  if(!selection || selection.start !== selection.end) return false;
  const fullRange = document.createRange();
  fullRange.selectNodeContents(el);
  const length = fullRange.toString().length;
  if(direction[1].toLowerCase() === 'backward') return selection.start === 0;
  return selection.start === length;
}

function subtitleDividerEditBlocked(el, inputType){
  const dividers = Array.from(el.querySelectorAll('[data-preview-protected-token]'));
  const selection = previewSelectionOffsets(el);
  if(!dividers.length || !selection) return false;
  return dividers.some(divider => {
    const beforeDivider = document.createRange();
    beforeDivider.selectNodeContents(el);
    beforeDivider.setEndBefore(divider);
    const dividerStart = beforeDivider.toString().length;
    const dividerEnd = dividerStart + divider.textContent.length;
    if(selection.start !== selection.end){
      return selection.start < dividerEnd && selection.end > dividerStart;
    }
    if(/^delete.*Backward$/i.test(inputType)) return selection.start === dividerEnd;
    if(/^delete.*Forward$/i.test(inputType)) return selection.start === dividerStart;
    return false;
  });
}

function enablePreviewDirectEditor(el, descriptor, label){
  if(!el || el.dataset.previewDirectEdit === 'true') return;
  const preservesLineBreaks = descriptor.type === 'body' || descriptor.type === 'comment' || descriptor.multiline === true;
  el.dataset.previewDirectEdit = 'true';
  el.dataset.previewEditType = descriptor.type;
  previewDirectEditDescriptors.set(el, descriptor);
  el.setAttribute('contenteditable', 'plaintext-only');
  el.setAttribute('role', 'textbox');
  el.setAttribute('aria-label', label);
  el.setAttribute('title', preservesLineBreaks
    ? '미리보기에서 수정 · Enter 저장 · Shift+Enter 같은 문단 줄바꿈 · Esc 취소'
    : '미리보기에서 수정 · Enter 저장 · Esc 취소');
  // 미리보기는 교정 화면이 아니므로 브라우저·확장 프로그램의 빨간 맞춤법 밑줄을 표시하지 않는다.
  el.spellcheck = false;
  el.setAttribute('spellcheck', 'false');
  el.setAttribute('autocorrect', 'off');
  el.setAttribute('autocapitalize', 'off');
  el.setAttribute('data-gramm', 'false');
  el.setAttribute('data-gramm_editor', 'false');
  el.setAttribute('data-enable-grammarly', 'false');
  el.querySelectorAll('[data-mosaic-speaker-label="true"], [data-mosaic-generated="true"]')
    .forEach(node => node.setAttribute('contenteditable', 'false'));
  if(descriptor.protectedSubtitleTokens) protectPreviewSubtitleDividers(el, descriptor.protectedSubtitleTokens);

  let cancelled = false;
  let focusValue = '';
  const syncChangedHighlight = () => {
    if(previewEditableText(el, preservesLineBreaks) !== focusValue){
      el.dataset.previewEditChanged = 'true';
    }else{
      delete el.dataset.previewEditChanged;
    }
  };
  el.addEventListener('focus', () => {
    focusValue = previewEditableText(el, preservesLineBreaks);
    delete el.dataset.previewEditChanged;
    syncDirectEditPosition(el, descriptor);
  });
  el.addEventListener('beforeinput', e => {
    if(previewBoundaryDeleteBlocked(el, e.inputType || '')){
      e.preventDefault();
      return;
    }
    if(descriptor.protectedSubtitleTokens && subtitleDividerEditBlocked(el, e.inputType || '')){
      e.preventDefault();
      return;
    }
    const fmt = e.inputType === 'formatBold' ? 'bold'
      : (e.inputType === 'formatItalic' ? 'emphasis' : null);
    if(fmt){
      e.preventDefault();
      applyPreviewFormatToSource(el, descriptor, fmt, previewSelectionDetails(el));
      return;
    }
    if(e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') e.preventDefault();
  });
  el.addEventListener('paste', e => {
    e.preventDefault();
    if(descriptor.protectedSubtitleTokens && subtitleDividerEditBlocked(el, 'insertFromPaste')) return;
    const pasted = (e.clipboardData || window.clipboardData).getData('text/plain');
    const plain = preservesLineBreaks
      ? pasted.replace(/\r\n?/g, '\n')
      : pasted.replace(/\s*\n\s*/g, ' ');
    document.execCommand('insertText', false, plain);
  });
  el.addEventListener('cut', e => {
    if(descriptor.protectedSubtitleTokens && subtitleDividerEditBlocked(el, 'deleteByCut')) e.preventDefault();
  });
  el.addEventListener('input', e => {
    if(descriptor.protectedSubtitleTokens && descriptor.protectedSubtitleTokens.some(key =>
      !el.querySelector(`[data-preview-protected-token="${key}"]`))){
      // 일부 브라우저의 편집 명령이 beforeinput을 건너뛰면 원본 필드로 즉시 복구한다.
      uiUpdateEffects.renderNow();
      return;
    }
    const fmt = e.inputType === 'formatBold' ? 'bold'
      : (e.inputType === 'formatItalic' ? 'emphasis' : null);
    if(fmt) applyPreviewFormatToSource(el, descriptor, fmt, previewSelectionDetails(el));
    syncChangedHighlight();
    if(descriptor.type === 'credit'){
      const input = creditEditorInput(descriptor.index, descriptor.field);
      if(!input) return;
      const staged = previewEditableText(el, false)
        .slice(0, Number(input.maxLength) > 0 ? Number(input.maxLength) : 500);
      if(staged === input.value) return;
      // 다음 크레딧 입력이 전체 항목을 직렬화하기 전에 현재 미리보기 수정값을
      // 원본 입력과 숨은 저장 필드에 함께 반영한다. 렌더는 blur까지 미뤄 포커스를 지킨다.
      if(el.dataset.previewCreditStaged !== 'true') MosaicStorage.snapshotCards();
      input.value = staged;
      MosaicRenderer.setStoredCreditItems(MosaicRenderer.creditItemsFromEditor(), false);
      el.dataset.previewCreditStaged = 'true';
    }
  });
  el.addEventListener('keydown', e => {
    if(e.isComposing || e.keyCode === 229) return;
    if(e.key === 'Backspace' || e.key === 'Delete'){
      const inputType = e.key === 'Backspace' ? 'deleteContentBackward' : 'deleteContentForward';
      if(previewBoundaryDeleteBlocked(el, inputType)){
        e.preventDefault();
        return;
      }
    }
    const shortcut = (e.metaKey || e.ctrlKey) && !e.altKey ? e.key.toLowerCase() : '';
    if(shortcut === 'b' || shortcut === 'i'){
      e.preventDefault();
      if(descriptor.type === 'body'){
        const fmt = shortcut === 'b' ? 'bold' : 'emphasis';
        const button = document.querySelector(`#selToolbar button[data-fmt="${fmt}"]`);
        if(previewEditState.selection && button) button.click();
      }
      return;
    }
    if(e.key === 'Enter'){
      e.preventDefault();
      if(e.shiftKey && preservesLineBreaks){
        const selection = window.getSelection();
        if(selection && selection.rangeCount){
          const range = selection.getRangeAt(0);
          if(el.contains(range.startContainer) && el.contains(range.endContainer)){
            range.deleteContents();
            const br = document.createElement('br');
            range.insertNode(br);
            range.setStartAfter(br);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            syncChangedHighlight();
          }
        }
        return;
      }
      el.blur();
    } else if(e.key === 'Escape'){
      e.preventDefault();
      cancelled = true;
      if(descriptor.type === 'credit' && el.dataset.previewCreditStaged === 'true'){
        const input = creditEditorInput(descriptor.index, descriptor.field);
        if(input){
          input.value = focusValue;
          MosaicRenderer.setStoredCreditItems(MosaicRenderer.creditItemsFromEditor(), false);
        }
        delete el.dataset.previewCreditStaged;
        MosaicStorage.discardUndoSnapshot();
      }
      el.blur();
      uiUpdateEffects.renderNow();
    }
  });
  el.addEventListener('blur', () => {
    if(cancelled) return;
    // 클릭·선택·위치 연동만으로는 원문을 다시 쓰지 않는다. 실제 입력이나 삭제로
    // 보이는 내용이 달라진 경우에만 저장해 문장 복제와 잘못된 덮어쓰기를 막는다.
    if(previewEditableText(el, preservesLineBreaks) === focusValue){
      if(descriptor.type === 'credit' && el.dataset.previewCreditStaged === 'true') MosaicStorage.discardUndoSnapshot();
      delete el.dataset.previewCreditStaged;
      delete el.dataset.previewEditChanged;
      return;
    }
    commitPreviewDirectEdit(el, descriptor);
    delete el.dataset.previewEditChanged;
  });

  // 일부 브라우저의 선택 메뉴는 beforeinput/input 없이 DOM 태그만 삽입한다.
  // 새로 생긴 서식 요소를 감시해 같은 원문 변환 경로로 보낸다.
  if(descriptor.type === 'body' && typeof MutationObserver === 'function'){
    const knownNodes = new WeakSet([el, ...el.querySelectorAll('*')]);
    const observer = new MutationObserver(() => {
      if(previewEditState.committing || !el.isConnected) return;
      const candidates = Array.from(el.querySelectorAll('b, strong, i, em, span[style]'));
      const added = candidates.find(node => !knownNodes.has(node));
      candidates.forEach(node => knownNodes.add(node));
      if(!added) return;
      const tag = added.tagName;
      const weight = (added.style && added.style.fontWeight) || '';
      const italic = (added.style && added.style.fontStyle) === 'italic';
      const fmt = (tag === 'B' || tag === 'STRONG' || /^(?:bold|[7-9]00)$/.test(weight))
        ? 'bold'
        : ((tag === 'I' || tag === 'EM' || italic) ? 'emphasis' : null);
      if(fmt) applyPreviewFormatToSource(el, descriptor, fmt, previewSelectionDetails(el, added));
    });
    observer.observe(el, { childList:true, subtree:true, attributes:true, attributeFilter:['style'] });
  }
}

// 소제목을 한 번 클릭하면 # 단계 선택 메뉴를 연다.
function bindHeadingLevelInteraction(block, ctx){
  if(!block || block.dataset.mosaicHeadingLevelBound === 'true') return;
  block.dataset.mosaicHeadingLevelBound = 'true';
  block.title = '클릭해서 # 단계 변경 · 글자는 미리보기에서 직접 수정';
  block.addEventListener('click', () => {
    if(block.isConnected) showBlockToolbar(ctx);
  });
  block.addEventListener('contextmenu', e => e.preventDefault());
}

const PROFILE_DIRECT_EDIT_LABELS = Object.freeze({
  profileCharRole:'BOT 라벨 수정',
  profileCharName:'BOT 이름 수정',
  profileCharDesc:'BOT 소개 수정',
  profileUserRole:'USER 라벨 수정',
  profileUserName:'USER 이름 수정',
  profileUserDesc:'USER 소개 수정',
  profileRelationship1:'관계·키워드 1 수정',
  profileRelationship2:'관계·키워드 2 수정',
  profileRelationship3:'관계·키워드 3 수정',
  profileSituation:'상황·요약 수정'
});

function decoratePreviewProfileEditors(){
  if(!previewEditState.ready) return;
  const profile = previewParts().profile;
  if(!profile) return;
  profile.querySelectorAll('[data-mosaic-profile-field]').forEach(field => {
    const id = field.dataset.mosaicProfileField;
    const input = document.getElementById(id);
    if(!input) return;
    const isTag = /(?:Tag|Relationship)\d$/.test(id);
    const multiline = input.tagName === 'TEXTAREA';
    enablePreviewDirectEditor(field, {
      type:'profile',
      id,
      multiline,
      normalizeTag:isTag
    }, PROFILE_DIRECT_EDIT_LABELS[id] || (isTag ? '프로필 태그 수정' : '프로필 내용 수정'));
    // 이름에 연결 URL이 있어도 미리보기에서는 편집을 우선하고 페이지를 이탈하지 않는다.
    field.querySelectorAll('a').forEach(link => {
      link.removeAttribute('href');
      link.removeAttribute('target');
      link.tabIndex = -1;
      link.addEventListener('click', event => event.preventDefault());
    });
  });

  profile.querySelectorAll('[data-mosaic-profile-image-field]').forEach(image => {
    const id = image.dataset.mosaicProfileImageField;
    image.removeAttribute('aria-hidden');
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', '왼쪽의 프로필 이미지 설정으로 이동');
    image.title = '클릭하면 왼쪽의 프로필 이미지 설정으로 이동';
    image.style.cursor = 'pointer';
    const reveal = event => {
      if(event?.target.closest('[data-mosaic-profile-field]')) return;
      if(positionSyncEnabled()) revealProfileControl(id);
    };
    image.addEventListener('click', reveal);
    image.addEventListener('keydown', event => {
      if(event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      reveal(event);
    });
  });

  // 역할명이나 카드의 빈 부분을 눌러도 해당 BOT/USER 설정 묶음을 찾을 수 있게 한다.
  profile.querySelectorAll('[data-mosaic-profile-role]').forEach(item => {
    item.addEventListener('click', event => {
      if(event.target.closest('[data-mosaic-profile-field], [data-mosaic-profile-image-field]')) return;
      const role = item.dataset.mosaicProfileRole;
      const id = /^extra[3-5]$/.test(role) ? `profileExtra${role.slice(-1)}Name`
        : role === 'user' ? 'profileUserName' : 'profileCharName';
      if(positionSyncEnabled()) revealProfileControl(id);
    });
  });
}

function decoratePreviewCreditEditors(){
  if(!previewEditState.ready) return;
  const credit = previewParts().credit;
  if(!credit) return;
  const fields = Array.from(credit.querySelectorAll('[data-mosaic-credit-index][data-mosaic-credit-field]'));
  fields.forEach(field => {
    const index = Number(field.dataset.mosaicCreditIndex);
    const fieldName = field.dataset.mosaicCreditField;
    if(!Number.isInteger(index) || !['label','value'].includes(fieldName)) return;
    if(!creditEditorInput(index, fieldName)) return;
    enablePreviewDirectEditor(field, {
      type:'credit',
      index,
      field:fieldName
    }, `크레딧 ${index + 1} ${fieldName === 'label' ? '항목명' : '내용'} 수정`);
    // 연결 URL은 왼쪽에서 관리하고, 미리보기에서는 항목 내용 편집을 우선한다.
    field.querySelectorAll('a').forEach(link => {
      link.removeAttribute('href');
      link.removeAttribute('target');
      link.tabIndex = -1;
      link.addEventListener('click', event => event.preventDefault());
    });
  });

  // 항목의 여백을 눌러도 대응하는 왼쪽 입력 묶음을 찾을 수 있게 한다.
  credit.addEventListener('click', event => {
    if(event.target.closest('[data-mosaic-credit-index][data-mosaic-credit-field]')) return;
    if(!positionSyncEnabled()) return;
    const row = event.target.closest('[data-mosaic-credit-row]');
    const divider = event.target.closest('[data-mosaic-credit-divider-before]');
    const index = divider
      ? Number(divider.dataset.mosaicCreditDividerBefore)
      : (row ? Number(row.dataset.mosaicCreditRow) : Number(fields[0] && fields[0].dataset.mosaicCreditIndex));
    if(Number.isInteger(index)) revealCreditControl(index, 'label');
  });
}

function decoratePreviewDirectEditors(){
  if(!previewEditState.ready) return;
  const title = previewParts().title;
  if(title){
    const settings = MosaicState.getSettings();
    const rows = [];
    if((settings.logNumber || '').trim()) rows.push({ id:'logNumber', label:'표지 메모 수정' });
    if((settings.logTitle || '').trim()) rows.push({ id:'logTitle', label:'표지 제목 수정' });
    const subIds = ['subChar','subUser','logSubtitle'].filter(id => (settings[id] || '').trim());
    if(subIds.length === 1) rows.push({ id:subIds[0], label:'표지 부제 수정' });
    else if(subIds.length > 1) rows.push({ type:'coverSubtitle', ids:subIds, label:'표지 부제 수정' });
    // 사진을 표제 배경으로 쓰면 문단이 가운데 정렬용 div 두 겹 안에 들어간다.
    const paragraphs = Array.from(title.querySelectorAll('p'));
    rows.forEach((row, index) => {
      const descriptor = row.type === 'coverSubtitle'
        ? {
            type:'coverSubtitle',
            ids:row.ids,
            protectedSubtitleTokens:[
              ...(row.ids.includes('subChar') && row.ids.includes('subUser') ? ['subtitle-couple-divider'] : []),
              ...(row.ids.includes('logSubtitle') && (row.ids.includes('subChar') || row.ids.includes('subUser'))
                ? ['subtitle-free-divider'] : [])
            ]
          }
        : { type:'cover', id:row.id };
      enablePreviewDirectEditor(paragraphs[index], descriptor, row.label);
    });
  }

  // 현재 탭이나 마지막으로 선택한 카드와 관계없이, 출력 중인 모든 카드의 원문을 연결한다.
  previewCardContexts().forEach(ctx => {
    const blocks = previewSourceBlocks(ctx.cardEl);
    const entries = sourceDisplayEntries(ctx.ta);
    blocks.forEach((block, index) => {
      const entry = entries[index];
      if(entry && entry.editable){
        // 분할된 출력 조각은 원문 속 정확한 범위를 찾았을 때만 직접 편집을 허용한다.
        // 범위를 모르는 상태에서 줄 전체를 덮어쓰면 인접 문장이 복제될 수 있다.
        if(entry.segmented && !entry.sourceBounds) return;
        enablePreviewDirectEditor(block, {
          type:'body',
          ta:ctx.ta,
          raw:entry.raw,
          rawEnd:entry.rawEnd === undefined ? entry.raw : entry.rawEnd,
          softBreak:!!entry.softBreak,
          segmented:entry.segmented,
          sourceBounds:entry.sourceBounds || null
        }, '본문 문단 수정');
        // 인용 전체는 하나의 원문 문단으로 유지하고 내부 소제목만 기존 단계 메뉴에 연결한다.
        if(block.matches('[data-mosaic-quote="true"]')){
          const sourceLines = ctx.ta.value.split('\n');
          block.querySelectorAll('[data-mosaic-quote-heading]').forEach(heading => {
            const raw = entry.raw + Number(heading.dataset.mosaicQuoteLine || 0);
            const source = sourceLines[raw] || '';
            if(!/^\s*(?:\[C\]\s*)?(?:>(?!>)\s*(?:\[C\]\s*)?)?#{1,4}\s+/.test(source)) return;
            bindHeadingLevelInteraction(heading, {
              block:heading, ta:ctx.ta, raw, type:'heading',
              level:Number(heading.dataset.mosaicQuoteHeading)
            });
          });
        }
        const sourceLine = (ctx.ta.value.split('\n')[entry.raw] || '').trim();
        const headingMatch = sourceLine.match(/^(?:\[C\]\s*)?(?:\[접기\s+)?(#{1,4})\s+/i);
        if(headingMatch){
          bindHeadingLevelInteraction(block, {
            block,
            ta:ctx.ta,
            raw:entry.raw,
            type:'heading',
            level:headingMatch[1].length
          });
        }
      }
    });

  });

  // 코멘트도 미리보기 문단을 원문 범위와 연결해 직접 수정한다. 본문 서식·문법
  // 도구는 연결하지 않으며, 편집 속성은 복사 HTML이 아닌 미리보기 DOM에만 붙는다.
  previewCommentContexts().forEach(ctx => {
    const paragraphs = Array.from(ctx.commentEl.querySelectorAll(':scope > p'));
    const entries = commentDisplayEntries(ctx.ta);
    paragraphs.forEach((paragraph, index) => {
      const entry = entries[index];
      if(!entry) return;
      enablePreviewDirectEditor(paragraph, {
        type:'comment',
        ta:ctx.ta,
        raw:entry.raw,
        rawEnd:entry.rawEnd
      }, '코멘트 문단 수정');
    });
  });
}

// 미리보기의 카드 제목을 누르면 왼쪽의 원본 카드 편집기를 보여준다.
// summary의 기본 접기/펼치기 동작은 막지 않으며, 미리보기 쪽 포커스도 빼앗지 않는다.
function revealPreviewCardTitleEditor(ctx){
  if(!positionSyncEnabled() || !ctx || !ctx.ed) return;
  const editor = ctx.ed;
  const ta = ctx.ta;
  const bodyTab = document.getElementById('tabBtnBody');
  if(bodyTab && !bodyTab.classList.contains('active')) bodyTab.click();
  ensureBodyInputGroupOpen();
  if(editor.classList.contains('isCollapsed')){
    const collapse = editor.querySelector('.collapseCtl');
    if(collapse) collapse.click();
  }
  if(ta){
    cardEditorState.activeTextarea = ta;
    syncBodyOnlyToolbarAvailability({ target:ta });
  }
  requestAnimationFrame(() => {
    if(!positionSyncEnabled() || !editor.isConnected) return;
    scrollCardIntoSidebar(editor);
    editor.style.boxShadow = '0 0 0 2px var(--accent)';
    setTimeout(() => {
      if(editor.isConnected) editor.style.boxShadow = '';
    }, 900);
  });
}

function decoratePreviewCardTitlePositionLinks(){
  previewCardContexts().forEach(ctx => {
    const titleEl = ctx.cardEl.tagName === 'DETAILS'
      ? ctx.cardEl.querySelector(':scope > summary')
      : ctx.cardEl.querySelector(':scope > [data-mosaic-card-title="true"]');
    if(!titleEl) return;
    titleEl.dataset.mosaicCardTitlePositionLink = 'true';
    titleEl.title = '클릭하면 왼쪽의 해당 카드로 이동';
    const activate = event => {
      if(event.target.closest('a, button, input, select, textarea')) return;
      revealPreviewCardTitleEditor(ctx);
    };
    titleEl.addEventListener('click', activate);
    // summary는 자체 키보드 동작을 유지하고, 일반 카드 제목에만 같은 접근성을 더한다.
    if(titleEl.tagName !== 'SUMMARY'){
      titleEl.tabIndex = 0;
      titleEl.setAttribute('role', 'button');
      titleEl.setAttribute('aria-label', '왼쪽의 해당 카드로 이동');
      titleEl.addEventListener('keydown', event => {
        if(event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        revealPreviewCardTitleEditor(ctx);
      });
    }
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

function revealEditorOffsetAtTop(target, start, ed){
  requestAnimationFrame(() => {
    const { top } = caretOffsetTop(target, start);
    const cs = getComputedStyle(target);
    const padTop = parseFloat(cs.paddingTop) || 0;
    const borderTop = parseFloat(cs.borderTopWidth) || 0;
    target.scrollTop = Math.max(0, top - padTop - borderTop);
    if(ed){
      scrollCardIntoSidebar(ed);
      ed.style.boxShadow = '0 0 0 2px var(--accent)';
      setTimeout(() => { ed.style.boxShadow = ''; }, 900);
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
  cardEditorState.activeTextarea = ta;
  revealEditorOffsetAtTop(target, start, editor);
}

function revealInEditor(ta, raw, text, occurrence, sourceBounds, segmented = false){
  // 본문 탭으로 전환 (전체 화면 편집 중이면 그대로 둠)
  const fsOpen = document.getElementById('fsOverlay').style.display === 'block';
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
  const sourceRange = descriptorSourceRange({ sourceBounds, segmented }, line, text, occurrence);
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
  revealEditorOffsetAtTop(target, start, ed);
}


function bindPreviewSelectionEvents(){
  bindUIFeatureEvents('preview-selection', () => {
uiElements.preview.addEventListener('mouseup', () => {
  // 블록 드래그 이동 중에는 무시
  if(previewEditState.drag) return;
  const directEditor = document.activeElement && document.activeElement.closest
    ? document.activeElement.closest('[data-preview-direct-edit="true"]')
    : null;
  const directDescriptor = directEditor ? previewDirectEditDescriptors.get(directEditor) : null;
  // 표지 글자는 직접 편집만 허용하고, B/I/가운데 정렬 도구는 본문 원문에만 표시한다.
  if(directEditor && directEditor.dataset.previewEditType !== 'body'){
    hideSelToolbar();
    return;
  }
  setTimeout(() => {
    const sel = window.getSelection();
    if(!sel || sel.isCollapsed || !sel.rangeCount){ hideSelToolbar(); return; }
    const text = sel.toString().replace(/\u00a0/g, ' ').trim();
    if(!text){ hideSelToolbar(); return; }
    const range = sel.getRangeAt(0);
    const endEl = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
    if(endEl && endEl.closest('[data-mosaic-speaker-label="true"]')){ hideSelToolbar(); return; }
    // 직접 편집 본문은 렌더 순서를 다시 추정하지 않고, 편집 요소에 저장한 정확한 카드·원문 줄을 사용한다.
    const src = directDescriptor && directDescriptor.type === 'body'
      ? { ta:directDescriptor.ta, raw:directDescriptor.raw, block:directEditor }
      : findBlockSource(range.startContainer);
    if(!src || !src.block.contains(range.endContainer)){ hideSelToolbar(); return; }
    // 블록 안에서 선택 앞쪽 글자 수를 세어, 같은 글자가 여러 번 나올 때 몇 번째인지 판별
    let occurrenceRoot = src.block;
    if(src.block.querySelector(':scope > [data-mosaic-speaker-label="true"]')){
      let child = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
      while(child && child.parentElement !== src.block) child = child.parentElement;
      if(child && child.parentElement === src.block && child.contains(range.endContainer)) occurrenceRoot = child;
    }
    const pre = range.cloneRange();
    pre.selectNodeContents(occurrenceRoot);
    pre.setEnd(range.startContainer, range.startOffset);
    const occurrence = pre.toString().split(text).length - 1;

    // 이미 걸려 있는 서식 감지 (선택 지점을 감싸는 <strong>/<em> 찾기)
    const active = {};
    Object.keys(FMT_TAG).forEach(fmt => {
      const el = activeFormatEl(range.startContainer, FMT_TAG[fmt], src.block);
      active[fmt] = el ? el.textContent : null;
    });
    const sourceDescriptor = directDescriptor && directDescriptor.type === 'body'
      ? directDescriptor
      : src;
    const resolved = descriptorSelectionSource(sourceDescriptor, text, occurrence);
    if(!resolved){ hideSelToolbar(); return; }
    // [BR] 문단의 가운데 정렬은 결합 문단 전체를 제어하므로 첫 원문 줄을 기준으로 한다.
    const centerRaw = sourceDescriptor.softBreak ? sourceDescriptor.raw : resolved.raw;
    const centerLine = src.ta.value.split('\n')[centerRaw] || '';
    active.center = CENTER_RE.test(centerLine) ? 'on' : null;

    previewEditState.selection = { ta:src.ta, raw:resolved.raw, centerRaw, text, occurrence, active, sourceRange:resolved.range };
    if(positionSyncEnabled()) revealInEditor(
      src.ta,
      resolved.raw,
      text,
      resolved.occurrence,
      resolved.sourceBounds,
      resolved.segmented
    );
    const bar = document.getElementById('selToolbar');
    bar.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', !!active[b.dataset.fmt]);
    });
    const r = range.getBoundingClientRect();
    bar.style.display = 'flex';
    const bw = bar.offsetWidth || 100;
    bar.style.left = Math.max(8, Math.min(window.innerWidth - bw - 8, r.left + r.width / 2 - bw / 2)) + 'px';
    const above = r.top - bar.offsetHeight - 8;
    const vertical = above > 8 ? above : r.bottom + 8;
    bar.style.top = Math.max(8, Math.min(window.innerHeight - bar.offsetHeight - 8, vertical)) + 'px';
  }, 0);
});

document.addEventListener('mousedown', (e) => {
  if(e.target.closest && (e.target.closest('#selToolbar') || e.target.closest('#blockToolbar'))) return;
  hideSelToolbar();
  hideBlockToolbar();
});

document.querySelectorAll('#selToolbar button').forEach(btn => {
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    if(!previewEditState.selection) return;
    const { ta, raw, centerRaw = raw, text, occurrence, active, sourceRange:capturedRange } = previewEditState.selection;
    const fmt = btn.dataset.fmt;
    const wrap = FMT_WRAP[fmt];
    const lines = ta.value.split('\n');
    const line = lines[raw];
    if(line === undefined){ hideSelToolbar(); return; }

    const fail = (msg) => {
      const st = document.getElementById('copyStatus');
      st.textContent = msg;
      setTimeout(() => { st.textContent = ''; }, 3500);
      hideSelToolbar();
    };
    const finish = (newLine, label, targetRaw = raw) => {
      // 미리보기를 다시 그릴 때 기존 contenteditable이 blur되며 평문을 재저장하면
      // 방금 넣은 **...** / *...* 마커가 지워진다. 서식 작업 동안 blur 저장을 잠근다.
      previewEditState.committing = true;
      try {
        MosaicStorage.snapshotCards();
        lines[targetRaw] = newLine;
        ta.value = lines.join('\n');
        hideSelToolbar();
        window.getSelection().removeAllRanges();
        uiUpdateEffects.committedChange();
        showUndoToast(label);
      } finally {
        previewEditState.committing = false;
      }
    };
    const name = { bold: '굵게', emphasis: '강조', center: '가운데 정렬' }[fmt];

    // 가운데 정렬: 줄 단위로 [C] 붙이기/떼기 (인용 `> ` 뒤에 삽입)
    if(fmt === 'center'){
      const centerLine = lines[centerRaw];
      if(centerLine === undefined){ hideSelToolbar(); return; }
      let newLine;
      if(active.center){
        newLine = centerLine.replace(CENTER_RE, (m, q) => (q || ''));
        return finish(newLine, '가운데 정렬 해제.', centerRaw);
      }
      const qm = centerLine.match(/^>(?!>)\s?/);
      newLine = qm ? qm[0] + '[C] ' + centerLine.slice(qm[0].length) : '[C] ' + centerLine;
      return finish(newLine, '가운데 정렬 적용.', centerRaw);
    }

    // 이미 서식이 걸린 부분 → 해제
    if(active[fmt]){
      const targetPlain = active[fmt];
      const re = new RegExp(FMT_RE[fmt].source, 'g');
      let m, found = null;
      const sourceRange = capturedRange || findSourceRange(line, text, occurrence, false);
      while((m = re.exec(line)) !== null){
        const containsSelection = sourceRange && sourceRange.start >= m.index && sourceRange.end <= m.index + m[0].length;
        if(containsSelection && comparableFormattedText(MosaicParser.formatMatchContent(fmt, m)) === comparableFormattedText(targetPlain)){
          found = m;
          break;
        }
      }
      if(!found) return fail(`${name} 서식을 찾지 못함. 본문에서 직접 삭제.`);
      const newLine = line.slice(0, found.index) + MosaicParser.formatMatchContent(fmt, found) + line.slice(found.index + found[0].length);
      return finish(newLine, `${name} 서식 해제.`);
    }

    // 원본 줄에서 같은 글자의 occurrence번째 위치를 찾음 (마커가 섞여 있으면 실패할 수 있음)
    const sourceRange = capturedRange || findSourceRange(line, text, occurrence, false);
    if(!sourceRange) return fail('선택한 글자의 원문 위치를 확인하지 못함.');
    const selectedSource = line.slice(sourceRange.start, sourceRange.end);

    finish(line.slice(0, sourceRange.start) + wrap + selectedSource + wrap + line.slice(sourceRange.end), `${name} 서식 적용.`);
  });
});
  });
}

// ---------- 미리보기 블록 드래그 이동 (이미지·문단 구분 요소) ----------
// MosaicRenderer.assembleBody의 라우팅 규칙을 그대로 재현해, 카드 본문의 '최상위 블록'이
// 원본 텍스트의 몇 번째 줄에서 나왔는지 매핑한다.
// entries: [{raw, text}] (빈 줄 제외, raw는 원본 줄 번호)
// 반환: [{kind:'line'|'fold', startRaw, text}]
function topLevelMap(entries){
  const res = [];
  let manual = false, manualStart = -1;
  entries.forEach(e => {
    const line = e.text;
    const structuralLine = line.replace(/^\[C\]\s*/i, '');
    const openMatch = structuralLine.match(/^\[접기(?:\s+(.+?))?\]$/);
    if(openMatch && !manual){ manual = true; manualStart = e.raw; return; }
    if(/^\[\/접기\]$/.test(line)){
      if(manual){
        manual = false;
        res.push({ kind:'fold', startRaw:manualStart });
      }
      return;
    }
    if(!manual) res.push({
      kind:'line', startRaw:e.raw, text:structuralLine,
      partIndex:e.partIndex || 0, partCount:e.partCount || 1
    });
  });
  if(manual) res.push({ kind:'fold', startRaw:manualStart });
  return res;
}

// MosaicRenderer.assembleBody와 같은 순서로 빈 줄 제거 → [BR] 문단 결합 → 대사 분할을 적용하되,
// 각 출력 항목이 시작된 원문 줄 번호는 보존한다. 이전 매핑은 [BR] 두 줄을 각각
// 세어 미리보기 블록 수와 어긋났고, 그 순간 이미지가 클릭 편집 전용 폴백으로
// 내려가 드래그가 비활성화됐다.
function topLevelSourceEntries(text, settings){
  const sourceEntries = [];
  String(text || '').split('\n').forEach((line, raw) => {
    const trimmed = line.trim();
    if(trimmed) sourceEntries.push({ raw, text:trimmed });
  });

  const combinedEntries = [];
  for(let index = 0; index < sourceEntries.length; index++){
    const start = sourceEntries[index];
    let current = start.text;
    let rawEnd = start.raw;
    while(/\[BR\]\s*$/i.test(current) && index + 1 < sourceEntries.length){
      const left = current.replace(/\[BR\]\s*$/i, '');
      const next = sourceEntries[index + 1];
      const joined = MosaicRenderer.combineSoftBreakPair(left, next.text);
      if(joined === null) break;
      current = joined;
      rawEnd = next.raw;
      index++;
    }
    combinedEntries.push({ raw:start.raw, rawEnd, text:current });
  }

  const entries = [];
  combinedEntries.forEach(entry => {
    const outputParts = MosaicRenderer.expandDialogueLinesForOutput([entry.text], settings)
      .map(value => String(value).trim())
      .filter(Boolean);
    outputParts.forEach((value, partIndex) => {
      entries.push({
        raw:entry.raw,
        rawEnd:entry.rawEnd,
        text:value,
        partIndex,
        partCount:outputParts.length
      });
    });
  });
  return entries;
}

// 원본 텍스트에서 srcRaw 줄을 떼어내 destRaw 줄 앞에 끼워넣음 (destRaw=null이면 맨 끝)
function moveLineInText(text, srcRaw, destRaw){
  let lines = text.split('\n');
  const moved = lines[srcRaw];
  if(moved === undefined) return text;
  lines.splice(srcRaw, 1);
  let dest = destRaw;
  if(dest === null || dest === undefined){
    if(lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(moved);
  } else {
    if(dest > srcRaw) dest -= 1;   // 앞쪽을 뺐으니 목적지가 한 칸 당겨짐
    dest = Math.max(0, Math.min(lines.length, dest));
    const insert = [];
    if(dest > 0 && lines[dest - 1].trim() !== '') insert.push('');
    insert.push(moved);
    if(dest < lines.length && lines[dest].trim() !== '') insert.push('');
    lines.splice(dest, 0, ...insert);
  }
  return lines.join('\n');
}

// 대사 옵션 3–5가 한 원문 줄을 여러 출력 블록으로 나눈 경계에 구분 요소를 놓으면,
// 그 원문 줄을 실제 줄들로 분리하고 선택한 경계에 원래 마커를 삽입한다.
function moveSeparatorIntoSplitLine(text, srcRaw, destInfo, settings){
  if(!destInfo || destInfo.kind !== 'line' || destInfo.partCount <= 1 || destInfo.partIndex <= 0) return null;
  const lines = String(text).split('\n');
  const moved = lines[srcRaw];
  const targetRaw = destInfo.startRaw;
  const targetLine = lines[targetRaw];
  if(moved === undefined || targetLine === undefined || srcRaw === targetRaw) return null;
  if(!/^\s*\[(?:HR(?:[2-4])?|GAP)\]\s*$/i.test(moved)) return null;

  const parts = MosaicRenderer.splitDialogueLineForOutput(targetLine, settings)
    .map(part => String(part).trim())
    .filter(Boolean);
  const splitAt = destInfo.partIndex;
  if(parts.length !== destInfo.partCount || splitAt <= 0 || splitAt >= parts.length) return null;

  // 사용자가 원문에 넣었던 바깥쪽 들여쓰기·후행 공백은 첫/마지막 조각에 보존한다.
  const leading = (targetLine.match(/^\s*/) || [''])[0];
  const trailing = (targetLine.match(/\s*$/) || [''])[0];
  parts[0] = leading + parts[0];
  parts[parts.length - 1] += trailing;

  // 먼저 기존 구분선을 떼어낸 뒤 대상 원문 줄의 변경된 인덱스를 계산한다.
  lines.splice(srcRaw, 1);
  const adjustedTarget = targetRaw - (srcRaw < targetRaw ? 1 : 0);
  const replacement = [
    ...parts.slice(0, splitAt),
    moved.trim(),
    ...parts.slice(splitAt)
  ];
  lines.splice(adjustedTarget, 1, ...replacement);
  return lines.join('\n');
}

// 화면에 장식·편집 기능을 붙이기 전의 순수 출력 HTML은 previewRenderState가 보관한다.
// 카드별 복사는 이 문자열에서 꺼내므로 미리보기 전용 버튼이나 편집 속성이 섞이지 않는다.

function copyPreviewCardText(text){
  // file:// 미리보기에서도 동작하도록 동기 복사를 우선하고 Clipboard API를 보조로 쓴다.
  try {
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', '');
    temp.style.cssText = 'position:fixed; left:-9999px; top:0; opacity:0; pointer-events:none;';
    document.body.appendChild(temp);
    temp.select();
    temp.setSelectionRange(0, temp.value.length);
    let done = false;
    try { done = document.execCommand('copy'); } catch(e){ done = false; }
    temp.remove();
    if(done){
      if(window.getSelection) window.getSelection().removeAllRanges();
      return Promise.resolve(true);
    }
  } catch(e){ /* Clipboard API로 한 번 더 시도 */ }

  if(navigator.clipboard && navigator.clipboard.writeText){
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  return Promise.resolve(false);
}

const PREVIEW_CONTROL_INSET = 8;
const PREVIEW_CONTROL_GAP = 6;
const PREVIEW_CONTROL_SIZE = 27;

function createPreviewControlButton(className, text, title){
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `${className} previewFloatingControl`;
  button.textContent = text;
  button.title = title;
  button.setAttribute('aria-label', title);
  return button;
}

function previewElementRect(element, positioningRoot){
  const root = positioningRoot || document.getElementById('previewWrap');
  const rootRect = root.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top - rootRect.top - root.clientTop + root.scrollTop,
    left: rect.left - rootRect.left - root.clientLeft + root.scrollLeft,
    width: rect.width,
    height: rect.height
  };
}

function previewControlGeometry(button, positioningRoot){
  const target = button._mosaicCopyTarget || button._mosaicProfileTarget || button._mosaicOptionTarget;
  const anchor = button._mosaicOptionAnchor || target;
  if(!target || !anchor || !target.isConnected || !anchor.isConnected) return null;
  const targetRect = previewElementRect(target, positioningRoot);
  const anchorRect = previewElementRect(anchor, positioningRoot);
  const buttonWidth = button.offsetWidth || PREVIEW_CONTROL_SIZE;
  const buttonHeight = button.offsetHeight || PREVIEW_CONTROL_SIZE;
  const mirrored = MosaicApp.isDesktopLayoutMirrored();
  const priority = button.classList.contains('previewBlockCopyBtn')
    ? 0
    : (button.classList.contains('previewProfilePlacementBtn') ? 1 : 2);
  return {
    button,
    priority,
    desiredTop:button._mosaicFooterAtCardEnd
      ? anchorRect.top + anchorRect.height - PREVIEW_CONTROL_INSET - buttonHeight
      : targetRect.top + PREVIEW_CONTROL_INSET,
    // 왼쪽/오른쪽 카드 조작 버튼은 대상 카드의 가장자리를 따라간다.
    left:mirrored
      ? anchorRect.left - PREVIEW_CONTROL_INSET - buttonWidth
      : anchorRect.left + anchorRect.width + PREVIEW_CONTROL_INSET,
    height:buttonHeight
  };
}

function layoutPreviewFloatingButtons(){
  const root = document.getElementById('previewWrap');
  if(!root) return;
  syncPreviewCommentOutset();
  const controls = Array.from(root.querySelectorAll(':scope > .previewFloatingControl'))
    .map(button => previewControlGeometry(button, root))
    .filter(Boolean)
    .sort((a, b) => a.desiredTop - b.desiredTop || a.priority - b.priority);
  const placed = [];
  controls.forEach(control => {
    let top = control.desiredTop;
    // 버튼 종류나 대상 DOM의 깊이와 관계없이 같은 열에서 겹치는 모든 버튼을
    // 복사 → 이동 → 옵션 순서로 한 번만 쌓는다.
    placed.forEach(previous => {
      const sameColumn = Math.abs(previous.left - control.left) < 2;
      const overlaps = top < previous.bottom + PREVIEW_CONTROL_GAP
        && top + control.height + PREVIEW_CONTROL_GAP > previous.top;
      if(sameColumn && overlaps) top = previous.bottom + PREVIEW_CONTROL_GAP;
    });
    control.button.style.top = `${Math.round(top)}px`;
    control.button.style.left = `${Math.round(control.left)}px`;
    placed.push({
      top,
      bottom:top + control.height,
      left:control.left
    });
  });
}

// 검색창처럼 미리보기 위쪽 형제가 나타나거나 사라지면 대상 카드의 실제 좌표가
// 즉시 달라진다. 현재 프레임과 브라우저가 레이아웃을 확정한 다음 프레임에 한 번씩
// 다시 계산해 외곽 조작 버튼이 이전 좌표에 남지 않도록 한다.
function refreshPreviewFloatingButtonLayout(){
  layoutPreviewFloatingButtons();
  requestAnimationFrame(layoutPreviewFloatingButtons);
}

// 일반 미리보기에서는 카드보다 넓은 게시글 영역을 계산해 기본 코멘트가
// 왼쪽 설정 패널 쪽부터 시작하도록 한다. 전체화면의 모바일 380 미리보기는
// 그 폭 자체가 게시글 viewport이므로 바깥 확장을 적용하지 않는다.
function syncPreviewCommentOutset(){
  const previewArea = uiElements.previewArea;
  const previewWrap = document.getElementById('previewWrap');
  const preview = uiElements.preview;
  const mobileButton = document.getElementById('widthMobileBtn');
  if(!previewArea || !previewWrap || !preview) return;
  if(document.body.classList.contains('previewFullscreen') && mobileButton && mobileButton.classList.contains('active')){
    preview.style.setProperty('--preview-comment-outset', '0px');
    return;
  }
  const areaRect = previewArea.getBoundingClientRect();
  const wrapRect = previewWrap.getBoundingClientRect();
  const areaStyle = getComputedStyle(previewArea);
  const contentLeft = areaRect.left + (parseFloat(areaStyle.paddingLeft) || 0);
  const contentRight = areaRect.right - (parseFloat(areaStyle.paddingRight) || 0);
  const leftSpace = Math.max(0, wrapRect.left - contentLeft);
  const rightSpace = Math.max(0, contentRight - wrapRect.right);
  const outset = Math.max(0, Math.min(leftSpace, rightSpace));
  preview.style.setProperty('--preview-comment-outset', `${Math.round(outset)}px`);
}

function previewCopySuccessMessage(label){
  const compact = String(label).replace(/카드\s+(\d+)/g, '카드$1');
  return `${compact}의 HTML을 복사했습니다.`;
}

const PREVIEW_COPY_JOIN_TOLERANCE = 2;

// 기능상의 종류가 아니라 화면에서 실제로 맞닿은지를 복사 단위의 기준으로 삼는다.
// 소수점 렌더링 오차는 허용하되, 옆에 놓인 요소나 폭이 크게 다른 요소는 합치지 않는다.
function previewCopyElementsAreAttached(previousElement, nextElement){
  if(!previousElement || !nextElement) return false;
  const previousRect = previousElement.getBoundingClientRect();
  const nextRect = nextElement.getBoundingClientRect();
  const verticalGap = nextRect.top - previousRect.bottom;
  const overlapWidth = Math.max(0,
    Math.min(previousRect.right, nextRect.right) - Math.max(previousRect.left, nextRect.left));
  const narrowerWidth = Math.min(previousRect.width, nextRect.width);
  return verticalGap >= -PREVIEW_COPY_JOIN_TOLERANCE
    && verticalGap <= PREVIEW_COPY_JOIN_TOLERANCE
    && narrowerWidth > 0
    && overlapWidth >= narrowerWidth * 0.8;
}

function previewCopyLabel(labels){
  return labels.filter((label, index, all) => label && all.indexOf(label) === index).join('와 ');
}

function previewTopLevelCopyLabel(element, visibleCardNumbers, visibleCommentNumbers){
  if(element.dataset.mosaicProfile === 'true') return '프로필';
  if(element.dataset.mosaicCoverImage === 'true' || element.dataset.mosaicTitle === 'true') return '표지';
  if(element.dataset.mosaicCredit === 'true') return '크레딧';
  if(element.hasAttribute('data-mosaic-comment-index')){
    const sourceIndex = Number(element.dataset.mosaicCommentIndex);
    return `코멘트 ${visibleCommentNumbers.get(sourceIndex) || 1}`;
  }
  if(element.hasAttribute('data-mosaic-card-index')){
    const sourceIndex = Number(element.dataset.mosaicCardIndex);
    const visibleNumber = visibleCardNumbers.get(sourceIndex);
    return `카드 ${visibleNumber || 1}`;
  }
  return '카드';
}

// previewSourceHTML과 화면의 #preview는 렌더 직후 같은 최상위 자식 순서를 가진다.
// 검색 강조·직접 편집용 속성이 들어간 화면 DOM은 복사하지 않고, 같은 순서의 순수 출력
// 노드를 복사한다. 대표 이미지 인식용 숨김 노드는 최상단 프로필을 건너뛰고
// 실제 대표 이미지 블록과 함께 보존한다.
function previewCopySegments(){
  const preview = uiElements.preview;
  if(!previewRenderState.sourceHTML || !preview) return [];
  const sourceDocument = new DOMParser().parseFromString(previewRenderState.sourceHTML, 'text/html');
  const sourceChildren = Array.from(sourceDocument.body.children);
  const previewChildren = Array.from(preview.children);
  const visibleCardNumbers = new Map(
    previewCardContexts().map((context, index) => [context.sourceIndex, index + 1])
  );
  const visibleCommentNumbers = new Map(
    Array.from(preview.querySelectorAll(':scope > [data-mosaic-comment-index]'))
      .map((element, index) => [Number(element.dataset.mosaicCommentIndex), index + 1])
  );
  const coverImageIndex = sourceChildren.findIndex(element => element.dataset.mosaicCoverImage === 'true');
  const segments = [];
  let pendingHiddenElements = [];
  sourceChildren.forEach((sourceElement, index) => {
    const previewElement = previewChildren[index];
    const hidden = sourceElement.hidden
      || sourceElement.getAttribute('aria-hidden') === 'true'
      || !previewElement
      || previewElement.hidden
      || previewElement.getAttribute('aria-hidden') === 'true';
    if(hidden){
      pendingHiddenElements.push(sourceElement);
      return;
    }
    const keepHiddenForCoverImage = pendingHiddenElements.length
      && coverImageIndex >= 0
      && index < coverImageIndex;
    const sourceHTML = keepHiddenForCoverImage
      ? sourceElement.outerHTML
      : [...pendingHiddenElements.map(element => element.outerHTML), sourceElement.outerHTML].join('\n');
    const html = MosaicRenderer.stripEditorOutputMetadata(
      sourceHTML
    );
    if(!keepHiddenForCoverImage) pendingHiddenElements = [];
    segments.push({
      startElement:previewElement,
      endElement:previewElement,
      labels:[previewTopLevelCopyLabel(sourceElement, visibleCardNumbers, visibleCommentNumbers)],
      html
    });
  });
  if(pendingHiddenElements.length && segments.length){
    const lastSegment = segments[segments.length - 1];
    lastSegment.html += `\n${MosaicRenderer.stripEditorOutputMetadata(pendingHiddenElements.map(element => element.outerHTML).join('\n'))}`;
  }
  return segments;
}

function previewCopyGroups(){
  const groups = [];
  previewCopySegments().forEach(segment => {
    const previous = groups[groups.length - 1];
    if(previous && previewCopyElementsAreAttached(previous.endElement, segment.startElement)){
      previous.endElement = segment.endElement;
      previous.labels.push(...segment.labels);
      previous.htmlParts.push(segment.html);
      return;
    }
    groups.push({
      startElement:segment.startElement,
      endElement:segment.endElement,
      labels:[...segment.labels],
      htmlParts:[segment.html]
    });
  });
  return groups;
}

function addPreviewCopyButton(target, label, getHTML, successMessage){
  if(!target) return;
  const previewWrap = document.getElementById('previewWrap');
  const button = createPreviewControlButton('previewBlockCopyBtn', '⧉', `${label} HTML 복사`);
  button._mosaicCopyTarget = target;
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const html = getHTML();
    if(!html){
      button.textContent = '!';
      button.classList.add('isError');
      showNoticeToast(`${label} HTML을 찾지 못했습니다.`);
      return;
    }
    copyPreviewCardText(html).then(done => {
      button.classList.toggle('isCopied', done);
      button.classList.toggle('isError', !done);
      button.textContent = done ? '✓' : '!';
      button.title = done ? `${label} HTML 복사 완료` : '클립보드 권한을 확인해 주세요';
      showNoticeToast(done
        ? successMessage
        : '자동 복사가 차단됐습니다. 브라우저의 클립보드 권한을 확인해 주세요.');
      setTimeout(() => {
        if(!button.isConnected) return;
        button.classList.remove('isCopied', 'isError');
        button.textContent = '⧉';
        button.title = `${label} HTML 복사`;
      }, 1600);
    });
  });
  previewWrap.appendChild(button);
}

function decoratePreviewCopyButtons(){
  previewCopyGroups().forEach(group => {
    const unified = group.startElement.dataset.mosaicUnifiedItem === 'true'
      && group.endElement.dataset.mosaicUnifiedItem === 'true';
    const label = unified ? '이어진 카드' : previewCopyLabel(group.labels);
    addPreviewCopyButton(
      group.startElement,
      label,
      () => {
        const html = group.htmlParts.filter(Boolean).join('\n');
        return html ? `${html}\n<br>` : '';
      },
      previewCopySuccessMessage(label)
    );
  });
  // 접기 상태가 바뀌면 아래 카드의 위치도 달라지므로 외곽 버튼을 다시 맞춘다.
  document.querySelectorAll('#preview details').forEach(detail => {
    detail.addEventListener('toggle', () => requestAnimationFrame(layoutPreviewFloatingButtons));
  });
}

function decoratePreviewProfilePlacementButton(){
  const profile = previewParts().profile;
  if(!profile) return;
  const placement = document.getElementById('profilePlacement');
  if(!placement) return;
  const atTop = placement.value === 'top';
  const title = atTop ? '프로필을 표지 아래로 이동' : '프로필을 최상단 독립으로 이동';
  const button = createPreviewControlButton('previewProfilePlacementBtn', atTop ? '↓' : '↑', title);
  button._mosaicProfileTarget = profile;
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    MosaicStorage.snapshotCards();
    const next = placement.value === 'top' ? 'below' : 'top';
    placement.value = next;
    placement.dispatchEvent(new Event('input', { bubbles:true }));
    showUndoToast(next === 'top'
      ? '프로필을 최상단 독립으로 이동했습니다.'
      : '프로필을 표지 아래로 이동했습니다.');
  });
  document.getElementById('previewWrap').appendChild(button);
}

function decoratePreviewCreditPlacementButton(){
  const credit = previewParts().credit;
  if(!credit) return;
  const placement = document.getElementById('creditPlacement');
  if(!placement || placement.disabled) return;
  const atTop = MosaicRenderer.normalizeCreditPlacement(placement.value) === 'top';
  const title = atTop ? '크레딧을 최하단으로 이동' : '크레딧을 최상단으로 이동';
  const button = createPreviewControlButton('previewProfilePlacementBtn', atTop ? '↓' : '↑', title);
  button._mosaicProfileTarget = credit;
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    MosaicStorage.snapshotCards();
    const next = atTop ? 'bottom' : 'top';
    placement.value = next;
    placement.dispatchEvent(new Event('input', { bubbles:true }));
    showUndoToast(next === 'top'
      ? '크레딧을 최상단으로 이동했습니다.'
      : '크레딧을 최하단으로 이동했습니다.');
  });
  document.getElementById('previewWrap').appendChild(button);
}

function addPreviewMinimalToggleButton(target, anchor, inputId, label){
  const input = document.getElementById(inputId);
  if(!target || !input) return;
  const title = input.checked ? `${label} 미니멀 해제` : `${label} 미니멀 적용`;
  const button = createPreviewControlButton('previewOptionToggleBtn', input.checked ? '•' : '○', title);
  button.setAttribute('aria-pressed', String(input.checked));
  button._mosaicOptionTarget = target;
  button._mosaicOptionAnchor = anchor || target;
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    MosaicStorage.snapshotCards();
    const enabled = !input.checked;
    input.checked = enabled;
    input.dispatchEvent(new Event('input', { bubbles:true }));
    showUndoToast(`${label} 미니멀을 ${enabled ? '적용' : '해제'}했습니다.`);
  });
  document.getElementById('previewWrap').appendChild(button);
}

function addPreviewFooterVisibilityButton(){
  const input = document.getElementById('footerOn');
  if(!input) return;
  // 접힌 details 안의 꼬리말은 DOM에 있어도 화면에는 보이지 않는다.
  // 보이는 꼬리말만 좌표 대상으로 삼아 숨은 요소의 0 좌표를 사용하지 않는다.
  const footer = previewVisibleFooterElement();
  const cards = previewParts().cards;
  const lastCard = cards[cards.length - 1] || null;
  const anchor = footer ? (footer.closest('[data-mosaic-card-index]') || lastCard) : lastCard;
  if(!anchor) return;

  const visible = input.checked;
  const title = visible ? '꼬리말 숨기기' : '꼬리말 다시 표시';
  const button = createPreviewControlButton(
    'previewOptionToggleBtn',
    visible ? '○' : '⊘',
    title
  );
  button.setAttribute('aria-pressed', String(!visible));
  button._mosaicOptionTarget = footer || anchor;
  button._mosaicOptionAnchor = anchor;
  button._mosaicFooterAtCardEnd = !footer;
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    MosaicStorage.snapshotCards();
    input.checked = !visible;
    syncCoverControlState();
    input.dispatchEvent(new Event('input', { bubbles:true }));
    showUndoToast(input.checked ? '꼬리말을 표시했습니다.' : '꼬리말을 숨겼습니다.');
  });
  document.getElementById('previewWrap').appendChild(button);
}

function addPreviewCardDividerToggleButton(cardEl, titleEl){
  const divider = document.getElementById('foldDividerOn');
  if(!cardEl || !titleEl || !divider) return;
  const title = divider.checked
    ? '모든 카드 제목 구분선 숨기기'
    : '모든 카드 제목 구분선 표시';
  const button = createPreviewControlButton('previewOptionToggleBtn', divider.checked ? '○' : '•', title);
  button.setAttribute('aria-pressed', String(!divider.checked));
  button._mosaicOptionTarget = titleEl;
  button._mosaicOptionAnchor = cardEl;
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    MosaicStorage.snapshotCards();
    divider.checked = !divider.checked;
    syncDesignSummaries();
    uiUpdateEffects.renderedDraftChange();
    showUndoToast(divider.checked
      ? '모든 카드 제목 구분선을 표시했습니다.'
      : '모든 카드 제목 구분선을 숨겼습니다.');
  });
  document.getElementById('previewWrap').appendChild(button);
}

function decoratePreviewOptionButtons(){
  const parts = previewParts();
  addPreviewMinimalToggleButton(parts.title, parts.title, 'titleMinimal', '표제');
  addPreviewMinimalToggleButton(parts.profile, parts.profile, 'profileMinimal', '프로필');
  addPreviewFooterVisibilityButton();
  previewCardContexts().forEach(({ cardEl }) => {
    const titleEl = cardEl.tagName === 'DETAILS'
      ? cardEl.querySelector(':scope > summary')
      : cardEl.querySelector(':scope > [data-mosaic-card-title="true"]');
    addPreviewCardDividerToggleButton(cardEl, titleEl);
  });
}

function bindPreviewLayoutEvents(){
  bindUIFeatureEvents('preview-layout', () => {
    window.addEventListener('resize', () => requestAnimationFrame(layoutPreviewFloatingButtons));
    // 웹폰트 적용, 프로필 줄바꿈, 본문 편집처럼 창 크기 변화 없이 미리보기 높이가
    // 달라지는 경우에도 외곽 복사 버튼을 해당 카드 오른쪽에 다시 맞춘다.
    if(typeof ResizeObserver === 'function'){
      const observer = new ResizeObserver(() => requestAnimationFrame(layoutPreviewFloatingButtons));
      observer.observe(uiElements.preview);
      observer.observe(document.getElementById('pvSearchBox'));
      uiLifecycleState.observers.push(observer);
    }
  });
}

// 접기 카드 자체와 카드 안의 일부 접기를 같은 순서로 다룬다.
function previewDetailsForCard(cardEl){
  return [
    ...(cardEl.tagName === 'DETAILS' ? [cardEl] : []),
    ...cardEl.querySelectorAll('details')
  ];
}

function capturePreviewFoldState(){
  // 카드 번호와 내부 순번을 함께 사용해 다른 카드의 접힘 상태와 섞이지 않게 한다.
  const states = new Map();
  previewCardContexts().forEach(ctx => {
    previewDetailsForCard(ctx.cardEl).forEach((detail, index) => {
      states.set(`${ctx.sourceIndex}:${index}`, detail.open);
    });
  });
  return states;
}

function restorePreviewFoldState(states){
  previewCardContexts().forEach(ctx => {
    previewDetailsForCard(ctx.cardEl).forEach((detail, index) => {
      if(states.get(`${ctx.sourceIndex}:${index}`) === true) detail.open = true;
    });
  });
}

// HTML 교체로 사라진 편집·검색·버튼 기능을 기존 순서로 연결한다.
function bindPreviewInteractions(preview){
  enableBlockDrag(preview);
  if(previewSearchState.open) pvApplySearch(true);   // 검색 중이면 강조 다시 칠함 (미리보기 DOM 전용)
  decoratePreviewDirectEditors();
  decoratePreviewProfileEditors();
  decoratePreviewCreditEditors();
  decoratePreviewCardTitlePositionLinks();
  decoratePreviewCopyButtons();
  decoratePreviewProfilePlacementButton();
  decoratePreviewCreditPlacementButton();
  decoratePreviewOptionButtons();
}

function finishPreviewLayout(preview){
  // 즉시 배치한 뒤 다음 프레임에 한 번 더 보정한다.
  layoutPreviewFloatingButtons();
  requestAnimationFrame(() => {
    layoutPreviewFloatingButtons();
    preview.classList.remove('previewRefreshing');
  });
}

// 미리보기 갱신 순서: 이전 UI 정리 → 상태 보관 → HTML 교체 → 상태 복원 → 기능 연결.
function renderPreview(prebuiltHTML){
  const preview = uiElements.preview;
  // 외곽 버튼은 HTML 교체 후에도 남으므로 이전 대상을 참조하는 버튼부터 제거한다.
  document.querySelectorAll('#previewWrap > .previewFloatingControl').forEach(button => button.remove());
  preview.classList.add('previewRefreshing');
  hideBlockToolbar();
  const openStates = capturePreviewFoldState();
  previewRenderState.sourceHTML = prebuiltHTML !== undefined
    ? prebuiltHTML
    : MosaicRenderer.buildCard(MosaicState.getSettings(), getCards());
  preview.innerHTML = previewRenderState.sourceHTML;
  syncPreviewOuterBreaks();
  restorePreviewFoldState(openStates);
  bindPreviewInteractions(preview);
  finishPreviewLayout(preview);
}

function syncPreviewOuterBreaks(){
  const preview = uiElements.preview;
  const option = document.getElementById('copyWithOuterBreaks');
  if(!preview || !option) return;
  preview.classList.toggle('previewOuterBreaks', option.checked);
}

// 한 번 클릭하면 편집 메뉴를 열고, 일정 거리 이상 움직이면 기존 드래그 이동을 시작한다.
function bindSeparatorInteraction(target, dragCtx, menuCtx){
  const MOVE_PX = 7;
  let suppressClick = false;

  target.addEventListener('mousedown', e => {
    if(e.button !== 0) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const cleanup = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    const onMove = ev => {
      if(Math.hypot(ev.clientX - sx, ev.clientY - sy) < MOVE_PX) return;
      cleanup();
      if(dragCtx){
        suppressClick = true;
        startBlockDrag(dragCtx);
      }
    };
    const onUp = () => cleanup();
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  target.addEventListener('click', e => {
    e.preventDefault();
    if(suppressClick){ suppressClick = false; return; }
    showBlockToolbar(menuCtx);
  });
  target.addEventListener('contextmenu', e => e.preventDefault());
}

function previewSeparatorType(block){
  if(!block || block.dataset.mosaicGenerated !== 'true' || block.tagName !== 'DIV') return null;
  if(['hr', 'hr2', 'hr3', 'hr4'].includes(block.dataset.mosaicSeparator)) return block.dataset.mosaicSeparator;
  if(block.style.height === '1px') return 'hr';
  if(block.textContent.trim() === '✦' || (block.textContent.trim() === '✦ ✦ ✦' && block.style.letterSpacing)) return 'hr2';
  if(block.textContent.trim() === '· · ·' && block.style.letterSpacing) return 'hr3';
  return null;
}

function bindSeparatorBlockInteraction(block, type, dragCtx, menuCtx){
  if(!block || block.dataset.mosaicSeparatorEditBound === 'true') return;
  block.dataset.mosaicSeparatorEditBound = 'true';
  if(type === 'hr'){
    // 1px 선 자체 대신 충분히 넓은 투명 클릭 영역을 사용한다.
    block.style.position = 'relative';
    const hit = document.createElement('div');
    hit.dataset.mosaicSeparatorHit = 'true';
    hit.style.cssText = `position:absolute; z-index:2; left:0; right:0; top:-15px; height:32px; cursor:${dragCtx ? 'grab' : 'pointer'}; user-select:none;`;
    hit.title = dragCtx ? '클릭해서 변경/삭제 · 드래그로 이동' : '클릭해서 변경/삭제';
    bindSeparatorInteraction(hit, dragCtx, menuCtx);
    block.appendChild(hit);
    return;
  }
  block.style.cursor = dragCtx ? 'grab' : 'pointer';
  block.style.userSelect = 'none';
  block.title = dragCtx ? '클릭해서 변경/삭제 · 드래그로 이동' : '클릭해서 변경/삭제';
  bindSeparatorInteraction(block, dragCtx, menuCtx);
}

// 최상위 이미지·문단 구분 요소는 드래그 이동도 지원한다.
// 접기 안쪽 이미지는 구조를 깨지 않도록 이동은 막고 클릭 편집만 연결한다.
function enableBlockDrag(preview){
  const editors = Array.from(document.querySelectorAll('#cardEditors .cardEditor'));
  // 출력에서 빈 카드는 제외되므로, 내용 있는 본문 카드만 순서대로 대응시킨다.
  // 코멘트는 별도 최상위 블록이라 이전 순번 폴백에 섞이면 카드 드래그 대상이 밀릴 수 있다.
  const nonEmpty = editors.filter(ed => ed.dataset.blockType !== 'comment'
    && ed.querySelector('textarea').value.split('\n').some(l => l.trim() !== ''));

  // 미리보기 최상위 자식 중 '카드'만 골라냄 (썸네일 p, 이미지 밴드, 표제 밴드 제외)
  const indexedCardEls = Array.from(preview.querySelectorAll(':scope > [data-mosaic-card-index]'));
  const cardEls = indexedCardEls.length ? indexedCardEls : Array.from(preview.children).filter(el => {
    if(el.tagName === 'DETAILS') return true;
    if(el.tagName !== 'DIV') return false;
    if(el.style.backgroundImage) return false;
    const inner = el.firstElementChild;
    return !!(inner && inner.tagName === 'DIV');
  });

  cardEls.forEach((cardEl, cardIdx) => {
    const sourceIndex = Number(cardEl.dataset.mosaicCardIndex);
    const editor = Number.isInteger(sourceIndex) ? editors[sourceIndex] : nonEmpty[cardIdx];
    if(!editor) return;
    const ta = editor.querySelector('textarea');
    const settings = MosaicState.getSettings();
    // MosaicRenderer.assembleBody의 [BR] 결합과 대사 분할을 모두 반영해 이미지·구분선의
    // 드래그 대상 수가 실제 미리보기 최상위 블록 수와 항상 같게 한다.
    const entries = topLevelSourceEntries(ta.value, settings);
    const map = topLevelMap(entries);

    // 카드 본문 컨테이너: details면 summary 다음, div면 첫 자식
    const bodyDiv = previewCardBody(cardEl);
    if(!bodyDiv) return;

    // 원문과 출력의 이미지 순서는 같으므로, 접기 안쪽 이미지도 원문 줄과 안전하게 연결할 수 있다.
    const bindRemainingBodyImages = () => {
      const sourceImages = [];
      ta.value.split('\n').forEach((line, raw) => {
        if(MosaicRenderer.parseBodyImageLine(line)) sourceImages.push({ raw });
      });
      const previewImages = Array.from(bodyDiv.querySelectorAll('img'));
      if(sourceImages.length !== previewImages.length) return;
      previewImages.forEach((img, index) => {
        const block = img.parentElement;
        if(!block || block.dataset.mosaicImageEditBound === 'true') return;
        block.dataset.mosaicImageEditBound = 'true';
        block.style.cursor = 'pointer';
        block.title = '클릭해서 이미지 삭제/비율/캡션 편집';
        bindSeparatorInteraction(block, null, {
          block,
          ta,
          raw: sourceImages[index].raw,
          type: 'img'
        });
      });
    };

    // 접기 내부의 문단 구분 요소도 출력 순서와 원문 순서로 연결한다.
    // 최상위 요소만 대상으로 삼던 기존 매핑에서 빠진 항목은 클릭 편집만 허용하고,
    // 접기 구조를 깨뜨릴 수 있는 드래그 이동은 막는다.
    const bindRemainingBodySeparators = () => {
      const sourceSeparators = [];
      ta.value.split('\n').forEach((line, raw) => {
        const token = line.trim().toUpperCase();
        if(token === '[HR]') sourceSeparators.push({ raw, type:'hr' });
        else if(token === '[HR2]') sourceSeparators.push({ raw, type:'hr2' });
        else if(token === '[HR3]') sourceSeparators.push({ raw, type:'hr3' });
        else if(token === '[HR4]' || token === '[GAP]') sourceSeparators.push({ raw, type:'hr4' });
      });
      const previewSeparators = Array.from(bodyDiv.querySelectorAll('[data-mosaic-generated="true"]'))
        .map(block => ({ block, type:previewSeparatorType(block) }))
        .filter(item => item.type);
      if(sourceSeparators.length !== previewSeparators.length) return;
      previewSeparators.forEach((item, index) => {
        const source = sourceSeparators[index];
        if(source.type !== item.type || item.block.dataset.mosaicSeparatorEditBound === 'true') return;
        bindSeparatorBlockInteraction(item.block, item.type, null, {
          block:item.block,
          ta,
          raw:source.raw,
          type:item.type
        });
      });
    };

    // 표제 블록은 카드 밖이므로 본문 자식 = [문단들..., (마지막 카드면 꼬리말)]
    let blocks = Array.from(bodyDiv.children);
    if(blocks.length === map.length + 1) blocks = blocks.slice(0, -1); // 꼬리말 제외
    if(blocks.length !== map.length){
      bindRemainingBodyImages();
      bindRemainingBodySeparators();
      return;
    }

    blocks.forEach((block, i) => {
      const info = map[i];
      if(info.kind !== 'line') return;
      const text = info.text;
      const isImg = !!MosaicRenderer.parseBodyImageLine(text);
      const isHr = /^\[HR\]$/i.test(text);
      const isHr2 = /^\[HR2\]$/i.test(text);
      const isHr3 = /^\[HR3\]$/i.test(text);
      const isHr4 = /^\[(?:HR4|GAP)\]$/i.test(text);
      if(!isImg && !isHr && !isHr2 && !isHr3 && !isHr4) return;
      if(isImg && !block.querySelector('img')) return;

      const label = isImg ? '이미지'
        : (isHr ? '구분선' : (isHr2 ? '장면 전환' : (isHr3 ? '호흡 구분' : '여백')));
      const type = isImg ? 'img' : (isHr ? 'hr' : (isHr2 ? 'hr2' : (isHr3 ? 'hr3' : 'hr4')));
      const dragCtx = { block, blocks, map, ta, srcIndex:i, label, type };
      const menuCtx = { block, ta, raw:info.startRaw, type };

      if(isHr || isHr2 || isHr3 || isHr4){
        bindSeparatorBlockInteraction(block, type, dragCtx, menuCtx);
      } else {
        block.dataset.mosaicImageEditBound = 'true';
        block.style.cursor = 'grab';
        block.title = '클릭해서 삭제/비율/캡션 · 드래그로 이미지 이동';
        bindSeparatorInteraction(block, dragCtx, menuCtx);
      }
    });
    bindRemainingBodyImages();
    bindRemainingBodySeparators();
  });
}

function startBlockDrag(ctx){
  const { block, blocks } = ctx;
  block.style.opacity = '0.45';
  block.style.cursor = 'grabbing';

  const marker = document.createElement('div');
  marker.style.cssText = 'height:3px; background:#111; border-radius:2px; margin:4px 0; pointer-events:none;';
  previewEditState.drag = Object.assign({}, ctx, { marker, destIndex:null, moved:false });

  document.addEventListener('mousemove', onBlockDragMove);
  document.addEventListener('mouseup', onBlockDragEnd);
}

function onBlockDragMove(e){
  if(!previewEditState.drag) return;
  previewEditState.drag.moved = true;
  const { blocks, marker, srcIndex } = previewEditState.drag;
  // 커서와 가장 가까운 삽입 지점(문단 경계)을 찾음
  let dest = blocks.length;
  for(let i = 0; i < blocks.length; i++){
    const r = blocks[i].getBoundingClientRect();
    if(e.clientY < r.top + r.height / 2){ dest = i; break; }
  }
  previewEditState.drag.destIndex = dest;
  // 제자리면 표시 안 함
  if(dest === srcIndex || dest === srcIndex + 1){
    if(marker.parentNode) marker.remove();
    return;
  }
  const ref = blocks[dest];
  if(ref) ref.parentNode.insertBefore(marker, ref);
  else blocks[blocks.length - 1].parentNode.appendChild(marker);
}

function onBlockDragEnd(){
  document.removeEventListener('mousemove', onBlockDragMove);
  document.removeEventListener('mouseup', onBlockDragEnd);
  if(!previewEditState.drag) return;
  const { block, marker, map, ta, srcIndex, destIndex, moved, label, type } = previewEditState.drag;
  block.style.opacity = '';
  block.style.cursor = 'grab';
  if(marker.parentNode) marker.remove();
  previewEditState.drag = null;

  if(!moved || destIndex === null) return;
  if(destIndex === srcIndex || destIndex === srcIndex + 1) return; // 제자리

  const srcRaw = map[srcIndex].startRaw;
  const destInfo = destIndex < map.length ? map[destIndex] : null;
  const destRaw = destInfo ? destInfo.startRaw : null;
  const splitMove = (type === 'hr' || type === 'hr2')
    ? moveSeparatorIntoSplitLine(ta.value, srcRaw, destInfo, MosaicState.getSettings())
    : null;
  const nextText = splitMove === null
    ? moveLineInText(ta.value, srcRaw, destRaw)
    : splitMove;
  if(nextText === ta.value) return;
  MosaicStorage.snapshotCards();
  ta.value = nextText;
  uiUpdateEffects.committedChange();
  showUndoToast(splitMove === null ? `${label} 위치 변경.` : `${label} 위치 변경 · 원문 자동 분리.`);
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
try {
  positionSyncInput.checked = localStorage.getItem(POSITION_SYNC_KEY) !== 'off';
} catch(e){
  positionSyncInput.checked = true;
}
function positionSyncEnabled(){
  return !!(positionSyncInput && positionSyncInput.checked);
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
    positionSyncInput.addEventListener('change', () => {
      previewPositionState.pendingFocus = null;
      previewPositionState.pendingFallbackScrollTop = null;
      syncPositionSyncFloatingUi();
      try { localStorage.setItem(POSITION_SYNC_KEY, positionSyncInput.checked ? 'on' : 'off'); }
      catch(e){ /* 저장소를 쓸 수 없어도 현재 화면 설정은 유지 */ }
    });
  });
}
syncPositionSyncFloatingUi();

// 미리보기 전체화면: 설정 패널을 숨기고 작업 화면 색상에 맞는 캔버스에서 확인한다.
const previewFullscreenBtn = document.getElementById('previewFullscreenBtn');
function setPreviewFullscreen(on){
  const previewArea = uiElements.previewArea;
  if(on){
    MosaicApp.setPreviewArcaTheme(document.documentElement.classList.contains('uiNight') ? 'dark' : 'light');
    previewPositionState.fullscreenScrollTop = previewArea.scrollTop;
    previewArea.scrollTop = 0;
  }
  document.body.classList.toggle('previewFullscreen', !!on);
  if(on && document.getElementById('widthMobileBtn').classList.contains('active')){
    document.getElementById('previewWrap').style.maxWidth = '380px';
  } else {
    syncDesktopPreviewWidth();
  }
  previewFullscreenBtn.setAttribute('aria-pressed', String(!!on));
  previewFullscreenBtn.textContent = on ? '×' : '⛶';
  previewFullscreenBtn.title = on ? '전체화면 미리보기 닫기 (Esc)' : '전체화면 미리보기';
  previewFullscreenBtn.setAttribute('aria-label', previewFullscreenBtn.title);
  // 폭 전환이나 출력 HTML의 인라인 효과가 이미 시작됐더라도 즉시 정지시킨다.
  if(typeof previewArea.getAnimations === 'function'){
    try { previewArea.getAnimations({ subtree:true }).forEach(animation => animation.cancel()); }
    catch(e){ /* 구형 브라우저에서는 위 CSS 차단만 적용한다. */ }
  }
  syncPreviewToolbarLabel();
  requestAnimationFrame(() => {
    syncPreviewCommentOutset();
    layoutPreviewFloatingButtons();
  });
  if(!on) requestAnimationFrame(() => { previewArea.scrollTop = previewPositionState.fullscreenScrollTop; });
}
function bindPreviewFullscreenEvents(){
  bindUIFeatureEvents('preview-fullscreen', () => {
    previewFullscreenBtn.addEventListener('click', () => {
      setPreviewFullscreen(!document.body.classList.contains('previewFullscreen'));
    });
    document.addEventListener('keydown', (event) => {
      if(event.key === 'Escape' && document.body.classList.contains('previewFullscreen')){
        event.preventDefault();
        setPreviewFullscreen(false);
      }
    });
  });
}

// 미리보기 최상위 구성요소 분류: 이미지 밴드 / 표제 밴드 / 프로필 / 카드들
function previewParts(){
  const preview = uiElements.preview;
  const parts = { image: null, title: null, profile: null, credit: null, cards: [], comments: [] };
  Array.from(preview.children).forEach(el => {
    // 대표 이미지 목록 인식용 숨김 썸네일을 표제 밴드로 오인하지 않는다.
    if(el.hidden || el.getAttribute('aria-hidden') === 'true') return;
    if(el.hasAttribute('data-mosaic-comment-index')){ parts.comments.push(el); return; }
    if(el.hasAttribute('data-mosaic-card-index')){ parts.cards.push(el); return; }
    if(el.tagName === 'DETAILS'){ parts.cards.push(el); return; }
    if(el.tagName !== 'DIV') return;                       // 숨김 썸네일 <p>
    if(el.dataset.mosaicProfile === 'true'){ parts.profile = el; return; }
    if(el.dataset.mosaicCredit === 'true'){ parts.credit = el; return; }
    if(el.dataset.mosaicCoverImage === 'true'){ parts.image = el; return; }
    if(el.dataset.mosaicTitle === 'true'){ parts.title = el; return; }
    if(el.style.backgroundImage){ parts.image = el; return; }
    const first = el.firstElementChild;
    if(first && first.tagName === 'DIV') parts.cards.push(el);   // 카드(안쪽 패딩 div)
    else if(!parts.title) parts.title = el;                      // 표제 밴드(<p>들만 가짐)
  });
  return parts;
}

// 세로 배치(모바일)에서는 미리보기로 스크롤하면 입력창이 화면 밖으로 밀려 편집이 불가능해짐.
// CSS의 680px 분기와 같은 기준으로 판단.
function isStackedLayout(){
  return window.matchMedia('(max-width: 680px)').matches;
}

// 화면 밖일 때만 오른쪽 미리보기 컨테이너 안에서 부드럽게 스크롤한다.
// Element.scrollIntoView()는 모든 상위 스크롤 영역과 뷰포트를 함께 조정할 수 있어,
// 좌우 분할 화면에서는 미리보기 변화가 왼쪽 사이드바 위치까지 흔드는 원인이 된다.
function scrollPreviewIfNeeded(el, force){
  if(!el || isStackedLayout()) return;
  const previewArea = uiElements.previewArea;
  if(!previewArea || !previewArea.contains(el)) return;
  const areaRect = previewArea.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const margin = 40;
  const visibleTop = areaRect.top + margin;
  const visibleBottom = areaRect.bottom - margin;
  const visible = r.top >= visibleTop && r.bottom <= visibleBottom;
  if(!force && visible) return;
  const current = previewArea.scrollTop;
  const relativeTop = r.top - areaRect.top + current;
  const centeredTop = relativeTop - Math.max(0, (previewArea.clientHeight - r.height) / 2);
  const maxScroll = Math.max(0, previewArea.scrollHeight - previewArea.clientHeight);
  const next = Math.max(0, Math.min(maxScroll, centeredTop));
  previewArea.scrollTo({ top:next, behavior:'smooth' });
}

// 특정 카드/줄에 해당하는 미리보기 블록 찾기
function previewBlockFor(ta, raw){
  const editors = Array.from(document.querySelectorAll('#cardEditors .cardEditor'));
  const myEd = ta.closest('.cardEditor');
  const sourceIndex = editors.indexOf(myEd);
  // 내용 있는 카드의 순번을 추측하지 않고 출력 카드가 기록한 원래 카드 번호로 찾는다.
  // 앞쪽에 빈 카드가 있거나 카드 순서를 바꾼 직후에도 다른 카드로 이동하지 않는다.
  const cardEl = Number.isInteger(sourceIndex) && sourceIndex >= 0
    ? previewParts().cards.find(card => Number(card.dataset.mosaicCardIndex) === sourceIndex)
    : null;
  if(!cardEl) return null;

  const entries = [];
  ta.value.split('\n').forEach((l, i) => { if(l.trim() !== '') entries.push({ raw: i, text: l.trim() }); });
  const map = topLevelMap(entries);
  const bodyDiv = previewCardBody(cardEl);
  if(!bodyDiv) return cardEl;
  let blocks = Array.from(bodyDiv.children);
  if(blocks.length === map.length + 1) blocks = blocks.slice(0, -1);   // 꼬리말 제외
  // 출력에 꼬리말·접기 래퍼가 더해져 개수가 달라도 가장 가까운 블록을 사용한다.

  // 커서가 놓인 줄(raw) 이하에서 가장 가까운 블록
  let best = -1;
  map.forEach((m, i) => { if(m.startRaw <= raw) best = i; });
  if(best < 0) return cardEl;
  return blocks[Math.min(best, blocks.length - 1)] || cardEl;
}

// 카드 편집기의 헤더·제목 입력은 본문 줄 좌표가 없으므로 카드 시작점을 직접 찾는다.
// 접기 카드는 summary, 일반 제목 카드는 제목, 제목이 비어 있으면 카드 자체를 대상으로 한다.
function previewCardStartForEditor(editor){
  if(!editor || editor.dataset.blockType === 'comment' || editor.dataset.outputVisible === 'false') return null;
  const editors = Array.from(document.querySelectorAll('#cardEditors .cardEditor'));
  const sourceIndex = editors.indexOf(editor);
  if(sourceIndex < 0) return null;
  const cardEl = previewParts().cards.find(card => Number(card.dataset.mosaicCardIndex) === sourceIndex);
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
  const raw = ta.value.slice(0, ta.selectionStart).split('\n').length - 1;
  focusPreviewOn(() => previewBlockFor(ta, raw));
}

// DOM 자체가 아니라 기능별 입력값만 기억한다. 외부 복원은 전체 무효화하고,
// 갱신 과정에서 값이 정규화되면 정규화 뒤의 값을 기준으로 다음 갱신을 판단한다.
const uiControlSyncState = { keys:new Map() };
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
  ]), syncImageBackgroundToggleAvailability);
  syncUIControlsWhenChanged('ranges', () => [
    uiControlValues([...MosaicState.STYLE_FIELDS,...COVER_IMAGE_RANGE_IDS,...PROFILE_IMAGE_RANGE_IDS,'profileStyle','profileExtraCount','profileImageBackgroundOn']),
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
  ], syncDesignSummaries);
  syncUIControlsWhenChanged('preview-style', () => uiControlValues(['cardLayout','cardBorderOn']),
    MosaicApp.syncPreviewCardStyleToggles);
  syncUIControlsWhenChanged('paragraph', () => [
    uiControlValues(['narrIndent','commentWidth','commentAlign']),
    hasMarkdownCardContent(), hasQuoteCardContent(), hasBodyFoldTitleContent(),
    Boolean(document.querySelector('#cardEditors .commentEditor'))
  ], syncParagraphSettingsUI);
  // 본문에 새 [이름] 마커가 생기면 인물 목록을 자동 갱신 (재진입 방지)
  if(!previewPositionState.syncingCharacters){
    previewPositionState.syncingCharacters = true;
    try {
      syncUIControlsWhenChanged('characters', () => [
        cards.filter(card => card.type !== 'comment' && card.visible !== false).map(card => card.body),
        uiControlValues(['extraChars','narrColor'])
      ], MosaicStorage.syncCharList);
    } finally { previewPositionState.syncingCharacters = false; }
  }
}

const HR_CONTROL_IDS = {
  hr:['hrShape','hrOpacity','hrOpacityVal','hrLength','hrLengthVal','hrVerticalSpace','hrVerticalSpaceVal','hrResetBtn'],
  hr2:['hr2Shape','hr2Opacity','hr2OpacityVal','hr2VerticalSpace','hr2VerticalSpaceVal','hr2ResetBtn'],
  hr3:['hr3Shape','hr3Opacity','hr3OpacityVal','hr3VerticalSpace','hr3VerticalSpaceVal','hr3ResetBtn'],
  hr4:['gapHeight','gapHeightVal','hr4ResetBtn']
};

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

function syncHrControlAvailability(cards = getCards()){
  const used = usedHrTypes(cards);
  const advancedOn = document.getElementById('advancedOn').checked;
  document.querySelectorAll('#advancedDesignGroup [data-hr-control]').forEach(element => {
    element.classList.toggle('isUnavailable', !used.has(element.dataset.hrControl));
  });
  Object.entries(HR_CONTROL_IDS).forEach(([type, ids]) => {
    ids.forEach(id => {
      document.getElementById(id).disabled = !used.has(type) || (id.endsWith('ResetBtn') && !advancedOn);
    });
    if(type !== 'hr4') MosaicStorage.syncSegmentedChoiceControl(`${type}Shape`);
  });
}

function syncCreditDetailAvailability(){
  const creditOn = document.getElementById('creditOn').checked;
  const transparentTheme = MosaicRenderer.outputThemeTransparent(document.getElementById('outputTheme').value);
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
  const shape = MosaicRenderer.outputThemeShape(mode);
  const transparent = MosaicRenderer.outputThemeTransparent(mode);
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

function setCardDefaultsForShapeChange(previousTheme, nextTheme){
  const previousShape = MosaicRenderer.outputThemeShape(previousTheme);
  const nextShape = MosaicRenderer.outputThemeShape(nextTheme);
  if(previousShape === nextShape) return;
  // 카드 모양을 새로 고를 때만 이어보기와 외곽선 기본값을 적용한다.
  // 이후 체크박스와 미리보기 버튼에서 바꾼 값은 그대로 유지한다.
  document.getElementById('cardLayout').value = nextShape === 'document' ? 'unified' : 'separate';
  document.getElementById('cardBorderOn').checked = nextShape !== 'document';
  MosaicRenderer.syncCardLayoutCheckbox();
}

function chooseOutputTheme(shape, transparent){
  MosaicStorage.commitThemeHoverPreview();
  const outputTheme = document.getElementById('outputTheme');
  const nextTheme = MosaicRenderer.composeOutputTheme(shape, transparent);
  setCardDefaultsForShapeChange(outputTheme.value, nextTheme);
  outputTheme.value = nextTheme;
  updateHexLabels();
  MosaicStorage.renderComboList();
  MosaicStorage.renderPresetList();
  uiUpdateEffects.renderedSavedChange();
  MosaicStorage.commitStyleHistory(true);
}

function bindThemeChoiceEvents(){
  bindUIFeatureEvents('theme-choice', () => {
    document.querySelectorAll('[data-output-shape]').forEach(button => {
      button.addEventListener('click', () => {
        const mode = document.getElementById('outputTheme').value;
        chooseOutputTheme(button.dataset.outputShape, MosaicRenderer.outputThemeTransparent(mode));
      });
    });
    document.getElementById('previewCardShapeBtn').addEventListener('click', () => {
      const mode = document.getElementById('outputTheme').value;
      const nextShape = MosaicRenderer.outputThemeShape(mode) === 'document' ? 'solid' : 'document';
      chooseOutputTheme(nextShape, MosaicRenderer.outputThemeTransparent(mode));
    });

    document.getElementById('outputTransparentOn').addEventListener('change', event => {
      const mode = document.getElementById('outputTheme').value;
      chooseOutputTheme(MosaicRenderer.outputThemeShape(mode), event.target.checked);
    });
  });
}

function updateHexLabels(){
  syncOutputThemeControls();
  const transparentHint = document.getElementById('transparentThemeHint');
  if(transparentHint) transparentHint.hidden = !MosaicRenderer.outputThemeTransparent(document.getElementById('outputTheme').value);
  ['narrColor','charColor','userColor','emphasisColor','bgColor'].forEach(id => {
    document.getElementById(id + 'Hex').value = document.getElementById(id).value;
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
          MosaicStorage.updateOverwriteBtn();
          uiUpdateEffects.renderedDraftChange();
          MosaicStorage.commitStyleHistory(false);
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

function syncLinkedRangeEditor(id){
  const input = document.getElementById(id);
  const editor = document.getElementById(id + 'Val');
  if(input && editor && editor !== document.activeElement) editor.value = input.value;
}

function bindRangeLabelMirrors(bindingName, ids){
  bindUIFeatureEvents(bindingName, () => {
    ids.forEach(id => {
      document.getElementById(id).addEventListener('input', () => syncLinkedRangeEditor(id));
    });
  });
}

function bindCoverRangeLabelEvents(){
  bindRangeLabelMirrors('cover-range-labels', COVER_IMAGE_RANGE_IDS);
}

const extraProfileCount = () => Math.max(0, Math.min(3, Math.floor(Number(document.getElementById('profileExtraCount').value) || 0)));
document.getElementById('profileExtraEditors').innerHTML = MosaicState.EXTRA_PROFILE_SLOTS.map(slot => {
  const prefix = MosaicState.extraProfilePrefix(slot);
  const range = (field, label, min, max, step, value, unit = '') => `<div class="row"><label for="${prefix}${field}">${label}</label><input type="range" id="${prefix}${field}" min="${min}" max="${max}" step="${step}" value="${value}"><span class="rangeEditor"><input type="text" inputmode="numeric" class="rangeval" id="${prefix}${field}Val" data-range="${prefix}${field}" value="${value}" aria-label="인물 ${slot} 사진 ${label} 직접 입력">${unit ? `<span class="rangeUnit">${unit}</span>` : ''}</span></div>`;
  const key = `extra${slot}`;
  return `<details class="profileSubFold" id="${prefix}Group" data-profile-key="${key}" hidden><summary class="profileSubHead"><button type="button" class="profileRemoveBtn" data-profile-remove="${slot}" aria-label="인물 ${slot} 삭제" title="인물 삭제">×</button><span class="profileSubTitle" id="${prefix}Title">인물 ${slot}</span><span class="profileSubActions"><button type="button" class="profileMoveBtn" data-profile-move="up" data-profile-key="${key}" aria-label="인물 ${slot} 위로 이동" title="위로 이동">↑</button><button type="button" class="profileMoveBtn" data-profile-move="down" data-profile-key="${key}" aria-label="인물 ${slot} 아래로 이동" title="아래로 이동">↓</button><button type="button" class="profileResetIconBtn" id="${prefix}ResetBtn" aria-label="인물 ${slot} 초기화" title="인물 ${slot} 초기화">↺</button><label class="coverVisibilitySwitch" title="인물 ${slot} 표시 전환"><input type="checkbox" id="${prefix}On" checked aria-label="인물 ${slot} 표시"><span class="coverVisibilitySwitchTrack" aria-hidden="true"></span></label></span><span class="profileSubArrow" aria-hidden="true"></span></summary><div class="profileSubBody"><div class="row profileImageRow"><label for="${prefix}Image">이미지 URL</label><div class="profileImageField"><input type="url" id="${prefix}Image" maxlength="8192" placeholder="프로필 이미지 URL"><span class="imageLoadStatus profileImageDot" id="${prefix}ImageStatus" data-state="idle" aria-live="polite" hidden></span><button type="button" class="profileImageAdjustBtn" id="${prefix}ImageAdjustBtn" aria-label="인물 ${slot} 사진 조정 열기" title="사진 조정" aria-expanded="false" aria-controls="${prefix}ImageAdjustPanel">⚙︎</button></div></div><div class="profileImageAdjustPanel" id="${prefix}ImageAdjustPanel" hidden><div class="profileImageAdjustments" role="group" aria-label="인물 ${slot} 사진 조절">${range('Scale','배율',100,300,5,100,'%')}${range('X','가로',0,100,1,50)}${range('Y','세로',0,100,1,50)}</div></div><div class="row"><label for="${prefix}Role">라벨</label><input type="text" id="${prefix}Role" maxlength="24" value="CHAR" placeholder="CHAR"></div><div class="row"><label for="${prefix}Name">이름</label><input type="text" id="${prefix}Name" maxlength="100" placeholder="표시 이름"></div><div class="row profileTagsRow"><label id="${prefix}TagsLabel">태그</label><div class="profileTagFields" role="group" aria-labelledby="${prefix}TagsLabel"><input type="text" id="${prefix}Tag1" maxlength="150" placeholder="태그 1"><input type="text" id="${prefix}Tag2" maxlength="150" placeholder="태그 2"><input type="text" id="${prefix}Tag3" maxlength="150" placeholder="태그 3"></div><input type="hidden" id="${prefix}Tags" value=""></div><div class="row"><label for="${prefix}Desc">소개</label><textarea id="${prefix}Desc" maxlength="500" rows="2" style="min-height:58px; resize:vertical;" placeholder="한 줄 설명"></textarea></div></div></details>`;
}).join('');

function currentProfileEntityOrder(){
  const input = document.getElementById('profileEntityOrder');
  const order = MosaicState.normalizeProfileEntityOrder(
    input.value,
    extraProfileCount(),
    document.getElementById('profileOrder').value
  );
  input.value = JSON.stringify(order);
  return order;
}

function setProfileEntityOrder(order){
  document.getElementById('profileEntityOrder').value = JSON.stringify(MosaicState.normalizeProfileEntityOrder(
    order,
    extraProfileCount(),
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
  const count = extraProfileCount();
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
  PROFILE_IMAGE_RANGE_IDS.forEach(syncLinkedRangeEditor);
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
  if(id === 'profileImageBackgroundOn'){
    document.getElementById('profileTextPositionRow').hidden = !input.checked;
  }
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
  const profileImageAvailable = ['profileChar','profileUser',...MosaicState.EXTRA_PROFILE_SLOTS.filter(slot => slot <= extraProfileCount() + 2).map(MosaicState.extraProfilePrefix)].some(role => {
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
  COVER_IMAGE_RANGE_IDS.forEach(syncLinkedRangeEditor);
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
  ['hrOpacity','hrLength','hrVerticalSpace','hr2Opacity','hr2VerticalSpace','hr3Opacity','hr3VerticalSpace','gapHeight','coverVerticalSpace','profileItemGap','profileTitleGap','coverCardGap','cardGap','unifiedBottomSpace','creditWidth','creditCardGap','cardInlinePadding','cardBodyTopSpace','cardBodyBottomSpace','footerBodyGap','headingTopSpace','headingBetweenSpace','headingBottomSpace','cardCornerRadius','cardTitleOrnamentOpacity','coverDividerLength','cardTitlePadding','cardDividerLength'].forEach(id => {
    const input = document.getElementById(id);
    const label = document.getElementById(id + 'Val');
    if(id === 'profileItemGap'){
      input.min = String(-MosaicRenderer.profileItemGapBasePx());
      if(Number(input.value) < Number(input.min)) input.value = input.min;
    }
    if(label !== document.activeElement) label.value = id === 'profileItemGap'
      ? String(Math.max(0, MosaicRenderer.profileItemGapBasePx() + Number(input.value)))
      : id === 'cardInlinePadding' ? String(Number(input.value) - 22) : input.value;
    const min = Number(input.min);
    const max = Number(input.max);
    const progress = max > min ? (Number(input.value) - min) / (max - min) * 100 : 0;
    input.style.setProperty('--advanced-range-progress', `${Math.max(0, Math.min(100, progress))}%`);
  });
  MosaicRenderer.syncSoftBreakSpacingControl();
  ['narrSize','narrLine','dlgSize','dlgLine','paragraphGap','narrDialogueGap','softBreakSpacing','titleSize','foldTitleSize'].forEach(id => {
    const input = document.getElementById(id);
    const min = Number(input.min);
    const max = Number(input.max);
    const progress = max > min ? (Number(input.value) - min) / (max - min) * 100 : 0;
    input.style.setProperty('--type-range-progress', `${Math.max(0, Math.min(100, progress))}%`);
  });
}

// 슬라이더와 숫자 입력을 양방향으로 연결해 빠른 조절과 정확한 입력을 모두 지원한다.
function bindRangeEditorEvents(){
  bindUIFeatureEvents('range-editors', () => {
    document.querySelectorAll('.rangeEditor input[data-range]').forEach(editor => {
      const range = document.getElementById(editor.dataset.range);
      if(!range) return;
      editor.addEventListener('input', () => {
        const value = Number(editor.value) - (range.id === 'profileItemGap' ? MosaicRenderer.profileItemGapBasePx()
          : range.id === 'cardInlinePadding' ? -22 : 0);
        if(!Number.isFinite(value) || value < Number(range.min) || value > Number(range.max)) return;
        range.value = String(value);
        range.dispatchEvent(new Event('input', { bubbles:true }));
      });
      editor.addEventListener('change', () => {
        const base = range.id === 'profileItemGap' ? MosaicRenderer.profileItemGapBasePx()
          : range.id === 'cardInlinePadding' ? -22 : 0;
        const value = Number(editor.value) - base;
        const safeValue = Number.isFinite(value)
          ? Math.min(Number(range.max), Math.max(Number(range.min), value))
          : Number(range.value);
        range.value = String(safeValue);
        editor.value = String(range.id === 'cardInlinePadding' || range.id === 'footerBodyGap'
          ? Number(range.value) + base : Math.max(0, Number(range.value) + base));
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

function syncDesktopPreviewWidth(){
  const desktopButton = document.getElementById('widthDesktopBtn');
  if(document.body.classList.contains('previewFullscreen') && (!desktopButton || !desktopButton.classList.contains('active'))) return;
  const cardWidth = parseInt(document.getElementById('cardWidth').value, 10) || 750;
  document.getElementById('previewWrap').style.maxWidth = `${cardWidth}px`;
}

function syncPreviewToolbarLabel(){
  const toolbar = document.getElementById('previewToolbar');
  const previewArea = uiElements.previewArea;
  const areaStyle = getComputedStyle(previewArea);
  const availableWidth = previewArea.clientWidth
    - (parseFloat(areaStyle.paddingLeft) || 0)
    - (parseFloat(areaStyle.paddingRight) || 0);
  // 위쪽 도구모음은 카드 폭 대신 미리보기 영역 폭을 따른다. 카드 폭을 순환해도
  // 버튼의 가로 위치가 바뀌지 않고, 영역 자체가 좁아질 때에만 함께 줄어든다.
  toolbar.style.setProperty('--preview-toolbar-width', `${Math.min(900, Math.max(0, availableWidth))}px`);
  const desktopButton = document.getElementById('widthDesktopBtn');
  const mobileButton = document.getElementById('widthMobileBtn');
  const cycleButton = document.getElementById('previewWidthCycleBtn');
  const cardWidthSelect = document.getElementById('cardWidth');
  const cardWidth = parseInt(cardWidthSelect.value, 10) || 750;
  const desktopLabel = `데스크톱 ${cardWidth}`;
  const mobileLabel = '모바일 380';
  const setLabel = (button, label) => {
    if(button.textContent !== label) button.textContent = label;
  };
  desktopButton.setAttribute('aria-label', desktopLabel);
  mobileButton.setAttribute('aria-label', mobileLabel);
  const fullscreen = document.body.classList.contains('previewFullscreen');
  const toolbarWidth = toolbar.clientWidth;
  if(!fullscreen){
    const widths = Array.from(cardWidthSelect.options).filter(option => !option.disabled);
    const currentIndex = widths.findIndex(option => option.value === cardWidthSelect.value);
    const nextWidth = widths[(currentIndex + 1) % widths.length]?.value || '620';
    setLabel(cycleButton, `${cardWidth}px`);
    cycleButton.setAttribute('aria-label', `본문 폭 ${cardWidth}px, 누르면 ${nextWidth}px로 변경`);
    cycleButton.title = `다음 본문 폭 ${nextWidth}px`;
    toolbar.classList.toggle('previewToolbarStacked', toolbarWidth < 450);
    return;
  }

  // 버튼 글씨와 줄 배치를 바꾸며 다시 폭을 재면 측정 대상 자체가 달라져
  // 경계 근처에서 한 줄/두 줄이 번갈아 나타난다. 컨테이너 폭만 기준으로 삼는다.
  const fullLabels = toolbarWidth >= 830;
  setLabel(desktopButton, fullLabels ? desktopLabel : String(cardWidth));
  setLabel(mobileButton, fullLabels ? mobileLabel : '380');
  toolbar.classList.toggle('previewToolbarStacked', toolbarWidth < 580);
}
function schedulePreviewToolbarSync(){
  if(previewPositionState.toolbarSyncFrame !== null) return;
  previewPositionState.toolbarSyncFrame = requestAnimationFrame(() => {
    previewPositionState.toolbarSyncFrame = null;
    syncPreviewToolbarLabel();
  });
}
function bindPreviewToolbarLayoutEvents(){
  bindUIFeatureEvents('preview-toolbar-layout', () => {
    if(typeof ResizeObserver === 'function'){
      const observer = new ResizeObserver(schedulePreviewToolbarSync);
      observer.observe(uiElements.previewArea);
      observer.observe(document.getElementById('previewWrap'));
      observer.observe(document.querySelector('#previewToolbar .previewTools'));
      uiLifecycleState.observers.push(observer);
    }
    // 전체화면에서 본문은 380px로 고정되어 있어도 도구모음은 창 폭을 따른다.
    // 관찰 중인 본문·도구 폭이 그대로인 채 창만 넓어지는 경우도 다시 계산한다.
    window.addEventListener('resize', schedulePreviewToolbarSync);
  });
}

function syncDividerLengthControlState(){
  const controls = [
    ['coverDividerLength', document.getElementById('titleMinimal').checked],
    ['cardDividerLength', !document.getElementById('foldDividerOn').checked]
  ];
  controls.forEach(([id, unavailable]) => {
    document.getElementById(`${id}Row`).classList.toggle('isUnavailable', unavailable);
    document.getElementById(id).disabled = unavailable;
    document.getElementById(`${id}Val`).disabled = unavailable;
  });
}

function syncUnifiedBottomSpaceControlState(){
  const unavailable = MosaicRenderer.normalizeCardLayout(document.getElementById('cardLayout').value) !== 'unified';
  document.getElementById('unifiedBottomSpaceRow').classList.toggle('isUnavailable', unavailable);
  document.getElementById('unifiedBottomSpace').disabled = unavailable;
  document.getElementById('unifiedBottomSpaceVal').disabled = unavailable;
}
function syncProfileTitleGapControlState(){
  const unavailable = !document.getElementById('profileOn').checked
    || document.getElementById('profilePlacement').value !== 'top'
    || MosaicRenderer.normalizeCardLayout(document.getElementById('cardLayout').value) === 'unified';
  document.getElementById('profileTitleGapRow').classList.toggle('isUnavailable', unavailable);
  document.getElementById('profileTitleGap').disabled = unavailable;
  document.getElementById('profileTitleGapVal').disabled = unavailable;
}
function syncTopProfileDetailControlState(){
  const available = document.getElementById('profileOn').checked
    && document.getElementById('profilePlacement').value === 'top';
  const activePrefixes = ['profileChar','profileUser',
    ...MosaicState.EXTRA_PROFILE_SLOTS.filter(slot => slot <= extraProfileCount() + 2).map(MosaicState.extraProfilePrefix)];
  const visibleProfiles = activePrefixes.filter(prefix => {
    if(!document.getElementById(`${prefix}On`).checked) return false;
    const image = document.getElementById(`${prefix}Image`).value.trim();
    return image
      || ['Name','Desc','Tags'].some(field => document.getElementById(`${prefix}${field}`).value.trim());
  }).length;
  document.getElementById('topProfileDetailPanel').classList.toggle('isUnavailable', !available);
  const background = document.getElementById('profileOuterBackground');
  background.disabled = !available;
  MosaicStorage.syncSegmentedChoiceControl('profileOuterBackground');
  const gapUnavailable = !available || visibleProfiles < 2;
  document.getElementById('profileItemGapRow').classList.toggle('isUnavailable', gapUnavailable);
  document.getElementById('profileItemGap').disabled = gapUnavailable;
  document.getElementById('profileItemGapVal').disabled = gapUnavailable;
}

function syncFoldAutoNumberStyleControlState(){
  const unavailable = !document.getElementById('foldTitleAutoNumber').checked;
  document.getElementById('foldAutoNumberStyleRow').classList.toggle('isUnavailable', unavailable);
  document.getElementById('foldAutoNumberStyle').disabled = unavailable;
  MosaicStorage.syncSegmentedChoiceControl('foldAutoNumberStyle');
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
      || (Boolean(HR_CONTROL_IDS[group]) && button.classList.contains('isUnavailable'));
  });
}

function syncDesignControlStates(){
  MosaicRenderer.syncCardLayoutCheckbox();
  MosaicStorage.syncMinimalChoiceControls();
  syncDividerLengthControlState();
  syncUnifiedBottomSpaceControlState();
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
  const width = cardWidthSelect.selectedOptions[0]?.textContent.trim() || `${cardWidth}px`;
  syncDesktopPreviewWidth();
  syncPreviewToolbarLabel();
  document.getElementById('typographyDesignSummary').textContent =
    `${font} · 본문 ${document.getElementById('narrSize').value}px · 제목 ${document.getElementById('titleSize').value}px`;
  const parallelLayout = selectedControlText('parallelTranslationLayout');
  document.getElementById('dialogueDesignSummary').textContent =
    `${dialogue} · 병행 ${parallelLayout}`;
  document.getElementById('layoutDesignSummary').textContent = width;

  const imageOn = document.getElementById('imgOn').checked;
  document.getElementById('imageCoverSummary').textContent = imageOn
    ? `${document.getElementById('imgHeight').value}px`
    : '';

  const titleOn = document.getElementById('logTitleOn').checked;
  document.getElementById('titleCoverSummary').textContent = titleOn
    ? (document.getElementById('titleMinimal').checked ? '미니멀' : '일반')
    : '';
  const profileOn = document.getElementById('profileOn').checked;
  const profilePlacementSummary = document.getElementById('profilePlacement').value === 'top'
    ? '최상단'
    : selectedControlText('profilePlacement');
  document.getElementById('profileCoverSummary').textContent = profileOn
    ? `${selectedControlText('profileStyle')} · ${document.getElementById('profileMinimal').checked ? '미니멀' : '일반'} · ${profilePlacementSummary}`
    : '';

  const footerAuthorSummary = document.getElementById('footerAuthor').value.trim();
  document.getElementById('footerCoverSummary').textContent = document.getElementById('footerOn').checked && footerAuthorSummary
    ? `©${footerAuthorSummary}`
    : '';
  const creditOn = document.getElementById('creditOn').checked;
  const creditCount = MosaicRenderer.storedCreditItems().filter(item => item.label.trim() || item.value.trim()).length;
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
    label:'관계와 상황', toggleId:'profileCommonOn', groupId:'profileCommonGroup', resetButtonId:'profileCommonResetBtn',
    controlIds:['profileRelationship1','profileRelationship2','profileRelationship3','profileSituation'],
    resetValues:{ profileRelationship:'', profileSituation:'' },
    emptyMessage:'관계와 상황은 이미 초기 상태입니다.',
    completeMessage:'관계와 상황을 초기화했습니다.'
  }
];

function applyProfileReset(entries, message){
  MosaicStorage.snapshotCards();
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
  MosaicStorage.snapshotCards();
  setProfileEntityOrder(nextOrder);
  syncProfileEntityEditors();
  syncCoverControlState();
  syncDesignSummaries();
  uiUpdateEffects.committedChange();
  showUndoToast('인물 순서를 변경했습니다.');
  return true;
}

function addExtraProfile(){
  const count = extraProfileCount();
  if(count >= MosaicState.EXTRA_PROFILE_SLOTS.length) return;
  MosaicStorage.snapshotCards();
  const slot = count + 3;
  const order = currentProfileEntityOrder();
  resetExtraProfileSlot(slot);
  document.getElementById('profileExtraCount').value = String(count + 1);
  setProfileEntityOrder([...order, `extra${slot}`]);
  document.getElementById(`profileExtra${slot}Group`).open = true;
  commitExtraProfileChange(`인물 ${slot}을 추가했습니다.`);
}

function removeExtraProfile(slot){
  const count = extraProfileCount();
  if(slot < 3 || slot > count + 2) return;
  MosaicStorage.snapshotCards();
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
  const separator = MosaicParser.normalizeSubtitleCoupleSeparator(subtitleCoupleSeparatorInput.value);
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
      MosaicStorage.snapshotCards();
      const separators = ['×', '&', '·'];
      const current = MosaicParser.normalizeSubtitleCoupleSeparator(subtitleCoupleSeparatorInput.value);
      subtitleCoupleSeparatorInput.value = separators[(separators.indexOf(current) + 1) % separators.length];
      subtitleCoupleSeparatorInput.dispatchEvent(new Event('input', { bubbles:true }));
      showUndoToast(`이름 구분 기호를 ${subtitleCoupleSeparatorInput.value}로 변경했습니다.`);
    });
  });
}
syncSubtitleCoupleSeparatorControl();

// 모든 입력 변경시 리렌더 (헥스 입력창은 위에서 별도 처리하므로 여기선 건드리지 않음)
// 상태 필드와 기본값은 state.js의 단일 스키마를 사용한다.
const SIDEBAR_OUTPUT_IDS = new Set([...MosaicState.WORK_FIELDS, ...MosaicState.STYLE_FIELDS, ...MosaicState.WORK_BOOLEAN_FIELDS]);
// 표시 여부에 따라 미리보기 높이가 크게 바뀌는 옵션들.
// 위치 맞추기가 꺼져 있으면 브라우저의 자동 스크롤 보정까지 취소해 현재 화면을 유지한다.
const POSITION_PRESERVE_TOGGLE_IDS = new Set(['logTitleOn', 'titleMinimal', 'titleImageBackgroundOn', 'profileOn', 'profileMinimal', 'profileCharOn', 'profileUserOn', ...MosaicState.EXTRA_PROFILE_SLOTS.map(slot => `profileExtra${slot}On`), 'profileImageBackgroundOn', 'profileCommonOn', 'footerOn', 'creditOn', 'creditPlacement', 'cardLayout']);
function previewVisibleFooterElement(){
  const footer = document.querySelector('#preview [data-mosaic-footer="true"]');
  return footer && footer.getClientRects().length ? footer : null;
}

function previewProfileRoleTarget(role){
  return document.querySelector(`#preview [data-mosaic-profile-role="${role}"]`) || previewParts().profile;
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
    || previewParts().profile;
}

function previewCreditFieldTarget(index, field){
  if(!Number.isInteger(index) || index < 0) return previewParts().credit;
  const credit = previewParts().credit;
  if(!credit) return null;
  const preferredField = field === 'label' ? 'label' : 'value';
  return credit.querySelector(`[data-mosaic-credit-index="${index}"][data-mosaic-credit-field="${preferredField}"]`)
    || credit.querySelector(`[data-mosaic-credit-index="${index}"]`)
    || credit;
}

function activeCreditPreviewTarget(){
  const id = document.activeElement && document.activeElement.id;
  const match = String(id || '').match(/^credit(Label|Value|Url)(\d+)$/);
  if(!match) return previewParts().credit;
  const field = match[1] === 'Label' ? 'label' : 'value';
  return previewCreditFieldTarget(Number(match[2]), field);
}
const PREVIEW_FOCUS_MAP = {
  logNumber:  () => previewParts().title,
  logTitle:   () => previewParts().title,
  subChar:    () => previewParts().title,
  subUser:    () => previewParts().title,
  subtitleCoupleSeparator:() => previewParts().title,
  logSubtitle:() => previewParts().title,
  logTitleOn: () => previewParts().title,
  titleMinimal:() => previewParts().title,
  imgOn:      () => previewParts().image,
  imgUrl:     () => previewParts().image,
  imgHeight:  () => previewParts().image,
  xpos:       () => previewParts().image,
  ypos:       () => previewParts().image,
  profileOn:  () => previewParts().profile,
  profileMinimal:() => previewParts().profile,
  profileCharOn:() => previewProfileRoleTarget('bot'),
  profileUserOn:() => previewProfileRoleTarget('user'),
  profileCommonOn:() => previewParts().profile,
  profilePlacement:() => previewParts().profile,
  profileTextPosition:() => previewParts().profile,
  profileImageBackgroundOn:() => previewParts().profile,
  profileStyle:() => previewParts().profile,
  profileOrder:() => previewParts().profile,
  profileEntityOrder:() => previewParts().profile,
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
  profileRelationship:() => previewProfileFieldTarget('profileRelationship'),
  profileSituation:() => previewProfileFieldTarget('profileSituation'),
  // 숨긴 뒤에는 대체 대상으로 마지막 카드 전체를 반환하지 않는다.
  // 큰 카드를 중앙 정렬하며 미리보기 스크롤이 튀는 것을 막고,
  // 다시 표시한 경우에도 접힌 카드 안이라면 스크롤하거나 카드를 열지 않는다.
  footerOn: () => previewVisibleFooterElement(),
  footerAuthor: () => previewVisibleFooterElement(),
  creditOn: () => previewParts().credit,
  creditPlacement: () => previewParts().credit,
  creditItems: () => activeCreditPreviewTarget(),
};
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
syncParagraphSettingsUI();

function bindProfileCompositionEvents(input){
  let composing = false;
  input.addEventListener('compositionstart', () => {
    composing = true;
    MosaicStorage.deferDraftSave();
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
          MosaicStorage.deferDraftSave();
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
        uiUpdateEffects.renderLater();
        if(preserveViewport){
          requestAnimationFrame(() => window.scrollTo(viewportX, viewportY));
        }
        uiUpdateEffects.saveLater();
        if(el.id && MosaicState.STYLE_FIELDS.includes(el.id)) MosaicStorage.commitStyleHistory(false);
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
        MosaicStorage.commitStyleHistory(true);
      });
    });
    document.getElementById('textFont').addEventListener('change', () => MosaicRenderer.loadSelectedWebFont('textFont'));
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
  uiControlSyncState.keys.clear();
  syncExtraProfileEditors();
  COVER_VISIBILITY_GROUPS.forEach(([groupId, toggleId]) => {
    document.getElementById(groupId).classList.toggle(
      'isCoverInactive', !document.getElementById(toggleId).checked
    );
  });
  syncSubtitleCoupleSeparatorControl();
  syncCoverImageRangeLabels();
  syncProfileImageRangeLabels();
  syncCoverRangeProgress();
  // 상위 섹션의 OFF 상태는 출력만 숨긴다. 입력은 유지해 첫 조작으로 자동 ON한다.
  subtitleCoupleSeparatorBtn.disabled = false;
  syncProfileEntityControlState();
  syncProfileImageUiState();
  syncImageBackgroundToggleAvailability();
  MosaicStorage.syncAllSegmentedChoiceControls();
  MosaicStorage.syncMinimalChoiceControls();
  MosaicApp.updateAllImageLoadStatuses();
  syncCreditControlState();
  syncCreditDetailAvailability();
  MosaicApp.syncPreviewVisibilityToggles();
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
  MosaicStorage.syncSegmentedChoiceControl('creditPlacement');
  MosaicRenderer.syncCreditPresetControls();
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

    // BOT·USER·관계가 자체 OFF일 때도 첫 입력으로 해당 항목을 켠다.
    PROFILE_ENTITY_CONFIGS.forEach(config => {
      const body = document.querySelector(`#${config.groupId} > .profileSubBody`);
      const toggle = document.getElementById(config.toggleId);
      bindVisibilityActivation(body, toggle);
    });
    ['imgOn','logTitleOn','profileOn','profileCharOn','profileUserOn',...MosaicState.EXTRA_PROFILE_SLOTS.map(slot => `profileExtra${slot}On`),'profileCommonOn','footerOn','creditOn'].forEach(id => {
      document.getElementById(id).addEventListener('change', syncCoverControlState);
    });

    document.getElementById('creditAddBtn').addEventListener('click', MosaicRenderer.addCreditItem);
    document.getElementById('creditPresetSelect').addEventListener('change', MosaicRenderer.syncCreditPresetControls);
    document.getElementById('creditPresetName').addEventListener('input', MosaicRenderer.syncCreditPresetControls);
    document.getElementById('creditPresetLoadBtn').addEventListener('click', MosaicRenderer.loadSelectedCreditPreset);
    document.getElementById('creditPresetSaveBtn').addEventListener('click', MosaicRenderer.saveCurrentCreditPreset);
    document.getElementById('creditPresetDeleteBtn').addEventListener('click', MosaicRenderer.deleteSelectedCreditPreset);
    document.getElementById('detailPresetSelect').addEventListener('change', MosaicRenderer.syncDetailPresetControls);
    document.getElementById('detailPresetName').addEventListener('input', MosaicRenderer.syncDetailPresetControls);
    document.getElementById('detailPresetLoadBtn').addEventListener('click', MosaicRenderer.loadSelectedDetailPreset);
    document.getElementById('detailPresetSaveBtn').addEventListener('click', MosaicRenderer.saveCurrentDetailPreset);
    document.getElementById('detailPresetDeleteBtn').addEventListener('click', MosaicRenderer.deleteSelectedDetailPreset);
  });
}

// ---------- 카드별 본문 입력 ----------
const EXAMPLE_BODY = `<<"이리야."

대답이 없었다.

이리의 눈동자는 하늘에 박혀 있었고, 눈꺼풀은 깜빡이는 것조차 잊은 듯 움직이지 않았다. 동공이 빛에 반응하며 천천히 줄어들었다가 구름이 해를 가리자 다시 풀어졌다. 그 작은 변화조차 이리에게는 경이로움이었다. 그의 목구멍에서 낮은 소리가 흘러나왔다. 말이 아니었다. 개가 낯선 것을 마주했을 때 내는, 가슴 깊은 곳에서 울리는 작은 울음소리.

이리의 눈에는 눈물이 맺혀 있었다.

흐르지는 않았다. 속눈썹에 걸린 채로 아침 햇살을 받아 작은 프리즘처럼 빛나고 있었다. 슬픔의 눈물이 아니었다. 두려움도, 고통도 아니었다. 그저 너무 많은 것이 한꺼번에 밀려들어왔을 때, 몸이 감당하지 못해 흘러넘치는 수분. 개였을 때는 볼 수 없었던 색깔들. 인간의 눈이 포착하는 스펙트럼의 넓이. 하늘의 파랑은 단일한 색이 아니라 수백 개의 파랑이 겹쳐진 층위였다. 이리는 그 모든 것을 동시에 보고 있었다.

"하늘."

단 한 단어. 발음은 여전히 서툴렀다. 하지만 그 목소리에는 말로 다 담지 못한 모든 것이 실려 있었다.


*이렇게 생긴 거였어? 이렇게 넓은 거였어? 이렇게 많은 색이 있었어? 나 여태까지 이걸 모르고 살았어?*`;

const cardEditorState = {
  activeTextarea:null, // 마지막으로 포커스된 카드 입력창 (툴바 삽입 대상)
  toolbarHeaderObserver:null,
  delegatedEventsBound:false
};

function bodyCardTextareas(){
  return Array.from(document.querySelectorAll('#cardEditors .cardEditor:not(.commentEditor) textarea'));
}

function bindCardEditorDelegatedEvents(){
  if(cardEditorState.delegatedEventsBound) return;
  const root = uiElements.cardEditors;
  if(!root) return;
  cardEditorState.delegatedEventsBound = true;

  root.addEventListener('mousedown', event => {
    if(event.target.closest('.fmtBtn[data-card-format]')) event.preventDefault();
  });

  root.addEventListener('click', event => {
    const editor = event.target.closest('.cardEditor:not(.commentEditor)');
    if(!editor) return;
    const textarea = editor.querySelector('textarea');
    const formatButton = event.target.closest('.fmtBtn[data-card-format]');
    if(formatButton && textarea){
      applyTextareaFormat(textarea, formatButton.dataset.cardFormat);
      return;
    }
    if(event.target.closest('.foldTitleInput')){
      scrollPreviewToCardEditor(editor);
      return;
    }
    const actionButton = event.target.closest('[data-card-action]');
    if(!actionButton || !textarea) return;
    if(actionButton.dataset.cardAction === 'show-preview') scrollPreviewToCardEditor(editor);
    if(actionButton.dataset.cardAction === 'fullscreen'){
      const number = editor.querySelector('.cardNum');
      openFullscreen(textarea, number?.textContent || '본문', editor);
    }
  });

  root.addEventListener('keydown', event => {
    const positionLink = event.target.closest('[data-card-action="show-preview"]');
    if(!positionLink || (event.key !== 'Enter' && event.key !== ' ')) return;
    const editor = positionLink.closest('.cardEditor:not(.commentEditor)');
    if(!editor) return;
    event.preventDefault();
    scrollPreviewToCardEditor(editor);
  });

  root.addEventListener('focusin', event => {
    syncBodyOnlyToolbarAvailability(event);
    const titleInput = event.target.closest('.foldTitleInput');
    if(!titleInput) return;
    const editor = titleInput.closest('.cardEditor:not(.commentEditor)');
    if(!editor) return;
    scrollPreviewToCardEditor(editor);
    editor.querySelector('.cardFoldRow')?.classList.add('isTitleEditing');
  });

  root.addEventListener('focusout', event => {
    const titleInput = event.target.closest('.foldTitleInput');
    if(!titleInput) return;
    titleInput.closest('.cardFoldRow')?.classList.remove('isTitleEditing');
  });

  root.addEventListener('input', event => {
    const titleInput = event.target.closest('.foldTitleInput');
    if(!titleInput) return;
    const editor = titleInput.closest('.cardEditor:not(.commentEditor)');
    if(!editor) return;
    focusPreviewOn(() => previewCardStartForEditor(editor));
    afterEditorLiveInput();
  });
}
const BODY_ONLY_TOOL_IDS = ['tidyBtn','insertHrBtn','separatorInsertSelect','insertImgBtn','insertQuoteBtn','insertFoldBtn'];
function syncBodyOnlyToolbarAvailability(event){
  const focused = event && event.target && event.target.matches('#cardEditors textarea')
    ? event.target
    : cardEditorState.activeTextarea;
  const commentActive = !!(focused && focused.closest && focused.closest('.commentEditor'));
  const toolbar = document.getElementById('bodyEditorToolbar');
  if(toolbar) toolbar.setAttribute('aria-disabled', String(commentActive));
  BODY_ONLY_TOOL_IDS.forEach(id => {
    const button = document.getElementById(id);
    if(button) button.disabled = commentActive;
  });
}

// 일반 본문·대사·인용문 안에서 Shift+Enter를 누르면 저장 원문에 [BR]을 남긴다.
// 인용문도 다음 원문 줄에 `>`를 자동으로 붙이지 않는다. MosaicRenderer.combineSoftBreakPair가
// 앞줄의 인용 문맥을 이어받으므로 [C]와 함께 써도 한 인용 블록으로 안전하게 출력된다.
// 구조 문법 줄과 빈 줄에서는 브라우저 기본 줄바꿈을 유지한다.
function handleSoftBreakKeydown(e){
  if(e.isComposing || e.keyCode === 229 || e.key !== 'Enter' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
  const ta = e.currentTarget;
  if(!ta || typeof ta.selectionStart !== 'number') return;
  const value = ta.value;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  // 여러 원문 줄을 한 번에 선택한 경우에는 구조 문법까지 지울 수 있으므로
  // 자동 [BR] 치환을 하지 않고 브라우저의 일반 줄바꿈 동작을 유지한다.
  if(value.slice(start, end).includes('\n')) return;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = value.indexOf('\n', end);
  if(lineEnd < 0) lineEnd = value.length;
  const currentLine = value.slice(lineStart, lineEnd).replace(/\[BR\]\s*$/i, '');
  const semanticCurrentLine = currentLine.replace(/^\s*\[C\]\s*/i, '');
  const isQuoteLine = /^\s*>(?!>)\s?\S/.test(semanticCurrentLine);
  if(!currentLine.trim() || (MosaicRenderer.isStructuralBodyLine(currentLine) && !isQuoteLine)) return;
  e.preventDefault();
  ta.focus();
  ta.setSelectionRange(start, end);
  const insertion = '[BR]\n';
  let inserted = false;
  try { inserted = document.execCommand('insertText', false, insertion); } catch(err){ inserted = false; }
  if(!inserted){
    ta.setRangeText(insertion, start, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles:true }));
  }
}

// 코멘트에는 카드 구조 문법이 없으므로 구조 줄 판별 없이 [BR] 줄바꿈만 허용한다.
// 빈 줄과 여러 줄 선택은 일반 Enter 동작을 유지해 예기치 않은 범위 치환을 막는다.
function handleCommentSoftBreakKeydown(e){
  if(e.isComposing || e.keyCode === 229 || e.key !== 'Enter' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
  const ta = e.currentTarget;
  if(!ta || typeof ta.selectionStart !== 'number') return;
  const value = ta.value;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  if(value.slice(start, end).includes('\n')) return;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const currentLine = value.slice(lineStart, start).replace(/\[BR\]\s*$/i, '');
  if(!currentLine.trim()) return;
  e.preventDefault();
  ta.focus();
  ta.setSelectionRange(start, end);
  let inserted = false;
  try { inserted = document.execCommand('insertText', false, '[BR]\n'); } catch(err){ inserted = false; }
  if(!inserted){
    ta.setRangeText('[BR]\n', start, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles:true }));
  }
}

// 카드 입력창에 붙인 관찰자를 정리한 뒤 DOM을 비워, 반복 불러오기·초기화 시
// 제거된 카드가 메모리에 남거나 뒤늦은 크기 콜백이 실행되지 않게 한다.
function disposeCardEditor(ed){
  if(!ed) return;
  const observer = ed._widthObserver;
  if(observer && typeof observer.disconnect === 'function') observer.disconnect();
  delete ed._widthObserver;
}

function clearCardEditors(){
  const container = uiElements.cardEditors;
  Array.from(container.children).forEach(disposeCardEditor);
  container.replaceChildren();
}

// 상단 탭 헤더의 실제 높이를 따라가 툴바가 그 아래에 정확히 붙도록 한다.
function syncBodyToolbarStickyOffset(){
  const sidebar = document.getElementById('sidebar');
  const sidebarTop = document.getElementById('sidebarTop');
  if(!sidebar || !sidebarTop) return;
  // 상단 탭과 편집 도크를 바로 이어 붙여, 스크롤된 본문이 틈 사이로 비치지 않게 한다.
  sidebar.style.setProperty('--body-toolbar-sticky-top', `${Math.round(sidebarTop.getBoundingClientRect().height)}px`);
}
function bindCardToolbarLayoutEvents(){
  bindUIFeatureEvents('card-toolbar-layout', () => {
    if(typeof ResizeObserver === 'function'){
      cardEditorState.toolbarHeaderObserver = new ResizeObserver(syncBodyToolbarStickyOffset);
      cardEditorState.toolbarHeaderObserver.observe(document.getElementById('sidebarTop'));
    }
    window.addEventListener('resize', syncBodyToolbarStickyOffset);
  });
}
requestAnimationFrame(syncBodyToolbarStickyOffset);

function getCards(){
  return Array.from(document.querySelectorAll('#cardEditors .cardEditor')).map(ed => {
    const body = ed.querySelector('textarea').value;
    const visible = ed.dataset.outputVisible !== 'false';
    if(ed.dataset.blockType === 'comment') return { type:'comment', body, visible };
    const fold = ed.querySelector('.cardFoldChk');
    const title = ed.querySelector('.foldTitleInput');
    return {
      type:'card',
      body,
      folded:!!(fold && fold.checked),
      foldTitle:title ? title.value : '',
      cardTitle:title ? title.value : '',
      visible,
    };
  });
}

function renumberCards(){
  const editors = Array.from(document.querySelectorAll('#cardEditors .cardEditor'));
  const cardEditors = editors.filter(ed => ed.dataset.blockType !== 'comment');
  let cardNumber = 0;
  let commentNumber = 0;
  editors.forEach(ed => {
    const isComment = ed.dataset.blockType === 'comment';
    const index = isComment ? ++commentNumber : ++cardNumber;
    const folded = ed.querySelector('.cardFoldChk') && ed.querySelector('.cardFoldChk').checked;
    const status = ed.dataset.outputVisible === 'false' ? ' · 숨김' : (folded ? ' · 접힘' : '');
    ed.querySelector('.cardNum').textContent = (isComment ? '코멘트 ' : '카드 ') + index + status;
    const ta = ed.querySelector('textarea');
    if(ta) ta.setAttribute('aria-label', `${isComment ? '코멘트' : '카드'} ${index} 본문`);
    // 카드가 1장뿐이면 삭제 버튼 숨김
    const deleteButton = ed.querySelector('.delCardBtn');
    if(deleteButton) deleteButton.style.display = isComment || cardEditors.length > 1 ? '' : 'none';
  });
  // 카드 구조가 바뀐 시점에만 코멘트 배치 버튼의 활성 여부를 갱신한다.
  syncParagraphSettingsUI();
}

// 카드와 코멘트가 섞인 실제 편집 순서를 헤더 드래그로 바꾼다.
// 입력창과 헤더의 버튼은 드래그 시작점에서 제외해 편집·클릭 오작동을 막는다.
const cardEditorDragState = {
  editor:null,
  marker:null,
  blockedByControl:false,
  clientY:null,
  autoScrollFrame:null
};

function cardEditorElements(container){
  return Array.from(container.children).filter(child => child.classList && child.classList.contains('cardEditor'));
}

function cardEditorOrderAtMarker(container, dragged, marker){
  const remaining = cardEditorElements(container).filter(editor => editor !== dragged);
  const children = Array.from(container.children);
  const childrenBeforeMarker = children.slice(0, children.indexOf(marker));
  const insertIndex = childrenBeforeMarker.filter(child => child !== dragged && child.classList && child.classList.contains('cardEditor')).length;
  const ordered = remaining.slice();
  ordered.splice(insertIndex, 0, dragged);
  return ordered;
}

function stopCardEditorAutoScroll(){
  if(cardEditorDragState.autoScrollFrame !== null){
    cancelAnimationFrame(cardEditorDragState.autoScrollFrame);
    cardEditorDragState.autoScrollFrame = null;
  }
  cardEditorDragState.clientY = null;
}

function cleanupCardEditorDrag(){
  stopCardEditorAutoScroll();
  if(cardEditorDragState.editor) cardEditorDragState.editor.classList.remove('isEditorDragging');
  if(cardEditorDragState.marker) cardEditorDragState.marker.remove();
  cardEditorDragState.editor = null;
  cardEditorDragState.marker = null;
  cardEditorDragState.blockedByControl = false;
}

function prepareCardEditorDragHandle(head){
  head.draggable = true;
  head.title = '헤더를 끌어서 카드·코멘트 순서 변경';
}

function positionCardEditorDropMarker(clientY){
  const dragged = cardEditorDragState.editor;
  const marker = cardEditorDragState.marker;
  if(!dragged || !marker) return;
  const candidates = cardEditorElements(cardEditorContainer).filter(editor => editor !== dragged);
  const nextEditor = candidates.find(editor => {
    // 본문이 길어도 헤더를 지나면 다음 위치로 이동할 수 있게 한다.
    const head = editor.querySelector('.cardEditorHead') || editor;
    const rect = head.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  });
  if(nextEditor) cardEditorContainer.insertBefore(marker, nextEditor);
  else cardEditorContainer.appendChild(marker);
}

function cardEditorAutoScrollStep(){
  cardEditorDragState.autoScrollFrame = null;
  if(!cardEditorDragState.editor || cardEditorDragState.clientY === null) return;
  const sidebar = document.getElementById('sidebar');
  if(!sidebar) return;

  const rect = sidebar.getBoundingClientRect();
  const stickyHeader = document.getElementById('sidebarTop');
  const stickyBottom = stickyHeader
    ? Math.max(rect.top, Math.min(rect.bottom, stickyHeader.getBoundingClientRect().bottom))
    : rect.top;
  const edge = Math.min(110, Math.max(68, rect.height * .14));
  const y = cardEditorDragState.clientY;
  let delta = 0;
  if(y < stickyBottom + edge){
    const strength = Math.min(1, Math.max(0, (stickyBottom + edge - y) / edge));
    delta = -Math.ceil(8 + 24 * strength);
  }else if(y > rect.bottom - edge){
    const strength = Math.min(1, Math.max(0, (y - (rect.bottom - edge)) / edge));
    delta = Math.ceil(8 + 24 * strength);
  }

  if(delta){
    const before = sidebar.scrollTop;
    sidebar.scrollTop += delta;
    // 스크롤하는 동안 카드의 화면 좌표가 계속 바뀌므로 표시선도 매 프레임 다시 계산한다.
    if(sidebar.scrollTop !== before) positionCardEditorDropMarker(y);
    cardEditorDragState.autoScrollFrame = requestAnimationFrame(cardEditorAutoScrollStep);
  }
}

function updateCardEditorAutoScroll(clientY){
  cardEditorDragState.clientY = clientY;
  if(cardEditorDragState.autoScrollFrame === null){
    cardEditorDragState.autoScrollFrame = requestAnimationFrame(cardEditorAutoScrollStep);
  }
}

const cardEditorContainer = uiElements.cardEditors;
function trackCardEditorDragPointer(event){
  // 헤더 버튼을 누른 채 포인터를 바깥에서 놓아도 draggable 속성이 고착되지 않도록
  // 카드별 속성을 바꾸지 않고 이번 포인터 동작만 컨테이너 상태로 차단한다.
  cardEditorDragState.blockedByControl = !!event.target.closest('.cardEditorHead button, .cardEditorHead input, .cardEditorHead label, .cardEditorHead a, .cardEditorHead select');
}

function startCardEditorDrag(event){
  const head = event.target.closest('.cardEditorHead');
  const editor = head && head.closest('.cardEditor');
  if(!editor || cardEditorDragState.blockedByControl){
    event.preventDefault();
    return;
  }
  // 브라우저가 직전 dragend를 누락했어도 표시선과 흐림 상태를 남기지 않는다.
  cleanupCardEditorDrag();
  cardEditorDragState.editor = editor;
  cardEditorDragState.marker = document.createElement('div');
  cardEditorDragState.marker.className = 'cardEditorDropMarker';
  cardEditorDragState.marker.setAttribute('aria-hidden', 'true');
  editor.classList.add('isEditorDragging');
  if(event.dataTransfer){
    event.dataTransfer.effectAllowed = 'move';
    // Safari는 데이터가 없는 dragstart를 취소할 수 있다.
    event.dataTransfer.setData('text/plain', 'mosaic-log-editor-order');
  }
}

// 카드 목록 위의 고정 헤더까지 포인터를 올려도 dragover를 계속 받아야 위쪽으로
// 자동 스크롤할 수 있다. 컨테이너가 아닌 문서에서 받아 사이드바 내부 동작만 처리한다.
function moveCardEditorDrag(event){
  const dragged = cardEditorDragState.editor;
  const marker = cardEditorDragState.marker;
  if(!dragged || !marker) return;
  const sidebar = document.getElementById('sidebar');
  if(!sidebar) return;
  const rect = sidebar.getBoundingClientRect();
  const insideSidebar = event.clientX >= rect.left && event.clientX <= rect.right
    && event.clientY >= rect.top && event.clientY <= rect.bottom;
  if(!insideSidebar){
    stopCardEditorAutoScroll();
    return;
  }
  event.preventDefault();
  if(event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  positionCardEditorDropMarker(event.clientY);
  updateCardEditorAutoScroll(event.clientY);
}

function finishCardEditorDrop(event){
  const dragged = cardEditorDragState.editor;
  const marker = cardEditorDragState.marker;
  if(!dragged || !marker || !marker.isConnected){
    cleanupCardEditorDrag();
    return;
  }
  event.preventDefault();

  const before = cardEditorElements(cardEditorContainer);
  const intended = cardEditorOrderAtMarker(cardEditorContainer, dragged, marker);
  const changed = before.length === intended.length && before.some((editor, index) => editor !== intended[index]);
  if(changed){
    MosaicStorage.snapshotCards();
    const anchor = marker.nextElementSibling;
    cardEditorContainer.insertBefore(dragged, anchor);
    renumberCards();
    uiUpdateEffects.committedChange();
    const kind = dragged.dataset.blockType === 'comment' ? '코멘트' : '카드';
    showUndoToast(`${kind} 순서 변경.`);
  }
  cleanupCardEditorDrag();
}

function bindCardEditorDragEvents(){
  bindUIFeatureEvents('card-editor-drag', () => {
    cardEditorContainer.addEventListener('pointerdown', trackCardEditorDragPointer);
    document.addEventListener('pointerup', () => { cardEditorDragState.blockedByControl = false; });
    document.addEventListener('pointercancel', () => { cardEditorDragState.blockedByControl = false; });
    cardEditorContainer.addEventListener('dragstart', startCardEditorDrag);
    document.addEventListener('dragover', moveCardEditorDrag);
    cardEditorContainer.addEventListener('drop', finishCardEditorDrop);
    // 위쪽 자동 스크롤 구역이 카드 컨테이너 밖의 고정 헤더까지 확장되므로,
    // 그 위치에서 놓아도 현재 표시선에 정상적으로 정렬을 확정한다.
    document.getElementById('sidebar').addEventListener('drop', finishCardEditorDrop);
    cardEditorContainer.addEventListener('dragend', cleanupCardEditorDrag);
  });
}

const AUTO_EXPAND_ICON_MARKUP = '<svg class="autoExpandIcon" viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="M4 2.75h10M4 15.25h10M9 5.5v7M6.75 7.75 9 5.5l2.25 2.25M6.75 10.25 9 12.5l2.25-2.25"/></svg>';

function afterEditorLiveInput(){
  uiUpdateEffects.liveInput();
}

function afterEditorControlChange(){
  uiUpdateEffects.controlChange();
}

function afterEditorStructureChange(){
  uiUpdateEffects.committedChange();
}

function setupAutoExpandTextarea(editor, textarea, button, minimumHeight, accessibleName = '입력창'){
  const resize = () => {
    if(!textarea.classList.contains('isAutoExpanded') || getComputedStyle(textarea).display === 'none') return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(minimumHeight, textarea.scrollHeight) + 'px';
    textarea.scrollTop = 0;
  };
  const setExpanded = enabled => {
    textarea.classList.toggle('isAutoExpanded', enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? `${accessibleName} 원래 높이로 되돌리기` : `${accessibleName} 전체 펼치기`);
    button.title = enabled
      ? '입력창을 원래 높이로 되돌리기'
      : '입력창을 본문 전체 높이로 펼쳐 내부 스크롤 없애기';
    if(enabled) requestAnimationFrame(resize);
    else {
      textarea.style.height = '';
      textarea.scrollTop = 0;
    }
  };
  button.addEventListener('click', () => setExpanded(!textarea.classList.contains('isAutoExpanded')));
  if(typeof ResizeObserver === 'function'){
    let lastWidth = 0;
    const widthObserver = new ResizeObserver(entries => {
      const width = entries[0] ? entries[0].contentRect.width : 0;
      if(Math.abs(width - lastWidth) < 0.5) return;
      lastWidth = width;
      if(textarea.classList.contains('isAutoExpanded')) requestAnimationFrame(resize);
    });
    widthObserver.observe(textarea);
    editor._widthObserver = widthObserver;
  }
  return resize;
}

function createEditorShell(type, visible){
  const isComment = type === 'comment';
  const noun = isComment ? '코멘트' : '카드';
  const ed = document.createElement('div');
  ed.className = isComment ? 'cardEditor commentEditor' : 'cardEditor';
  ed.dataset.blockType = type;
  ed.dataset.outputVisible = String(visible);

  const head = document.createElement('div');
  head.className = 'cardEditorHead';
  prepareCardEditorDragHandle(head);
  const left = document.createElement('div');
  left.className = 'headLeft';
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'miniCtl collapseCtl';
  collapseBtn.title = isComment ? '입력창 접기' : '입력창 접기 (편집 화면 정리용, 출력에는 영향 없음)';
  collapseBtn.setAttribute('aria-expanded', 'true');
  collapseBtn.setAttribute('aria-label', isComment ? '코멘트 입력창 접기' : '입력창 접기');
  const visibilityBtn = document.createElement('button');
  visibilityBtn.type = 'button';
  visibilityBtn.className = 'miniCtl visibilityCtl';
  visibilityBtn.innerHTML = '<span class="visibilityIcon visibilityVisibleIcon" aria-hidden="true">○</span><span class="visibilityIcon visibilityHiddenIcon" aria-hidden="true">⊘</span>';
  const num = document.createElement('span');
  num.className = 'cardNum';
  if(!isComment){
    num.dataset.positionLink = 'true';
    num.dataset.cardAction = 'show-preview';
    num.tabIndex = 0;
    num.setAttribute('role', 'button');
    num.title = '미리보기에서 이 카드 위치 보기';
    num.setAttribute('aria-label', '미리보기에서 이 카드 위치 보기');
  }
  left.append(collapseBtn, visibilityBtn, num);

  const right = document.createElement('div');
  right.className = 'headRight';
  const arrowGroup = document.createElement('span');
  arrowGroup.className = 'arrowGroup';
  const upBtn = document.createElement('button');
  upBtn.type = 'button';
  upBtn.className = 'miniCtl itemMoveBtn';
  upBtn.textContent = '↑';
  upBtn.title = `${noun}를 위로`;
  upBtn.setAttribute('aria-label', `${noun}를 위로 이동`);
  const downBtn = document.createElement('button');
  downBtn.type = 'button';
  downBtn.className = 'miniCtl itemMoveBtn';
  downBtn.textContent = '↓';
  downBtn.title = `${noun}를 아래로`;
  downBtn.setAttribute('aria-label', `${noun}를 아래로 이동`);
  arrowGroup.append(upBtn, downBtn);

  const autoExpandBtn = document.createElement('button');
  autoExpandBtn.type = 'button';
  autoExpandBtn.className = 'miniCtl autoExpandBtn';
  autoExpandBtn.innerHTML = AUTO_EXPAND_ICON_MARKUP;
  autoExpandBtn.title = '입력창을 본문 전체 높이로 펼쳐 내부 스크롤 없애기';
  autoExpandBtn.setAttribute('aria-label', `${isComment ? '코멘트 ' : ''}입력창 전체 펼치기`);
  autoExpandBtn.setAttribute('aria-pressed', 'false');
  right.append(arrowGroup, autoExpandBtn);

  let fsBtn = null;
  if(!isComment){
    fsBtn = document.createElement('button');
    fsBtn.type = 'button';
    fsBtn.className = 'miniCtl fsBtn';
    fsBtn.textContent = '⛶';
    fsBtn.title = '이 카드를 전체 화면으로 크게 편집';
    fsBtn.setAttribute('aria-label', '카드 전체 화면 편집');
    fsBtn.dataset.cardAction = 'fullscreen';
    right.appendChild(fsBtn);
  }
  head.append(left, right);
  return { ed, head, right, collapseBtn, visibilityBtn, num, upBtn, downBtn, autoExpandBtn, fsBtn };
}

function createEditorDeleteButton(type){
  const isComment = type === 'comment';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'delCardBtn';
  button.title = `이 ${isComment ? '코멘트' : '카드'} 삭제`;
  button.setAttribute('aria-label', `${isComment ? '코멘트' : '카드'} 삭제`);
  return button;
}

function syncEditorVisibilityUI(editor, button, type){
  const visible = editor.dataset.outputVisible !== 'false';
  const noun = type === 'comment' ? '코멘트' : '카드';
  editor.classList.toggle('isOutputHidden', !visible);
  button.classList.toggle('isHidden', !visible);
  button.setAttribute('aria-pressed', String(!visible));
  button.setAttribute('aria-label', visible ? `${noun} 출력 숨기기` : `${noun} 출력 다시 표시`);
  button.title = visible
    ? (type === 'comment' ? '미리보기와 출력 HTML에서 숨기기' : '이 카드를 미리보기와 출력 HTML에서 숨기기')
    : (type === 'comment' ? '출력 다시 표시' : '숨긴 카드를 미리보기와 출력 HTML에 다시 표시');
}

function moveEditorBySibling(editor, direction, message){
  const sibling = direction < 0 ? editor.previousElementSibling : editor.nextElementSibling;
  if(!sibling) return;
  MosaicStorage.snapshotCards();
  if(direction < 0) editor.parentNode.insertBefore(editor, sibling);
  else editor.parentNode.insertBefore(sibling, editor);
  renumberCards();
  afterEditorControlChange();
  showUndoToast(message);
}

function deleteEditor(editor, textarea, message){
  MosaicStorage.snapshotCards();
  const focusEditor = editor.nextElementSibling || editor.previousElementSibling;
  if(cardEditorState.activeTextarea === textarea) cardEditorState.activeTextarea = null;
  disposeCardEditor(editor);
  editor.remove();
  renumberCards();
  afterEditorControlChange();
  if(focusEditor){
    cardEditorState.activeTextarea = focusEditor.querySelector('textarea');
    if(cardEditorState.activeTextarea) cardEditorState.activeTextarea.focus();
  }
  showUndoToast(message);
}

function createCardEditor(value){
  // value: 문자열(본문만) 또는 {body, folded, foldTitle/cardTitle, visible} 객체
  const source = (typeof value === 'object' && value !== null) ? value : { body: value || '', folded: false, foldTitle: '' };
  const data = {
    ...source,
    foldTitle:source.cardTitle !== undefined ? source.cardTitle : (source.foldTitle || ''),
    body:MosaicParser.normalizeBodyHrMarkers(source.body || ''),
    visible:source.visible === undefined ? true : MosaicState.settingFlagOn(source.visible)
  };

  const {
    ed, head, collapseBtn, visibilityBtn, upBtn, downBtn, autoExpandBtn
  } = createEditorShell('card', data.visible);
  const duplicateBtn = document.createElement('button');
  duplicateBtn.type = 'button';
  duplicateBtn.className = 'duplicateCardBtn uiButton';
  duplicateBtn.textContent = '⧉';
  duplicateBtn.title = '이 카드를 바로 아래에 복제';
  duplicateBtn.setAttribute('aria-label', '카드 복제');
  const foldLabel = document.createElement('label');
  foldLabel.className = 'foldChk';
  const foldChk = document.createElement('input');
  foldChk.type = 'checkbox';
  foldChk.className = 'cardFoldChk';
  foldChk.checked = MosaicState.settingFlagOn(data.folded);
  foldLabel.appendChild(document.createTextNode('접기'));
  foldLabel.appendChild(foldChk);
  const del = createEditorDeleteButton('card');

  // 카드 제목: 접기 여부와 관계없이 항상 표시하며, 접기 카드에서는 summary 제목으로 사용한다.
  const foldTitleInput = document.createElement('input');
  foldTitleInput.type = 'text';
  foldTitleInput.className = 'foldTitleInput';
  foldTitleInput.maxLength = 200;
  foldTitleInput.placeholder = '카드 제목';
  foldTitleInput.setAttribute('aria-label', '카드 제목');
  foldTitleInput.value = data.foldTitle || '';

  const ta = document.createElement('textarea');
  ta.value = data.body || '';
  ta.placeholder = '이 카드의 본문을 입력...';
  const resizeAutoExpanded = setupAutoExpandTextarea(ed, ta, autoExpandBtn, 200);

  const syncVisibilityUi = () => syncEditorVisibilityUI(ed, visibilityBtn, 'card');
  visibilityBtn.addEventListener('click', () => {
    MosaicStorage.snapshotCards();
    const visible = ed.dataset.outputVisible !== 'false';
    ed.dataset.outputVisible = String(!visible);
    MosaicRenderer.syncHiddenEditorCollapse(ed, collapseBtn, visible);
    syncVisibilityUi();
    renumberCards();
    afterEditorControlChange();
    MosaicApp.buildDocumentNavigator();
    showUndoToast(visible ? '카드 출력 숨김.' : '카드 출력 다시 표시.');
  });
  syncVisibilityUi();
  duplicateBtn.addEventListener('click', () => {
    MosaicStorage.snapshotCards();
    const clone = createCardEditor({
      body: ta.value,
      folded: foldChk.checked,
      cardTitle: foldTitleInput.value,
      visible: ed.dataset.outputVisible !== 'false'
    });
    ed.after(clone);
    renumberCards();
    afterEditorStructureChange();
    const cloneTa = clone.querySelector('textarea');
    if(cloneTa){
      cardEditorState.activeTextarea = cloneTa;
      cloneTa.focus();
      clone.scrollIntoView({ block:'nearest', behavior:'smooth' });
    }
    showUndoToast('카드 복제됨.');
  });
  ta.addEventListener('input', () => {
    applyActiveNameRulesToTextarea(ta);
    applyActiveKeywordRulesToTextarea(ta);
    MosaicParser.normalizeStandaloneHrInput(ta);
    // 미리보기 직접 편집이 원문 입력창으로 반영되는 동안에는 현재 미리보기 위치를
    // 유지한다. 왼쪽 입력창에서 직접 타이핑할 때만 기존 위치 연동을 실행한다.
    if(previewEditState.committing) previewPositionState.pendingFocus = null;
    else focusPreviewOnCaret(ta);
    afterEditorLiveInput();
    if(ed.classList.contains('isCollapsed')) updatePeek();
    if(ta.classList.contains('isAutoExpanded')) requestAnimationFrame(resizeAutoExpanded);
  });
  ta.addEventListener('keydown', handleSoftBreakKeydown);
  ta.addEventListener('focus', () => {
    cardEditorState.activeTextarea = ta;
    decoratePreviewDirectEditors();
  });
  // 커서만 옮겨도(클릭·방향키) 해당 문단을 보여줌
  ta.addEventListener('keyup', (e) => {
    if(positionSyncEnabled() && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown'].includes(e.key)){
      scrollPreviewIfNeeded(previewBlockFor(ta, ta.value.slice(0, ta.selectionStart).split('\n').length - 1), true);
    }
  });
  ta.addEventListener('click', () => {
    if(!positionSyncEnabled()) return;
    scrollPreviewIfNeeded(previewBlockFor(ta, ta.value.slice(0, ta.selectionStart).split('\n').length - 1), true);
  });

  // 본문 첫 줄(문법 마커는 걷어냄)을 요약으로
  const updatePeek = () => {
    const first = ta.value.split('\n').map(l => l.trim()).find(l => l !== '') || '';
    const plain = first
      .replace(/^\[C\]\s*/i, '')
      .replace(/^#{1,4}\s*/, '')
      .replace(/^>{1,2}\s*/, '')
      .replace(/^<<\s*/, '')
      .replace(/^\[[^\]]{1,24}\]\s*/, '')
      .replace(/__|\*/g, '');
    peek.textContent = plain || '(빈 카드)';
    peek.title = plain;
  };

  collapseBtn.addEventListener('click', () => {
    const collapsed = ta.style.display !== 'none';   // 지금 펼쳐져 있으면 접는 동작
    ta.style.display = collapsed ? 'none' : '';
    // 접으면 서식 버튼 대신 본문 요약을 보여줌 (접기 설정은 그대로)
    fmtGroup.style.display = collapsed ? 'none' : '';
    peek.style.display = collapsed ? '' : 'none';
    ed.classList.toggle('isCollapsed', collapsed);
    if(collapsed) updatePeek();
    collapseBtn.classList.toggle('isCollapsed', collapsed);
    collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    if(!collapsed && ta.classList.contains('isAutoExpanded')) requestAnimationFrame(resizeAutoExpanded);
  });

  upBtn.addEventListener('click', () => moveEditorBySibling(ed, -1, '카드 순서 변경.'));
  downBtn.addEventListener('click', () => moveEditorBySibling(ed, 1, '카드 순서 변경.'));
  const syncFoldUi = () => {
    ed.classList.toggle('isFolded', foldChk.checked);
    renumberCards();
  };
  let foldUndoPrepared = false;
  const prepareFoldUndo = () => {
    if(foldUndoPrepared) return;
    MosaicStorage.snapshotCards();
    foldUndoPrepared = true;
  };
  foldChk.addEventListener('pointerdown', prepareFoldUndo);
  foldChk.addEventListener('keydown', (e) => { if(e.key === ' ' || e.key === 'Enter') prepareFoldUndo(); });
  foldChk.addEventListener('change', () => {
    syncFoldUi();
    afterEditorControlChange();
    if(foldUndoPrepared) showUndoToast(foldChk.checked ? '접기 카드 설정.' : '접기 카드 해제.');
    foldUndoPrepared = false;
  });
  requestAnimationFrame(syncFoldUi);
  del.addEventListener('click', () => {
    const cardCount = document.querySelectorAll('#cardEditors .cardEditor:not(.commentEditor)').length;
    if(cardCount <= 1) return;
    deleteEditor(ed, ta, '카드 삭제됨.');
  });

  // 헤더 아래 회색 줄: 왼쪽=서식 도구(입력창 바로 위), 오른쪽=접기 카드 설정
  const fmt = document.createElement('div');
  fmt.className = 'cardFoldRow cardToolRow';

  const fmtGroup = document.createElement('div');
  fmtGroup.className = 'cardFmtBar';
  [['bold',`선택 부분 굵게 (**…**)  ·  ${MosaicRenderer.MOD_KEY}+B`],
   ['emphasis',`선택 부분 강조 (*…*)  ·  ${MosaicRenderer.MOD_KEY}+I`],
   ['center',`이 줄 가운데 정렬 ([C])  ·  ${MosaicRenderer.MOD_KEY}+E`]].forEach(([f, tip]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fmtBtn';
    btn.dataset.cardFormat = f;
    btn.title = tip;
    btn.innerHTML = f === 'bold' ? '<b>B</b>' : (f === 'emphasis' ? '<i>I</i>' : 'C');
    fmtGroup.appendChild(btn);
  });

  const foldGroup = document.createElement('div');
  foldGroup.className = 'cardFoldGroup';
  foldGroup.appendChild(foldTitleInput);   // 제목이 왼쪽
  foldGroup.appendChild(foldLabel);        // 체크박스가 오른쪽
  foldGroup.appendChild(duplicateBtn);      // 보조 동작은 카드 헤더 밖에 배치
  foldGroup.appendChild(del);              // 위험 동작은 도구줄 끝에 조용히 배치

  // 입력창을 접었을 때 서식 버튼 자리에 본문 첫 줄을 보여줌
  const peek = document.createElement('div');
  peek.className = 'cardPeek';
  peek.style.display = 'none';

  fmt.appendChild(fmtGroup);
  fmt.appendChild(peek);
  fmt.appendChild(foldGroup);

  ed.appendChild(head);
  ed.appendChild(fmt);
  ed.appendChild(ta);
  if(ed.dataset.outputVisible === 'false') MosaicRenderer.syncHiddenEditorCollapse(ed, collapseBtn, true);
  return ed;
}

function createCommentEditor(value){
  const source = (typeof value === 'object' && value !== null) ? value : { body:value || '' };
  const {
    ed, head, right, collapseBtn, visibilityBtn, upBtn, downBtn, autoExpandBtn
  } = createEditorShell(
    'comment',
    source.visible === undefined ? true : MosaicState.settingFlagOn(source.visible)
  );

  const ta = document.createElement('textarea');
  ta.value = String(source.body || '');
  ta.placeholder = '카드 사이에 덧붙일 코멘트를 입력...';
  const resizeAutoExpanded = setupAutoExpandTextarea(ed, ta, autoExpandBtn, 96, '코멘트 입력창');
  const del = createEditorDeleteButton('comment');
  right.append(del);
  ed.append(head, ta);

  const syncVisibility = () => syncEditorVisibilityUI(ed, visibilityBtn, 'comment');
  syncVisibility();
  visibilityBtn.addEventListener('click', () => {
    MosaicStorage.snapshotCards();
    ed.dataset.outputVisible = String(ed.dataset.outputVisible === 'false');
    MosaicRenderer.syncHiddenEditorCollapse(ed, collapseBtn, ed.dataset.outputVisible === 'false');
    syncVisibility(); renumberCards(); afterEditorControlChange(); MosaicApp.buildDocumentNavigator();
    showUndoToast(ed.dataset.outputVisible === 'false' ? '코멘트 출력 숨김.' : '코멘트 출력 다시 표시.');
  });
  ta.addEventListener('input', () => {
    previewPositionState.pendingFocus = null;
    afterEditorLiveInput();
    if(ta.classList.contains('isAutoExpanded')) requestAnimationFrame(resizeAutoExpanded);
  });
  ta.addEventListener('keydown', handleCommentSoftBreakKeydown);
  ta.addEventListener('focus', () => { cardEditorState.activeTextarea = ta; });
  collapseBtn.addEventListener('click', () => {
    const collapse = ta.style.display !== 'none';
    ta.style.display = collapse ? 'none' : '';
    ed.classList.toggle('isCollapsed', collapse);
    collapseBtn.classList.toggle('isCollapsed', collapse);
    collapseBtn.setAttribute('aria-expanded', String(!collapse));
    if(!collapse && ta.classList.contains('isAutoExpanded')) requestAnimationFrame(resizeAutoExpanded);
  });
  upBtn.addEventListener('click', () => moveEditorBySibling(ed, -1, '코멘트 순서 변경.'));
  downBtn.addEventListener('click', () => moveEditorBySibling(ed, 1, '코멘트 순서 변경.'));
  del.addEventListener('click', () => deleteEditor(ed, ta, '코멘트 삭제됨.'));
  if(ed.dataset.outputVisible === 'false') MosaicRenderer.syncHiddenEditorCollapse(ed, collapseBtn, true);
  return ed;
}

function addCard(value, focus){
  const isComment = value && typeof value === 'object' && value.type === 'comment';
  const ed = isComment ? createCommentEditor(value) : createCardEditor(value);
  uiElements.cardEditors.appendChild(ed);
  renumberCards();
  const ta = ed.querySelector('textarea');
  if(focus){ ta.focus(); cardEditorState.activeTextarea = ta; }
  return ta;
}

function bindCardCreationEvents(){
  bindUIFeatureEvents('card-creation', () => {
    document.getElementById('addCardBtn').addEventListener('click', () => {
      MosaicStorage.snapshotCards();
      addCard('', true);
      afterEditorStructureChange();
      showUndoToast('카드 추가됨.');
    });

    document.getElementById('addCommentBtn').addEventListener('click', () => {
      MosaicStorage.snapshotCards();
      const activeTextarea = cardEditorState.activeTextarea;
      const activeEditor = activeTextarea && activeTextarea.closest
        ? activeTextarea.closest('#cardEditors .cardEditor')
        : null;
      const editor = createCommentEditor({ type:'comment', body:'', visible:true });
      if(activeEditor) activeEditor.after(editor);
      else uiElements.cardEditors.appendChild(editor);
      renumberCards();
      const ta = editor.querySelector('textarea');
      cardEditorState.activeTextarea = ta;
      ta.focus();
      afterEditorStructureChange();
      if(ta) ta.closest('.cardEditor').scrollIntoView({ block:'nearest', behavior:'smooth' });
      showUndoToast('코멘트 추가됨.');
    });
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

// 작업 전체(카드 + 표제/이미지/이름/꼬리말/크레딧)를 담는 헬퍼 — 보관함 슬롯과 되돌리기가 공유
function collectWork(){
  return MosaicState.collectWorkState(getCards());
}

function collectSlotWork(){
  const data = collectWork();
  data.style = MosaicStorage.currentStyleValues();
  return data;
}

// 저장된 값과 입력 UI를 복원한다. 출력 렌더링과 초안 저장은 완료 단계에서 수행한다.
function applyWorkState(data){
  uiControlSyncState.keys.clear();
  const fields = data.fields || {};
  MosaicState.WORK_FIELDS.forEach(id => {
    document.getElementById(id).value = fields[id] !== undefined ? fields[id] : MosaicState.WORK_FIELD_DEFAULTS[id];
  });
  MosaicRenderer.renderCreditItemsEditor();
  syncProfileTagEditorsFromMasters();
  renderNameRuleList();
  renderKeywordRuleList();
  Object.entries(MosaicState.WORK_BOOLEAN_DEFAULTS).forEach(([id, fallback]) => {
    document.getElementById(id).checked = id === 'profileImageBackgroundOn'
      ? MosaicState.savedProfileImageBackgroundOn(fields)
      : (fields[id] !== undefined ? MosaicState.settingFlagOn(fields[id]) : fallback);
  });
  if(data.style && typeof data.style === 'object') MosaicStorage.applyStyleValues(data.style);
  syncCoverControlState();
  syncDesignSummaries();
  document.getElementById('xposVal').value = document.getElementById('xpos').value;
  document.getElementById('yposVal').value = document.getElementById('ypos').value;
  document.getElementById('imgHeightVal').value = document.getElementById('imgHeight').value;
  clearCardEditors();
  cardEditorState.activeTextarea = null;
  const cards = (data.cards && data.cards.length) ? data.cards : [{ body:'', folded:false, foldTitle:'' }];
  cards.forEach(c => addCard(c, false));
  cardEditorState.activeTextarea = bodyCardTextareas()[0] || null;
  MosaicStorage.invalidateCharacterRows();
  MosaicStorage.syncCharList();
}

// 본문·디자인 적용이 모두 끝난 상태만 출력하고 저장한다.
function finishWorkRestore(){
  uiUpdateEffects.committedChange();
}

// HTML·보관함 불러오기는 적용과 완료를 한 번에 수행한다.
function applyWork(data){
  applyWorkState(data);
  finishWorkRestore();
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
  if(typeof undoAction !== 'function') MosaicStorage.recordCompletedAction(message);
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
      MosaicStorage.goActionHistory(-1);
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
  let ta = cardEditorState.activeTextarea;
  // 코멘트에 포커스가 있을 때 본문 전용 버튼이 인접 카드까지 몰래 수정하지 않게 한다.
  if(ta && ta.closest('.commentEditor')) return;
  ta = ta || document.querySelector('#cardEditors .cardEditor:not(.commentEditor) textarea');
  if(!ta) return;
  cardEditorState.activeTextarea = ta;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const before = ta.value.slice(0, start);
  const after = ta.value.slice(end);
  const selected = ta.value.slice(start, end);
  const middle = selected || placeholder || '';
  MosaicStorage.snapshotCards();

  // 앞뒤로 빈 줄이 없으면 자동으로 넣어서 문단 규칙(엔터 구분)이 안 깨지게 함
  const needNlBefore = before.length > 0 && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
  const needNlAfter = after.length > 0 && !after.startsWith('\n\n') ? (after.startsWith('\n') ? '\n' : '\n\n') : '';

  const inserted = needNlBefore + prefix + middle + suffix + needNlAfter;
  ta.value = before + inserted + after;

  // 커서 위치: 선택이 있었으면 블록 뒤로, 없었으면 placeholder를 선택 상태로
  if(selected){
    const pos = before.length + inserted.length;
    ta.setSelectionRange(pos, pos);
  } else if(placeholder){
    const selStart = before.length + needNlBefore.length + prefix.length;
    ta.setSelectionRange(selStart, selStart + placeholder.length);
  }
  syncMirror(ta);   // 전체 화면 편집 중이면 실제 카드 입력창에도 선택 위치까지 반영
  ta.focus();
  uiUpdateEffects.committedChange();
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
  if(fmt !== 'center' && !FMT_WRAP[fmt]) return;
  const val = ta.value;
  const s = ta.selectionStart, e = ta.selectionEnd;
  if(fmt !== 'center' && s === e) return;
  MosaicStorage.snapshotCards();
  let resultLabel = '';

  if(fmt === 'center'){
    // 커서가 있는 줄 전체에 [C] 토글 (인용 `> ` 뒤에 삽입)
    const lineStart = val.lastIndexOf('\n', s - 1) + 1;
    let lineEnd = val.indexOf('\n', s);
    if(lineEnd === -1) lineEnd = val.length;
    const line = val.slice(lineStart, lineEnd);
    let newLine;
    if(CENTER_RE.test(line)){
      newLine = line.replace(CENTER_RE, (m, q) => (q || ''));
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
    const wrap = FMT_WRAP[fmt];
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

  syncMirror(ta);
  ta.focus();
  uiUpdateEffects.committedChange();
  showUndoToast(resultLabel || '본문 서식 변경.');
}

// 전체 화면 편집기의 서식 바 (입력창 바로 위)
function bindFullscreenFormatEvents(){
  bindUIFeatureEvents('fullscreen-format', () => {
    document.querySelectorAll('.fmtBar[data-scope="fs"] .fmtBtn').forEach(btn => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());  // 선택 유지
      btn.addEventListener('click', () => {
        applyTextareaFormat(document.getElementById('fsTextarea'), btn.dataset.tfmt);
      });
    });
  });
}

// ---------- 전체 화면 본문 편집 ----------
// 오버레이의 입력창은 실제 카드 입력창의 '거울'이다. 값이 바뀌면 원본에 그대로 옮기고
// input 이벤트를 흘려보내 미리보기·카운터·자동저장이 평소처럼 동작하게 한다.
function syncMirror(ta){
  if(ta && ta.__mirror){
    const real = ta.__mirror;
    real.value = ta.value;
    const s = Math.min(ta.selectionStart, real.value.length);
    const e = Math.min(ta.selectionEnd, real.value.length);
    real.setSelectionRange(s, e);
    real.dispatchEvent(new Event('input', { bubbles: true }));
    // 실제 카드의 input 처리에서 자동 이름·키워드 치환과 구분선 정돈이 일어나면
    // 전체 화면 거울에도 즉시 되비쳐 두 입력창의 값과 커서가 갈라지지 않게 한다.
    if(ta.value !== real.value){
      ta.value = real.value;
      ta.setSelectionRange(real.selectionStart, real.selectionEnd);
    }
  }
}

const fullscreenEditorState = {
  previousActive:null,
  scrollY:0,
  editor:null,
  searchQuery:'',
  searchCurrent:-1,
  searchAt:-1,
  bound:false
};

function setWorkspaceInert(on){
  ['sidebar','previewArea','sidebarResizer'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.inert = !!on;
  });
}

// 전체 화면의 접기 컨트롤과 카드 제목을 실제 카드의 컨트롤과 맞춰줌
function syncFsFold(){
  const titleInput = document.getElementById('fsFoldTitle');
  titleInput.style.display = '';
}

function openFullscreen(realTa, title, editor){
  const fsTa = document.getElementById('fsTextarea');
  fsTa.value = realTa.value;
  fsTa.__mirror = realTa;
  fullscreenEditorState.editor = editor || null;

  // 접기 카드 여부·카드 제목을 그대로 가져옴
  const chk = document.getElementById('fsFoldChk');
  const titleInput = document.getElementById('fsFoldTitle');
  const realChk = fullscreenEditorState.editor && fullscreenEditorState.editor.querySelector('.cardFoldChk');
  const realTitle = fullscreenEditorState.editor && fullscreenEditorState.editor.querySelector('.foldTitleInput');
  chk.checked = !!(realChk && realChk.checked);
  titleInput.value = realTitle ? realTitle.value : '';
  syncFsFold();

  document.getElementById('fsTitle').textContent = title;
  setFsSearchOpen(false);   // 이전 카드의 검색 결과·강조를 지우고 검색 도구는 접힌 상태로 시작
  document.getElementById('fsCheat').open = false;
  const overlay = document.getElementById('fsOverlay');
  overlay.style.display = 'block';
  overlay.setAttribute('aria-hidden', 'false');
  setWorkspaceInert(true);
  // 배경 스크롤 잠금 (위치를 기억했다가 닫을 때 그대로 복원)
  fullscreenEditorState.scrollY = window.scrollY;
  document.body.classList.add('fsLock');
  fullscreenEditorState.previousActive = cardEditorState.activeTextarea;
  cardEditorState.activeTextarea = fsTa; // 툴바 삽입이 전체 화면 입력창을 향하게 함
  fsTa.focus();
  fsTa.setSelectionRange(realTa.selectionStart, realTa.selectionEnd);
  fsTa.scrollTop = realTa.scrollTop;
}

function closeFullscreen(){
  const fsTa = document.getElementById('fsTextarea');
  const overlay = document.getElementById('fsOverlay');
  overlay.style.display = 'none';
  overlay.setAttribute('aria-hidden', 'true');
  fullscreenEditorState.editor = null;
  document.body.classList.remove('fsLock');
  setWorkspaceInert(false);
  window.scrollTo(0, fullscreenEditorState.scrollY);
  const real = fsTa.__mirror;
  fsTa.__mirror = null;
  cardEditorState.activeTextarea = real || fullscreenEditorState.previousActive;
  if(real){
    try { real.focus({ preventScroll: true }); }
    catch(e){ real.focus(); }
  }
}

// 전체 화면 툴바: 사이드바 툴바와 같은 동작을 그대로 호출
const FS_ACTIONS = {
  fold:   () => insertIntoBody('[접기 제목]\n\n', '\n\n[/접기]', '접힐 내용', '접기 삽입.'),
  hr:     () => insertIntoBody('[HR]', '', '', '구분선 삽입.'),
  hr2:    () => insertIntoBody('[HR2]', '', '', '장면 전환 삽입.'),
  hr3:    () => insertIntoBody('[HR3]', '', '', '호흡 구분 삽입.'),
  hr4:    () => insertIntoBody('[HR4]', '', '', '여백 삽입.'),
  img:    () => insertBodyImage(),
  quote:  () => insertIntoBody('> ', '', '인용할 내용', '인용 삽입.'),
  tidy:   () => document.getElementById('tidyBtn').click(),
};

// ---------- 전체 화면 본문 검색 ----------
// textarea가 포커스를 잃으면 selection 색이 사라지는 브라우저가 있어,
// 입력창 뒤 미러 레이어(#fsHl)에 전체 결과와 현재 결과를 직접 칠한다.
function fsScrollToIndex(ta, idx){
  const { top } = caretOffsetTop(ta, idx);
  ta.scrollTop = Math.max(0, top - ta.clientHeight / 2);
}

function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function normalizedLiteralOffsets(text, query){
  if(!query) return [];
  const hay = MosaicParser.normalizeQuotes(text).toLowerCase();
  const needle = MosaicParser.normalizeQuotes(query).toLowerCase();
  const offsets = [];
  let p = hay.indexOf(needle);
  while(p !== -1){
    offsets.push(p);
    p = hay.indexOf(needle, p + Math.max(1, needle.length));
  }
  return offsets;
}

function fsFindHits(q){
  return normalizedLiteralOffsets(document.getElementById('fsTextarea').value, q);
}

function fsHlPaint(query, current){
  const ta = document.getElementById('fsTextarea');
  const bd = document.getElementById('fsHl');
  if(!query){
    bd.innerHTML = '';
    ta.classList.remove('fsHlOn');
    return 0;
  }
  // textarea와 미러의 글꼴·자간·패딩을 매번 정확히 맞춰 한글 두 글자 이상도 어긋나지 않게 함
  const cs = getComputedStyle(ta);
  SEARCH_HL_PROPS.forEach(p => { bd.style[p] = cs[p]; });
  const r = searchHlMarkup(ta.value, query, 0, current);
  bd.innerHTML = r.html;
  bd.scrollTop = ta.scrollTop;
  bd.scrollLeft = ta.scrollLeft;
  ta.classList.add('fsHlOn');
  return r.count;
}

function fsClearSearch(){
  fullscreenEditorState.searchQuery = '';
  fullscreenEditorState.searchCurrent = -1;
  fullscreenEditorState.searchAt = -1;
  const find = document.getElementById('fsFindInput');
  if(find) find.value = '';
  const count = document.getElementById('fsFindCount');
  if(count) count.textContent = '';
  const hl = document.getElementById('fsHl');
  if(hl) fsHlPaint('', -1);
}

// 검색어 입력 직후에는 전체 결과를 회색으로 표시하고, 이동할 때만 현재 결과를 연두로 표시.
function fsFindApply(){
  const ta = document.getElementById('fsTextarea');
  const q = document.getElementById('fsFindInput').value;
  const counter = document.getElementById('fsFindCount');
  fullscreenEditorState.searchQuery = q;
  fullscreenEditorState.searchCurrent = -1;
  fullscreenEditorState.searchAt = -1;
  // 검색창에 포커스가 있을 때 남는 파란 네이티브 선택 영역은 접어 미러 강조와 겹치지 않게 함
  ta.setSelectionRange(ta.selectionStart, ta.selectionStart);
  const hits = fsFindHits(q);
  fsHlPaint(q, -1);
  counter.textContent = !q ? '' : (hits.length ? hits.length + '곳' : '0 / 0');
}

// dir: 1 다음 / -1 이전. 현재 위치는 selection이 아니라 fsHlAt으로 관리해 파란 선택 영역을 만들지 않음.
function fsFindStep(dir, fromIndex){
  const ta = document.getElementById('fsTextarea');
  const counter = document.getElementById('fsFindCount');
  const q = document.getElementById('fsFindInput').value;
  if(!q){ fsClearSearch(); return; }
  const hits = fsFindHits(q);
  if(!hits.length){ fsHlPaint(q, -1); counter.textContent = '0 / 0'; return; }
  const old = hits.indexOf(fullscreenEditorState.searchAt);
  let next;
  if(old < 0 && Number.isFinite(fromIndex)){
    if(dir >= 0){
      next = hits.findIndex(h => h >= fromIndex);
      if(next < 0) next = 0;
    } else {
      next = hits.length - 1;
      while(next >= 0 && hits[next] >= fromIndex) next--;
      if(next < 0) next = hits.length - 1;
    }
  } else {
    next = old < 0 ? (dir >= 0 ? 0 : hits.length - 1)
                   : (old + dir + hits.length) % hits.length;
  }
  const idx = hits[next];
  fsScrollToIndex(ta, idx);
  fullscreenEditorState.searchQuery = q;
  fullscreenEditorState.searchCurrent = next;
  fullscreenEditorState.searchAt = idx;
  fsHlPaint(q, fullscreenEditorState.searchCurrent);
  counter.textContent = (fullscreenEditorState.searchCurrent + 1) + ' / ' + hits.length;
}

// 현재 선택된 일치를 대치하고 다음 일치로 이동.
// execCommand('insertText')를 쓰면 브라우저 기본 되돌리기(Ctrl+Z)가 살아 있고,
// input 이벤트가 자연 발생해 미러 동기화(syncMirror)·미리보기·저장이 평소처럼 동작함.
function fsReplaceCurrent(){
  const ta = document.getElementById('fsTextarea');
  const q = document.getElementById('fsFindInput').value;
  if(!q) return;
  const r = document.getElementById('fsReplInput').value;
  const searchAt = fullscreenEditorState.searchAt;
  const selTxt = searchAt >= 0 ? ta.value.slice(searchAt, searchAt + q.length) : '';
  if(selTxt.toLowerCase() !== q.toLowerCase()){ fsFindStep(1); return; }  // 먼저 현재 항목 표시
  const s = searchAt;
  MosaicStorage.snapshotCards();
  ta.focus();
  ta.setSelectionRange(s, s + q.length);  // 실제 대치 순간에만 잠깐 선택해 브라우저 되돌리기를 유지
  let ok = false;
  try { ok = document.execCommand('insertText', false, r); } catch(e){ ok = false; }
  if(!ok){
    ta.value = ta.value.slice(0, s) + r + ta.value.slice(s + selTxt.length);
    ta.setSelectionRange(s + r.length, s + r.length);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  } else syncMirror(ta);
  fullscreenEditorState.searchAt = -1;
  fsFindStep(1, s + r.length);
  showUndoToast('1곳 변경.');
}

// 이 카드 전체 대치 (대소문자 무시 — 검색과 동일 기준)
function fsReplaceAll(){
  const ta = document.getElementById('fsTextarea');
  const counter = document.getElementById('fsFindCount');
  const q = document.getElementById('fsFindInput').value;
  if(!q) return;
  const r = document.getElementById('fsReplInput').value;
  const re = new RegExp(escRe(q), 'gi');
  const matches = ta.value.match(re);
  if(!matches){ counter.textContent = '0 / 0'; return; }
  MosaicStorage.snapshotCards();
  const newVal = ta.value.replace(re, () => r);
  ta.focus();
  ta.setSelectionRange(0, ta.value.length);
  let ok = false;
  try { ok = document.execCommand('insertText', false, newVal); } catch(e){ ok = false; }
  if(!ok || ta.value !== newVal){
    ta.value = newVal;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  } else syncMirror(ta);
  ta.setSelectionRange(0, 0);
  ta.scrollTop = 0;
  fullscreenEditorState.searchAt = -1;
  fullscreenEditorState.searchCurrent = -1;
  fsHlPaint(q, -1);
  counter.textContent = matches.length + '곳 변경';
  showUndoToast(matches.length + '곳 변경.');
}

function setFsSearchOpen(open, focusInput){
  const panel = document.getElementById('fsPanel');
  const toggle = document.getElementById('fsSearchToggle');
  panel.classList.toggle('fsSearchOpen', !!open);
  toggle.setAttribute('aria-expanded', String(!!open));
  document.getElementById('fsSearchBar').setAttribute('aria-hidden', String(!open));
  toggle.setAttribute('aria-label', open ? '검색·대치 닫기' : '검색·대치 열기');
  toggle.title = open ? '검색·대치 닫기 (Esc)' : '검색·대치 열기 (Ctrl+F)';
  if(!open){ fsClearSearch(); return; }
  if(focusInput){
    const input = document.getElementById('fsFindInput');
    input.focus(); input.select();
  }
}

function bindFullscreenTextareaEvents(overlay, textarea){
  // 입력창이 아닌 곳의 휠은 뒤쪽 작업 화면까지 전달하지 않는다.
  overlay.addEventListener('wheel', event => {
    if(!event.target.closest('#fsTextarea')) event.preventDefault();
  }, { passive:false });

  textarea.addEventListener('input', function(){
    MosaicParser.normalizeStandaloneHrInput(this);
    syncMirror(this);
    if(fullscreenEditorState.searchQuery){
      fsHlPaint(fullscreenEditorState.searchQuery, fullscreenEditorState.searchCurrent);
    }
  });
  textarea.addEventListener('keydown', handleSoftBreakKeydown);
  textarea.addEventListener('scroll', function(){
    const highlight = document.getElementById('fsHl');
    highlight.scrollTop = this.scrollTop;
    highlight.scrollLeft = this.scrollLeft;
  });
  // 전체 화면에서도 커서 위치의 문단을 미리보기에서 보여준다.
  textarea.addEventListener('keyup', function(event){
    if(!this.__mirror || !positionSyncEnabled()) return;
    if(!['ArrowUp','ArrowDown','PageUp','PageDown'].includes(event.key)) return;
    const raw = this.value.slice(0, this.selectionStart).split('\n').length - 1;
    if(isStackedLayout()) return;
    const element = previewBlockFor(this.__mirror, raw);
    if(element) element.scrollIntoView({ block:'center' });
  });
}

function bindFullscreenFoldEvents(foldCheckbox, foldTitle){
  // 접기 카드 설정을 실제 카드 컨트롤에 옮기고 기존 change/input 흐름을 유지한다.
  foldCheckbox.addEventListener('change', function(){
    syncFsFold();
    if(!fullscreenEditorState.editor) return;
    MosaicStorage.snapshotCards();
    const realCheckbox = fullscreenEditorState.editor.querySelector('.cardFoldChk');
    realCheckbox.checked = this.checked;
    realCheckbox.dispatchEvent(new Event('change', { bubbles:true }));
    showUndoToast(this.checked ? '접기 카드 설정.' : '접기 카드 해제.');
  });
  foldTitle.addEventListener('input', function(){
    if(!fullscreenEditorState.editor) return;
    const realTitle = fullscreenEditorState.editor.querySelector('.foldTitleInput');
    realTitle.value = this.value;
    realTitle.dispatchEvent(new Event('input', { bubbles:true }));
  });
}

function bindFullscreenOverlayEvents(overlay){
  document.getElementById('fsCloseBtn').addEventListener('click', closeFullscreen);
  overlay.addEventListener('mousedown', event => {
    if(event.target === overlay) closeFullscreen();
  });
  document.addEventListener('keydown', event => {
    if(event.isComposing || event.keyCode === 229) return;
    if(event.key === 'Escape' && overlay.style.display === 'block'){
      event.preventDefault();
      closeFullscreen();
    }
  });
}

function bindFullscreenToolbarEvents(textarea){
  document.getElementById('fsToolbar').addEventListener('mousedown', event => {
    if(event.target.closest('button[data-fs]')) event.preventDefault();
  });
  document.getElementById('fsToolbar').addEventListener('click', event => {
    const button = event.target.closest('button[data-fs]');
    if(!button) return;
    const action = FS_ACTIONS[button.dataset.fs];
    if(action) action();
    if(button.dataset.fs === 'tidy' && textarea.__mirror) textarea.value = textarea.__mirror.value;
    textarea.focus();
  });
}

function bindFullscreenSearchEvents(){
  const input = document.getElementById('fsFindInput');
  const repl = document.getElementById('fsReplInput');
  input.addEventListener('input', fsFindApply);
  input.addEventListener('compositionend', fsFindApply);
  const onEsc = (e) => {
    // 검색만 닫고 전체 화면 편집기는 유지
    e.preventDefault(); e.stopPropagation();
    setFsSearchOpen(false);
    document.getElementById('fsTextarea').focus();
  };
  input.addEventListener('keydown', (e) => {
    if(e.isComposing || e.keyCode === 229) return;
    if(e.key === 'Enter'){ e.preventDefault(); fsFindStep(e.shiftKey ? -1 : 1); }
    else if(e.key === 'Escape') onEsc(e);
  });
  repl.addEventListener('keydown', (e) => {
    if(e.isComposing || e.keyCode === 229) return;
    if(e.key === 'Enter'){ e.preventDefault(); fsReplaceCurrent(); }
    else if(e.key === 'Escape') onEsc(e);
  });
  const prev = document.getElementById('fsFindPrevBtn');
  const next = document.getElementById('fsFindNextBtn');
  [prev, next].forEach(b => b.addEventListener('mousedown', (e) => e.preventDefault()));  // 포커스 유지
  prev.addEventListener('click', () => fsFindStep(-1));
  next.addEventListener('click', () => fsFindStep(1));
  document.getElementById('fsReplBtn').addEventListener('click', fsReplaceCurrent);
  document.getElementById('fsReplAllBtn').addEventListener('click', fsReplaceAll);
  document.getElementById('fsSearchToggle').addEventListener('click', () => {
    const open = document.getElementById('fsPanel').classList.contains('fsSearchOpen');
    setFsSearchOpen(!open, !open);
  });
}

function bindFullscreenEditorEvents(){
  if(fullscreenEditorState.bound) return;
  fullscreenEditorState.bound = true;

  const overlay = document.getElementById('fsOverlay');
  const textarea = document.getElementById('fsTextarea');
  bindFullscreenTextareaEvents(overlay, textarea);
  bindFullscreenFoldEvents(
    document.getElementById('fsFoldChk'),
    document.getElementById('fsFoldTitle')
  );
  bindFullscreenOverlayEvents(overlay);
  bindFullscreenToolbarEvents(textarea);
  bindFullscreenSearchEvents();
}

// ---------- 미리보기 검색 (Ctrl/⌘+F) ----------
// 미리보기 DOM 의 텍스트 노드에만 강조 span(.pvHit)을 끼워 넣는다.
// 출력물(MosaicRenderer.generateHTML)은 항상 입력값에서 새로 만들어지므로 강조가 결과물에 섞일 일은 없음.
// 리렌더(renderPreview)가 innerHTML 을 갈아엎으므로, 검색이 켜져 있으면 끝에서 다시 칠한다.
const previewSearchState = {
  open:false,
  hits:[],
  current:-1,
  // 삭제로 검색 결과가 잠시 없어져도 되돌리기 후 선택 결과를 다시 펼칠 수 있게 기억한다.
  lastActiveIndex:-1,
  statusTimer:null,
  bound:false
};

function pvScopeTextarea(){
  const scope = document.getElementById('pvScopeSelect').value;
  if(scope === 'all') return null;
  const match = scope.match(/^card:(\d+)$/);
  if(match) return bodyCardTextareas()[Number(match[1])] || null;
  const activeTextarea = cardEditorState.activeTextarea;
  if(activeTextarea && activeTextarea.matches('#cardEditors .cardEditor:not(.commentEditor) textarea')){
    return activeTextarea;
  }
  if(previewSearchState.current >= 0 && previewSearchState.hits[previewSearchState.current]){
    const src = findBlockSource(previewSearchState.hits[previewSearchState.current]);
    if(src && src.ta) return src.ta;
  }
  return bodyCardTextareas()[0] || null;
}

function pvScopeTextareas(){
  const ta = pvScopeTextarea();
  return ta ? [ta] : bodyCardTextareas();
}

function pvScopePreviewRoots(){
  const ta = pvScopeTextarea();
  if(!ta) return previewCardContexts().map(ctx => ctx.cardEl);
  const ctx = previewCardContexts().find(item => item.ta === ta);
  return ctx ? [ctx.cardEl] : [];
}

function pvRefreshScopeOptions(resetToAll){
  const select = document.getElementById('pvScopeSelect');
  const previous = select.value;
  const textareas = bodyCardTextareas();
  select.innerHTML = '';
  const all = document.createElement('option');
  all.value = 'all';
  all.textContent = '전체 카드';
  select.appendChild(all);
  textareas.forEach((ta, index) => {
    const option = document.createElement('option');
    option.value = `card:${index}`;
    option.textContent = `카드 ${index + 1}`;
    select.appendChild(option);
  });
  const values = Array.from(select.options).map(option => option.value);
  if(resetToAll) select.value = 'all';
  else select.value = values.includes(previous) ? previous : 'all';
}

function pvClearHits(){
  document.querySelectorAll('#preview .pvHit').forEach(sp => {
    const parent = sp.parentNode;
    if(!parent) return;
    // 검색어가 굵게·강조 span 경계를 가로질러도 원래 미리보기 구조를 보존한다.
    while(sp.firstChild) parent.insertBefore(sp.firstChild, sp);
    sp.remove();
    parent.normalize();
  });
  previewSearchState.hits = [];
  previewSearchState.current = -1;
}

// 한 출력 문단의 여러 텍스트 노드를 하나의 문자열처럼 검색한다.
// 굵게·강조·원문 병행 span 경계를 가로지르는 검색어도 한 항목으로 표시하되,
// 화자 이름표와 자동 장식은 원문 입력에 없는 글자이므로 검색에서 제외한다.
function pvHighlightBlock(block, query){
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while(walker.nextNode()){
    node = walker.currentNode;
    const parent = node.parentElement;
    if(!node.data || (parent && parent.closest('[data-mosaic-speaker-label="true"], [data-mosaic-generated="true"], [data-mosaic-footer="true"], [data-mosaic-credit="true"], [data-mosaic-card-title="true"]'))) continue;
    nodes.push(node);
  }
  if(!nodes.length) return [];
  const text = nodes.map(item => item.data).join('');
  const matches = normalizedLiteralOffsets(text, query)
    .map(start => ({ start, end:start + query.length }));
  if(!matches.length) return [];

  const boundaries = [];
  let cursor = 0;
  nodes.forEach(textNode => {
    boundaries.push({ node:textNode, start:cursor, end:cursor + textNode.data.length });
    cursor += textNode.data.length;
  });
  const locate = (position, startBoundary) => {
    for(let i = 0; i < boundaries.length; i++){
      const item = boundaries[i];
      if(position < item.end || (position === item.end && (!startBoundary || i === boundaries.length - 1))){
        return { node:item.node, offset:Math.max(0, Math.min(item.node.data.length, position - item.start)) };
      }
    }
    const last = boundaries[boundaries.length - 1];
    return { node:last.node, offset:last.node.data.length };
  };

  const hits = [];
  // 뒤에서부터 감싸야 앞쪽 원본 텍스트 노드의 오프셋이 바뀌지 않는다.
  matches.slice().reverse().forEach(match => {
    const start = locate(match.start, true);
    const end = locate(match.end, false);
    if(!start || !end) return;
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const span = document.createElement('span');
    span.className = 'pvHit';
    span.appendChild(range.extractContents());
    range.insertNode(span);
    hits.unshift(span);
  });
  return hits;
}

function pvUpdateCount(){
  const q = document.getElementById('pvFindInput').value;
  document.getElementById('pvFindCount').textContent =
    !q ? '' : (previewSearchState.hits.length
      ? (previewSearchState.current >= 0
          ? (previewSearchState.current + 1) + ' / ' + previewSearchState.hits.length
          : previewSearchState.hits.length + '곳')
      : '0 / 0');
}

// keepPos: 리렌더 후 재적용 시 현재 위치를 유지하고 스크롤하지 않음 (타이핑이 화면을 끌고 다니지 않게)
function pvApplySearch(keepPos){
  const previous = keepPos
    ? (previewSearchState.current >= 0 ? previewSearchState.current : previewSearchState.lastActiveIndex)
    : -1;
  previewSearchState.lastActiveIndex = previous;
  pvRefreshScopeOptions(false);
  pvClearHits();
  const q = document.getElementById('pvFindInput').value;
  if(!previewSearchState.open || !q){ pvUpdateCount(); return; }
  const roots = pvScopePreviewRoots();
  if(!roots.length){ pvUpdateCount(); return; }
  roots.forEach(root => {
    previewSourceBlocks(root).forEach(block => {
      previewSearchState.hits.push(...pvHighlightBlock(block, q));
    });
  });
  if(previewSearchState.hits.length){
    previewSearchState.current = keepPos && previous >= 0
      ? Math.min(previous, previewSearchState.hits.length - 1)
      : -1;
    if(previewSearchState.current >= 0) pvMarkCurrent(false);
  }
  pvUpdateCount();
}

function pvMarkCurrent(scroll){
  previewSearchState.hits.forEach(sp => sp.classList.remove('pvHitCur'));
  const cur = previewSearchState.hits[previewSearchState.current];
  if(!cur) return;
  previewSearchState.lastActiveIndex = previewSearchState.current;
  cur.classList.add('pvHitCur');
  // 닫힌 접기(details) 안의 일치는 조상을 열어서 보이게 함
  let el = cur.parentElement;
  while(el){
    if(el.tagName === 'DETAILS') el.open = true;
    el = el.parentElement;
  }
  if(scroll) cur.scrollIntoView({ block: 'center' });
  pvUpdateCount();
}

function pvGo(dir){
  if(!previewSearchState.hits.length) return;
  previewSearchState.current = previewSearchState.current < 0
    ? (dir >= 0 ? 0 : previewSearchState.hits.length - 1)
    : (previewSearchState.current + dir + previewSearchState.hits.length) % previewSearchState.hits.length;
  pvMarkCurrent(true);
}

function openPreviewSearch(){
  previewSearchState.open = true;
  document.getElementById('pvSearchBox').style.display = 'flex';
  pvRefreshScopeOptions(true);
  const input = document.getElementById('pvFindInput');
  input.focus();
  input.select();
  pvApplySearch(false);
  refreshPreviewFloatingButtonLayout();
}

function closePreviewSearch(){
  previewSearchState.open = false;
  previewSearchState.lastActiveIndex = -1;
  const box = document.getElementById('pvSearchBox');
  box.style.display = 'none';
  pvClearHits();
  document.getElementById('pvFindCount').textContent = '';
  refreshPreviewFloatingButtonLayout();
}

// ---------- 미리보기 대치 ----------
// 현재 항목 대치: 강조 span(findBlockSource)으로 원본 카드·줄을 역추적하고,
// 그 줄 안에서 몇 번째 일치인지(같은 줄에 속한 앞선 강조 수)를 세어 원본의 해당 위치만 바꾼다.
// 미리보기 텍스트는 마커 제거·따옴표 정규화를 거치므로, 검색어가 그 변형에 걸치면
// 원본에서 위치를 찾지 못할 수 있음 → 상태 메시지로 알리고 아무것도 바꾸지 않는다.
function pvReplaceCurrent(){
  const q = document.getElementById('pvFindInput').value;
  if(!q || !previewSearchState.hits.length) return;
  if(previewSearchState.current < 0){ pvGo(1); return; }
  const r = document.getElementById('pvReplInput').value;
  const hit = previewSearchState.hits[previewSearchState.current];
  if(!hit) return;
  const src = findBlockSource(hit);
  if(!src){ pvStatusFlash('본문 밖 — 대치 불가'); return; }
  let k = 0;
  for(let i = 0; i < previewSearchState.current; i++){
    const s = findBlockSource(previewSearchState.hits[i]);
    if(s && s.ta === src.ta && s.raw === src.raw) k++;
  }
  const lines = src.ta.value.split('\n');
  const line = lines[src.raw] || '';
  const sourceRange = findSourceRange(line, q, k, true);
  if(!sourceRange){ pvStatusFlash('원본 위치 확인 실패'); return; }
  MosaicStorage.snapshotCards();
  lines[src.raw] = replaceSourceRange(line, sourceRange, r);
  src.ta.value = lines.join('\n');
  src.ta.dispatchEvent(new Event('input', { bubbles: true }));  // 리렌더 + 저장 + 강조 재적용
  showUndoToast('1곳 변경.');
  if(previewSearchState.hits.length) pvMarkCurrent(true);
}

// 선택한 범위 안의 모든 일치 대치 (대소문자 무시 — 검색 강조와 동일 기준)
function pvReplaceAll(){
  const q = document.getElementById('pvFindInput').value;
  if(!q) return;
  const r = document.getElementById('pvReplInput').value;
  const perTextarea = new Map();

  // DOM 강조 위치가 아니라 원문의 '화면에 보이는 투영'을 직접 검색한다.
  // 그래서 접기 내부도 빠지지 않고, 표제·꼬리말·화자 이름표와 문법 기호는 건드리지 않는다.
  pvScopeTextareas().forEach(ta => {
    const rows = new Map();
    ta.value.split('\n').forEach((line, raw) => {
      const matches = findAllSourceRanges(line, q, true);
      if(matches.length) rows.set(raw, matches);
    });
    if(rows.size) perTextarea.set(ta, rows);
  });

  let n = 0;
  perTextarea.forEach(rows => rows.forEach(atList => { n += atList.length; }));
  if(!n){ pvStatusFlash('0 / 0'); return; }
  MosaicStorage.snapshotCards();
  perTextarea.forEach((rows, ta) => {
    const lines = ta.value.split('\n');
    rows.forEach((rangeList, raw) => {
      let line = lines[raw] || '';
      rangeList.sort((a, b) => b.start - a.start).forEach(range => {
        line = replaceSourceRange(line, range, r);
      });
      lines[raw] = line;
    });
    ta.value = lines.join('\n');
  });
  uiUpdateEffects.committedChange();
  showUndoToast(n + '곳 변경.');
  if(previewSearchState.hits.length) pvMarkCurrent(true);
}

// 카운터 자리에 상태를 잠깐 보여주고 원래 카운트로 복귀
function pvStatusFlash(msg){
  document.getElementById('pvFindCount').textContent = msg;
  clearTimeout(previewSearchState.statusTimer);
  previewSearchState.statusTimer = setTimeout(pvUpdateCount, 2200);
}

function bindPreviewSearchInputEvents(){
  const input = document.getElementById('pvFindInput');
  const repl = document.getElementById('pvReplInput');
  const scope = document.getElementById('pvScopeSelect');
  input.addEventListener('input', () => pvApplySearch(false));
  scope.addEventListener('change', () => {
    pvApplySearch(false);
  });
  input.addEventListener('keydown', (e) => {
    if(e.isComposing || e.keyCode === 229) return;
    if(e.key === 'Enter'){
      e.preventDefault();
      pvGo(e.shiftKey ? -1 : 1);
    } else if(e.key === 'Escape'){
      e.preventDefault(); e.stopPropagation();
      closePreviewSearch();
    }
  });
  repl.addEventListener('keydown', (e) => {
    if(e.isComposing || e.keyCode === 229) return;
    if(e.key === 'Enter'){ e.preventDefault(); pvReplaceCurrent(); }
    else if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); closePreviewSearch(); }
  });
}

function bindPreviewSearchControlEvents(){
  document.getElementById('pvReplBtn').addEventListener('click', pvReplaceCurrent);
  document.getElementById('pvReplAllBtn').addEventListener('click', pvReplaceAll);
  const prev = document.getElementById('pvFindPrevBtn');
  const next = document.getElementById('pvFindNextBtn');
  [prev, next].forEach(b => b.addEventListener('mousedown', (e) => e.preventDefault()));
  prev.addEventListener('click', () => pvGo(-1));
  next.addEventListener('click', () => pvGo(1));
  document.getElementById('pvFindCloseBtn').addEventListener('click', closePreviewSearch);
}

function bindPreviewSearchEscapeEvent(){
  // 입력창 밖의 Esc도 검색을 닫되, 전체 화면·코드 화면이 열렸으면 그쪽을 우선한다.
  document.addEventListener('keydown', event => {
    if(event.isComposing || event.keyCode === 229 || event.key !== 'Escape') return;
    if(document.getElementById('fsOverlay').style.display === 'block') return;
    if(document.getElementById('codeOverlay').style.display === 'block') return;
    if(previewSearchState.open) closePreviewSearch();
  });
}

function bindPreviewSearchEvents(){
  if(previewSearchState.bound) return;
  previewSearchState.bound = true;
  bindPreviewSearchInputEvents();
  bindPreviewSearchControlEvents();
  bindPreviewSearchEscapeEvent();
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

document.getElementById('separatorInsertSelect').addEventListener('change', (event) => {
  const type = event.target.value;
  event.target.value = '';
  if(type === 'hr2') insertIntoBody('[HR2]', '', '', '장면 전환 삽입.');
  else if(type === 'hr3') insertIntoBody('[HR3]', '', '', '호흡 구분 삽입.');
  else if(type === 'hr4') insertIntoBody('[HR4]', '', '', '여백 삽입.');
});

document.getElementById('insertImgBtn').addEventListener('click', () => {
  insertBodyImage();
});

document.getElementById('insertQuoteBtn').addEventListener('click', () => {
  insertIntoBody('> ', '', '인용할 내용', '인용 삽입.');
});

document.getElementById('tidyBtn').addEventListener('click', () => {
  MosaicStorage.snapshotCards();
  let changed = 0;
  bodyCardTextareas().forEach(ta => {
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
    MosaicStorage.discardUndoSnapshot();
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

// 카드 편집기를 사이드바 뷰 안으로만 스크롤 (미리보기·페이지는 밀지 않음)
function scrollCardIntoSidebar(ed){
  if(isStackedLayout()) return;
  const sidebar = document.getElementById('sidebar');
  const sidebarTop = document.getElementById('sidebarTop');
  const edRect = ed.getBoundingClientRect();
  const sbRect = sidebar.getBoundingClientRect();
  const margin = 12;
  const headerGap = 28;  // 고정 탭 아래에 카드 헤더가 숨지 않도록 주는 여유
  // #sidebarTop은 sticky라 카드가 그 아래로 숨을 수 있다. 실제 보이는 시작점은
  // 사이드바 맨 위가 아니라 고정 헤더의 아랫선이다.
  const headerBottom = sidebarTop ? sidebarTop.getBoundingClientRect().bottom : sbRect.top;
  const bodyToolbar = document.getElementById('bodyEditorToolbar');
  const toolbarBottom = bodyToolbar && bodyToolbar.offsetParent !== null
    ? bodyToolbar.getBoundingClientRect().bottom
    : headerBottom;
  const desiredTop = Math.max(sbRect.top + margin, headerBottom + headerGap, toolbarBottom + margin);
  // 카드가 사이드바보다 길어도 헤더와 입력창의 시작점이 고정 헤더 아래로 오게 한다.
  if(edRect.top < desiredTop || edRect.bottom > sbRect.bottom - margin){
    sidebar.scrollTop += edRect.top - desiredTop;
  }
}

// ---------- 이름 바꾸기 (조사 자동 변환) ----------
// 마지막 글자의 받침 유무. char/user는 받침 없는 이름으로 읽고, 다른 비한글은 조사를 유지한다.
function hasBatchim(word){
  if(/^(?:char|user)$/i.test((word || '').trim())) return false;
  const ch = (word || '').trim().slice(-1);
  const code = ch.charCodeAt(0);
  if(!(code >= 0xAC00 && code <= 0xD7A3)) return null;
  return (code - 0xAC00) % 28 !== 0;
}

const JOSA_INDEX = { '은': 0, '는': 0, '이': 1, '가': 1, '을': 2, '를': 2, '과': 3, '와': 3 };
const JOSA_FORMS = [['은','는'], ['이','가'], ['을','를'], ['과','와']];   // [받침 있음, 없음]

// text 안의 from 을 to 로 바꾸면서, 바로 뒤에 붙은 조사(은/는·이/가·을/를·과/와)를
// 새 이름의 받침 유무에 맞춰 조사를 자연스럽게 변환한다.
// 받침 있는 이름의 '이' 접미 결합(이가/이는/이를/이와)도 함께 처리한다.
// 조사 뒤가 한글이면 조사로 보지 않고 이름만 바꿔 원문을 안전하게 보존한다.
function renameWithJosa(text, from, to){
  const combos = hasBatchim(from) === true ? '이가|이는|이를|이와|' : '';
  const re = new RegExp(escRe(from) + '(?:(' + combos + '은|는|이|가|을|를|과|와)(?=$|[^가-힣]))?', 'g');
  const b = hasBatchim(to);
  let count = 0;
  const out = text.replace(re, (m, josa) => {
    count++;
    if(!josa) return to;
    if(b === null) return to + josa;                                        // 새 이름이 한글이 아님 → 조사 유지
    if(josa.length === 2) return to + (b ? josa : JOSA_FORMS[JOSA_INDEX[josa[1]]][1]);
    return to + JOSA_FORMS[JOSA_INDEX[josa]][b ? 0 : 1];
  });
  return { out, count };
}

// 키워드 치환과 같은 저장·자동 적용 흐름을 쓰되, 이름은 후속 조사를 함께 바꾼다.
const NAME_RULE_LIMIT = 20;
const NAME_RULE_LIMIT_MESSAGE = `이름 규칙은 최대 ${NAME_RULE_LIMIT}개까지 추가할 수 있습니다.`;

function nameRules(){
  try {
    const parsed = JSON.parse(document.getElementById('nameRules').value || '[]');
    if(!Array.isArray(parsed)) return [];
    const seenIds = new Set();
    return parsed
      .filter(rule => rule && typeof rule.from === 'string' && typeof rule.to === 'string'
        && rule.from && rule.to && rule.from.length <= 80 && rule.to.length <= 80)
      .slice(0, NAME_RULE_LIMIT)
      .map((rule, index) => {
        let id = typeof rule.id === 'string' && rule.id ? rule.id : `nr_legacy_${index}`;
        while(seenIds.has(id)) id += `_${index}`;
        seenIds.add(id);
        return { id, from:rule.from, to:rule.to };
      });
  } catch(e){ return []; }
}
function saveNameRules(rules){
  document.getElementById('nameRules').value = JSON.stringify(rules);
  renderNameRuleList();
  uiUpdateEffects.saveLater();
}
function replaceNameInTextarea(ta, from, to){
  if(!from || !ta.value.includes(from)) return 0;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const beforeStart = renameWithJosa(ta.value.slice(0, start), from, to).out.length;
  const beforeEnd = renameWithJosa(ta.value.slice(0, end), from, to).out.length;
  const result = renameWithJosa(ta.value, from, to);
  if(!result.count) return 0;
  ta.value = result.out;
  try { ta.setSelectionRange(beforeStart, beforeEnd); } catch(e){}
  return result.count;
}
function applyActiveNameRulesToTextarea(ta){
  if(!ta || ta.closest('.commentEditor')) return 0;
  let count = 0;
  nameRules().forEach(rule => { count += replaceNameInTextarea(ta, rule.from, rule.to); });
  return count;
}
function changeExactNameFields(from, to){
  let count = 0;
  ['charName','userName','subChar','subUser'].forEach(id => {
    const el = document.getElementById(id);
    if(el.value.trim() === from){ el.value = to; count++; }
  });
  // 커스텀 인물의 색상 설정은 이름만 바꿔 그대로 보존한다.
  try {
    const input = document.getElementById('extraChars');
    const list = JSON.parse(input.value);
    if(Array.isArray(list)){
      let changed = false;
      list.forEach(char => { if(char && char.name === from){ char.name = to; count++; changed = true; } });
      if(changed) input.value = JSON.stringify(list);
    }
  } catch(e){}
  if(count) MosaicStorage.syncCharList();
  return count;
}

function renderReplacementRuleItems(list, rules, label, undoRule){
  list.replaceChildren();
  rules.forEach(rule => {
    const row = document.createElement('div');
    row.className = 'keywordRuleItem';
    const text = document.createElement('div');
    text.className = 'keywordRuleText';
    const from = document.createElement('b');
    from.textContent = rule.from;
    const to = document.createElement('b');
    to.textContent = rule.to;
    text.append(from, document.createTextNode(' → '), to);
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'keywordUndoBtn';
    undo.textContent = '↺';
    undo.setAttribute('aria-label', `${rule.from} → ${rule.to} ${label} 규칙 되돌리기`);
    undo.addEventListener('click', () => undoRule(rule.id));
    row.append(text, undo);
    list.appendChild(row);
  });
}

function renderNameRuleList(){
  const list = document.getElementById('nameRuleList');
  if(!list) return;
  const rules = nameRules();
  const atLimit = rules.length >= NAME_RULE_LIMIT;
  document.getElementById('nameReplaceBtn').disabled = atLimit;
  const status = document.getElementById('nameStatus');
  if(atLimit) status.textContent = NAME_RULE_LIMIT_MESSAGE;
  else if(status.textContent === NAME_RULE_LIMIT_MESSAGE) status.textContent = '';
  renderReplacementRuleItems(list, rules, '이름', undoNameRule);
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
  if(rules.length >= NAME_RULE_LIMIT){ status.textContent = NAME_RULE_LIMIT_MESSAGE; return; }
  if(rules.some(rule => rule.from === from && rule.to === to)){
    status.textContent = '이미 활성화된 이름 규칙입니다.';
    return;
  }
  const overlaps = (a, b) => a.includes(b) || b.includes(a);
  if(overlaps(from, to)){
    status.textContent = '새 이름이 현재 이름과 겹칩니다. 자동 변경이 반복되지 않도록 다른 이름을 사용해 주세요.';
    return;
  }
  if(rules.some(rule => [rule.from, rule.to].some(value => overlaps(value, from) || overlaps(value, to)))){
    status.textContent = '기존 규칙과 이름이 겹칩니다. 각각 되돌릴 수 있도록 다른 이름을 사용해 주세요.';
    return;
  }
  MosaicStorage.snapshotCards();
  let count = 0;
  bodyCardTextareas().forEach(ta => { count += replaceNameInTextarea(ta, from, to); });
  const fields = changeExactNameFields(from, to);
  rules.push({ id:'nr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), from, to });
  saveNameRules(rules);
  fromEl.value = ''; toEl.value = ''; fromEl.focus();
  uiUpdateEffects.committedChange();
  showUndoToast(`이름 규칙 추가 · 기존 ${count}곳 변경.`);
  status.textContent = `본문 ${count}곳 · 이름 필드 ${fields}곳 자동 변환`;
  if(previewSearchState.open && document.getElementById('pvFindInput').value === from){
    document.getElementById('pvFindInput').value = to;
    pvApplySearch(false);
  }
}
function undoNameRule(id){
  const rules = nameRules();
  const rule = rules.find(item => item.id === id);
  if(!rule) return;
  MosaicStorage.snapshotCards();
  bodyCardTextareas().forEach(ta => { replaceNameInTextarea(ta, rule.to, rule.from); });
  changeExactNameFields(rule.to, rule.from);
  saveNameRules(rules.filter(item => item.id !== id));
  uiUpdateEffects.committedChange();
  MosaicStorage.recordCompletedAction(`'${rule.from} → ${rule.to}' 이름 규칙 되돌림.`);
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
renderNameRuleList();

// ---------- 키워드 치환 ----------
// 여러 규칙을 저장하고 입력 순서대로 적용한다. 서로 이어지는 규칙은 되돌리기 결과가
// 모호해지므로 같은 문구를 다른 규칙의 출발·도착점으로 중복 사용하지 않는다.
const KEYWORD_RULE_LIMIT = 20;
const KEYWORD_RULE_LIMIT_MESSAGE = `치환 규칙은 최대 ${KEYWORD_RULE_LIMIT}개까지 추가할 수 있습니다.`;

function keywordRules(){
  try {
    const parsed = JSON.parse(document.getElementById('keywordRules').value || '[]');
    if(!Array.isArray(parsed)) return [];
    const seenIds = new Set();
    return parsed
      .filter(r => r && typeof r.from === 'string' && typeof r.to === 'string')
      .slice(0, KEYWORD_RULE_LIMIT)
      .map((rule, index) => {
        let id = typeof rule.id === 'string' && rule.id ? rule.id : `kr_legacy_${index}`;
        while(seenIds.has(id)) id += `_${index}`;
        seenIds.add(id);
        return { id, from:rule.from, to:rule.to };
      });
  } catch(e){ return []; }
}
function saveKeywordRules(rules){
  document.getElementById('keywordRules').value = JSON.stringify(rules);
  renderKeywordRuleList();
  uiUpdateEffects.saveLater();
}
function replaceLiteralInTextarea(ta, from, to){
  if(!from || !ta.value.includes(from)) return 0;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const beforeStart = ta.value.slice(0, start).split(from).join(to).length;
  const beforeEnd = ta.value.slice(0, end).split(from).join(to).length;
  const count = ta.value.split(from).length - 1;
  ta.value = ta.value.split(from).join(to);
  try { ta.setSelectionRange(beforeStart, beforeEnd); } catch(e){}
  return count;
}
function applyActiveKeywordRulesToTextarea(ta){
  // 코멘트는 게시판 기본 문단으로 별도 취급하며, 본문용 자동 치환 규칙을 적용하지 않는다.
  if(!ta || ta.closest('.commentEditor')) return 0;
  let count = 0;
  keywordRules().forEach(rule => { count += replaceLiteralInTextarea(ta, rule.from, rule.to); });
  return count;
}
function renderKeywordRuleList(){
  const list = document.getElementById('keywordRuleList');
  if(!list) return;
  const rules = keywordRules();
  const atLimit = rules.length >= KEYWORD_RULE_LIMIT;
  const addButton = document.getElementById('keywordAddBtn');
  const status = document.getElementById('keywordStatus');
  if(addButton) addButton.disabled = atLimit;
  if(status){
    if(atLimit) status.textContent = KEYWORD_RULE_LIMIT_MESSAGE;
    else if(status.textContent === KEYWORD_RULE_LIMIT_MESSAGE) status.textContent = '';
  }
  renderReplacementRuleItems(list, rules, '키워드', undoKeywordRule);
}
function addKeywordRule(){
  const fromEl = document.getElementById('keywordFrom');
  const toEl = document.getElementById('keywordTo');
  const from = fromEl.value;
  const to = toEl.value;
  const st = document.getElementById('keywordStatus');
  if(!from || !to){ st.textContent = '찾을 키워드와 바꿀 키워드를 모두 입력해 주세요.'; return; }
  if(from === to){ st.textContent = '두 키워드가 같아 치환하지 않았습니다.'; return; }
  const rules = keywordRules();
  if(rules.length >= KEYWORD_RULE_LIMIT){
    st.textContent = KEYWORD_RULE_LIMIT_MESSAGE;
    renderKeywordRuleList();
    return;
  }
  if(rules.some(r => r.from === from && r.to === to)){ st.textContent = '이미 활성화된 치환 규칙입니다.'; return; }
  const overlaps = (a, b) => a.includes(b) || b.includes(a);
  if(rules.some(r => [r.from, r.to].some(value => overlaps(value, from) || overlaps(value, to)))){
    st.textContent = '기존 규칙과 문구가 겹칩니다. 각각 정확히 되돌릴 수 있도록 다른 문구를 사용해 주세요.';
    return;
  }
  MosaicStorage.snapshotCards();
  let count = 0;
  bodyCardTextareas().forEach(ta => { count += replaceLiteralInTextarea(ta, from, to); });
  rules.push({ id:'kr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), from, to });
  saveKeywordRules(rules);
  fromEl.value = ''; toEl.value = ''; fromEl.focus();
  uiUpdateEffects.committedChange();
  showUndoToast(`키워드 규칙 추가 · 기존 ${count}곳 변경.`);
  st.textContent = `본문 ${count}곳 자동 치환`;
}
function undoKeywordRule(id){
  const rules = keywordRules();
  const rule = rules.find(r => r.id === id);
  if(!rule) return;
  MosaicStorage.snapshotCards();
  bodyCardTextareas().forEach(ta => { replaceLiteralInTextarea(ta, rule.to, rule.from); });
  saveKeywordRules(rules.filter(r => r.id !== id));
  uiUpdateEffects.committedChange();
  MosaicStorage.recordCompletedAction(`'${rule.from} → ${rule.to}' 규칙 되돌림.`);
  dismissToast();
  document.getElementById('keywordStatus').textContent = '';
}
function bindKeywordRuleEvents(){
  bindUIFeatureEvents('keyword-rules', () => {
    document.getElementById('keywordAddBtn').addEventListener('click', addKeywordRule);
    ['keywordFrom','keywordTo'].forEach(id => document.getElementById(id).addEventListener('keydown', event => {
      if(event.isComposing || event.keyCode === 229) return;
      if(event.key === 'Enter'){ event.preventDefault(); addKeywordRule(); }
    }));
  });
}
renderKeywordRuleList();

// ---------- UI 수명주기·외부 출입구 ----------
// 기능별 이벤트 연결은 한 번만 수행한다. 다른 모듈은 아래 MosaicUI만 통해
// UI를 다루며, 이 파일 안의 상태 객체와 보조 함수에는 직접 의존하지 않는다.
const uiLifecycleState = {
  initialized:false,
  bindings:new Set(),
  observers:[]
};
function bindUIFeatureEvents(name, bind){
  if(uiLifecycleState.bindings.has(name)) return;
  bind();
  uiLifecycleState.bindings.add(name);
}
function initUI(){
  if(uiLifecycleState.initialized) return;
  bindGlobalUIEvents();
  bindBlockToolbarEvents();
  bindPreviewSelectionEvents();
  bindPreviewLayoutEvents();
  bindPositionSyncEvents();
  bindPreviewFullscreenEvents();
  bindPreviewToolbarLayoutEvents();
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
  bindCardEditorDelegatedEvents();
  bindCardToolbarLayoutEvents();
  bindCardEditorDragEvents();
  bindCardCreationEvents();
  bindUndoToastEvents();
  bindFullscreenFormatEvents();
  bindFullscreenEditorEvents();
  bindPreviewSearchEvents();
  bindBodyToolEvents();
  bindNameRuleEvents();
  bindKeywordRuleEvents();
  uiLifecycleState.initialized = true;
}

const MosaicUI = Object.freeze({
  init:initUI,
  cards:Object.freeze({
    add:addCard,
    clear:clearCardEditors,
    all:getCards,
    textareas:bodyCardTextareas,
    snapshot:(...args) => MosaicStorage.snapshotCards(...args),
    format:applyTextareaFormat,
    setDefaultsForShape:setCardDefaultsForShapeChange,
    exampleBody:EXAMPLE_BODY,
    activeTextarea:() => cardEditorState.activeTextarea,
    setActiveTextarea:textarea => { cardEditorState.activeTextarea = textarea || null; }
  }),
  preview:Object.freeze({
    render,
    scheduleRefresh:uiUpdateEffects.renderCountLater,
    renderMarkup:renderPreview,
    focusCaret:focusPreviewOnCaret,
    revealOffsetAtTop:revealEditorOffsetAtTop,
    positionSyncEnabled,
    layoutFloatingButtons:layoutPreviewFloatingButtons,
    syncToolbarLabel:syncPreviewToolbarLabel,
    syncCommentOutset:syncPreviewCommentOutset,
    syncOuterBreaks:syncPreviewOuterBreaks,
    openSearch:openPreviewSearch,
    closeSearch:closePreviewSearch,
    setFullscreenSearchOpen:setFsSearchOpen,
    clearFullscreenSearch:fsClearSearch,
    hideSelectionToolbar:hideSelToolbar,
    revision:() => previewRenderState.revision,
    setDirectEditReady:ready => { previewEditState.ready = !!ready; }
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
    syncTypographyLabels:syncTypographyRangeLabels,
    updateHexLabels,
    renderNameRules:renderNameRuleList,
    renderKeywordRules:renderKeywordRuleList,
    selectedText:selectedControlText
  }),
  workspace:Object.freeze({ setInert:setWorkspaceInert })
});
globalThis.MosaicUI = MosaicUI;
initUI();
