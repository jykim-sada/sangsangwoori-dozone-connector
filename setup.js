/* 연동 프로그램 설정 도우미 (install.bat 이 호출). 질문에 답하면 config.json 을 만든다. 다시 실행하면 기존 값이 기본값으로 뜬다. */
const fs = require('fs'), path = require('path'), readline = require('readline');
const dir = __dirname; const cfgPath = path.join(dir, 'config.json'); const example = JSON.parse(fs.readFileSync(path.join(dir, 'config.example.json'), 'utf8'));
let cur = {}; try { cur = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (e) { cur = {}; }
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def) => new Promise(res => rl.question(q + (def ? ` [${def}]` : '') + ': ', a => res((a || '').trim() || def || '')));
(async () => {
  console.log('\n=== 원천세 지급관리 ↔ 더존(비즈박스) 연동 설정 ===');
  console.log('웹앱 관리 → 데이터 → 더존 연동 카드에 있는 값을 적습니다.\n');
  const appUrl = await ask('1) 웹앱 수신 주소', cur.appUrl || example.appUrl);
  const key = await ask('2) 연동 키 (카드의 "보기"로 확인)', cur.key && !/보기/.test(cur.key) ? cur.key : '');
  const src = Object.assign({}, example.source, cur.source || {}, { type: 'bizbox' });
  const dailyHour = await ask('3) 매일 자동 실행 시각 (시, 0~23)', String(cur.dailyHour == null ? 9 : cur.dailyHour));
  console.log('   (그룹웨어 로그인은 설치 뒤 "연동 시험.bat"에서 브라우저 창에 직접 합니다. 비밀번호는 저장하지 않습니다)');
  rl.close();
  if (!appUrl || !key) { console.error('\n빈 값이 있어 저장하지 않았습니다. install.bat 을 다시 실행하세요.'); process.exit(1); }
  const cfg = { appUrl, key, dailyHour: Number(dailyHour) || 9, source: src }; delete cfg.source.requireExec; delete cfg.source.userId; delete cfg.source.password; delete cfg.source.groupId;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2)); console.log('\nconfig.json 을 저장했습니다 (' + cfgPath + ')');
  console.log('다음 단계: 설치가 끝나면 "연동 시험.bat" 으로 첫 로그인(2차 인증)과 짝짓기 결과를 확인하세요.');
})();
