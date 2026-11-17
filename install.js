/* install.bat 이 호출하는 설치 본체 (Node.js 가 있어야 한다). 모듈 설치 → 설정(setup.js) → 작업 스케줄러 등록 */
const { spawnSync } = require('child_process'); const path = require('path'); const dir = __dirname;
function run(cmd, args) { const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: dir, shell: true }); return r.status; }
console.log('\n=== 원천세 지급관리 - 더존(비즈박스) 연동 프로그램 설치 ===\n');
console.log('Node.js ' + process.version + ' (' + process.execPath + ')\n');
console.log('[1/3] 필요한 모듈 설치 (1~3분)');
if (run('npm', ['install', '--no-audit', '--no-fund']) !== 0) { console.error('\nnpm install 실패. 인터넷 연결을 확인하고 install.bat 을 다시 실행하세요.'); process.exit(1); }
if (run('npx', ['playwright', 'install', 'chromium']) !== 0) { console.error('\n크로미움 설치 실패. 인터넷 연결을 확인하고 install.bat 을 다시 실행하세요.'); process.exit(1); }
console.log('\n[2/3] 설정 (웹앱 수신 주소, 연동 키, 그룹웨어 계정)');
if (spawnSync(process.execPath, [path.join(dir, 'setup.js')], { stdio: 'inherit', cwd: dir }).status !== 0) process.exit(1);
console.log('\n[3/3] 작업 스케줄러 등록: 5분마다 확인해서 매일 오전 9시(설정한 시각) 자동 실행 + 앱에서 "지금 더존과 연동"을 누르면 즉시 실행');
const tr = '"' + process.execPath + '" "' + path.join(dir, 'dozone-sync.js') + '" --auto';
const s = spawnSync('schtasks', ['/Create', '/F', '/SC', 'MINUTE', '/MO', '5', '/TN', '원천세 더존 연동', '/TR', tr], { stdio: 'inherit' });
if (s.status !== 0) console.log('\n스케줄 등록에 실패했습니다. install.bat 을 마우스 오른쪽 → "관리자 권한으로 실행"으로 한 번 더 돌리거나, 작업 스케줄러에서 직접 등록하세요.\n  실행: ' + tr);
/* git 으로 설치한 폴더(.git 있음)면 매일 08:50 에 자동업데이트.bat(git pull + npm install)도 등록한다 → 연동 프로그램이 바뀌어도 파일을 복사할 일이 없다 */
const fs = require('fs');
if (fs.existsSync(path.join(dir, '.git')) && fs.existsSync(path.join(dir, '자동업데이트.bat'))) {
  const u = spawnSync('schtasks', ['/Create', '/F', '/SC', 'DAILY', '/ST', '08:50', '/TN', '원천세 더존 연동 업데이트', '/TR', '"' + path.join(dir, '자동업데이트.bat') + '"'], { stdio: 'inherit' });
  console.log(u.status === 0 ? '\n자동 업데이트 등록: 매일 08:50 에 GitHub 에서 새 파일을 받습니다 (수동: 업데이트.bat)' : '\n자동 업데이트 등록 실패: 업데이트.bat 을 가끔 직접 실행하세요');
} else console.log('\n(이 폴더는 git 으로 설치되지 않아 자동 업데이트가 없습니다. 새 파일은 원천세연동_git설치.bat 으로 다시 설치하면 자동으로 받습니다)');
console.log('\n============================================================');
console.log(' 설치가 끝났습니다.');
console.log(' - 처음 한 번: "연동 시험.bat" 을 더블클릭해 그룹웨어 로그인(2차 인증)을 직접 처리하세요.');
console.log(' - 바로 반영: "지금 더존과 연동.bat" 또는 웹앱 관리 > 데이터 > "지금 더존과 연동" 버튼.');
console.log(' - 기록: sync.log');
console.log('============================================================');
