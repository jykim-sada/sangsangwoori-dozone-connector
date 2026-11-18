/* 작업 스케줄러 등록 (install.js 와 자동업데이트.bat 이 호출). 실행 주기를 바꾸고 싶으면 이 파일을 고쳐 저장소에 올리면 다음 자동 업데이트 때 노트북에 다시 등록된다.
   - "원천세 더존 연동": 매일 dailyHour시(기본 9시)에 한 번 node dozone-sync.js --auto  (그룹웨어 읽기 → 웹앱 전송). 노트북에서 직접: "지금 더존과 연동.bat"
   - "원천세 더존 연동 업데이트": 매일 dailyHour 10분 전에 자동업데이트.bat (git pull + npm install + 이 파일 재실행). git 으로 설치한 폴더에만.
   - "원천세 더존 연동 확인": 5분마다 창 없이(run-hidden.vbs) 웹앱에 "지금 더존과 연동" 버튼이 눌렸는지 묻고, 눌렸을 때만 더존을 읽는다. node 의 전체 경로를 넘겨 PATH 와 무관하게 돈다. 등록 직후 한 번 바로 실행해 웹앱 카드에 신호가 보이게 한다.
   node register-tasks.js            → 등록
   node register-tasks.js --show     → 등록할 명령만 보여 준다 (등록하지 않음) */
const { spawnSync } = require('child_process'); const path = require('path'); const fs = require('fs'); const dir = __dirname;
const show = process.argv.includes('--show');
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')); } catch (e) { cfg = {}; }
const hour = Math.min(23, Math.max(0, Number(cfg.dailyHour == null ? 9 : cfg.dailyHour) || 0));
const hh = n => String(n).padStart(2, '0');
const runAt = hh(hour) + ':00'; const updAt = (hour === 0 ? '23' : hh(hour - 1)) + ':50';
const CHECK = '원천세 더존 연동 확인';
const tasks = [
  { name: '원천세 더존 연동', tr: '"' + process.execPath + '" "' + path.join(dir, 'dozone-sync.js') + '" --auto', at: runAt, when: '매일 ' + runAt + ' 더존 읽어 보내기' },
];
if (fs.existsSync(path.join(dir, '.git')) && fs.existsSync(path.join(dir, '자동업데이트.bat'))) tasks.push({ name: '원천세 더존 연동 업데이트', tr: '"' + path.join(dir, '자동업데이트.bat') + '"', at: updAt, when: '매일 ' + updAt + ' GitHub 에서 새 파일 받기' });
/* 웹앱의 "지금 더존과 연동" 버튼용. 첫 인자로 node.exe 전체 경로를 넘긴다(작업 스케줄러에서는 PATH 에 node 가 없을 수 있다). 더존 정기 읽기는 위의 09:00 작업뿐 */
if (fs.existsSync(path.join(dir, 'run-hidden.vbs'))) tasks.push({ name: CHECK, tr: 'wscript.exe "' + path.join(dir, 'run-hidden.vbs') + '" "' + process.execPath + '" --auto --only-requested', every: 5, when: '5분마다 창 없이 웹앱 버튼 확인 (눌렸을 때만 더존 읽기)' });
let fail = 0;
tasks.forEach(t => {
  const args = t.every ? ['/Create', '/F', '/SC', 'MINUTE', '/MO', String(t.every), '/TN', t.name, '/TR', t.tr] : ['/Create', '/F', '/SC', 'DAILY', '/ST', t.at, '/TN', t.name, '/TR', t.tr];
  if (show) { console.log('schtasks', args.join(' ')); return; }
  const r = spawnSync('schtasks', args, { stdio: 'inherit' });
  if (r.status === 0) console.log('등록: "' + t.name + '" — ' + t.when); else { fail++; console.log('등록 실패: "' + t.name + '" (관리자 권한으로 다시 실행하거나 작업 스케줄러에서 직접 등록: ' + t.tr + ')'); }
});
if (!show) {
  console.log(fail ? '\n일부 등록에 실패했습니다.' : '\n작업 스케줄러 등록 완료: 더존 읽기는 매일 ' + runAt + ' 한 번 + 웹앱의 "지금 더존과 연동" 버튼(5분 안에, 창 없이). 노트북에서 직접은 "지금 더존과 연동.bat".');
  /* 확인 작업을 지금 한 번 돌려 본다: 1~2분 뒤 웹앱 더존 연동 카드에 "노트북 연동 프로그램: 마지막 신호 …"가 보이면 정상. 실패하면 이 폴더의 sync.log 에 이유가 남는다 */
  if (tasks.some(t => t.name === CHECK)) { const r = spawnSync('schtasks', ['/Run', '/TN', CHECK], { stdio: 'inherit' }); console.log(r.status === 0 ? '확인 작업을 한 번 바로 실행했습니다. 1~2분 뒤 웹앱 관리 → 데이터 → 더존 연동 카드에 "노트북 연동 프로그램: 마지막 신호 …"가 보이면 정상입니다. 안 보이면 이 폴더의 sync.log 를 열어 보세요.' : '확인 작업을 바로 실행하지 못했습니다(작업 스케줄러에서 "' + CHECK + '"을 직접 실행해 보세요).'); }
  process.exit(fail ? 1 : 0);
}
