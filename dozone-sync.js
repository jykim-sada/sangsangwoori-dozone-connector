/* 더존 → 원천세 지급관리 웹앱 연동 프로그램 (경영기획실 컴퓨터에서 실행)
   더존 지출결의 목록을 읽어 웹앱 수신 주소로 보내면, 웹앱이 금액·사업명·기안자·날짜로 지급요청을 찾아 품의번호(지결번호)와 시행일(지급일자)을 적는다.

   실행:  node dozone-sync.js                 (config.json 의 source 로 읽어 보냄)
          node dozone-sync.js --sample        (가짜 2건을 보내 연결만 확인)
          node dozone-sync.js --dry-run       (웹앱에 반영하지 않고 짝짓기 결과만 봄)
          node dozone-sync.js --headed        (비즈박스: 브라우저를 보이게 띄워 첫 로그인·2차 인증 처리)
   설정:  같은 폴더의 config.json (config.example.json 을 복사해 채운다)
          node dozone-sync.js --auto          (작업 스케줄러용: 매일 dailyHour시(기본 9시)에 한 번 실행된다. 그룹웨어 로그인 확인 → 웹앱에 노트북 상태 알림 →
                                               그날 아직 안 돌았거나 웹앱에서 "지금 더존과 연동"을 눌러 두었으면 더존을 읽어 보낸다. 주기는 register-tasks.js)
   설치:  install.bat 을 더블클릭하면 모듈 설치 → 설정 → 작업 스케줄러 등록까지 한 번에 된다 */
const fs = require('fs'), path = require('path');
const args = new Set(process.argv.slice(2)); const cfgPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(cfgPath)) { console.error('config.json 이 없습니다. config.example.json 을 복사해 채우세요.'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const stateFile = path.join(__dirname, '.state.json'); const logFile = path.join(__dirname, 'sync.log'); const stamp = path.join(__dirname, '.lastrun');
const nowIso = () => new Date().toISOString();
const log = msg => { const line = nowIso() + ' ' + msg; console.log(line); try { fs.appendFileSync(logFile, line + '\n'); } catch (e) {} };
const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')) || {}; } catch (e) { return {}; } };
const writeState = patch => { const s = Object.assign(readState(), patch); try { fs.writeFileSync(stateFile, JSON.stringify(s)); } catch (e) {} return s; };
const dateStr = v => { if (!v) return ''; if (v instanceof Date) return v.toISOString().slice(0, 10); const s = String(v).trim().replace(/[./]/g, '-'); const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : ''); };

/* ---- 더존에서 목록 읽기: 소스 종류별 ---- */
async function readItems() {
  if (args.has('--sample')) return [
    { approvalNo: '26-지결-9001', title: '행복캠퍼스 11월 외부 강사비', amount: 300000, date: '2026-11-20', execDate: '2026-11-25', status: '승인', drafter: '김담당' },
    { approvalNo: '26-지결-9002', title: '테스트 상신 전 건', amount: 100000, date: '2026-11-21', status: '작성중', drafter: '김담당' },
  ];
  const src = cfg.source || {};
  if (src.type === 'json') { /* 미리 만들어 둔 항목 파일 보내기 (시험용) */ return JSON.parse(fs.readFileSync(path.resolve(__dirname, src.file || 'items.json'), 'utf8')); }
  if (src.type === 'bizbox') {
    /* 더존 비즈박스 알파 그룹웨어(전자결재)에서 읽기 — bizbox.js 참고. npm i playwright && npx playwright install chromium */
    const { readBizbox } = require('./bizbox'); return readBizbox(src, { headed: args.has('--headed') });
  }
  if (src.type === 'mssql') {
    /* 더존 iCUBE / Amaranth 사내 서버(MS SQL)에서 직접 조회. 읽기 전용 계정과 지출결의 테이블·컬럼명은 더존 유지보수 업체에 확인해 query 에 넣는다.
       query 결과 컬럼 별칭: approvalNo, title, amount, date, execDate, status, drafter  (npm i mssql 필요) */
    const sql = require('mssql'); const pool = await sql.connect(src.connection); const rs = await pool.request().query(src.query); await pool.close();
    return rs.recordset.map(r => ({ approvalNo: r.approvalNo, title: r.title, amount: Number(r.amount) || 0, date: dateStr(r.date), execDate: dateStr(r.execDate), status: r.status, drafter: r.drafter }));
  }
  if (src.type === 'http') {
    /* 더존 WEHAGO·Amaranth 10 등 API(또는 사내 중계 API)에서 JSON 으로 받는 경우. map 으로 필드 이름을 맞춘다 */
    const res = await fetch(src.url, { headers: src.headers || {} }); if (!res.ok) throw new Error('더존 API 응답 ' + res.status); const data = await res.json(); const rows = src.path ? src.path.split('.').reduce((o, k) => (o || {})[k], data) : data; const m = src.map || {};
    return (rows || []).map(r => ({ approvalNo: r[m.approvalNo || 'approvalNo'], title: r[m.title || 'title'], amount: Number(r[m.amount || 'amount']) || 0, date: dateStr(r[m.date || 'date']), execDate: dateStr(r[m.execDate || 'execDate']), status: r[m.status || 'status'], drafter: r[m.drafter || 'drafter'] }));
  }
  throw new Error('config.json 의 source.type 은 mssql 또는 http 여야 합니다 (연결 확인만 하려면 --sample)');
}

/* ---- 그룹웨어 로그인 유지: 10분마다 저장된 로그인 상태로 그룹웨어에 들어가 보고(세션이 끊기지 않게), 만료됐으면 상태에 남긴다 ---- */
async function keepAlive() {
  const src = cfg.source || {}; if (src.type !== 'bizbox') return;
  const st = readState(); const last = Date.parse(st.loginCheckedAt || '') || 0; if (Date.now() - last < 10 * 60000) return;
  let login = 'ok', err = '';
  try { const { checkLogin } = require('./bizbox'); const r = await checkLogin(src); login = r.loggedIn ? 'ok' : 'expired'; } catch (e) { login = 'error'; err = String(e.message || e); }
  if (login !== st.login) log(login === 'ok' ? '그룹웨어 로그인 정상' : login === 'expired' ? '그룹웨어 로그인이 없거나 만료되었습니다. "연동 시험.bat"을 실행해 브라우저 창에서 다시 로그인하세요' : '그룹웨어 확인 실패: ' + err);
  writeState({ login, loginCheckedAt: nowIso(), loginError: err });
}

/* ---- 웹앱에 묻기(5분마다): 화면에서 "지금 더존과 연동"을 눌렀는지. 이때 노트북 상태(로그인·마지막 실행·오류)도 같이 알려 더존 연동 카드에 보이게 한다 ---- */
/* 원격 진단용: 지금 노트북에 받아진 git 버전(자동 업데이트가 됐는지)과 로그 끝부분 */
function gitVersion() { try { const g = path.join(__dirname, '.git'); const head = fs.readFileSync(path.join(g, 'HEAD'), 'utf8').trim(); if (!/^ref:/.test(head)) return head.slice(0, 7); const ref = head.slice(5).trim(); const f = path.join(g, ref); if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim().slice(0, 7); const packed = fs.readFileSync(path.join(g, 'packed-refs'), 'utf8').split('\n').find(l => l.endsWith(' ' + ref)); return packed ? packed.slice(0, 7) : ''; } catch (e) { return ''; } }
function tail(file, n) { try { const t = fs.readFileSync(path.join(__dirname, file), 'utf8'); return t.split(/\r?\n/).filter(l => l.trim()).slice(-n).map(l => l.slice(0, 160)).join('\n'); } catch (e) { return ''; } }
async function pollApp() {
  const st = readState();
  try { return await sendToApp(cfg.appUrl, { key: cfg.key, action: 'poll', state: { login: st.login || '', loginCheckedAt: st.loginCheckedAt || '', lastRunAt: st.lastRunAt || '', lastResult: st.lastResult || '', lastError: st.lastError || '', lastErrorAt: st.lastErrorAt || '', version: gitVersion(), mode: args.has('--only-requested') ? 'check' : 'daily', logTail: tail('sync.log', 12), updTail: tail('update.log', 4) } }); }
  catch (e) { log('웹앱에 닿지 못함: ' + e.message); return {}; }
}
function dueNow(poll) {
  const d0 = new Date(); const today = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0'); const hour = d0.getHours(); const dailyHour = Number(cfg.dailyHour == null ? 9 : cfg.dailyHour);
  const ranToday = fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === today;
  /* --only-requested: 5분마다 창 없이 도는 확인 작업. 웹앱에서 "지금 더존과 연동"을 눌렀을 때만 돌고, 매일 정기 실행은 09:00 작업이 맡는다 */
  const daily = !args.has('--only-requested') && hour >= dailyHour && !ranToday; /* 9시에 PC가 꺼져 있었으면 그날 처음 켜졌을 때 한 번 */
  return { due: !!poll.requested || daily, today, why: poll.requested ? '화면에서 지금 연동 요청' : daily ? '매일 ' + dailyHour + '시 정기 실행' : '' };
}

/* 웹앱으로 보내기. 구글 앱스 스크립트는 POST 에 302 로 응답하고 결과는 googleusercontent 주소에서 GET 으로 받는다.
   1차: 보통의 fetch(자동 리다이렉트). 응답이 JSON 이 아니면 2차: 리다이렉트를 손으로 따라가 GET. 그래도 안 되면 상태·주소를 같이 보여 준다 */
async function sendToApp(appUrl, body) {
  const hostOk = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(appUrl);
  if (!hostOk) console.log('주의: appUrl 이 https://script.google.com/macros/s/<배포ID>/exec 형식이 아닙니다 (회사 도메인이 붙은 주소는 연동 프로그램에서 쓸 수 없습니다):', appUrl.replace(/\/s\/[^/]+/, '/s/…'));
  const payload = JSON.stringify(body); const tried = [];
  const parse = (text) => { try { return JSON.parse(text); } catch (e) { return null; } };
  /* 1차 */
  let res = await fetch(appUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, redirect: 'follow' });
  let text = await res.text(); let out = parse(text); if (out) return out;
  tried.push('1차 ' + res.status + ' ' + (res.headers.get('content-type') || '') + ' ' + res.url.replace(/\/s\/[^/]+/, '/s/…').slice(0, 80) + ' 본문 ' + text.length + '자');
  /* 2차: 리다이렉트를 직접 따라감 */
  res = await fetch(appUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, redirect: 'manual' });
  const loc = res.headers.get('location');
  if (loc) { const r2 = await fetch(loc, { redirect: 'follow' }); text = await r2.text(); out = parse(text); if (out) return out; tried.push('2차 ' + r2.status + ' ' + (r2.headers.get('content-type') || '') + ' 본문 ' + text.length + '자'); }
  else { text = await res.text(); out = parse(text); if (out) return out; tried.push('2차 ' + res.status + ' location 없음 본문 ' + text.length + '자'); }
  throw new Error('웹앱 응답이 JSON 이 아닙니다. 배포 접근 권한이 "모든 사용자"인지, appUrl 이 /macros/s/…/exec 형식인지, 이 PC 네트워크가 script.google.com 과 script.googleusercontent.com 에 닿는지 확인하세요. [' + tried.join(' | ') + '] ' + text.replace(/\s+/g, ' ').slice(0, 160));
}

(async () => {
  const auto = args.has('--auto'); let due = null;
  if (auto) {
    await keepAlive(); const poll = await pollApp(); due = dueNow(poll); if (!due.due) return;
    const st = readState();
    if (st.login === 'expired') { const lastHold = Date.parse(st.holdLoggedAt || '') || 0; if (Date.now() - lastHold > 60 * 60000) { log('실행 보류(' + due.why + '): 그룹웨어 로그인 만료. "연동 시험.bat"으로 다시 로그인하면 바로 이어서 돕니다'); writeState({ holdLoggedAt: nowIso() }); } return; }
    log('실행: ' + due.why);
  }
  const items = (await readItems()).filter(x => x && x.approvalNo);
  const body = { key: cfg.key, items, apply: !args.has('--dry-run'), onlyConfirmed: cfg.onlyConfirmed !== false };
  const out = await sendToApp(cfg.appUrl, body);
  if (!out.ok) throw new Error('웹앱 오류: ' + out.error);
  console.log(`${nowIso()} 보냄 ${out.received}건 · 짝지음 ${out.matched.length} · 반영 ${out.applied} · 못 찾음 ${out.unmatched.length} · 결재 중·상신 전 ${out.pending} · 비움 ${(out.cleared || []).length}`);
  out.matched.forEach(m => console.log('  ✓', m.approvalNo, '→', m.no, m.project, m.period, m.execDate || '', m.changed ? '(저장)' : '(변경 없음)'));
  out.unmatched.forEach(u => console.log('  ✗', u.approvalNo, u.title, u.amount, '-', u.reason));
  fs.appendFileSync(logFile, `${nowIso()} received=${out.received} matched=${out.matched.length} applied=${out.applied} unmatched=${out.unmatched.length} cleared=${(out.cleared || []).length} pending=${out.pending}\n`);
  const src = cfg.source || {};
  writeState(Object.assign({ lastRunAt: nowIso(), lastResult: `받음 ${out.received}·반영 ${out.applied}·못 찾음 ${out.unmatched.length}·결재 중 ${out.pending}`, lastError: '', lastErrorAt: '' }, src.type === 'bizbox' && !args.has('--sample') ? { login: 'ok', loginCheckedAt: nowIso(), loginError: '' } : {}));
  if (due) fs.writeFileSync(stamp, due.today); /* 성공했을 때만 "오늘 돌았다"로 적는다 (실패하면 5분 뒤 다시 시도) */
})().catch(e => { const msg = String(e && e.message || e); log('실패: ' + msg); writeState(Object.assign({ lastError: msg, lastErrorAt: nowIso() }, /로그인 상태가 없거나 만료|로그인이 확인되지 않았습니다/.test(msg) ? { login: 'expired', loginCheckedAt: nowIso() } : {})); process.exit(1); });
