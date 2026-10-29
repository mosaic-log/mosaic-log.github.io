// 조각로그 v1.9.0 · 본문 문법·원문 위치 계산
// 개조 길잡이: 본문 문법과 원문 위치 계산을 담당한다. 현재 화면 값은 인자로 받는다.
// Dependencies: MosaicState
globalThis.MosaicParser = (() => {
'use strict';
// 조각로그 v1.9.0 본문 문법과 안전한 인라인 HTML 변환.
function escapeHTML(s){
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeTextHTML(s){
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s){
  return escapeHTML(s);
}

function normalizeHttpLinkUrl(value){
  const normalized = MosaicState.normalizeProtocolRelativeUrl(value);
  if(!normalized) return '';
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch(e){
    return '';
  }
}

function escapeCssUrl(s){
  const cssSafe = String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n\f]/g, '');
  return cssSafe.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeQuotes(text){
  return text
    .replace(/[\u201C\u201D\u301D\u301E\u2033]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035\u02BC\uFF07]/g, "'");
}

// 따옴표 정규화는 길이를 유지한다. 문자열 전체를 소문자로 바꾸면 İ처럼
// 길이가 늘어나는 문자 뒤의 위치가 어긋나므로 원래 문자열에서 범위를 찾는다.
function literalMatchRanges(text, query, caseInsensitive = true){
  const source = normalizeQuotes(String(text));
  const needle = normalizeQuotes(String(query));
  if(!needle) return [];
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, caseInsensitive ? 'giu' : 'gu');
  return Array.from(source.matchAll(pattern), match => ({start:match.index,end:match.index + match[0].length}));
}

function stripMarkers(value){
  return String(value).replace(/__|\*/g, '');
}

// 메모 시작 줄만 읽는다. [BR] 연속 줄은 별도 문맥으로 연결하고 다른 문법은 해석하지 않는다.
function parseBodyCommentLine(value){
  const match = /^([\t ]*(?:\[C\][\t ]*)?:[\t ]*)([^\r\n]*)\r?$/i.exec(String(value));
  return match ? {prefix:match[1], content:match[2]} : null;
}

// 인용처럼 [BR] 다음 평문을 이어받되, 독립 구조 요소는 다음 블록으로 남긴다.
// 연속 줄에도 :를 썼다면 표식은 한 번만 소비한다.
function bodyCommentContinuation(value){
  const source = String(value), comment = parseBodyCommentLine(source);
  if(comment) return comment.content.trim() ? comment : null;
  const text = source.trim().replace(/^\[C\]\s*/i, '');
  if(!text || /^(?:>>|<<|>(?!>)|#{1,4}\s+|\[IMG\s+)/i.test(text)
    || /^\[(?:HR[2-4]?|GAP)\]$/i.test(text) || /^\[\/?접기(?:\s+.+?)?\]$/.test(text)
    || /^\[\s*(.+\|.+)\s*\]$/.test(text)) return null;
  return {prefix:'',content:source};
}

// 출력 치환·화자 감지·미리보기 매핑이 같은 메모 범위를 사용한다.
function bodyCommentLineContexts(value){
  const source = String(value), lines = source.split(/\n|\uE200/);
  let start = 0, continuing = false;
  return lines.map(line => {
    const comment = parseBodyCommentLine(line);
    const context = comment || (continuing ? bodyCommentContinuation(line) : null);
    const entry = context ? {...context,start,end:start+line.length} : null;
    if(line.trim() && comment?.content.trim() !== ''){
      continuing = !!context && (/\[BR\]\s*$/i.test(line) || source[start+line.length] === '\uE200');
    }
    start += line.length+1;
    return entry;
  });
}

function formatMatchContent(format, match){
  // ***글***에서 강조만 해제할 때 굵기는 남겨 **글**로 되돌린다.
  if(format === 'emphasis' && match[0].startsWith('***')) return `**${match[1]}**`;
  return match[1] !== undefined ? match[1] : match[2];
}

// 따옴표 위치는 정규화 전후에 같다. 단어의 apostrophe와 중첩 인용을 같은
// 순회로 판정해 병행·문단 분리·메신저·편집 좌표가 서로 다른 쌍을 잡지 않게 한다.
// 닫히지 않은 바깥 인용은 표시하되 내부의 일부만 새 병행 쌍으로 삼지 않는다.
function quotedTextRanges(value, includeNested = false){
  const source = normalizeQuotes(String(value)), stack = [], ranges = [];
  const latinWord = char => /[\p{Script=Latin}\p{N}]/u.test(char || '');
  const flushOpen = end => {
    if(stack.length) ranges.push({start:stack[0].start,end,quote:stack[0].quote,closed:false,depth:0});
    stack.length = 0;
  };
  for(let i=0;i<source.length;i++){
    const char=source[i];
    if(char==='\r' || char==='\n'){flushOpen(i);continue;}
    if(char!=="'" && char!=='"') continue;
    let slashes=0;
    for(let at=i-1;at>=0 && source[at]==='\\';at--) slashes++;
    if(slashes%2) continue;
    const before=source[i-1] || '',after=source[i+1] || '',top=stack.at(-1);
    if(char==="'"){
      if(latinWord(before) && latinWord(after)) continue; // can't, we're, l'homme
      if(top){
        const following=source.slice(i+1,i+20);
        const leading=/^(?:em|cause|til|tis|twas|twere|twill|twould|bout|round|nuff)\b(?!')/i.test(following);
        if(!latinWord(before) && leading) continue;
        const possessive=/[sS0-9]/.test(before) && /^[\t ]+\p{L}/u.test(following);
        if(possessive && (top.quote!=="'" || /[\t ]/.test(source.slice(Math.max(top.start+1,i-128),i)))) continue;
      }
    }
    if(!top || top.quote!==char){stack.push({start:i,quote:char});continue;}
    // 같은 종류도 `He said "go".`처럼 단어 앞에서 새로 열고, 단어 뒤에서 닫는다.
    const opensInside=/[\s([{<:;=—–-]/.test(before) && /[\p{L}\p{N}([{]/u.test(after);
    if(opensInside){stack.push({start:i,quote:char});continue;}
    const opened=stack.pop(),depth=stack.length;
    if(includeNested || depth===0) ranges.push({...opened,end:i+1,closed:true,depth});
  }
  flushOpen(source.length);
  return ranges.sort((a,b)=>a.start-b.start || b.end-a.end);
}

function parallelDialogueSegments(line){
  const source = normalizeQuotes(String(line)), segments = [];
  let cursor=0;
  for(const quote of quotedTextRanges(source)){
    if(!quote.closed || quote.start<cursor) continue;
    const group=/^([\t ]*)([（(])([^()（）\r\n]+)([)）])/.exec(source.slice(quote.end));
    if(!group || (group[2]==='(' ? group[4]!==')' : group[4]!=='）')) continue;
    const end=quote.end+group[0].length;
    segments.push({start:quote.start,end,original:source.slice(quote.start,quote.end),
      betweenOriginalAndGroup:group[1],translationGroup:group[2]+group[3]+group[4]});
    cursor=end;
  }
  return segments;
}

function parallelDialogueParts(line){
  const source = normalizeQuotes(String(line)).trim();
  const segments = parallelDialogueSegments(source);
  return segments.length === 1 && segments[0].start === 0 && segments[0].end === source.length
    ? segments[0]
    : null;
}

// 말풍선의 대사 구분자만 숨긴다. 병행 번역 안의 인용 부호는 실제 문구로 보존한다.
function dialogueQuoteRanges(value, settings = {}, options = {}){
  const source=normalizeQuotes(String(value)),ranges=[];
  // 대사 병행 OFF·나레이션 ON에서도 번역 괄호는 독립 문단으로 보존된다.
  const narrationParallel=parallelKindEnabled('narration',settings);
  const pairs=settings.parallelTranslationSoft || narrationParallel ? parallelDialogueSegments(source) : [];
  for(const quote of quotedTextRanges(source)){
    if(!quote.closed || quote.quote!=='"') continue;
    const insideTranslation=pairs.some(pair=>quote.start>=pair.start+pair.original.length+pair.betweenOriginalAndGroup.length && quote.end<=pair.end);
    const before=source.slice(0,quote.start).trim(),after=source.slice(quote.end).trim();
    // 화면의 독립 번역 괄호는 인용부호를 보여 준다. 원문 편집 범위를 넓힐 때는
    // 같은 모양의 원문에서 실제 대사로 분리된 인용부호까지 함께 처리해야 한다.
    const translationParagraph=!options.rawSource && narrationParallel
      && ((before==='(' && after===')') || (before==='（' && after==='）'));
    if(!insideTranslation && !translationParagraph)ranges.push([quote.start,quote.start+1],[quote.end-1,quote.end]);
  }
  return ranges;
}

function parallelKindEnabled(kind, settings = {}){
  if(settings.parallelTranslationLayout === 'off') return false;
  return kind === 'narration' ? settings.parallelNarrationOn === true
    : settings.parallelDialogueOn !== false && settings.parallelTranslationSoft !== false;
}

// 문법을 추가하지 않는다. 줄/BR 끝과 다음 대사 앞의 서술 조각 끝을 같은 경계로 본다.
function parallelSegments(value, settings = {}, options = {}){
  const source = normalizeQuotes(String(value)), result = [];
  const comments = bodyCommentLineContexts(source);
  // 이미 출력된 [BR] 대사의 편집 투영에서만 연결된 쌍을 함께 찾는다.
  // 일반 본문 해석·나레이션 분할·병행 제외 후보의 기존 경계는 유지한다.
  const softDialogues = !options.softDialogueGroups || settings.bodyCommentLiteral || !source.includes(SOFT_BREAK_TOKEN) ? [] : parallelDialogueSegments(source)
    .filter(segment=>segment.original.includes(SOFT_BREAK_TOKEN) || segment.translationGroup.includes(SOFT_BREAK_TOKEN))
    .filter(segment=>!comments.some(comment=>comment && comment.start<segment.end && comment.end>segment.start))
    .map(segment=>({...segment,kind:'dialogue'}));
  result.push(...softDialogues);
  let base = 0;
  source.split(/\n|\uE200/).forEach((line,index) => {
    const sourceLength=line.length;
    if(settings.bodyCommentLiteral || comments[index]){base+=sourceLength+1;return;}
    line=line.replace(/\[BR\][ \t]*$/i,'');
    const dialogues = parallelDialogueSegments(line).map(segment => ({...segment,kind:'dialogue'}));
    result.push(...dialogues.map(segment => ({...segment,start:base+segment.start,end:base+segment.end})));
    if(settings.parallelNarrationOn !== true){base+=sourceLength+1;return;}
    const quotes=quotedTextRanges(line);
    const boundaries=quotes.filter(quote=>quote.closed && quote.quote==='"'
      && !dialogues.some(segment=>quote.start>segment.start && quote.end<=segment.end)).map(quote=>{
      const mark=/(?:(>>|<<)|\[([^\[\]\n]{1,24})\])\s*$/.exec(line.slice(0,quote.start));
      const known=mark && (mark[1] || (settings.extraChars || []).some(person=>[person.name,person.sourceName]
        .some(name=>String(name || '').trim().toLowerCase()===mark[2].trim().toLowerCase())));
      return quote.start-(known ? mark[0].length : 0);
    });
    boundaries.push(line.length);
    let contentStart = line.length-line.trimStart().length;
    const prefix = line.slice(contentStart).match(/^(?:\[C\]\s*)?(?:\{#?[0-9a-f]{3}(?:[0-9a-f]{3})?\}\s*)?(?:(?:>>|<<)\s*)?/i);
    contentStart += prefix?.[0].length || 0;
    const named = line.slice(contentStart).match(/^\[([^\[\]\n]{1,24})\]\s*/);
    if(named && (settings.extraChars || []).some(person => [person.name,person.sourceName].some(name => String(name || '').trim().toLowerCase() === named[1].trim().toLowerCase()))) contentStart += named[0].length;
    if(/^[>#\[]/.test(line.slice(contentStart))){base+=sourceLength+1;return;}
    for(const boundary of boundaries){
      const ending = /([（(])([^()（）\r\n]+)([)）])[ \t]*$/.exec(line.slice(0,boundary));
      if(ending && ((ending[1] === '(' && ending[3] === ')') || (ending[1] === '（' && ending[3] === '）'))){
        let start=contentStart;
        const end = ending.index+ending[0].trimEnd().length;
        // 문장 안의 작은따옴표 속마음은 나레이션의 일부다. 그 뒤로 시작점을
        // 자르면 앞부분이 남은 채 번역 전체가 삽입된다. 독립 속마음·번역 쌍은
        // 아래 dialogues 경계로 분리하며 영어 단어의 apostrophe도 자르지 않는다.
        if(quotes.some(quote=>!quote.closed && quote.start<ending.index))continue;
        quotes.filter(quote=>quote.closed && quote.quote==='"' && quote.end<=ending.index)
          .forEach(quote=>{start=Math.max(start,quote.end);});
        dialogues.forEach(segment => { if(segment.end <= ending.index) start = Math.max(start,segment.end); });
        while(start < ending.index && /\s/.test(line[start])) start++;
        const original = line.slice(start,ending.index).trimEnd();
        if(original && /[\p{L}\p{N}]/u.test(original) && !dialogues.some(segment => segment.start < end && segment.end > ending.index)){
          result.push({kind:'narration',start:base+start,end:base+end,original,
            betweenOriginalAndGroup:line.slice(start+original.length,ending.index),translationGroup:ending[1]+ending[2]+ending[3]});
        }
      }
    }
    base += sourceLength+1;
  });
  return result.filter(segment=>!softDialogues.some(pair=>pair!==segment && pair.start<segment.end && pair.end>segment.start))
    .sort((a,b)=>a.start-b.start);
}

function parallelSegmentKey(segment){
  return JSON.stringify([segment.kind || 'dialogue',segment.original,segment.betweenOriginalAndGroup,segment.translationGroup]);
}

function resolveParallelSegment(segment, settings = {}){
  const context = settings.parallelContext;
  if(context){
    const key = parallelSegmentKey(segment);
    const at = context.items.findIndex((item,index) => index >= context.cursor && parallelSegmentKey(item) === key);
    if(at >= 0){ context.cursor=at+1; return {...segment,excluded:context.items[at].excluded}; }
  }
  const match = settings.parallelResolvedCandidates?.find(item => item.start === segment.start && parallelSegmentKey(item) === parallelSegmentKey(segment));
  return match ? {...segment,excluded:match.excluded} : segment;
}

function parallelOutputCandidates(value, settings = {}, projection){
  const source=String(value), output=projection || outputTextProjection(source,settings);
  const base=settings.outputRuleSourceOffset || 0;
  return parallelSegments(output.text,outputRuleSettings(settings)).filter(segment=>parallelKindEnabled(segment.kind,settings)).flatMap(segment=>{
    const spans=output.spans?.slice(segment.start,segment.end);
    if(!spans?.length)return [];
    const start=spans.reduce((min,span)=>Math.min(min,span.start),Infinity),end=spans.reduce((max,span)=>Math.max(max,span.end),0);
    const lineStart=output.text.lastIndexOf('\n',Math.max(0,segment.start-1))+1;
    if(settings.parallelBodyOnly && /^\s*(?:\[C\]\s*)?(?:>(?!>)|#|\[(?:IMG\s|HR[2-4]?\]|GAP\]|\/?접기(?:\s|\])))/i.test(output.text.slice(lineStart)))return [];
    const text=source.slice(start,end);
    const excluded=(settings.parallelExclusions || []).some(item=>item.kind===segment.kind && item.start===base+start && item.end===base+end && item.text===text);
    return [{...segment,sourceStart:base+start,sourceEnd:base+end,text,excluded}];
  });
}

function parallelHidesDialogueQuotes(settings){
  if(typeof settings.hideDialogueQuotes === 'boolean') return settings.hideDialogueQuotes;
  return settings.dlgStyle === 'messenger2' || settings.dlgStyle === 'messenger';
}

// 출력과 편집 투영이 같은 자동/이어쓰기/아래쓰기 기준을 사용한다.
function parallelTranslationPlacement(settings){
  const selected = settings.parallelTranslationLayout || 'auto';
  if(selected === 'off') return 'plain';
  if(selected === 'inline' || selected === 'stack') return selected;
  return ['softlight', 'highlight'].includes(settings.dlgStyle) ? 'inline' : 'stack';
}

function parallelDisplayParts(segment, settings = {}){
  const enabled = !segment.excluded && parallelKindEnabled(segment.kind || 'dialogue',settings);
  const reverse = enabled && settings.parallelTranslationOrder === 'translation';
  const hide = enabled && settings.parallelTranslationBrackets === 'hide';
  const quote = segment.kind === 'narration' ? '' : segment.original[0];
  const original = quote ? segment.original.slice(1,-1) : segment.original;
  const inner = segment.translationGroup.slice(1,-1), rawTranslation = inner.trim();
  // 병행 대사의 보조 문장은 표시 순서와 무관하게 바깥 큰따옴표를 생략한다.
  // 주 대사의 구분자는 표현 방식에 따르며 내부 인용·원문은 보존한다.
  // 생략한 기호만큼 편집 좌표도 안쪽으로 옮겨 숨긴 입력 구분자를 유지한다.
  const wrapper = enabled && quote === '"'
    ? quotedTextRanges(rawTranslation).find(range=>range.closed && range.quote==='"' && range.start===0 && range.end===rawTranslation.length)
    : null;
  const translation = wrapper ? rawTranslation.slice(1,-1) : rawTranslation;
  const open = segment.start+segment.original.length+segment.betweenOriginalAndGroup.length;
  const leading = inner.length-inner.trimStart().length;
  const translationStart = open+1+leading+(wrapper ? 1 : 0);
  const translationGroup = wrapper
    ? segment.translationGroup.slice(0,1+leading)+translation+segment.translationGroup.slice(1+leading+rawTranslation.length)
    : segment.translationGroup;
  return {reverse,hide,quote,original,translation,translationStart,open,translationQuoted:!!wrapper,
    primary:reverse ? quote+translation+quote : segment.original,
    secondary:reverse ? segment.translationGroup[0]+original+segment.translationGroup.at(-1) : translationGroup,
    between:reverse || hide ? ' ' : segment.betweenOriginalAndGroup};
}

// 출력 순서를 뒤집어도 원문 인덱스는 그대로 남긴다. 새 서술 문법은 인식하지 않는다.
function parallelTextProjection(value, settings = {}){
  const source = normalizeQuotes(String(value));
  const text = [], spans = [];
  const copy = (start,end,part = null,editable = true) => {
    for(let at=start;at<end;at++){text.push(source[at]);spans.push({start:at,end:at+1,part,editable});}
  };
  const generated = (char,start,end,part) => {text.push(char);spans.push({start,end,part,editable:false});};
  let cursor=0;
  parallelSegments(source,settings,{softDialogueGroups:true}).filter(segment=>parallelKindEnabled(segment.kind,settings)).map(segment=>resolveParallelSegment(segment,settings)).forEach((segment,index) => {
    if(segment.excluded) return;
    const parts = parallelDisplayParts(segment,settings), key='pair'+index;
    // 직접 편집에서는 원문 우선 메신저의 숨긴 대사 구분자도 같은 좌표로 보호한다.
    if(!parts.reverse && !parts.hide && !parts.translationQuoted && !settings.parallelEditProjection) return;
    copy(cursor,segment.start);
    const original=[segment.start+(parts.quote ? 1 : 0),segment.start+segment.original.length-(parts.quote ? 1 : 0),key+':original'];
    const translation=[parts.translationStart,parts.translationStart+parts.translation.length,key+':translation'];
    const first=parts.reverse?translation:original, second=parts.reverse?original:translation;
    const showQuote=parts.quote && !(parallelHidesDialogueQuotes(settings) && parts.quote==='"');
    if(showQuote)generated(parts.quote,first[0],first[0],key+':shell');
    copy(...first);
    if(showQuote)generated(parts.quote,first[1],first[1],key+':shell');
    const mode = parts.quote === "'" ? settings.parallelTranslationLayout === 'stack' ? 'stack' : 'inline'
      : parallelTranslationPlacement(settings);
    for(const char of mode === 'stack' ? ' ' : parts.between)generated(char,first[1],first[1],key+':shell');
    if(!parts.hide)generated(segment.translationGroup[0],second[0],second[0],key+':shell');
    // 원문 우선·괄호 표시에서는 출력도 괄호 안의 원래 여백을 보존한다.
    // 숨긴 따옴표와 여백을 내용 편집 범위로 섞지 않고 같은 표시 좌표를 만든다.
    if(!parts.reverse && !parts.hide)
      copy(parts.open+1,parts.translationStart-(parts.translationQuoted ? 1 : 0),key+':shell',false);
    copy(...second);
    if(!parts.reverse && !parts.hide)
      copy(parts.translationStart+parts.translation.length+(parts.translationQuoted ? 1 : 0),segment.end-1,key+':shell',false);
    if(!parts.hide)generated(segment.translationGroup.at(-1),second[1],second[1],key+':shell');
    cursor=segment.end;
  });
  copy(cursor,source.length);
  return {text:text.join(''),spans,changed:cursor>0};
}

function parallelSourceBounds(value,bounds,settings = {}){
  const result={...bounds};
  for(const segment of parallelSegments(value,settings).filter(segment=>parallelKindEnabled(segment.kind,settings))){
    const parts=parallelDisplayParts(segment,settings);
    if(!parts.reverse && !parts.hide && !parts.translationQuoted) continue;
    if(result.start<=segment.start+(parts.quote ? 1 : 0) && result.end>=parts.translationStart+parts.translation.length){
      result.start=Math.min(result.start,segment.start);
      result.end=Math.max(result.end,segment.end);
    }
  }
  return result;
}

function normalizeStandaloneHr(text){
  return String(text).split('\n').map(line =>
    /^[\t ]*---[\t ]*$/.test(line) ? '[HR]' : line
  ).join('\n');
}

function normalizeBodyHrMarkers(text){
  return normalizeStandaloneHr(text).split('\n').map(line =>
    line.replace(/^([\t ]*\[(?:HR(?:[2-4])?|GAP)\])(?=[\t ]*\S)/i, '$1\n')
  ).join('\n');
}

function normalizedBodyHrOffset(text, offset){
  const source = String(text);
  const safeOffset = Math.max(0, Math.min(Number(offset) || 0, source.length));
  const prefix = source.slice(0, safeOffset);
  const normalizedPrefix = normalizeBodyHrMarkers(prefix);
  let mapped = normalizedPrefix.length;
  const lineStart = source.lastIndexOf('\n', Math.max(0, safeOffset - 1)) + 1;
  let lineEnd = source.indexOf('\n', safeOffset);
  if(lineEnd < 0) lineEnd = source.length;
  const line = source.slice(lineStart, lineEnd);
  const marker = line.match(/^([\t ]*\[(?:HR(?:[2-4])?|GAP)\])(?=[\t ]*\S)/i);
  const prefixAlreadySplit = normalizedPrefix.length > normalizeStandaloneHr(prefix).length;
  if(marker && safeOffset >= lineStart + marker[1].length && !prefixAlreadySplit) mapped++;
  return mapped;
}

function processInline(text, emphasisColor, options){
  const literalSingleQuotes = !!(options && options.literalSingleQuotes);
  const color = /^#[0-9A-Fa-f]{6}$/.test(emphasisColor || '') ? emphasisColor : '#747474';
  const inlineTypographyLock = `font-size:inherit; line-height:inherit; font-family:inherit; -webkit-text-size-adjust:100%; text-size-adjust:100%;`;
  const inheritedColorLock = `color:inherit; -webkit-text-fill-color:inherit;`;
  const emphasisStyle = `color:${color}; -webkit-text-fill-color:${color}; font-style:italic; font-weight:inherit; ${inlineTypographyLock}`;
  const strongStyle = `${inheritedColorLock} font-style:inherit; font-weight:700; ${inlineTypographyLock}`;
  const emphasisOuterStyle = `${emphasisStyle} margin-right:0.08em;`;
  const strongEmphasisOuterStyle = `${emphasisStyle} margin-right:0.12em;`;
  const thoughtStyle = `color:${color}; -webkit-text-fill-color:${color}; font-style:normal; font-weight:inherit; ${inlineTypographyLock}`;
  const em = (content, combined = false) => `<em style='${combined ? strongEmphasisOuterStyle : emphasisOuterStyle}'><span style='${emphasisStyle}'>${content}</span></em>`;
  const strong = content => `<strong style='${strongStyle}'>${content}</strong>`;
  const thought = content => `<span data-mosaic-thought='true' style='${thoughtStyle}'>'${content}'</span>`;
  const source=normalizeQuotes(String(text));
  let content='',cursor=0;
  if(!literalSingleQuotes && source.includes("'")) for(const quote of quotedTextRanges(source,true)){
    if(!quote.closed || quote.quote!=="'" || quote.end-quote.start<=2 || quote.start<cursor) continue;
    content+=escapeTextHTML(source.slice(cursor,quote.start))+thought(escapeTextHTML(source.slice(quote.start+1,quote.end-1)));
    cursor=quote.end;
  }
  content+=escapeTextHTML(source.slice(cursor));
  return content
    .replace(/\*\*\*([^*\n]+?)\*\*\*/g, (m, inner) => strong(em(inner, true)))
    .replace(/\*\*(.+?)\*\*/g, (m, inner) => strong(inner))
    .replace(/__(.+?)__/g, (m, inner) => strong(inner))
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, (m, inner) => em(inner));
}

const SOFT_BREAK_TOKEN = '\uE200';

function processBodyInline(text, emphasisColor, options){
  const content = options && options.literalText ? escapeTextHTML(String(text)) : processInline(text, emphasisColor, options);
  const mode = MosaicState.normalizeSoftBreakSpacing(options && options.softBreakSpacing);
  if(mode === 'normal') return content.split(SOFT_BREAK_TOKEN).join('<br>');
  const extra = mode === 'wide' ? 0.55 : 0.2;
  const softBreak = `<br><span data-mosaic-generated='true' aria-hidden='true' style='display:block; width:100%; height:${extra}em; overflow:hidden; font-size:inherit; line-height:0;'></span>`;
  return content.split(SOFT_BREAK_TOKEN).join(softBreak);
}

// 출력 전용 치환. 원문/저장 모델은 건드리지 않고, 필요할 때만 출력 글자의
// 원문 범위를 함께 만든다. 뒤 규칙은 앞 규칙의 결과에 추가 순서대로 적용한다.
function hasBatchim(word){
  const normalized = (word || '').trim();
  if(/^(?:char|user)$/i.test(normalized)) return false;
  // 단일 알파벳의 한글 이름만 판정한다. L/M/N/R은 엘/엠/엔/알 기준이며
  // Avatar 같은 단어·약어의 끝 글자에는 이 발음 규칙을 적용하지 않는다.
  if(/^[a-z]$/i.test(normalized)) return /^[lmnr]$/i.test(normalized);
  const code = normalized.slice(-1).charCodeAt(0);
  return code >= 0xAC00 && code <= 0xD7A3 ? (code - 0xAC00) % 28 !== 0 : null;
}

function nameRulePattern(from){
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const combos = hasBatchim(from) === true ? '이가|이는|이를|이와|' : '';
  return new RegExp(escaped + '(?:(' + combos + '은|는|이|가|을|를|과|와)(?=$|[^가-힣]))?', 'g');
}

function nameRuleReplacement(to, josa){
  const forms = {은:['은','는'],는:['은','는'],이:['이','가'],가:['이','가'],을:['을','를'],를:['을','를'],과:['과','와'],와:['과','와']};
  const batchim = hasBatchim(to);
  if(!josa || batchim === null) return to + (josa || '');
  return to + (josa.length === 2 && batchim ? josa : forms[josa.slice(-1)][batchim ? 0 : 1]);
}

function outputTextProjection(value, settings, trackSource = true){
  let text = String(value);
  const source = text, offset = settings.outputRuleSourceOffset || 0;
  const exclusions = settings.outputRuleExclusions || [];
  const collect = settings.trackOutputRuleOccurrences === true;
  const occurrences = [];
  const needsSpans = trackSource || collect || exclusions.length > 0;
  let spans = needsSpans ? Array.from({length:text.length}, (_,i) => ({start:i,end:i+1})) : null;
  const names = (settings.nameRules || []).map((rule,i) => ({...rule,id:rule.id || `nr_legacy_${i}`})).filter(rule => rule.enabled !== false && rule.from);
  const keywords = (settings.keywordRules || []).map((rule,i) => ({...rule,id:rule.id || `kr_legacy_${i}`})).filter(rule => rule.enabled !== false && rule.from);
  for(const [rules,name] of [[names,true],[keywords,false]]){
    for(const rule of rules){
      if(!text.includes(rule.from)) continue;
      // 화자 이름표는 원래 인물의 식별자로 남긴다. 표시 이름은 출력 설정에서
      // 바꾸므로 두 인물을 같은 이름으로 바꿔도 각각의 색상을 잃지 않는다.
      const speakers = [];
      // 카드 코멘트와 마찬가지로 작성자 메모의 원문·표식은 치환하지 않는다.
      const comments = settings.bodyCommentLiteral ? [{start:0,end:text.length}]
        : bodyCommentLineContexts(text).filter(Boolean);
      if(name && (settings.extraChars || []).length){
        const markers = /\[([^\[\]\n]{1,24})\]\s*(?=["“‘'])/g;
        let marker;
        while((marker = markers.exec(text)) !== null){
          const key = marker[1].trim().toLowerCase();
          if(settings.extraChars.some(char => String(char.sourceName || char.name).trim().toLowerCase() === key)){
            speakers.push({start:marker.index + 1,end:marker.index + 1 + marker[1].length});
          }
        }
      }
      const isProtected = (start,end) => speakers.some(span => start < span.end && end > span.start)
        || comments.some(span => start < span.end && end > span.start);
      const pattern = name ? nameRulePattern(rule.from)
        : new RegExp(rule.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),'g');
      if(!needsSpans){
        text = text.replace(pattern, (match,josa,offset) => {
          const at = name ? offset : josa;
          if(isProtected(at,at+match.length)) return match;
          return name ? nameRuleReplacement(rule.to,josa) : rule.to;
        });
        continue;
      }
      let nextText = '', nextSpans = [], cursor = 0, match;
      while((match = pattern.exec(text)) !== null){
        if(isProtected(match.index,match.index + match[0].length)) continue;
        nextText += text.slice(cursor,match.index);
        for(let i=cursor;i<match.index;i++) nextSpans.push(spans[i]);
        const first = spans[match.index], last = spans[match.index+match[0].length-1];
        const range = {start:first.start,end:last.end,
          editStart:first.editStart ?? first.start,editEnd:last.editEnd ?? last.end};
        const nameEnd = spans[match.index + rule.from.length - 1];
        const nameRange = {...range,end:nameEnd.end};
        const josaStart = spans[match.index + rule.from.length];
        const josaRange = josaStart ? {...range,start:josaStart.start} : range;
        const kind = name ? 'name' : 'keyword';
        // 이름의 예외는 이름 자체에 묶는다. 조사나 바깥 서식이 바뀌어도 같은 이름이다.
        const occurrenceRange = name ? nameRange : range;
        const sourceText = source.slice(occurrenceRange.start,occurrenceRange.end);
        const excluded = exclusions.some(item => item.kind === kind && item.ruleId === rule.id
          && item.from === rule.from && item.to === rule.to && item.start === offset+occurrenceRange.start
          && item.end === offset+occurrenceRange.end && item.text === sourceText);
        const replacement = excluded ? match[0] : name ? nameRuleReplacement(rule.to,match[1]) : rule.to;
        if(collect && (excluded || replacement !== match[0])) occurrences.push({
          kind,ruleId:rule.id,from:rule.from,to:rule.to,start:offset+occurrenceRange.start,end:offset+occurrenceRange.end,
          text:sourceText,matched:match[0],replacement,excluded,deleted:!excluded && replacement === ''
        });
        nextText += replacement;
        for(let i=0;i<replacement.length;i++) nextSpans.push(excluded ? spans[match.index+i]
          : name ? i < rule.to.length ? nameRange : josaRange : range);
        cursor = match.index + match[0].length;
      }
      nextText += text.slice(cursor);
      for(let i=cursor;i<spans.length;i++) nextSpans.push(spans[i]);
      text = nextText;
      spans = nextSpans;
    }
  }
  return {text,spans:trackSource || collect ? spans : null,...(collect ? {occurrences} : {})};
}

function applyOutputTextRules(value, settings){
  return outputTextProjection(value,settings,false).text;
}

function outputRuleSettings(settings){
  if(settings.outputRulesProjected || !(settings.nameRules || []).some(rule => rule.enabled !== false)) return settings;
  const exactName = value => {
    let result = value;
    (settings.nameRules || []).forEach(rule => {
      if(rule.enabled !== false && String(result || '').trim() === rule.from) result = rule.to;
    });
    return result;
  };
  return {...settings,outputRulesProjected:true,
    charName:exactName(settings.charName),userName:exactName(settings.userName),
    subChar:exactName(settings.subChar),subUser:exactName(settings.subUser),
    extraChars:(settings.extraChars || []).map(char => ({...char,sourceName:char.name,name:exactName(char.name) }))};
}
return Object.freeze({
...Object.freeze({parseBodyCommentLine,
bodyCommentContinuation,
bodyCommentLineContexts,
quotedTextRanges,
dialogueQuoteRanges,
parallelSegments,
parallelKindEnabled,
parallelOutputCandidates,
resolveParallelSegment,
parallelDisplayParts,
parallelTranslationPlacement,
parallelTextProjection,
parallelSourceBounds,
applyOutputTextRules,
outputRuleSettings,
outputTextProjection,
SOFT_BREAK_TOKEN,
formatMatchContent,
normalizeBodyHrMarkers,
normalizeQuotes,
literalMatchRanges,
normalizeStandaloneHr,
stripMarkers}),
escapeAttr,
escapeCssUrl,
escapeHTML,
escapeTextHTML,
normalizeHttpLinkUrl,
normalizedBodyHrOffset,
parallelDialogueParts,
processBodyInline,
processInline
});
})();
