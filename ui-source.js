// 조각로그 UI · 원문 매핑과 미리보기 원문 변경안
// 생성 함수만 등록하며, 실행 상태와 기능 연결은 ui.js에서 구성한다.
globalThis.MosaicUIParts = Object.create(null);
globalThis.MosaicUIParts.source = (() => {
'use strict';

function createSourceMapping(host){
const parallelEditorState = new WeakMap();

function editorParallelExclusions(ta){
  const state=parallelEditorState.get(ta);if(!state)return [];
  if(state.body!==ta.value){state.items=MosaicState.rebaseParallelExclusions(state.items,state.body,ta.value);state.body=ta.value;}
  return state.items;
}

function parallelCardCandidates(ta,settings=host.getSettings()){
  return MosaicParser.parallelOutputCandidates(ta.value,{...settings,parallelBodyOnly:true,outputRuleExclusions:editorOutputRuleExclusions(ta),parallelExclusions:editorParallelExclusions(ta)});
}

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
function sourceProjectionMeta(line, currentSettings = host.getSettings()){
  const normalized = MosaicParser.normalizeQuotes(String(line));
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

  // 메모의 [BR] 연속 줄은 접두어 없는 평문도 같은 리터럴 문맥을 사용한다.
  if(currentSettings.bodyCommentLiteral){
    const comment = MosaicParser.parseBodyCommentLine(normalized);
    if(comment){ hide(0,comment.prefix.length); offset=comment.prefix.length; }
    return {normalized,hidden,start:offset,maskInlineSpeakers:false,literal:true};
  }

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

  // 메모는 접두어만 숨기고, 뒤의 서식 기호·따옴표는 글자 그대로 표시한다.
  const comment = rest.match(/^:[\t ]*/);
  if(comment){
    hide(offset, offset + comment[0].length);
    return {normalized, hidden, start:offset + comment[0].length, maskInlineSpeakers:false, literal:true};
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
    const named = rest.match(/^\[([^\[\]\n]{1,24})\]\s*/);
    if(named && MosaicRenderer.findChar(currentSettings, named[1])){
      hide(offset, offset + named[0].length);
      offset += named[0].length;
    }
  }
  // 원래 문법 위치를 먼저 남기고, 괄호 숨김·표시 순서는 문자 투영에서 적용한다.
  return { normalized, hidden, start: offset, maskInlineSpeakers:true };
}

function sourceContentStart(line){
  return sourceProjectionMeta(line).start;
}

function lineSearchProjection(line, currentSettings = host.getSettings()){
  const meta = sourceProjectionMeta(line, currentSettings);
  const normalized = meta.normalized;
  const chars = normalized.split('');
  const mask = (start, end) => {
    for(let i = Math.max(0, start); i < Math.min(chars.length, end); i++) chars[i] = '\u0000';
  };
  meta.hidden.forEach(range => mask(range[0], range[1]));
  (currentSettings.parallelTranslationQuoteRanges || []).forEach(([start,end])=>mask(start,end));

  let m;
  // 일반 문단 중간의 화자 마커만 화면에서 사라진다. 제목·인용문에서는 글자 그대로다.
  if(meta.maskInlineSpeakers){
    const settings = currentSettings;
    const speakerRe = /(>>|<<|\[([^\[\]\n]{1,24})\])\s*(?=["“‘'])/g;
    while((m = speakerRe.exec(normalized)) !== null){
      const known = m[1] === '>>' || m[1] === '<<' || !!MosaicRenderer.findChar(settings, m[2]);
      if(known) mask(m.index, m.index + m[0].length);
    }
    if(MosaicState.isMessengerDialogueStyle(settings.dlgStyle))(settings.messengerQuoteRanges || MosaicParser.dialogueQuoteRanges(normalized,settings)).forEach(([start,end])=>mask(start,end));
  }

  // 인라인 서식 기호는 보이지 않지만 내용의 원문 인덱스는 그대로 유지한다.
  // 미리보기 직접 편집에서도 출력 파서와 같은 ** / __ / *** 문법을 사용한다.
  if(!meta.literal) maskInlineFormatMarkers(normalized, mask);
  return chars.join('');
}

// 상태창은 출력할 때 `|` 양옆 공백을 통일하므로 화면 문자열의 길이가 원문과 달라질 수 있다.
// 화면의 각 글자가 원문의 어느 인덱스에서 왔는지 함께 만들어 드래그 범위를 정확히 되돌린다.
function sourceDisplayProjectionMap(line, settings = host.getSettings()){
  const projection = lineSearchProjection(line, settings);
  const extended = settings.parallelTranslationOrder === 'translation' || settings.parallelTranslationBrackets === 'hide'
    || MosaicState.isMessengerDialogueStyle(settings.dlgStyle) || MosaicParser.parallelKindEnabled('dialogue',settings);
  if(extended && (sourceProjectionMeta(line,settings).maskInlineSpeakers || /^\s*(?:\[C\]\s*)?>(?!>)/.test(line))){
    const parallel = MosaicParser.parallelTextProjection(line,{...settings,
      hideDialogueQuotes:MosaicState.isMessengerDialogueStyle(settings.dlgStyle) && sourceProjectionMeta(line,settings).maskInlineSpeakers});
    if(parallel.changed){
      // 마커는 표시 순서가 아니라 원래 위치에서 가린다. 번역 안의 인물명·따옴표가
      // 앞으로 나왔다는 이유로 새 화자 문법으로 소비되지 않게 한다.
      const points = parallel.spans.map((span,index)=>({...span,char:parallel.text[index]}))
        .filter(point=>!point.editable || projection[point.start] !== '\u0000');
      return {text:points.map(point=>point.char).join(''),map:points.map(point=>point.start),
        ends:points.map(point=>point.end),parts:points.map(point=>point.part),
        protected:points.map(point=>!point.editable),parallel:true};
    }
  }
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

// 치환으로 길이가 바뀌거나 글자가 사라져도 출력 선택·편집을 원문 범위에 연결한다.
const outputRuleEditorState = new WeakMap();

const bodyCommentContextCache = new WeakMap();

function editorBodyCommentContexts(ta){
  let cached = bodyCommentContextCache.get(ta);
  if(!cached || cached.body !== ta.value){
    cached = {body:ta.value,lines:MosaicParser.bodyCommentLineContexts(ta.value)};
    bodyCommentContextCache.set(ta,cached);
  }
  return cached.lines;
}

function editorOutputRuleExclusions(ta){
  if(!ta) return [];
  const state = outputRuleEditorState.get(ta);
  if(!state) return [];
  if(state.body !== ta.value){
    state.items = MosaicState.rebaseOutputRuleExclusions(state.items,state.body,ta.value);
    state.body = ta.value;
  }
  return state.items;
}

function outputRuleLineSettings(ta, raw = 0, segmentOffset = 0, settings = host.getSettings()){
  const exclusions = editorOutputRuleExclusions(ta);
  const parallelExclusions=editorParallelExclusions(ta);
  const bodyCommentLiteral = !!(ta && editorBodyCommentContexts(ta)[raw]);
  if(!exclusions.length && !parallelExclusions.length && !bodyCommentLiteral) return settings;
  const snapshot = editorTextSnapshot(ta);
  const offset = (snapshot.offsets[raw] ?? snapshot.offsets.at(-1)) + segmentOffset;
  return {...settings,outputRuleExclusions:exclusions,parallelExclusions,outputRuleSourceOffset:offset,bodyCommentLiteral};
}

function outputSourceDisplayProjectionMap(line, settings = host.getSettings()){
  const output = MosaicParser.outputTextProjection(line, settings);
  const display = sourceDisplayProjectionMap(output.text, {...MosaicParser.outputRuleSettings(settings),
    parallelResolvedCandidates:MosaicParser.parallelOutputCandidates(line,settings,output)});
  const spans = display.map.map((index,at) => {
    const first = output.spans[index] || {start:line.length,end:line.length};
    const last = output.spans[(display.ends?.[at] ?? index+1)-1] || first;
    return {...first,end:last.end,editEnd:last.editEnd ?? last.end};
  });
  return {text:display.text,map:spans.map(span => span.start),ends:spans.map(span => span.end),
    editMap:spans.map(span => span.editStart ?? span.start),editEnds:spans.map(span => span.editEnd ?? span.end),
    ...(display.parallel ? {parallel:true,parts:display.parts,protected:display.protected} : {})};
}

function findSourceRange(line, text, occurrence, caseInsensitive, settings){
  const ranges = findAllSourceRanges(line, text, caseInsensitive, settings);
  return ranges[Math.max(0, occurrence || 0)] || null;
}

function findAllSourceRanges(line, text, caseInsensitive, settings){
  if(!text) return [];
  const display = outputSourceDisplayProjectionMap(line, settings);
  const normalizedText = MosaicParser.normalizeQuotes(String(text)).replace(/\u00a0/g, ' ').trim();
  if(!normalizedText) return [];
  const ranges = [];
  MosaicParser.literalMatchRanges(display.text, normalizedText, !!caseInsensitive).forEach(({start:at,end}) => {
    const last = end - 1;
    if(display.map[at] !== undefined && display.map[last] !== undefined){
      let range = display.parallel
        ? {start:display.map.slice(at,last+1).reduce((min,value)=>Math.min(min,value),Infinity),
          end:display.ends.slice(at,last+1).reduce((max,value)=>Math.max(max,value),0)}
        : {start:display.map[at],end:display.ends[last]};
      if(display.parallel)range=MosaicParser.parallelSourceBounds(line,range,settings);
      if(range.end>range.start && !ranges.some(item => item.start === range.start && item.end === range.end)) ranges.push(range);
    }
  });
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

function replaceSourceRange(line, sourceRange, replacement, settings = host.getSettings()){
  const prepared = prepareSourceRangeReplacement(line, sourceRange);
  // 출력 이름과 조사를 함께 묶어 편집하되, 검색한 이름 바깥의 조사·원문은 보존한다.
  // 서식 마커 제거로 원문 좌표가 달라진 경우 예외도 같은 편집으로 재배치한다.
  if(settings.outputRuleExclusions?.length && prepared.line !== line){
    const base = settings.outputRuleSourceOffset || 0;
    const local = settings.outputRuleExclusions.map(item => ({...item,start:item.start-base,end:item.end-base}));
    settings = {...settings,outputRuleSourceOffset:0,
      outputRuleExclusions:MosaicState.rebaseOutputRuleExclusions(local,line,prepared.line)};
  }
  if(MosaicParser.applyOutputTextRules(prepared.line, settings) !== prepared.line){
    const output = outputSourceDisplayProjectionMap(prepared.line, settings);
    const first = output.map.findIndex((start,index) => start >= prepared.range.start && output.ends[index] <= prepared.range.end);
    let last = first;
    while(last + 1 < output.map.length && output.map[last + 1] >= prepared.range.start && output.ends[last + 1] <= prepared.range.end) last++;
    if(first >= 0){
      const next = output.text.slice(0, first) + replacement + output.text.slice(last + 1);
      return replaceVisibleUsingProjection(prepared.line, next, output);
    }
  }
  return prepared.line.slice(0, prepared.range.start)
    + replacement
    + prepared.line.slice(prepared.range.end);
}

function comparableFormattedText(value){
  return MosaicRenderer.formatStatusContent(MosaicParser.stripMarkers(MosaicParser.normalizeQuotes(String(value)))).trim();
}

// 원문 줄 가운데 화면에 실제로 글자가 생기는 줄만 출력 순서 그대로 모은다.
// 제목 없는 수동 접기는 기본 제목이 생성되므로 정렬용 항목은 남기되 직접 편집은 막는다.
function softBreakSourceProjection(ta, rawLines, settings){
  const lines = ta.value.split('\n');
  let text = ''; const spans = [];
  rawLines.forEach((raw,index) => {
    if(index){text += '\n';spans.push(null);}
    const line = index < rawLines.length-1 ? lines[raw].replace(/\[BR\]\s*$/i,'') : lines[raw];
    const display = outputSourceDisplayProjectionMap(line,outputRuleLineSettings(ta,raw,0,settings));
    text += display.text;
    display.map.forEach((start,index) => spans.push({raw,start,end:display.ends[index]}));
  });
  return {text,spans};
}

function sourceDisplayEntries(ta, rawSettings = host.getSettings()){
  const plain = plainSourceEntries(ta, rawSettings);
  if(plain) return plain;
  const result = [];
  const settings = MosaicParser.outputRuleSettings(rawSettings);
  const sourceLines = editorTextSnapshot(ta).lines;
  const parallelCandidates=editorParallelExclusions(ta).length ? parallelCardCandidates(ta,rawSettings) : null;
  const sourceOffsets=[];let sourceOffset=0;sourceLines.forEach(line=>{sourceOffsets.push(sourceOffset);sourceOffset+=line.length+1;});
  const outputLines = sourceLines.map((line,raw) => MosaicParser.applyOutputTextRules(line, outputRuleLineSettings(ta,raw,0,rawSettings)));
  MosaicRenderer.bodyRenderGroups(outputLines, settings).forEach(group => {
    const {raw, rawEnd, rawLines, renderLines} = group;
    const start=sourceOffsets[raw],end=sourceOffsets[rawEnd+1] ?? ta.value.length+1;
    const displaySettings=parallelCandidates ? {...settings,parallelContext:{items:parallelCandidates.filter(item=>item.sourceStart>=start && item.sourceEnd<end),cursor:0}} : settings;
    const originalLine = sourceLines[raw];
    const trimmed = renderLines[0].trim();
    if(/^(?:\[C\]\s*)?\[접기\]\s*$/i.test(trimmed)){
      result.push({ raw, editable:false });
      return;
    }

    if(rawLines.length > 1){
      const source = renderLines.length > 1 ? softBreakSourceProjection(ta,rawLines,rawSettings) : null;
      let cursor = 0;
      renderLines.forEach(renderLine => {
        const projection = sourceDisplayProjectionMap(renderLine, displaySettings).text
          .split(MosaicParser.SOFT_BREAK_TOKEN).join('\n').trim();
        if(!projection) return;
        if(source){
          const at = source.text.indexOf(projection,cursor), segments = [];
          if(at >= 0){
            source.spans.slice(at,at+projection.length).forEach(span => {
              if(!span) return;
              const previous = segments.at(-1);
              if(previous && previous.raw === span.raw){previous.start=Math.min(previous.start,span.start);previous.end=Math.max(previous.end,span.end);}
              else segments.push({...span});
            });
            cursor = at+projection.length;
          }
          segments.forEach(segment=>Object.assign(segment,MosaicParser.parallelSourceBounds(sourceLines[segment.raw],segment,rawSettings)));
          const first = segments[0], last = segments.at(-1);
          result.push({
            raw:first ? first.raw : raw,rawEnd:last ? last.raw : rawEnd,
            rawLines:segments.map(segment => segment.raw),sourceSegments:segments,
            editable:!!first,renderLine,projection,occurrence:0,
            sourceBounds:segments.length === 1 ? {start:first.start,end:first.end} : null,
            segmented:true,softBreak:segments.length > 1
          });
          return;
        }
        result.push({
          raw,
          rawEnd,
          rawLines,
          editable:renderLines.length === 1,
          renderLine,
          projection,
          occurrence:0,
          sourceBounds:null,
          segmented:false,
          softBreak:true
        });
      });
      return;
    }
    // 대사 옵션 3–5는 한 원문 줄 안의 서술과 대사를 여러 출력 문단으로 나눈다.
    // 미리보기 편집 연결도 같은 분할 결과를 사용해야 HR 등 구조 요소 뒤에서
    // 문단 인덱스가 밀리지 않는다.
    let sourceCursor = 0;
    renderLines.forEach(renderLine => {
      const projection = sourceDisplayProjectionMap(renderLine, displaySettings).text.trim();
      if(!projection) return;
      const ranges = findAllSourceRanges(originalLine, projection, false, outputRuleLineSettings(ta,raw,0,rawSettings));
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
  });
  return result;
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
function replaceVisibleUsingProjection(rawValue, nextVisible, projection, preserveLineBreaks = false, editHint = null){
  const raw = String(rawValue);
  const projected = projection === undefined ? lineSearchProjection(raw) : projection;
  const mapped = typeof projected === 'object';
  const rawIndexes = mapped ? projected.editMap || projected.map : [];
  const rawEnds = mapped ? projected.editEnds || projected.ends : [];
  let oldVisible = mapped ? projected.text : '';
  if(!mapped) for(let i = 0; i < projected.length; i++){
    if(projected[i] === '\u0000') continue;
    oldVisible += projected[i];
    rawIndexes.push(i);
    rawEnds.push(i + 1);
  }
  const normalizedNext = MosaicParser.normalizeQuotes(String(nextVisible))
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n');
  const next = preserveLineBreaks
    ? normalizedNext.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{2,}/g, '\n').trim()
    : normalizedNext.replace(/\s*\n\s*/g, ' ').trim();
  if(next === oldVisible.trim() && !editHint?.hunks?.length) return raw;
  if(!next) return '';
  if(mapped && (projected.parallel || editHint)) return replaceParallelVisibleSource(raw,next,projected,editHint);

  const old = oldVisible.trim();
  let prefix = 0;
  while(prefix < old.length && prefix < next.length && old[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while(suffix < old.length - prefix && suffix < next.length - prefix
    && old[old.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;

  // projection의 앞뒤 공백은 원문 문법처럼 숨겨질 수 있으므로, 화면 문자열의 실제 시작을 맞춘다.
  const projectedVisible = oldVisible;
  const leftTrim = projectedVisible.length - projectedVisible.trimStart().length;
  const visibleIndexes = rawIndexes.slice(leftTrim, rawIndexes.length - (projectedVisible.length - projectedVisible.trimEnd().length));
  const visibleEnds = rawEnds.slice(leftTrim, rawEnds.length - (projectedVisible.length - projectedVisible.trimEnd().length));
  let oldEnd = old.length - suffix;
  let inserted = next.slice(prefix, next.length - suffix);
  // 치환된 이름 일부를 편집하면 해당 출력 전체를 하나의 원문 범위로 바꾼다.
  // 앞뒤의 미수정 글자도 남겨 짧은 원래 이름을 부분적으로 훼손하지 않는다.
  if(mapped){
    const previousPrefix = prefix, previousEnd = oldEnd;
    while(prefix > 0 && prefix < visibleIndexes.length && visibleIndexes[prefix] < visibleEnds[prefix - 1]) prefix--;
    while(oldEnd > 0 && oldEnd < visibleIndexes.length && visibleIndexes[oldEnd] < visibleEnds[oldEnd - 1]) oldEnd++;
    inserted = old.slice(prefix, previousPrefix) + inserted + old.slice(previousEnd, oldEnd);
  }
  const replaceStart = prefix < visibleIndexes.length
    ? visibleIndexes[prefix]
    : (visibleIndexes.length ? visibleEnds[visibleEnds.length - 1] : sourceContentStart(raw));
  const replaceEnd = oldEnd > prefix && visibleIndexes[oldEnd - 1] !== undefined
    ? visibleEnds[oldEnd - 1]
    : replaceStart;
  return (raw.slice(0, replaceStart) + inserted + raw.slice(replaceEnd))
    .replace(/____/g, '')
    .replace(/\*\*\*\*/g, '');
}

// 표시 순서와 원문 순서가 달라도 변경한 부분의 원문 범위만 쓴다.
function replaceParallelVisibleSource(raw,next,projection,editHint = null){
  const old=projection.text.trim(), left=projection.text.length-projection.text.trimStart().length;
  const map=(projection.editMap || projection.map).slice(left,left+old.length);
  const ends=(projection.editEnds || projection.ends).slice(left,left+old.length);
  const parts=(projection.parts || Array(projection.text.length).fill(null)).slice(left,left+old.length);
  const protectedChars=(projection.protected || Array(projection.text.length).fill(false)).slice(left,left+old.length);
  let start=0,end=old.length,nextEnd=next.length;
  while(start<end && start<nextEnd && old[start]===next[start])start++;
  while(end>start && nextEnd>start && old[end-1]===next[nextEnd-1]){end--;nextEnd--;}
  let hunks=[{start,end,text:next.slice(start,nextEnd)}];
  if(editHint){
    // 실제 편집 DOM의 위/아래 경계로 나눈 변경만 쓴다. 같은 문구가 반복돼도
    // 전체 문자열의 공통 접두어가 다른 원문·번역 쪽으로 수정 위치를 밀지 않는다.
    if(editHint.before!==old || editHint.after!==next || !Array.isArray(editHint.hunks))return raw;
    hunks=editHint.hunks;
  }else if(protectedChars.slice(start,end).some(Boolean) || new Set(parts.slice(start,end)).size>1){
    hunks=parallelEditHunks(old.slice(start,end),next.slice(start,nextEnd),start);
    if(!hunks)return raw;
  }
  const replacements=[];
  for(const hunk of hunks){
    let from=hunk.start,to=hunk.end;
    while(from>0 && from<map.length && parts[from]===parts[from-1] && map[from]<ends[from-1])from--;
    while(to>0 && to<map.length && parts[to]===parts[to-1] && map[to]<ends[to-1])to++;
    const inserted=old.slice(from,hunk.start)+hunk.text+old.slice(hunk.end,to);
    if(from===to){
      const at=!protectedChars[from] && map[from]!==undefined ? map[from]
        : from>0 && !protectedChars[from-1] ? ends[from-1] : null;
      if(at===null)return raw;
      replacements.push({from:at,to:at,text:inserted});continue;
    }
    if(protectedChars.slice(from,to).some(Boolean) || new Set(parts.slice(from,to)).size>1)return raw;
    const rawFrom=map.slice(from,to).reduce((min,value)=>Math.min(min,value),Infinity);
    const rawTo=ends.slice(from,to).reduce((max,value)=>Math.max(max,value),0);
    // 다른 표시 조각을 덮는 범위나 치환된 글자의 일부만 지우는 모호한 변경은 보존한다.
    if(map.some((at,index)=>(index<from || index>=to) && !protectedChars[index] && at<rawTo && ends[index]>rawFrom))return raw;
    replacements.push({from:rawFrom,to:rawTo,text:inserted});
  }
  replacements.sort((a,b)=>b.from-a.from);
  if(replacements.some((item,index)=>index>0 && item.to>replacements[index-1].from))return raw;
  return replacements.reduce((value,item)=>value.slice(0,item.from)+item.text+value.slice(item.to),raw)
    .replace(/____/g,'').replace(/\*\*\*\*/g,'');
}

// 양쪽 문구를 한 번에 고쳐도 원래의 각 내용에만 돌려쓴다. 큰/모호한 변경은
// 무리하게 전체 문단으로 덮지 않으며, 비교 메모리·시간을 고정된 상한 안에 둔다.
function parallelEditHunks(old,next,offset){
  if((old.length+1)*(next.length+1)>250000)return null;
  const width=next.length+1,table=new Uint32Array((old.length+1)*width);
  for(let i=old.length-1;i>=0;i--)for(let j=next.length-1;j>=0;j--){
    table[i*width+j]=old[i]===next[j] ? table[(i+1)*width+j+1]+1
      : Math.max(table[(i+1)*width+j],table[i*width+j+1]);
  }
  const result=[];let i=0,j=0,current=null;
  const finish=()=>{if(current){result.push(current);current=null;}};
  while(i<old.length || j<next.length){
    if(i<old.length && j<next.length && old[i]===next[j]){finish();i++;j++;continue;}
    current ||= {start:offset+i,end:offset+i,text:''};
    if(i<old.length && (j===next.length || table[(i+1)*width+j]>=table[i*width+j+1])){i++;current.end=offset+i;}
    else current.text+=next[j++];
  }
  finish();return result;
}

function replacePreviewBodyLine(rawLine, nextVisible, settings = host.getSettings(), editHint = null){
  const raw = String(rawLine);
  if(editHint && MosaicState.isMessengerDialogueStyle(settings.dlgStyle))settings={...settings,parallelEditProjection:true};
  const comment = MosaicParser.parseBodyCommentLine(raw);
  if(comment || settings.bodyCommentLiteral){
    const next = String(nextVisible).replace(/\u00a0/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
    if(MosaicParser.normalizeQuotes(next) === MosaicParser.normalizeQuotes((comment?.content ?? raw).trim())) return raw;
    return (comment?.prefix ?? raw.match(/^[\t ]*/)[0]) + next;
  }
  if(MosaicState.isMessengerDialogueStyle(settings.dlgStyle)){
    const meta=sourceProjectionMeta(raw,settings),projection=outputSourceDisplayProjectionMap(raw,settings);
    const speaker=String(nextVisible).match(/^(?:>>|<<|\[(?!C\])[^\[\]\n]{1,24}\])\s*/i);
    if(meta.maskInlineSpeakers && meta.normalized[meta.start]==='"' && speaker
      && !projection.text.trimStart().startsWith(speaker[0])){
      // 화면에 없는 여는 따옴표 안쪽으로 새 화자 마커가 들어가지 않게 한다.
      const updated=replaceVisibleUsingProjection(raw,String(nextVisible).slice(speaker[0].length),projection);
      return updated.slice(0,meta.start)+speaker[0]+updated.slice(meta.start);
    }
  }
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
    if(clean === outputSourceDisplayProjectionMap(raw,settings).text.trim()) return raw;
    return replaceVisibleUsingProjection(raw, clean, outputSourceDisplayProjectionMap(raw,settings));
  }
  return replaceVisibleUsingProjection(raw, nextVisible, outputSourceDisplayProjectionMap(raw,settings),false,editHint);
}

// 한 원문 줄이 여러 미리보기 문단으로 분리된 경우에는 검색 범위를 해당 조각으로
// 제한한다. 같은 문장이 앞뒤에 반복돼도 다른 조각을 수정하지 않게 한다.
function descriptorSourceRange(descriptor, line, text, occurrence){
  // 코멘트 접두어를 잘라내면 메모가 일반 본문으로 재해석돼 이름 치환이 다시 걸린다.
  if(MosaicParser.parseBodyCommentLine(line)){
    return findSourceRange(line, text, occurrence, false, outputRuleLineSettings(descriptor.ta,descriptor.raw));
  }
  const bounds = descriptor && descriptor.sourceBounds;
  if(bounds && Number.isInteger(bounds.start) && Number.isInteger(bounds.end)){
    const segment = line.slice(bounds.start, bounds.end);
    const local = findSourceRange(segment, text, occurrence, false, outputRuleLineSettings(descriptor.ta,descriptor.raw,bounds.start));
    if(local) return { start:bounds.start + local.start, end:bounds.start + local.end };
    // 자동 분리된 대사는 반드시 자기 원문 조각 안에서만 수정한다.
    // 조각 검색에 실패했을 때 줄 전체로 되돌아가면 같은 문장이 인접 조각에서
    // 발견되어 엉뚱한 대사에 서식이나 편집 내용이 적용될 수 있다.
    if(descriptor && descriptor.segmented) return null;
  }
  return findSourceRange(line, text, occurrence, false, outputRuleLineSettings(descriptor.ta,descriptor.raw));
}

// [BR] 문단은 여러 원문 줄이 미리보기의 한 블록으로 합쳐진다. 선택한 글자가
// 첫 줄이 아닌 경우에도 결합 순서대로 각 원문 줄의 후보를 세어 실제 줄과 범위를 찾는다.
function descriptorSelectionSource(descriptor, text, occurrence){
  if(!descriptor || !descriptor.ta) return null;
  const lines = descriptor.ta.value.split('\n');
  const rawStart = descriptor.raw;
  const rawEnd = Math.max(rawStart, Number.isInteger(descriptor.rawEnd) ? descriptor.rawEnd : rawStart);
  if(descriptor.sourceSegments){
    let remaining = Math.max(0,occurrence || 0);
    for(const segment of descriptor.sourceSegments){
      const line = lines[segment.raw];
      if(line === undefined) return null;
      const ranges = findAllSourceRanges(line.slice(segment.start,segment.end),text,false,
        outputRuleLineSettings(descriptor.ta,segment.raw,segment.start));
      if(remaining < ranges.length){
        const range = ranges[remaining];
        return {raw:segment.raw,range:{start:segment.start+range.start,end:segment.start+range.end},
          occurrence:remaining,sourceBounds:{start:segment.start,end:segment.end},segmented:true};
      }
      remaining -= ranges.length;
    }
    return null;
  }
  if(descriptor.softBreak && rawEnd > rawStart){
    let remaining = Math.max(0, occurrence || 0);
    const rawLines = descriptor.rawLines || Array.from({length:rawEnd - rawStart + 1}, (_,i) => rawStart + i);
    for(const raw of rawLines){
      const line = lines[raw];
      if(line === undefined) continue;
      const ranges = findAllSourceRanges(line, text, false, outputRuleLineSettings(descriptor.ta,raw));
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

function messengerEditSourceBounds(line, segment, settings){
  const bounds={...segment};
  if(!MosaicState.isMessengerDialogueStyle(settings.dlgStyle) || !sourceProjectionMeta(line,settings).maskInlineSpeakers)return bounds;
  const quotes=MosaicParser.dialogueQuoteRanges(line,settings,{rawSource:true});
  for(let i=0;i+1<quotes.length;i+=2){
    const open=quotes[i],close=quotes[i+1];
    if(bounds.start<=open[1] && bounds.end>=close[0]){
      bounds.start=Math.min(bounds.start,open[0]);bounds.end=Math.max(bounds.end,close[1]);
    }
  }
  return bounds;
}

function sourceSegmentEditBounds(line, segment){
  const markers = [], bounds = {...segment};
  maskInlineFormatMarkers(line,(start,end) => markers.push({start,end}));
  // 조각에 온전히 속하는 서식쌍은 함께 편집한다. 줄 수를 줄이거나 삭제해도
  // 첫 줄의 여는 별표나 마지막 줄의 닫는 별표만 원문에 남지 않게 한다.
  for(let i = 0; i+1 < markers.length; i += 2){
    const open = markers[i], close = markers[i+1];
    if(bounds.start <= open.end && bounds.end >= close.start){
      bounds.start = Math.min(bounds.start,open.start);
      bounds.end = Math.max(bounds.end,close.end);
    }
  }
  return messengerEditSourceBounds(line,bounds,host.getSettings());
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
  const outputSettings = MosaicParser.outputRuleSettings(settings);
  const comments = MosaicParser.bodyCommentLineContexts(text || '');
  let offset = 0;
  const outputLines = String(text || '').split('\n').map((line,raw) => {
    const output = MosaicParser.applyOutputTextRules(line,{...settings,outputRuleSourceOffset:offset,bodyCommentLiteral:!!comments[raw]});
    offset += line.length+1;
    return output;
  });
  const entries = [];
  MosaicRenderer.bodyRenderGroups(outputLines, outputSettings).forEach(entry => {
    const outputParts = entry.renderLines
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

function setOutputRuleExclusions(ta,items){ outputRuleEditorState.set(ta,{body:ta.value,items}); }

function setParallelExclusions(ta,items){ parallelEditorState.set(ta,{body:ta.value,items}); }

function attachEditorSource(ta,source){
  setOutputRuleExclusions(ta,MosaicState.rebaseOutputRuleExclusions(source.outputRuleExclusions || [],source.body || '',ta.value));
  setParallelExclusions(ta,MosaicState.rebaseParallelExclusions(source.parallelExclusions || [],source.body || '',ta.value));
}

// 이미 아는 절단 위치를 사용한다. 반복 문구를 일반 변경 비교로 다시 찾지 않는다.
function planCardSplit(source,offset){
  const body = source.body;
  if(!Number.isInteger(offset) || offset <= 0 || offset >= body.length) return {reason:'boundary'};
  if(/[\uD800-\uDBFF]/.test(body[offset-1]) && /[\uDC00-\uDFFF]/.test(body[offset])) return {reason:'character'};
  const bodies = [body.slice(0,offset),body.slice(offset)];
  if(bodies.some(part => !part.trim())) return {reason:'boundary'};
  // 새 줄 맨 앞에서 구분선으로 바뀌는 절단은 원문을 조용히 정규화하지 않는다.
  if(bodies.some(part => MosaicParser.normalizeBodyHrMarkers(part) !== part)) return {reason:'marker'};
  const ranges = {
    outputRuleExclusions:MosaicState.normalizeOutputRuleExclusions(source.outputRuleExclusions,body),
    parallelExclusions:MosaicState.normalizeParallelExclusions(source.parallelExclusions,body)
  };
  if(Object.values(ranges).some(items => items.some(item => item.start < offset && offset < item.end))){
    return {reason:'exclusion'};
  }
  const cards = bodies.map((part,index) => {
    const card = {...source,body:part};
    if(index === 1){ card.cardTitle = ''; card.foldTitle = ''; }
    Object.entries(ranges).forEach(([key,items]) => {
      const kept = items.filter(item => index === 0 ? item.end <= offset : item.start >= offset)
        .map(item => ({...item,start:item.start-(index ? offset : 0),end:item.end-(index ? offset : 0)}));
      if(kept.length) card[key] = kept;
      else delete card[key];
    });
    return card;
  });
  return {cards};
}

// Shared eligibility and source spans for ordinary paragraphs, in both render paths.
function isPlainSource(body,settings){
  return !settings.parallelNarrationOn
    && ![...(settings.nameRules || []),...(settings.keywordRules || [])].some(rule=>rule.enabled !== false)
    && !/[<>{}\[\]*_'"#|]/.test(body) && MosaicParser.normalizeQuotes(body)===body
    // DOM parsing drops NUL, so its source projection must use the full mapping path.
    && !/[\u0000\u00a0]/.test(body) && !/^\s*:/m.test(body);
}

function plainSourceEntries(ta,settings){
  if(!isPlainSource(ta.value,settings)) return null;
  return editorTextSnapshot(ta).lines.flatMap((line,raw)=>{
    const projection=line.trim(); if(!projection) return [];
    const start=line.indexOf(projection);
    return [{raw,rawEnd:raw,editable:true,renderLine:projection,projection,occurrence:0,
      sourceBounds:{start,end:start+projection.length},segmented:false}];
  });
}

function bodyEditDescriptor(ta,entry){
  return {type:'body',ta,raw:entry.raw,rawEnd:entry.rawEnd ?? entry.raw,
    rawLines:entry.rawLines,sourceSegments:entry.sourceSegments,sourceValue:ta.value,
    projection:entry.projection,softBreak:!!entry.softBreak,segmented:entry.segmented,
    sourceBounds:entry.sourceBounds || null};
}

const editorTextSnapshots = new WeakMap();

function editorTextSnapshot(ta){
  const body = ta.value; let snapshot = editorTextSnapshots.get(ta);
  if(!snapshot || snapshot.body !== body){
    const lines = body.split('\n'), offsets = []; let offset = 0;
    lines.forEach(line => { offsets.push(offset); offset += line.length + 1; }); offsets.push(offset);
    snapshot = {body,lines,offsets}; editorTextSnapshots.set(ta,snapshot);
  }
  return snapshot;
}
return Object.freeze({
attachEditorSource,
bodyEditDescriptor,
comparableFormattedText,
descriptorSelectionSource,
descriptorSourceRange,
editorOutputRuleExclusions,
editorParallelExclusions,
editorTextSnapshot,
findAllSourceRanges,
findSourceRange,
inlineEditProjection,
isPlainSource,
messengerEditSourceBounds,
outputRuleLineSettings,
outputSourceDisplayProjectionMap,
planCardSplit,
parallelCardCandidates,
parallelEditHunks,
replacePreviewBodyLine,
replaceSourceRange,
replaceVisibleUsingProjection,
setOutputRuleExclusions,
setParallelExclusions,
sourceDisplayEntries,
sourceSegmentEditBounds,
topLevelMap,
topLevelSourceEntries
});
}

function createPreviewSourceEdits(host){
function replaceLines(before, lines, first, last, replacement, message){
  if(replacement.join('\n') === lines.slice(first,last+1).join('\n')) return null;
  lines.splice(first,last-first+1,...replacement);
  return {before, after:lines.join('\n'), message};
}

function planCommentChange(body, descriptor, next){
  const lines = body.split('\n');
  if(lines[descriptor.raw] === undefined) return null;
  const end = Math.max(descriptor.raw, Number.isInteger(descriptor.rawEnd) ? descriptor.rawEnd : descriptor.raw);
  const group = next.split('\n').join('[BR]\n');
  return replaceLines(body,lines,descriptor.raw,end,group ? group.split('\n') : [],'미리보기에서 코멘트 수정.');
}

function planMemoChange(body, descriptor, next){
  const lines = body.split('\n');
  const end = descriptor.rawEnd ?? descriptor.raw;
  const rawLines = descriptor.rawLines || [descriptor.raw];
  const parts = next ? next.split('\n') : [''];
  const updated = parts.map((part,index) => {
    const original = lines[rawLines[index]], follows = index < parts.length-1;
    const core = original?.replace(/\[BR\]\s*$/i,'');
    const comment = core === undefined ? null : MosaicParser.parseBodyCommentLine(core);
    if(core !== undefined && MosaicParser.normalizeQuotes((comment?.content ?? core).trim()) === MosaicParser.normalizeQuotes(part.trim())
      && /\[BR\]\s*$/i.test(original) === follows) return original;
    const forcePrefix = index === 0 || MosaicParser.parseBodyCommentLine(part) || !MosaicParser.bodyCommentContinuation(part);
    const prefix = comment?.prefix ?? (forcePrefix ? ': ' : core?.match(/^[\t ]*/)[0] || '');
    return prefix + part.trim() + (follows ? '[BR]' : '');
  });
  const replacement = []; let index = 0;
  for(let raw=descriptor.raw;raw<=end;raw++){
    if(raw === rawLines[index]){
      if(index < updated.length) replacement.push(updated[index]);
      index++;
    }else replacement.push(lines[raw]);
  }
  replacement.push(...updated.slice(rawLines.length));
  return replaceLines(body,lines,descriptor.raw,end,replacement,'미리보기에서 메모 수정.');
}

function planSegmentChange(body, descriptor, next, context, lines){
  if(!descriptor.sourceSegments.length || descriptor.sourceSegments.some(segment =>
    !lines[segment.raw] || segment.start < 0 || segment.end > lines[segment.raw].length)) return null;
  const segments = descriptor.sourceSegments.map(segment => host.sourceSegmentEditBounds(lines[segment.raw],segment));
  const first = segments[0], last = segments.at(-1), parts = next.split('\n');
  const updated = parts.map((part,index) => {
    const segment = segments[index];
    const content = segment ? host.replacePreviewBodyLine(
      lines[segment.raw].slice(segment.start,segment.end),part,context.lineSettings(segment.raw,segment.start),descriptor.parallelEditHints?.[index]
    ) : part;
    const prefix = segment ? lines[segment.raw].slice(0,segment.start) : '';
    const suffix = index === parts.length-1 ? lines[last.raw].slice(last.end)
      : (segment && index < segments.length-1 ? lines[segment.raw].slice(segment.end).replace(/\[BR\]\s*$/i,'') : '')+'[BR]';
    return prefix+content+suffix;
  });
  const replacement = []; let index = 0;
  for(let raw = first.raw; raw <= last.raw; raw++){
    if(segments[index]?.raw === raw){
      if(index < updated.length) replacement.push(updated[index]);
      index++;
    }else replacement.push(lines[raw]);
  }
  replacement.push(...updated.slice(segments.length));
  return replaceLines(body,lines,first.raw,last.raw,replacement,'미리보기에서 연결된 문단 조각 수정.');
}

function planMultilineChange(body, descriptor, next, context, lines, end){
  const parts = next ? next.split('\n') : [];
  const rawLines = descriptor.rawLines || Array.from({length:end - descriptor.raw + 1}, (_,i) => descriptor.raw + i);
  const oldParts = rawLines.map(raw => lines[raw].replace(/\[BR\]\s*$/i, ''));
  const outputParts = oldParts.map((part,index)=>MosaicParser.applyOutputTextRules(part,context.lineSettings(rawLines[index])));
  const translationQuotes = MosaicParser.parallelSegments(outputParts.join(MosaicParser.SOFT_BREAK_TOKEN),context.settings,{softDialogueGroups:true})
    .filter(segment=>segment.original.includes(MosaicParser.SOFT_BREAK_TOKEN))
    .flatMap(segment=>{
      const display=MosaicParser.parallelDisplayParts(segment,context.settings);
      return display.translationQuoted && !display.reverse
        ? [[display.translationStart-1,display.translationStart],[display.translationStart+display.translation.length,display.translationStart+display.translation.length+1]] : [];
    });
  const quotes = MosaicState.isMessengerDialogueStyle(context.settings.dlgStyle) && context.dialogue
    ? MosaicParser.dialogueQuoteRanges(oldParts.join(MosaicParser.SOFT_BREAK_TOKEN),context.settings,{rawSource:true}) : null;
  let partOffset=0,outputOffset=0;
  const updated = parts.map((part,index) => {
    if(oldParts[index] === undefined) return part;
    const settings=context.lineSettings(rawLines[index]),start=partOffset,partEnd=start+oldParts[index].length;
    partOffset=partEnd+1;
    const quoteStart=outputOffset,quoteEnd=quoteStart+outputParts[index].length;
    outputOffset=quoteEnd+1;
    const lineSettings=translationQuotes.length ? {...settings,parallelTranslationQuoteRanges:translationQuotes
      .filter(range=>range[0]>=quoteStart && range[1]<=quoteEnd).map(range=>range.map(at=>at-quoteStart))} : settings;
    return host.replacePreviewBodyLine(oldParts[index],part,quotes
      ? {...lineSettings,messengerQuoteRanges:quotes.filter(range=>range[0]>=start && range[1]<=partEnd).map(range=>range.map(at=>at-start))} : lineSettings,descriptor.parallelEditHints?.[index]);
  }).map((part,index) => part + (index < parts.length - 1 ? '[BR]' : ''));
  const replacement = []; let index = 0;
  for(let raw=descriptor.raw;raw<=end;raw++){
    if(raw === rawLines[index]){
      if(index < updated.length) replacement.push(updated[index]);
      index++;
    }else replacement.push(lines[raw]);
  }
  replacement.push(...updated.slice(rawLines.length));
  return replaceLines(body,lines,descriptor.raw,end,replacement,'미리보기에서 같은 문단 줄바꿈 수정.');
}

function planBodyChange(body, descriptor, next, context){
  const lines=body.split('\n'),rawLine=lines[descriptor.raw];
  if(rawLine === undefined) return null;
  const end=Math.max(descriptor.raw,Number.isInteger(descriptor.rawEnd)?descriptor.rawEnd:descriptor.raw);
  if(context.inlineComment) return planMemoChange(body,descriptor,next);
  if(descriptor.sourceSegments) return planSegmentChange(body,descriptor,next,context,lines);
  if(!descriptor.segmented && (descriptor.softBreak || next.includes('\n')))
    return planMultilineChange(body,descriptor,next,context,lines,end);
  let updated;
  if(descriptor.segmented && descriptor.sourceBounds){
    const settings=context.lineSettings(descriptor.raw);
    const bounds=host.messengerEditSourceBounds(rawLine,descriptor.sourceBounds,settings);
    const segment=rawLine.slice(bounds.start,bounds.end);
    const nextSegment=host.replacePreviewBodyLine(segment,next,context.lineSettings(descriptor.raw,bounds.start),descriptor.parallelEditHints?.[0]);
    updated=rawLine.slice(0,bounds.start)+nextSegment+rawLine.slice(bounds.end);
  }else updated=host.replacePreviewBodyLine(rawLine,next,context.lineSettings(descriptor.raw),descriptor.parallelEditHints?.[0]);
  return replaceLines(body,lines,descriptor.raw,descriptor.raw,!descriptor.segmented && updated === '' ? [] : [updated],'미리보기에서 본문 수정.');
}
return Object.freeze({planBodyChange,planCommentChange});
}

return Object.freeze({createSourceMapping,createPreviewSourceEdits});
})();
