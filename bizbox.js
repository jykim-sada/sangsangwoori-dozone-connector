/* 더존 비즈박스 알파(그룹웨어)에서 종결된 지출결의서를 읽는다 (Playwright 로 경영기획실 계정 로그인)
   - 목록: 전자결재 → 전체결재문서, POST /eap/ea/doc/EaTotalDoc.do (JSON {list, totalCount})
            양식 p_form_nm='지출결의서(계좌이체)', 상태 p_doc_sts=''(전체: 결재 중·종결·반려 모두), 기간 p_fr_dt~p_to_dt. 500건씩 3쪽까지 읽는다
   - 상세: /eap/ea/docpop/EAAppDocViewPop.do?doc_id=&form_id= 화면을 열어 금액을 읽는다
            양식마다 표 모양이 달라 라벨 대신 "실지급액 + 원천세 = 총액"이 되고 원천세 비율이 8.8%(기타소득) 또는 3.3%(사업소득)인 숫자 묶음을 찾는다
            (2026-11-13 실제 문서 101건으로 검증: 70건 금액 읽음, 나머지는 금액이 첨부파일에만 있어 0으로 보냄 → 웹앱이 보류)
   설정(config.json → source): { type:"bizbox", url, days, formFilter, titleFilter, stateFile }
   로그인은 프로그램이 하지 않는다. 처음 한 번 `node dozone-sync.js --headed`(연동 시험.bat)로 띄운 브라우저에서 담당자가 직접 로그인하면 그 상태가 stateFile 에 저장되고, 이후 실행은 그것을 재사용한다. 만료되면 같은 방법으로 다시 로그인한다. */
const fs = require('fs'), path = require('path');
const txt = v => String(v == null ? '' : v).trim();
const dateStr = v => { const m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(txt(v)); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''; };
const ymd = d => d.toISOString().slice(0, 10);

/* 문서 화면에서 금액·시행일자 읽기 (브라우저 안에서 실행). 세 단계로 찾는다:
   A) 한 줄에 숫자 셀 셋이 "실지급액 + 원천징수액 = 총지급액"인 줄 (팀 양식 "기타소득 실지급액/원천징수액/원천징수전 총금액", "세후 금액/기타소득세/세전 금액", "공급가액/세액/합계금액"에 원천세를 적은 양식 모두).
      원천징수가 0원인 문서(소액이라 세금이 없는 활동비 등)도 이 줄로 읽는다. 앞 줄(머리글)에 원천징수·소득세·세전·세후·실지급 같은 말이 있거나 비율이 8.8%·3.3%·22% 일 때만 채택해 예산(공급가액/부가세/합계) 줄과 섞이지 않게 한다.
   B) 화면의 숫자들 가운데 총액·원천징수·실지급 세 수의 비율 관계로 찾기 (값이 한 줄에 모여 있지 않은 양식).
   C) 계좌이체 표의 이체금액 합(=실지급액). 셀 안의 "(기타소득세 277,200)" 같은 표기가 있으면 더해 총액을 만든다. 겹친 표의 같은 줄은 한 번만 센다. 문서에 기타소득·사업소득·원천징수 같은 말이 있는 문서에만(일반 구매·공과금 이체 문서는 금액 0 → 보류).
   결과 how: 'row' | 'ratio' | 'transfer' | '' (못 읽음) */
function extractInPage() {
  const norm = s => String(s || '').replace(/\s+/g, '');
  const numOf = t => { const m = /^\(?([\d,]+)\)?(원)?$/.exec(norm(t)); return m ? Number(m[1].replace(/,/g, '')) : NaN; };
  const tds = Array.from(document.querySelectorAll('td,th')).filter(x => norm(x.textContent).length < 60);
  const after = re => { const c = tds.find(x => re.test(norm(x.textContent)) && norm(x.textContent).length < 30); return c && c.nextElementSibling ? c.nextElementSibling.textContent.trim() : ''; };
  const execDate = after(/^시행일자$/);
  const WH = /원천징수|소득세|세전|세후|실지급/; const RATIO = r => (r >= 0.0868 && r <= 0.0882) || (r >= 0.0324 && r <= 0.0332) || (r >= 0.2195 && r <= 0.2205);
  let A = null;
  Array.from(document.querySelectorAll('tr')).forEach(tr => {
    const cells = Array.from(tr.children); const vals = cells.map(c => numOf(c.textContent)).filter(v => !isNaN(v));
    if (vals.length !== 3 || !(vals[2] > 0) || vals[0] + vals[1] !== vals[2]) return;
    const prev = tr.previousElementSibling; const labels = norm((prev ? prev.textContent : '') + cells.filter(c => isNaN(numOf(c.textContent))).map(c => c.textContent).join(''));
    const okLabel = WH.test(labels); const okRatio = RATIO(vals[1] / vals[2]); if (!(okLabel || okRatio)) return;
    const score = (okLabel ? 2 : 0) + (okRatio ? 1 : 0);
    if (!A || score > A.score || (score === A.score && vals[2] > A.c)) A = { a: vals[0], b: vals[1], c: vals[2], score };
  });
  if (A) return { gross: A.c, net: A.a, wh: A.b, execDate, how: 'row' };
  const leaf = Array.from(document.querySelectorAll('td,th,span,div,p')).filter(x => x.children.length === 0 && norm(x.textContent).length < 40);
  const nums = [...new Set(leaf.map(x => numOf(x.textContent)).filter(v => v >= 1000))];
  let best = null;
  nums.forEach(c => nums.forEach(b => { if (b >= c) return; const a = c - b; if (!nums.includes(a)) return; if (RATIO(b / c)) { if (!best || c > best.c) best = { a, b, c }; } }));
  if (best) return { gross: best.c, net: best.a, wh: best.b, execDate, how: 'ratio' };
  let net = 0, wh = 0; const seen = new Set();
  Array.from(document.querySelectorAll('table')).forEach(tb => {
    const trs = Array.from(tb.querySelectorAll('tr')); const hi = trs.findIndex(tr => Array.from(tr.children).some(c => /^이체금액$/.test(norm(c.textContent)))); if (hi < 0) return;
    const col = Array.from(trs[hi].children).findIndex(c => /^이체금액$/.test(norm(c.textContent)));
    trs.slice(hi + 1).forEach(tr => { if (seen.has(tr)) return; seen.add(tr); const c = tr.children[col]; if (!c) return; const t = c.textContent; const m = /([\d,]{4,})/.exec(t); if (!m) return; net += Number(m[1].replace(/,/g, '')); const w = /(원천징수|소득세|세금)[^\d]*([\d,]{3,})/.exec(t); if (w) wh += Number(w[2].replace(/,/g, '')); });
  });
  /* 이체금액 합은 문서에 기타소득·사업소득·원천징수 같은 말이 있을 때만 쓴다: 물품 구매·공과금 같은 일반 이체 문서까지 금액 있는 문서로 보내면 사업명·금액이 우연히 맞는 요청에 잘못 적힐 수 있다 */
  if (net > 0 && /기타소득|사업소득|원천징수|원천세/.test(norm(document.body.innerText))) return { gross: net + wh, net, wh, execDate, how: 'transfer' };
  return { gross: 0, net: 0, wh: 0, execDate, how: '' };
}

async function readBizbox(src, opts) {
  const { chromium } = require('playwright');
  const base = (src.url || 'https://gw.openknowl.com').replace(/\/$/, '');
  const stateFile = path.resolve(__dirname, src.stateFile || 'bizbox-state.json');
  const headed = !!(opts && opts.headed);
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext(fs.existsSync(stateFile) ? { storageState: stateFile } : {});
  const page = await context.newPage();
  try {
    /* 1) 로그인 상태 확인. 없으면 --headed(연동 시험.bat)에서 담당자가 브라우저 창에 직접 로그인하고, 그 상태를 stateFile 에 저장해 이후 자동 실행에 재사용한다 */
    await page.goto(base + '/gw/userMain.do', { waitUntil: 'domcontentloaded' });
    const needLogin = async () => /egovLoginUsr|bizbox\.do$/.test(page.url()) || (await page.locator('#userPw').count()) > 0;
    if (await needLogin()) {
      if (!headed) throw new Error('그룹웨어 로그인 상태가 없거나 만료되었습니다. "연동 시험.bat"을 실행해 브라우저 창에서 직접 로그인하면 저장됩니다');
      await page.goto(base + '/gw/uat/uia/egovLoginUsr.do', { waitUntil: 'domcontentloaded' });
      console.log('브라우저 창에서 그룹웨어에 로그인하세요 (2차 인증까지). 최대 3분 기다립니다…');
      const t0 = Date.now(); while (Date.now() - t0 < 180000) { await page.waitForTimeout(2000); if (!(await needLogin())) break; }
      if (await needLogin()) throw new Error('3분 안에 로그인이 확인되지 않았습니다. "연동 시험.bat"을 다시 실행해 주세요');
      await page.waitForTimeout(2000); await context.storageState({ path: stateFile }); console.log('로그인 상태를 저장했습니다. 다음부터는 자동으로 들어갑니다.');
    }
    /* 2) 전체결재문서 목록 (최근 days 일, 지출결의서(계좌이체), 종결) */
    const days = Number(src.days || 60); const to = new Date(), from = new Date(Date.now() - days * 86400000);
    await page.goto(base + '/eap/ea/doc/EaTotal.do?menu_no=2002140000', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500);
    const list = await page.evaluate(async ({ from, to, formNm, sts }) => { const out = []; for (let p = 1; p <= 3; p++) { const body = new URLSearchParams({ page: String(p), pageSize: '500', sortField: '', sortType: '', p_search_comp: '', p_content: '', p_doc_no: '', p_dept_nm: '', p_draft_nm: '', p_form_nm: formNm, p_doc_sts: sts, p_subject: '', p_fr_dt: from, p_to_dt: to, p_excel_yn: '' }).toString(); const r = await fetch('/eap/ea/doc/EaTotalDoc.do', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, body, credentials: 'include' }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { return { error: t.slice(0, 200) }; } out.push(...(j.list || [])); if (!j.list || j.list.length < 500) break; } return { list: out }; }, { from: ymd(from), to: ymd(to), formNm: src.formName || '지출결의서(계좌이체)', sts: src.docSts || '' });
    if (!list || !Array.isArray(list.list)) throw new Error('목록을 읽지 못했습니다: ' + JSON.stringify(list).slice(0, 200));
    const formRe = new RegExp(src.formFilter || '지출결의서\\(계좌이체\\)'); const titleRe = (src.titleFilter && src.titleFilterStrict) ? new RegExp(src.titleFilter) : null; /* 제목 필터는 titleFilterStrict:true 일 때만. 기본은 지출결의서(계좌이체) 전부를 읽는다(제목에 기타소득 등이 없는 팀의 문서도 짝짓기 대상) */
    const uniq = {}; list.list.forEach(d => { uniq[d.DOC_ID] = d; });
    const docs = Object.values(uniq).filter(d => formRe.test(txt(d.FORM_NM)) && (!titleRe || titleRe.test(txt(d.DOC_TITLE)))).sort((a, b) => (a.CREATED_DT < b.CREATED_DT ? -1 : 1));
    console.log(`그룹웨어 전체결재문서 ${list.list.length}건 중 대상 ${docs.length}건 (${ymd(from)}~${ymd(to)}, 상태 ${src.docSts || '전체'})`);
    /* 3) 상세에서 금액·시행일 */
    /* 3) 상세에서 금액·시행일. 한 번 읽은 문서는 bizbox-cache.json 에 기억해 두고(문서번호+상태 기준) 다음 실행에서는 새로 올라왔거나 상태가 바뀐 문서만 연다.
          문서 3건을 동시에 열고, 화면이 그려지면 바로 읽어 시간을 줄인다. 진행 상황을 창에 표시한다 */
    const cacheFile = path.resolve(__dirname, src.cacheFile || 'bizbox-cache.json'); let cache = {};
    try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) || {}; } catch (e) { cache = {}; }
    const toRead = docs.filter(d => { const c = cache[txt(d.DOC_NO)]; return !(c && c.sts === txt(d.DOC_STS) && (c.gross > 0 || c.v === 2)); }); /* 금액을 못 읽은(0원) 문서는 새 읽기 방식(v2)으로 한 번 더 */
    console.log(`상세 읽기: 새로 읽을 문서 ${toRead.length}건, 기억해 둔 문서 ${docs.length - toRead.length}건`);
    const details = {}; let done = 0; const t0 = Date.now();
    async function readOne(pg, d) {
      let detail = { gross: 0, net: 0, wh: 0, execDate: '', how: '' };
      try {
        await pg.goto(`${base}/eap/ea/docpop/EAAppDocViewPop.do?doc_id=${d.DOC_ID}&form_id=${d.FORM_ID}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await pg.waitForFunction(() => document.body && document.body.innerText.replace(/\s/g, '').length > 200, null, { timeout: 6000 }).catch(() => {});
        await pg.waitForTimeout(700); detail = await pg.evaluate(extractInPage);
      } catch (e) { console.log('  상세 읽기 실패', d.DOC_NO, String(e.message).split('\n')[0]); }
      details[txt(d.DOC_NO)] = detail; cache[txt(d.DOC_NO)] = { sts: txt(d.DOC_STS), gross: detail.gross || 0, net: detail.net || 0, wh: detail.wh || 0, execDate: detail.execDate || '', how: detail.how || '', v: 2, readAt: new Date().toISOString() };
      done++; if (done % 5 === 0 || done === toRead.length) console.log(`  읽는 중 ${done}/${toRead.length} (${Math.round((Date.now() - t0) / 1000)}초)`);
    }
    const queue = toRead.slice(); const workers = [];
    for (let w = 0; w < Math.min(3, queue.length); w++) {
      workers.push((async () => { const pg = await context.newPage(); try { while (queue.length) { const d = queue.shift(); await readOne(pg, d); } } finally { await pg.close().catch(() => {}); } })());
    }
    await Promise.all(workers);
    try { fs.writeFileSync(cacheFile, JSON.stringify(cache)); } catch (e) {}
    const items = [];
    for (const d of docs) {
      const c = cache[txt(d.DOC_NO)] || {}; const detail = details[txt(d.DOC_NO)] || { gross: c.gross || 0, net: c.net || 0, wh: c.wh || 0, execDate: c.execDate || '' };
      /* 결재 중 문서도 보내되 웹앱은 종결(최종 결재권자 승인, DOC_STS 90)된 건만 품의번호로 적고 결재 중은 보류한다. 반려·회수 등은 상태 이름을 보고 웹앱이 품의번호를 비운다. 지급일자는 경영기획실이 엑셀에서 적으므로 시행일자는 참고용 */
      const exec = dateStr(detail.execDate);
      items.push({ approvalNo: txt(d.DOC_NO), title: txt(d.DOC_TITLE), amount: detail.gross || 0, net: detail.net || 0, wh: detail.wh || 0, date: dateStr(d.CREATED_DT), execDate: exec, status: txt(d.DOC_STSNM) + (exec ? '·시행' : ''), drafter: txt(d.USER_NM), dept: txt(d.DEPT_NM), confirmed: txt(d.DOC_STS) === '90' || !!exec });
    }
    return items;
  } finally { await browser.close(); }
}
/* 저장된 로그인 상태가 아직 유효한지만 본다(--auto 가 10분마다 호출). 유효하면 상태 파일을 다시 저장해 세션이 끊기지 않게 한다 */
async function checkLogin(src) {
  const { chromium } = require('playwright');
  const base = (src.url || 'https://gw.openknowl.com').replace(/\/$/, ''); const stateFile = path.resolve(__dirname, src.stateFile || 'bizbox-state.json');
  if (!fs.existsSync(stateFile)) return { loggedIn: false, reason: 'no-state' };
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: stateFile }); const page = await context.newPage();
    await page.goto(base + '/gw/userMain.do', { waitUntil: 'domcontentloaded', timeout: 30000 }); await page.waitForTimeout(800);
    const need = /egovLoginUsr|bizbox\.do$/.test(page.url()) || (await page.locator('#userPw').count()) > 0;
    if (!need) await context.storageState({ path: stateFile });
    return { loggedIn: !need };
  } finally { await browser.close(); }
}
module.exports = { readBizbox, checkLogin };
