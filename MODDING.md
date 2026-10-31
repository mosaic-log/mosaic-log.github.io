# 직접 개조 안내

HTML·CSS·JS를 수정하고 `index.html`을 다시 열면 됩니다. 설치·빌드·번들 생성은 없으며, 저장소의 코드와 실행하는 코드가 같습니다. 구조를 바꿀 때의 유지보수 원칙은 [AGENTS.md](AGENTS.md)를 참고합니다.

## 수정할 파일 찾기

| 바꾸려는 부분 | 파일과 검색할 이름 |
|---|---|
| 디자인 기본값·허용 타입·범위 | `state.js` → `DEFAULT_STYLE`, `STYLE_SCHEMA` |
| 본문 문법 해석 | `parser.js` |
| 검색·대치의 문구 매칭 | `parser.js` → `literalMatchRanges` |
| 표시 글자와 원문 위치의 대응·제외 범위 | `ui-source.js` → `createSourceMapping` |
| 출력 HTML·인용선 등 출력 간격 | `renderer.js` → `buildParagraph`, `buildProfileBlock`, `buildCard` |
| 작업 화면의 모양 | `styles.css`, `index.html` |
| 카드 입력·추가·삭제·이동·커서 분할 | `ui-editor.js` → `createCardEditors`, `splitCardAtCursor` |
| 카드 분할의 원문·제외 범위 계산 | `ui-source.js` → `planCardSplit` |
| 접힌 본문 입력의 카드·코멘트 개수 | `ui-editor.js` → `syncBodyInputCount`, `renumberCards` |
| 이름·키워드 규칙의 직접 수정 | `ui.js` → `createOutputRuleEditing`, `renderReplacementRuleItems` |
| 접힌 카드 구성의 요약 | `ui.js` → `syncDesignSummaryText` |
| 전체 화면 입력·찾기 | `ui-editor.js` → `createFullscreenEditor` |
| 미리보기 찾기·바꾸기 | `ui-preview-view.js` → `createPreviewSearch` |
| 미리보기 클릭·직접 편집·선택 서식 | `ui-preview-edit.js` → `createPreviewInteractions` |
| 본문·메모·코멘트 편집의 원문 변경안 계산 | `ui-source.js` → `createPreviewSourceEdits` |
| 출력·저장 설정 읽기 | `ui.js` → `createSettingsReader` |
| 컨트롤 표시·활성화·동기화 캐시 | `ui.js` → `createControlSync` |
| 미리보기 도구모음·접기·전체 화면 배치 | `ui-preview-view.js` → `createPreviewLayout` |
| 모바일 본문·미리보기 이동 | `ui-preview-view.js` → `createMobilePanelNavigation` |
| 보관함·테마·프리셋·크레딧 | `ui-library.js` → `createLibrary`, `createCredit` |
| 변경 후 렌더·저장·히스토리 순서 | `app.js` → `changes`, `replaceWork` |
| 저장 키·직렬화·복원 | `storage.js`, `state.js` |

담당 파일의 `create...` 함수가 구현이고, `ui.js`의 같은 이름 호출이 기능 사이의 연결 목록입니다. 예를 들어 카드 입력은 `ui-editor.js`의 `createCardEditors(host)`에서 수정하고, 다른 기능과의 연결은 `ui.js`의 `createCardEditors({...})`에서 수정합니다.

좁은 헤더에서 아래줄로 내려가는 `Mosaic Log`는 `styles.css`의 `@container sidebar (max-width: 410px)` 안에서 오른쪽으로 1.5px 옮겨 광학 정렬합니다. 영문 이름만 시각적으로 이동하며 한글 제목·버전·줄 높이는 유지합니다.

한글 제목의 `조`는 `index.html`에서 `.brandInitial`로 감싸고 오른쪽에 0.5px 여백을 둡니다. `로`는 `.brandLogInitial`로 감싸고 오른쪽에 0.25px 여백을 둡니다. `조·각`, `로·그` 사이만 조정하며 실제 공백 문자는 추가하지 않습니다.

영문 이름의 `os`, `Lo` 묶음에는 `.enTighterSpacing`으로 자간 0.3px를 적용하고 오른쪽에 0.15px 여백을 둡니다. `o–s`, `L–o` 사이는 기본값보다 각각 약 0.3px 좁히되, 묶음 뒤의 `s–a`, `o–g` 사이는 기존 자간 0.45px에 맞춥니다. `i`에는 `.enTightSpacing`으로 자간 0.45px를 적용해 `i–c` 사이를 약 0.15px 좁힙니다. 나머지 기본 자간 0.6px와 첫 글자의 광학 정렬은 유지합니다. `os`와 `Lo`는 각각 하나의 묶음으로 두어 원래 커닝을 보존합니다.

버전 표시의 `v`는 `.versionPrefix`로 감싸고 오른쪽에 0.5px 여백을 추가합니다. 숫자 사이의 기본 자간 0.25px와 버전 문자열은 유지하며 실제 공백 문자는 넣지 않습니다.

## 파일 로드와 기능 조립

UI 파일 6개와 공통 파일 5개로 구성됩니다. `index.html`의 `defer` 로드 순서는 다음과 같습니다.

```text
state.js → parser.js → renderer.js
→ ui-source.js → ui-editor.js → ui-preview-edit.js → ui-preview-view.js → ui-library.js
→ ui.js → storage.js → app.js
```

UI 부품 5개는 생성 함수 묶음만 `MosaicUIParts`에 등록합니다. `ui-source.js`가 등록 공간을 만들고, `ui.js`가 목록을 고정한 뒤 기능을 조립합니다. `app.js`는 명령 주입과 초기화를 이어갑니다. 등록 시점에는 이벤트를 연결하거나 입력창을 만들지 않습니다.

일반 개조 코드는 `MosaicUI`·`MosaicApp` API를 사용합니다. `MosaicUIParts`에는 편집 데이터·캐시·검색 상태를 넣지 않습니다. 기능 사이의 새 연결은 필요한 동작을 `host` 인자로 전달합니다. 부품 파일에서 `ui.js`의 비공개 변수를 직접 참조하지 않습니다.

기존 기능은 담당 함수에서 수정합니다. 같은 부품 파일에 생성 함수를 추가한다면 파일 끝의 반환 목록과 `ui.js`의 묶음 읽기·생성 호출도 연결합니다.

## 시작 화면과 기본 표지

첫 화면은 `index.html`의 본문 탭 활성 표시로 정합니다. `app.js`는 활성 탭을 읽어 탭별 스크롤을 관리합니다. 본문 입력은 펼치되 자동 포커스는 주지 않습니다. 기본 표지 URL과 표시 체크값은 비어 있는 상태로 시작합니다.

본문 입력 제목의 강조 배경은 `styles.css`의 `#tabBody .bodyEditorFold > summary.foldHead`에서 정합니다. 접힘·펼침 모두 UI 강조색 14%, 호버 18%를 사용합니다. color-mix 미지원 환경의 `::before` 불투명도도 같은 값으로 맞춥니다. 다른 그룹의 배경과 글자·테두리·여백은 유지합니다.

예전 기본 표지 URL의 복원 처리는 `state.js`의 `normalizeRetiredCoverImageFields()`에서 정합니다. 초안과 작업 복원에서 함께 사용하며, 작성 내용·다른 이미지·보관함 원본을 지우지 않습니다.

## 접힌 그룹의 요약

본문 입력의 `bodyInputSummary`는 `ui-editor.js`의 `renumberCards()`에서 카드·코멘트를 따로 셉니다. 빈 카드와 출력에서 숨긴 카드도 포함하고, 코멘트가 없으면 코멘트 개수는 생략합니다. `clearCardEditors()`에서도 개수를 비웁니다. 저장 필드를 추가하거나 출력용 글자 수 카운터와 섞지 않습니다.

카드 구성의 `layoutDesignSummary`는 `syncDesignSummaryText()`에서 폭·외곽선·이어보기 순서로 표시합니다. 폭은 `680px`처럼 쓰고, 나머지는 켜진 항목만 표시합니다. 펼친 상태의 본문 폭 선택지 이름은 유지합니다. 두 요약은 그룹이 접혔을 때만 표시하고, 좁은 화면에서는 끝을 생략해 제목과 접기 버튼을 남깁니다.

이름 바꾸기·키워드 치환의 `nameRuleSummary`·`keywordRuleSummary`도 같은 `bodyFoldMeta` 표시를 사용합니다. `renderReplacementRuleItems()`에서 `syncOutputRuleSummary()`로 정규화된 규칙 중 켜진 수를 셉니다. 규칙이 없으면 숨기고, 모두 OFF면 `활성 규칙 0개`로 표시합니다. 실제 본문에 일치하는 문구가 있는지와 관계없이 스위치 상태를 기준으로 하며, 켜진 삭제·공백 규칙도 포함합니다. 추가·삭제·스위치 전환·실행 취소·복원은 기존 목록 갱신 경로를 사용하고 개수를 별도 저장하지 않습니다.

문단 설정의 `paragraphSettingsSummary`는 `syncParagraphSettingsUI()`에서 선택값을 읽어 `들여쓰기 · 가운데 · 코멘트` 순서로 표시합니다. 들여쓰기 ON, `PARAGRAPH_CENTER_IDS` 중 하나 이상 ON, 코멘트 폭 또는 정렬이 기본값과 다른 경우에 각각 해당 단어를 넣습니다. 종류별로 한 번만 표시하고 모두 기본이면 숨깁니다. 관련 본문이 없어 일시적으로 비활성화된 항목도 저장된 선택값을 기준으로 합니다. 가운데 정렬의 여섯 필드는 컨트롤 동기화 캐시에도 포함해 변경·복원 직후 요약을 갱신합니다. 기존 `bodyFoldMeta` 스타일을 사용해 펼쳤을 때는 숨기고 별도 저장 필드는 추가하지 않습니다.

## 이름·키워드 규칙 수정

`ui.js`의 `createOutputRuleEditing(host)`가 임시 입력·검증·확정·취소를 관리합니다. `renderReplacementRuleItems()`는 두 종류의 규칙에 같은 편집 동작을 연결합니다. 문구를 누르거나 키보드로 선택해 Enter를 누르면 편집하고, Enter·다른 곳 클릭으로 적용하며 Esc로 취소합니다. 한글 조합 중 Enter는 확정하지 않습니다.

이름은 앞뒤 공백을 정리하고 두 문구를 모두 요구합니다. 키워드는 공백을 보존하고 바꿀 문구가 비어 있으면 삭제 규칙으로 처리합니다. 각 문구는 80자까지이며 중복 찾을 문구와 같은 문구로의 치환은 거절합니다. 잘못된 값을 Enter로 확정하면 안내하고 계속 편집하며, 다른 곳을 누르면 이전 값으로 복구합니다.

규칙 목록에서 빈 결과는 `삭제 처리`, 공백만 있는 결과는 `공백 N칸`으로 표시합니다. 두 안내는 `.replacementRuleTo.isEmptyResult`의 10.5px·`--help-ink` 색으로 통일합니다. 실제 글자 `삭제`로 치환하는 규칙은 일반 문구의 크기·색을 유지합니다. 안내 문구는 화면 표시만 담당하며, 편집·저장·출력에는 원래의 빈 문자열이나 공백을 사용합니다.

확정은 기존 스냅샷·`uiUpdateEffects.committedChange()` 경로를 사용합니다. 규칙 ID·순서·적용 상태와 본문 원문은 유지합니다. 부분 제외 내역도 삭제하지 않으며 기존처럼 ID·원래 문구·바꿀 문구가 일치할 때 적용합니다. 문구가 달라진 규칙으로 제외 범위를 자동 이전하지 않습니다.

확정할 때는 `saveNameRules(rules, false)`·`saveKeywordRules(rules, false)`로 값을 쓰고 해당 행만 갱신합니다. 목록 전체를 다시 만들면 다음 문구·스위치·제거 버튼을 누르는 클릭을 잃을 수 있습니다. 검증 안내는 새 입력을 시작하면 지워 같은 문제를 막습니다. 전체 작업 복원과 목록 재생성 전에는 `discard()`로 미확정 입력을 버립니다. 모바일 이탈 시에는 확정 후 기존 초안 저장 경로를 사용합니다. 임시 편집 상태와 요약 개수는 저장하지 않습니다.

## 디자인 기본값 바꾸기

`state.js`의 `DEFAULT_STYLE`을 수정합니다. 대사·나레이션 기본 크기는 14px, 줄간격은 1.6배입니다. 예를 들어 `narrSize: '14'`를 `'16'`으로 바꾸면 새 시작과 디자인 초기화에서 16px를 사용합니다.

`initializeStyleDefaults`가 초기화 시 HTML 컨트롤과 숫자·색상 입력 미러를 채우므로, HTML에 같은 디자인 기본값을 중복 작성하지 않습니다. 기존 초안이 있으면 저장된 값이 우선합니다. 새 기본값은 별도 브라우저 저장 공간에서 확인하거나, 작업을 백업한 뒤 디자인 초기화로 확인합니다.

허용 범위나 선택지를 바꿀 때는 `STYLE_SCHEMA`와 `index.html`의 컨트롤도 확인합니다. 작업 초기값은 `WORK_FIELD_DEFAULTS`·`WORK_BOOLEAN_DEFAULTS`, 처음 보이는 예제 내용은 별도로 관리합니다.

## 데이터 흐름

```text
카드·설정 입력 → UI 원본 변경 → app.js의 changes
                                ├─ 렌더·카운터 갱신
                                │   └─ settings + cards → renderer → 미리보기·HTML
                                └─ 원본 수집 → storage → 초안 저장

HTML·보관함·작업 히스토리 → replaceWork
                          └─ applyState → 필요한 상태 정리 → 렌더·저장

미리보기 편집 → 연결 확인 → 원문 변경안 계산 → 공통 적용 → input → 작업 기록
```

현재 카드 원문은 카드 입력창이 관리하고, 전체 화면 입력창은 그 원문과 연결된 미러입니다. 별도의 장기 본문 복사본을 만들지 않습니다.

| 읽기 API | 반환값·용도 |
|---|---|
| `MosaicUI.cards.all()` | 카드·코멘트 원본 배열 |
| `MosaicUI.work.collect()` | `{cards, fields}` — 작업 원본 |
| `MosaicUI.work.collectSlot()` | `{cards, fields, style}` — 보관함·HTML 복원·히스토리 |
| `MosaicUI.captureDraftUiState()` | `{fields, booleans, style, cards}` — 초안·복원 실패 시 되돌림 |
| `MosaicUI.currentStyleValues()` | 저장용 디자인 원본 |
| `MosaicUI.getSettings()` | 기본값·정규화·고급 옵션을 적용한 출력용 설정 |

수집 결과는 호출 시점의 새 데이터이며, 객체를 바꿔도 화면에 자동 적용되지 않습니다. 저장에는 원본 값을, 출력에는 `getSettings()`를 사용합니다. 출력용 설정으로 저장 데이터를 대체하면 공백이나 꺼진 고급 설정 등의 값이 달라질 수 있습니다. DOM·검색 포커스·런타임 카드 식별자는 저장 형식에 넣지 않습니다.

## 변경 후 처리 연결하기

값을 바꾼 뒤 아래 공통 경로를 사용합니다. UI 내부는 주입된 `appCommands.changes`, 외부 개조 코드는 `MosaicApp.changes`로 호출합니다.

| 경로 | 처리 |
|---|---|
| `settingsInput(id)` | 렌더·초안 저장 예약, 디자인 필드이면 디자인 히스토리 묶음 예약 |
| `liveInput()` | 렌더·카운터·초안 저장 예약 |
| `controlChange()` | 즉시 렌더·카운터 갱신, 초안 저장 예약 |
| `committedChange()` | 즉시 렌더·카운터 갱신·초안 저장, 저장 성공 여부 반환 |
| `renderedDraftChange()` | 즉시 렌더, 초안 저장 예약 |
| `renderedSavedChange()` | 즉시 렌더·초안 저장, 저장 성공 여부 반환 |
| `styleChange()` | 즉시 렌더·초안 저장·디자인 히스토리 확정, 저장 성공 여부 반환 |

예약된 렌더는 다음 화면 프레임에 실행됩니다. 일반 타이핑의 실행 취소는 브라우저가 관리합니다. 작업 단위 변경은 변경 전 `cards.snapshot()`, 완료 후 `feedback.undo()`로 기록합니다. 기존 `input` 이벤트를 발생시켰다면 이벤트 처리기가 공통 경로를 호출하므로 렌더·저장을 중복 호출하지 않습니다.

디자인 조절은 350ms 동안 묶어 기록합니다. `goActionHistory()`는 대기 중인 디자인 기록을 먼저 확정한 뒤 이동하므로, 조절 직후 실행 취소해도 앞선 카드 작업을 함께 취소하지 않습니다. 대기 기록을 취소할 때는 `cancelStyleHistoryCommit()`으로 타이머와 상태를 함께 정리합니다.

### 본문에 구분선 추가

```js
const textarea = MosaicUI.cards.textareas()[0];
if (textarea) {
  MosaicUI.cards.snapshot();
  textarea.setRangeText('\n\n[HR]\n\n', textarea.selectionStart, textarea.selectionEnd, 'end');
  textarea.dispatchEvent(new Event('input', {bubbles: true}));
  MosaicUI.feedback.undo('구분선 추가.');
}
```

### 디자인 값 변경

```js
const style = MosaicUI.currentStyleValues();
MosaicUI.applyStyleValues({...style, narrSize: '15'});
MosaicApp.changes.styleChange();
```

### 카드 추가 후 작업 전체 적용

```js
const work = MosaicUI.work.collectSlot();
if (work.cards.length < MosaicState.MAX_WORK_BLOCKS) {
  work.cards.push({type: 'card', body: '새 카드', visible: true});
  MosaicUI.cards.snapshot();
  MosaicUI.work.apply(work);
  MosaicUI.feedback.undo('새 카드 추가.');
}
```

`work.apply()`는 `MosaicApp.replaceWork()`를 통해 복원·렌더·저장을 연결합니다. `work.applyState()`는 화면 값만 복원하는 내부용 경로입니다. 시작 시 초안 복원은 검증과 실패 시 되돌림을 포함하는 별도 경로를 유지합니다.

### 카드 분할 수정하기

`ui-editor.js`의 `splitCardAtCursor()`는 해당 입력창의 `selectionStart`를 사용합니다. `⋯` 메뉴를 열 때 `syncCardSplitButton()`이 선택 범위·빈 본문·한글 조합 상태를 확인합니다. 분할 버튼은 `.splitCardBtn`이며 중앙 정렬 버튼 바로 왼쪽에 놓습니다. SVG와 접근성 이름은 `createCardEditor()`에서 정합니다.

보조 도구모음은 같은 카드 안에서 본문·제목을 편집해도 유지합니다. 바깥 클릭·포커스 판정은 열린 카드 전체를 기준으로 하며, 본문 입력·선택·커서 이동·한글 조합 중 분할 버튼 상태를 갱신합니다. `styles.css`의 `.cardActionMenu`가 PC의 일반 도구 폭 24px와 간격 2px를 정합니다. 순서 이동 버튼은 28px 폭·2px 간격·왼쪽 여백 8px로 헤더의 `− ○`와 중심을 맞추며, 구분선도 같은 위치에 놓습니다. 화살표 글자 크기는 바꾸지 않습니다. 삭제 버튼과 화살표 옆 구분선은 같은 의사 요소 스타일을 공유합니다. 최소 사이드바 폭 340px와 모바일 폭 320px에서 실제 버튼 영역이 잘리거나 넘치지 않는지 확인합니다.

680px 이하에서는 `--mobile-card-control-size`로 위·아래 화살표의 크기와 전체 도구 높이를 헤더 버튼에 맞춥니다. 560px 이하에서는 36px, 그보다 넓은 세로 배치에서는 28px입니다. 나머지 도구 너비는 `--mobile-card-tool-width`로 실제 도구모음 안쪽 폭에서 계산하며 26~32px 범위를 사용합니다. 화살표 묶음과 두 구분선 주변의 여백을 먼저 빼고 6개 도구에 나누므로, 화면이 좁아져도 가로 스크롤 없이 들어가야 합니다. 나머지 모바일 도구 아이콘 크기는 14~16px이며 PC 크기와 구분합니다.

카드 순서 이동 화살표는 모바일에서 12px·선 두께 1.2의 SVG(`.cardMoveIcon`)를 사용합니다. 누르는 영역과 정렬은 유지하며, PC에서는 기존 문자 화살표(`.cardMoveGlyph`)를 표시합니다.

다른 카드의 메뉴 버튼으로 전환할 때는 `pointerdown`·`focusin`에서 기존 도구모음을 먼저 접지 않고 `click`에서 교체합니다. 높이가 줄면서 누르려던 버튼이 움직여 클릭이 빗나가는 것을 막기 위한 처리입니다.

`ui-source.js`의 `planCardSplit()`은 원문을 잘라 두 카드와 제외 범위만 계산합니다. 공백을 제거하지 않고, 아래 카드의 제목만 비웁니다. 제외 범위는 절단 위치로 정확히 옮기며, 제외 문구·문자 한가운데나 구분선 정규화로 원문이 바뀌는 위치에서는 나누지 않습니다. 일반 문자열 비교로 반복 문구의 위치를 다시 추정하지 않습니다.

보관함·HTML 불러오기의 카드·코멘트 합계 상한은 기존과 같은 200개입니다. 추가·복제·분할은 `hasEditorCapacity()`에서 `MosaicState.MAX_WORK_BLOCKS`를 확인합니다. 초안 복원에도 쓰는 `addCard()` 자체는 기존 초안의 블록을 자르지 않습니다. 개조 코드로 카드를 추가할 때도 상한을 확인합니다.

적용 시 기존 카드의 원문 매핑을 다시 연결하고 새 카드를 바로 아래에 삽입합니다. `committedChange()`로 렌더·저장을 처리하고 새 입력창 맨 앞에 포커스를 둡니다. 제목·정렬·접기·출력 여부·부분 제외·코멘트 순서와 실행 취소·다시 실행을 함께 확인합니다. 카드가 각각 문법을 해석하므로 대사·강조·접기 구간 안에서 나눌 때의 결과도 구분합니다.

## 미리보기 편집 수정하기

검색과 대치는 `MosaicParser.literalMatchRanges()`의 원문 범위를 공유합니다. 따옴표를 정규화한 뒤 리터럴 정규식으로 검색하며, 문자열 전체를 소문자로 바꾼 위치를 원문에 적용하지 않습니다. `İ`처럼 소문자 변환 시 길이가 달라지는 문자 뒤의 위치를 지키기 위한 규칙입니다. 전체 화면의 현재 대치·전체 대치도 같은 범위를 사용합니다.

- 꼬리말 작성자는 `renderer.js`의 `buildFooter()`에서 표시하고 `ui-preview-edit.js`의 `decoratePreviewFooterEditor()`에서 표시된 이름에만 편집을 연결합니다. 프로필과 같은 `commitPreviewInlineFieldEdit()` 경로로 저장합니다. ©·도구 링크·여백은 편집 영역 밖에 둡니다. 이름이 없으면 편집 영역을 만들지 않으며, 표지 탭의 작성자 입력란에서 추가합니다.
- 꼬리말의 도구 링크 주소는 `buildFooter()`의 `https://mosaic-log.github.io/`입니다. `decoratePreviewFooterEditor()`는 작성자 유무와 관계없이 미리보기 DOM에서만 이 링크의 `href`·`target`을 제거하고 탭 이동에서 제외합니다. 게시용 HTML의 링크는 유지하며, 투명 테마의 기존 링크 없는 표시는 바꾸지 않습니다.
- 본문 위·아래 여백 `cardBodyTopSpace`·`cardBodyBottomSpace`의 범위는 모두 −44~40px, 기본값은 0, 조절 단위는 2px입니다. `index.html`의 입력 범위, `STYLE_SCHEMA`, `cardBodyTopSpacePx()`·`cardBodyBottomSpacePx()`를 함께 맞춥니다. 음수는 해당 기본 패딩에서 빼며 실제 패딩은 0 이상으로 유지합니다. −44px이면 화면 폭과 관계없이 해당 패딩이 0이 됩니다. 이어보기에서 이미 제거한 안쪽 여백은 0으로 유지하고 카드 사이 간격은 바꾸지 않습니다.
- 본문 좌우 기본 여백은 `CARD_INLINE_PADDING`의 `clamp(20px,calc(4.5vw + 2px),26px)`입니다. 기존 저장값 `cardInlinePadding:22`는 반응형 기본값을 뜻하며, 나머지 직접 지정값은 기존 픽셀값을 유지합니다. 위아래 기본값은 `cardBodyVerticalPaddingCss()`의 공통 기준에 `CARD_BODY_PADDING_OFFSET`(−5px)을 더해 37~43px로 맞춥니다. `trimCardBodyEdgeMargins()`는 첫·마지막 요소와 화자 이름의 flow-root 래퍼에서 바깥 margin만 제거합니다. 내부 문단 간격과 부분 접기의 안쪽 여백은 건드리지 않습니다. `cardBodyBottomSpace`는 꼬리말 유무와 관계없이 카드 아래에 적용하고, `footerBodyGap`은 꼬리말 앞 간격만 조절합니다. 꼬리말 앞 기본 간격은 공통 세로 기준의 1.5배에 `FOOTER_SPACING_OFFSET`(−10px)을 더한 값(일반 모드 53~62px)이며 문단 간격 모드의 배율을 유지합니다. 사용자 추가값은 별도로 더하고, 카드 하단 여백은 37~43px를 유지합니다.

- 병행 대사의 표시와 원문 위치는 `parser.js`의 `parallelDisplayParts`를 공유합니다. 보조 대사를 감싸는 바깥 큰따옴표만 생략하고, 내부 인용·입력 원문·나레이션·속마음은 보존합니다. 표시 순서를 바꿔도 같은 규칙을 적용합니다.
- 자동·이어쓰기·아래쓰기 판정은 `MosaicParser.parallelTranslationPlacement()`를 출력과 편집 투영이 함께 사용합니다. 괄호 안 공백과 숨긴 구분자의 원문 위치도 함께 보존합니다.
- 아카라이브 PC·모바일의 출력 색·크기 보호는 `renderer.js`의 `lockOutputTypographyForArca()`에서 처리합니다. 병행 묶음의 부모 스타일만 믿지 말고 자식에 직접 적용되는 외부 CSS도 검사합니다. 필요한 `!important`와 번역 보조색·축소 크기·내부 강조를 유지합니다.
- 크레딧 항목 구분선의 색은 `buildCredit()`의 `creditDivider`(`#e9e9e9`)에서 정합니다. `transparentOutput()`은 이 색과 본문 `[HR]`의 원래 색·농도를 보존하며, HR2·HR3·HR4는 기존 투명 규칙을 유지합니다.
- 프로필 줄바꿈은 `renderer.js`의 `buildProfileBlock()`에서 정합니다. 3인 한 줄과 5인 2+3은 `PROFILE_THREE_COLUMN_CARD_BREAKPOINT`의 카드 전체 폭 680px 기준입니다. `profileHorizontalInset`이 좌우 패딩·테두리를 빼서 실제 안쪽 경계를 계산합니다. 2열→1열은 `PROFILE_TWO_COLUMN_CONTENT_BREAKPOINT`의 안쪽 폭 400px 기준입니다. `styles.css`의 638·640·678·680px 컨테이너 조건도 함께 맞춥니다. 일반/붙임형·외곽선 여부에 따라 620px에서 3인 2+1·5인 2+2+1, 679px에서 2열, 680px에서 3인 한 줄·5인 2+3인지 확인합니다. 사진 접합선·모서리와 미리보기·출력 HTML도 비교합니다.
- 프로필은 기본 표현만 사용합니다. 미니·클래식의 인물 배경은 `buildProfileBlock()`의 `profileCardBg`에서 결정하며, 사진 배경과 포트레이트의 기존 규칙은 유지합니다. 프로필 구분선은 `profileDividerMinimal`, 표제 구분선은 `titleMinimal`로 결정하고 UI에는 구분선 — 표시/숨김으로 표시합니다.
- 프로필 기본 설정은 구분선·배치·배경·스타일 순서입니다. `styles.css`의 프로필 `.segmentedChoice` 공통 세 열에 구분선도 포함해 선택지 중심을 맞춥니다. 미니·클래식의 인물 기본 간격은 10px이며 상단 프로필의 사용자 간격 조절값을 더합니다. 포트레이트의 사진 접합·간격 규칙은 유지하고 `ui.js`의 `profileItemGapBasePx()`로 숫자 표시를 맞춥니다.
- 관계와 상황의 입력은 `#profileCommonGroup` 안의 `.profileCommonSection` 두 개로 묶습니다. 관계는 라벨·키워드, 상황은 라벨·요약 순서이며 작은 소제목과 간격으로 구분하며 소제목과 첫 입력행 사이는 6px로 둡니다. 바깥 제목에는 접기만 두고 각 소그룹의 `.profileCommonHead`에 초기화와 표시 스위치를 둡니다. `.profileCommonHead`와 입력행은 같은 설정 폼 그리드를 공유합니다. 조작 버튼을 두 번째 열 끝에 두어 스위치의 보이는 오른쪽 끝과 클릭 영역이 입력칸 밖으로 나가지 않게 맞춥니다. 인물 헤더의 접기 버튼 자리를 위한 빈 공간은 두지 않습니다. 내부 `.profileSubBody`는 별도 패딩 없이 기존 `PROFILE_ENTITY_CONFIGS`의 초기화·OFF 표시·입력 시 활성화 경로를 공유합니다. 관계 초기화는 라벨·키워드만, 상황 초기화는 라벨·요약만 바꾸며 입력 ID는 유지합니다. 중첩된 요약 textarea에도 기존 입력 스타일을 적용합니다. 키워드 라벨은 align-self: start와 --control-h 높이의 flex 정렬로 첫 입력줄 중앙에 맞춥니다. 요약 라벨은 위쪽 패딩 8px를 두고 나머지 라벨과 입력 폭은 유지합니다.
- 개별 표시값은 `profileRelationshipOn`·`profileSituationOn`이며 `WORK_BOOLEAN_DEFAULTS`에서 둘 다 true로 관리합니다. `MosaicState.savedProfileCommonVisibility()`는 명시한 개별 값을 우선하고 누락값에만 구버전 `profileCommonOn`을 적용합니다. 상태 검증·초안 준비·UI 작업 적용·렌더러는 이 변환을 공유합니다. 새 작업과 백업에는 개별 두 값만 저장하고 기존 저장 키·컨테이너·복원 버전은 유지합니다.
- 관계·상황 라벨은 `profileRelationshipHeading`·`profileSituationHeading`입니다. 기본값은 `state.js`의 `WORK_FIELD_DEFAULTS`에서 관리하며, `WORK_FIELDS`에 등록해 초안·보관함·실행 취소·HTML 복원에서 함께 수집합니다. 누락값만 기본값으로 채우고 빈 문자열은 유지합니다. 입력창과 가져오기에서 최대 80자를 허용합니다.
- `renderer.js`는 내용이 있는 관계·상황 상자에만 라벨을 출력하고 빈 라벨은 생략합니다. 라벨은 HTML을 이스케이프한 일반 텍스트이며 `data-mosaic-profile-field`로 미리보기 편집에 연결합니다. `decoratePreviewProfileEditors()`의 라벨 편집은 `plainText`를 사용해 별표·괄호 등을 서식 문법으로 해석하지 않습니다. 기존 `commitPreviewInlineFieldEdit()`의 입력 이벤트 경로로 입력창·렌더·히스토리·저장을 갱신합니다. 새 저장소나 별도 이벤트 경로를 추가하지 않습니다.
- 역할 라벨(`profileCharRole`·`profileUserRole`·추가 인물의 `Role`)도 평문 경로를 사용합니다. 공통 편집 함수는 입력창의 `maxlength`를 확인합니다. 평문은 제한 안에서 반영하고 서식 원문은 중간에서 자르지 않도록 초과한 새 입력을 거절합니다. `maxlength`가 없으면 제한을 적용하지 않으며, 구버전의 긴 값은 줄여 수정할 수 있습니다.
- 표제의 구분선과 배경 선택지는 `#titleGroup .segmentedChoice`의 두 열을 공유합니다. 두 그룹은 우측 정렬하고 첫 열은 문구 폭, 둘째 열은 64px, 열 간격은 14px로 중심을 맞춥니다. 라벨 위치의 세 선택지는 기존 배치를 유지합니다.
- `coverSectionDividerEnabled(settings, kind)`는 선의 표시를 판정하며 `coverDividerCss()`·`appendCoverDividerLine()`이 길이와 위치를 표현합니다. 연결형에서 구분선 생략 시 아래 안쪽 여백은 공통 `COVER_DIVIDER_OMIT_PADDING`을 기준으로 줄입니다. 기본 간격에서는 8px이며 좁게/넓게 설정에서는 기존 간격 배율을 따릅니다. 독립 프로필은 생략 값과 관계없이 기존 여백을 유지합니다. 사진으로 채운 붙임형 프로필처럼 바깥 패딩이 0이면 추가로 줄이지 않습니다. 이어보기·각진 테마와 사진 접합면의 마지막 보정 규칙을 유지합니다.
- 미리보기의 `addPreviewOptionToggleButton()`은 표제·프로필 구분선을 연결합니다. 사진 배경 표제는 `data-mosaic-image-background`를 읽어 버튼을 만들지 않습니다. 구분선 버튼에는 `_mosaicDividerAtBottom`을 붙여 아래 경계에 중심을 맞춥니다. `previewControlGeometry()`가 좌표를 읽고 `positionPreviewControls()`가 복사 버튼을 대상 카드 묶음 상단의 8px 위치에 먼저 고정합니다. 구분선은 원래 경계에서 시작하되 복사 버튼과 겹치면 아래로 옮기고, 다른 조작 버튼은 그 자리를 피합니다. 꼬리말의 `_mosaicFooterTextCenter`는 패딩을 제외한 글줄 중심을 사용하고 `_mosaicHideWhenCardClosed`는 마지막 카드가 닫히면 버튼을 숨깁니다. 좌표와 속성은 출력하거나 저장하지 않습니다. 표지선 길이 입력은 `syncDividerLengthControlState()`에서 두 구분선 설정을 확인합니다.
- 렌더러의 `data-mosaic-profile-divider-available`은 설정을 바꿔 표시할 내부 구분선이 있는지를 나타냅니다. 독립 프로필과 선을 제거하는 사진 접합면은 false로 표시하며, 미리보기는 이 값과 다음 영역의 존재를 확인해 버튼을 만듭니다. 사용자가 생략한 연결형 구분선은 버튼을 남깁니다. 구분선 표시는 `−`, 생략은 `createPreviewDividerToggleButton()`의 12px SVG로 표시합니다. 가로선·빗금의 두께는 1.1이며 표제·프로필·카드 제목 버튼이 공유합니다. 이 속성은 다른 미리보기 메타데이터와 함께 출력 시 제거되며 저장 필드를 추가하지 않습니다.
- 일반 표제 뒤에 `data-mosaic-photo-profile-top` 프로필이 틈 없이 붙으면 `resolveCoverProfileBoundary()`가 `titleDividerUnavailable`을 반환합니다. `finalizeCoverProfileBoundaries()`가 양쪽 접합선을 정리하고 `data-mosaic-title-divider-available=false`를 붙입니다. 이어보기의 접기 본문 간격도 같은 경계 판정으로 기본값을 유지합니다. 이 경우 `titleBottomPaddingPx()`의 기본 여백을 유지하고 미리보기는 가용성 표식을 읽어 표제 구분선 버튼을 만들지 않습니다. 사진 배경 표제의 기존 높이와 일반 프로필의 구분선 조작은 유지합니다. 상단 사진 표식은 관계·상황 설명 유무와 분리하며 기존 하단 사진 접합 판정은 유지합니다. 이 표식은 게시용 HTML에서 제거됩니다.
- `photoFollowsProfile`은 연결된 최상단 프로필 다음에 대표 이미지나 사진 배경 표제가 오는지를 판정합니다. 이때 구분선 가용성을 false로 만들고 생략에 따른 아래 여백 축소를 건너뜁니다. 이어보기의 선 보정도 같은 가용성 표식을 사용합니다.
- `createPreviewControlButton()`과 `setPreviewControlIcon()`은 복사·이동·구분선·꼬리말 및 복사 성공/실패 SVG를 공유합니다. 선 두께는 1.1, 구분선 크기는 12px, 나머지는 14px입니다. `.previewControlIcon`은 포인터 이벤트를 받지 않으며, 버튼 영역 27px와 접근성 이름은 유지합니다. 기본 색은 `--help-ink`이고 호버·포커스·복사 결과 색은 기존 경로를 사용합니다. `previewControlGeometry()`는 기본 왼쪽·PC 반전 오른쪽을 계산하며 `styles.css`의 미리보기 바깥 여백도 같은 방향을 따릅니다. `decoratePreviewOptionButtons()`는 첫 표시 카드 제목에만 전역 구분선 버튼을 만듭니다.
- 자동번호의 기본 형식은 `MosaicState.DEFAULT_STYLE.foldAutoNumberStyle`의 `arabic`입니다. HTML 선택지와 스키마 순서는 `arabic`·`roman`이며, 설정 수집기의 기본 경로와 렌더러의 누락값도 같은 기본값을 씁니다. 자동번호 ON/OFF 기본값은 바꾸지 않습니다. 저장된 명시적 `arabic`·`roman` 값은 그대로 복원하고, 작성한 제목에는 자동번호를 덮어쓰지 않습니다.
- `ui-library.js`의 `advancedResetBtn`은 `resetAdvancedControlFields()`에 세부 조정값만 전달합니다. 적용 스위치 `advancedOn`은 초기화 목록에서 제외하므로 ON 상태로 초기화해도 계속 ON을 유지합니다. 전체 디자인의 `resetDefaultsBtn`은 기존처럼 전체 기본값을 적용합니다.
- 프로필 구분선의 `profileDividerMinimal`은 기존 저장 컨테이너 안의 선택적 불리언입니다. `savedProfileDividerMinimal()`은 이 값만 읽고 누락값은 기본으로 처리합니다. 폐기된 표현 옵션은 읽거나 새 작업에 저장하지 않습니다. 명시한 구분선 값과 기존 저장 키·복원 버전은 유지합니다.
- `createPreviewSourceEdits`는 `{before, after, message}` 변경안을 계산합니다. 위치·표시 글자 치환은 `createSourceMapping`을 공유합니다.
- `applyPreviewSourceChange`는 연결과 현재 원문을 확인하고 입력창·작업 기록·입력 이벤트를 갱신합니다. 계산 함수에 포커스·렌더·저장 코드를 넣지 않습니다.
- 작업 전체 복원 전에는 `discardActiveDirectEdit()`로 미확정 편집을 종료합니다. 이전 편집기의 `blur`가 복원한 내용을 덮지 않도록 유지합니다.
- 병행 제외·다시 적용은 선택 도구막대에서 `changeParallelOccurrences`로 연결합니다. 글자 일부를 선택해도 원문·번역 묶음 전체가 대상입니다.
- `bindOutputRuleInteractions`의 일반 클릭과 `showOutputRulePopover`는 치환·삭제 예외를 처리합니다. 병행 제외 클릭 팝업을 다시 추가하지 않습니다.
- `parallelExclusions`·`outputRuleExclusions`의 저장 구조와 원문 범위 계산을 공유합니다.
- 컨트롤 동기화 캐시는 `createControlSync`가 관리합니다. 복원 시 `invalidateControlSync()`를 사용하고 캐시 객체를 직접 수정하지 않습니다.

## 모바일 Safari 호환성

iOS 15.8 Safari는 정규식 lookbehind를 지원하지 않습니다. 이 문법을 정규식 리터럴에 넣으면 버튼을 연결하기 전에 JS 파일 전체가 파싱에 실패합니다.

강조 범위는 `MosaicState.emphasisMatches(text, combined)`에서 이전 문자를 직접 확인합니다. `combined`가 참이면 `***굵은 강조***`도 함께 찾습니다. 미리보기 서식과 글자 수 계산은 `MosaicParser.formatMatches(format, text)`를 사용하며 원문의 인덱스와 기존 캡처 그룹을 보존합니다.

기존 `MosaicUI.FMT_RE`는 유지하지만 구형 Safari에서는 강조 후보를 찾는 대체 정규식이 제공됩니다. 새 코드에서 `.source`를 재컴파일하지 말고 `formatMatches`로 실제 서식 범위를 구합니다. PC의 모바일 화면 검사와 Safari 문법 호환성 검사는 별도로 진행합니다.

스위치의 체크박스는 투명하게 두고 라벨 전체를 덮습니다. 장식 트랙은 `pointer-events: none`으로 두어 실제 체크박스가 터치와 키보드를 처리합니다. `color-mix` 미지원 환경에서는 `@supports` 대체 스타일로 손잡이와 포커스 표시를 유지합니다.

대체 CSS는 원래 ON/OFF 선택자와 같은 우선순위로 적용합니다. `var()`가 포함된 비지원 함수는 계산 시 무효가 되어 더 낮은 우선순위의 대체 선언을 가릴 수 있습니다. 항목 헤더의 강조 배경과 테마 카드 모양 영역의 테두리·선택 배경은 의사 요소로 색과 불투명도를 표현하며, 장식층은 터치를 가로채지 않습니다. 호환성을 모사할 때는 `color-mix()`를 비지원 함수 이름으로 바꿔 검사합니다. 관련 선언을 삭제하는 검사만으로는 이 문제를 재현할 수 없습니다.

테마의 호버 미리보기는 `ui-library.js`의 `bindThemeHoverPreviewList`에서 마우스 `pointerover`·`pointerout`만 처리합니다. 터치에서 발생하는 합성 `mouseover`로 미리보기를 다시 그리지 않습니다. 추천 팔레트는 Safari의 버튼 내부 flex 배치에서도 폭이 줄지 않도록 자식 폭을 명시합니다.

전체 화면 아이콘은 카드 편집의 `cardFullscreenIcon`, 미리보기·코드 보기의 `fullscreenIcon` SVG입니다. 동일한 네 모서리 경로를 사용하고 크기는 `styles.css`에서 조정합니다. 미리보기 위쪽 버튼의 SVG는 13px이며, 버튼의 flex 정렬로 좌우 전환 아이콘과 높이를 맞춥니다. 카드 도구모음의 전체 화면 SVG는 PC 10px, 680px 이하에서는 13px이며 누르는 영역은 유지합니다.

카드 도구모음의 복제 아이콘은 `.duplicateCardBtn .cardActionIcon`의 글자 크기로 조정합니다. PC는 13px, 680px 이하 모바일 배치는 16px이며 버튼 영역과 간격은 유지합니다.

## 모바일 입력과 화면 위치

`ui.js`의 `positionSyncEnabled()`는 `createPreviewLayout().isStackedLayout()`을 공유하여 680px 이하에서 자동 위치 연동을 중지합니다. 화면 폭이 이 경계를 넘으면 예약된 자동 이동을 취소하고 표시 상태를 갱신합니다. PC의 `positionSyncOn` 체크값과 `mosaicPositionSync_v1` 저장값은 변경하지 않으며, PC 폭으로 돌아오면 기존 설정을 적용합니다. 모바일의 위·아래 이동 버튼과 미리보기 편집 내용의 반영은 유지합니다.

이탈 저장은 `app.js`의 `saveDraftBeforeLeaving()`이 담당합니다. `visibilitychange`의 숨김 상태·`pagehide`·`beforeunload`에서 `MosaicUI.preview.commitActiveEdit()`로 현재 미리보기 편집을 확정한 뒤 기존 초안 저장을 호출합니다. UI 부품의 `commitActiveDirectEdit()`는 평소 blur 경로를 사용합니다. 복원용 `discardActiveDirectEdit()`와 혼용하지 않습니다.

선택 도구막대는 `ui-preview-edit.js`의 `readPreviewSelection()`에서 원문 범위를 읽고 `syncPreviewSelection()`에서 화면에 반영합니다. `schedulePreviewSelection()`은 선택 변경·터치·마우스 종료를 모으며, 서식·치환 제외·병행 제외는 `syncSelectionForAction()`으로 현재 선택과 원문을 다시 확인합니다. 터치 선택 손잡이의 이동을 `mouseup`만으로 처리하지 않습니다.

탭별 스크롤은 `app.js`의 `rememberTabScroll()`·`restoreTabScroll()`이 관리합니다. `workspaceUsesPageScroll()`의 680px 경계를 기준으로 모바일은 문서, PC는 사이드바 위치를 따로 기억합니다. 짧은 탭을 선택해도 설정 영역이 화면 위로 사라지지 않게 복원 범위를 제한합니다.

보관함의 배경 잠금은 `syncArchiveScrollLock()`과 `styles.css`의 `archiveScrollLocked`가 처리합니다. 모바일에서는 문서 루트의 스크롤을 막고 body를 이전 위치에 고정합니다. 목록 자체의 스크롤은 유지합니다. 닫거나 PC 폭으로 바꾸면 위치·CSS 변수를 복원하며, 다시 열 때 이전 복귀 프레임을 취소합니다. 이 상태와 전체 화면의 `fsLock`을 합치지 않습니다.

## 모바일 화면 이동 수정하기

`createMobilePanelNavigation()`은 세로 배치에서 우하단 이동 버튼과 임시 스크롤 위치를 관리합니다. 680px 분기는 기존 `createPreviewLayout().isStackedLayout()`을 공유합니다. `ui.js`는 이벤트 등록·세로 배치 판정·화면 요소·미확정 렌더 반영만 주입합니다.

`editorOffset`과 `previewOffset`은 각 구역 시작점에 대한 상대 스크롤 위치입니다. 버튼을 누를 때 떠나는 구역의 위치를 기록하고, 반대 구역에서 직전에 보던 위치로 이동합니다. 탭 전환·본문 입력 펼치기·특정 카드 이동은 하지 않습니다. 구역 위쪽이 화면 안에 남아 있는 경우도 복원하도록 음수 상대 위치를 보존합니다. 원문·위치 연동 체크값·저장 형식은 바꾸지 않습니다. 전체 작업을 바꾸면 `applyWorkState()`가 이동 예약과 이전 위치를 초기화하며, 돌아온 입력창에 자동 포커스를 주지 않습니다.

모바일의 `--mobile-preview-tool-clearance`는 560px 이하에서 116px, 561~680px에서 124px입니다. 고정 목차와 화면 이동 버튼의 높이·하단 위치에 12px 여유를 더한 값입니다. 일반 미리보기의 바깥 아래 패딩과 조작 버튼의 `scroll-margin-bottom`에 safe-area와 함께 적용해, 짧은 마지막 카드에서도 꼬리말 버튼을 고정 도구 위로 스크롤할 수 있게 합니다. 전체 화면과 게시용 HTML의 여백에는 적용하지 않습니다.

아이콘은 `index.html`의 `mobilePanelSwitch`와 `previewSyncIcon`에서 정합니다. `styles.css`에서 SVG 크기·선 두께와 44px 터치 영역을 관리합니다. 모바일 헤더는 불투명한 `var(--bg-panel)`을 사용하며, `color-mix`를 지원하지 않는 환경에도 기본 배경색이 남도록 유지합니다. PC와 680px 경계, 긴·짧은 미리보기, 다른 탭·집중 모드·전체 화면·작업 복원을 함께 확인합니다.

모바일 이동 버튼은 아래·위 화살표만 표시하며, 마우스 호버·키보드 포커스에도 44px 크기를 유지합니다. 화면에 표시하는 문구와 `title` 툴팁은 없고, 이동 대상에 맞춘 `aria-label`은 유지합니다.

## 설정 추가하기

1. `index.html`에 컨트롤을 추가합니다. 디자인은 `DEFAULT_STYLE`·`STYLE_SCHEMA`, 작업 문자열은 `WORK_FIELDS`·`WORK_FIELD_DEFAULTS`, 작업 체크값은 `WORK_BOOLEAN_DEFAULTS`에 등록합니다.
2. 출력에 쓸 값은 `createSettingsReader`의 `getSettings()`에서 읽어 렌더러에 전달합니다. 저장 수집은 공통 필드 목록을 사용합니다.
3. 세부 프리셋에 포함한다면 스키마의 `detailPreset`도 확인합니다. 기존 저장에 새 필드가 없을 때의 기본값을 정합니다.
4. 필요한 기능 연결은 `host`로 전달합니다. 다른 기능의 비공개 상태나 바깥 클로저를 직접 참조하지 않습니다.

## 수정 후 확인

1. `index.html`을 직접 열고 PC·좁은 화면의 실행 오류와 배치를 확인합니다.
2. 카드·코멘트·숨긴 카드·접기 제목을 수정하고 저장·새로고침을 확인합니다.
3. 관련 입력창에서 직접 편집·검색·치환·한글 조합·기본 실행 취소·작업 실행 취소를 확인합니다.
4. 보관함과 HTML 내보내기·불러오기에서 원문·디자인·규칙 제외가 유지되는지 확인합니다.
5. 영향받는 출력 HTML·화면을 수정 전과 비교합니다. 병행 양쪽 편집, Shift+Enter, 인용선 간격 등 관련 경계도 확인합니다.
6. JS·CSS를 바꿨다면 `index.html`의 해당 `?v=...` 캐시 값을 갱신합니다. 문서만 바꿨다면 실행 파일의 캐시 값은 유지합니다.
7. 배포 ZIP과 폴더의 파일이 일치하는지 확인합니다. GitHub에는 HTML·CSS·JS 13개와 문서 3개를 같은 구조로 올립니다. 기본 표지 이미지 파일은 포함하지 않습니다.
