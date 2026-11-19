// 보물찾기 — 힌트 / 사진 올리기
// ponytail: 저장은 이 기기 localStorage. 실제 행사에선 다른 사람 힌트·사진이 공유돼야 하므로 store만 Supabase로 바꾸면 됨.

const UPLOAD_EVERY = 5 * 60 * 1000;
const PHOTO_MAX = 1000; // 긴 변 px
const params = new URLSearchParams(location.search);
const IS_ADMIN = params.has('admin');

const bg = params.get('bg');
if (bg) document.documentElement.dataset.bg = bg;
const look = params.get('look');
if (look) document.documentElement.dataset.look = look;

const $ = (id) => document.getElementById(id);

/* 키치 바탕: 흰 쪽지 뿌리기 (시드 고정이라 매번 같은 배치) */
const BG_PAPERS = 140;
function scatterPapers() {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const layer = document.createElement('div');
  layer.className = 'paper-bg';
  for (let i = 0; i < BG_PAPERS; i++) {
    const p = document.createElement('i');
    const w = 60 + rand() * 90;
    p.style.cssText = `left:${rand() * 110 - 10}%;top:${rand() * 110 - 10}%;width:${w}px;height:${w * (0.75 + rand() * 0.5)}px;rotate:${rand() * 80 - 40}deg`;
    layer.append(p);
  }
  document.querySelector('.phone').prepend(layer);
}
scatterPapers();

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem('th.' + key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('th.' + key, JSON.stringify(value)); return true; } catch { return false; }
  },
};

const timeText = (ms) => new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

/* 쪽지 (입장 쪽지·힌트 쪽지 공용) */
const NOTE_PARTS = '<i class="q tl"></i><i class="q bl"></i><span class="r"><i class="q tr"></i><i class="q br"></i></span>';
function makeNote(color, inner, extraClass = '') {
  const el = document.createElement('button');
  el.className = `note folded ${extraClass}`.trim();
  el.style.setProperty('--kc', color);
  el.innerHTML = NOTE_PARTS + inner;
  return el;
}

/* 입장 */
function enter(nick) {
  $('me').textContent = nick;
  $('enter').hidden = true;
  $('name').hidden = true;
  $('main').hidden = false;
  $('hintForm').hidden = !IS_ADMIN;
  renderHints();
  renderPhotos();
  tick();
}

/* 입장 쪽지: 누르면 펴짐. 다 펴지면 한 번 더 누르면 입장 */
const NOTES = [
  { ch: '보', info: '12월 ○일 ○시', color: '#ff3d9a' },
  { ch: '물', info: '정보관 7층', color: '#2f6bff' },
  { ch: '찾', info: '찾는 순간을 남겨 주세요', color: '#19c25b' },
  { ch: '기', info: '어쩌면 나도 상품의 주인공?', color: '#ff8a1f' },
];

const noteEls = NOTES.map((n) => {
  const el = makeNote(n.color, '<span class="tag"></span><span class="face"><small></small></span>');
  el.setAttribute('aria-label', n.ch);
  el.querySelector('.tag').textContent = n.ch;
  el.querySelector('small').textContent = n.info;
  // 펴는 클릭은 여기서 멈춤 → 마지막 쪽지를 펴는 순간 바로 입장되지 않게
  el.addEventListener('click', (e) => {
    if (!el.classList.contains('folded')) return;
    e.stopPropagation();
    unfold(el);
  });
  return el;
});
$('notes').replaceChildren(...noteEls);

function unfold(el) {
  if (!el.classList.contains('folded')) return;
  el.classList.replace('folded', 'open');
  if (noteEls.every((n) => n.classList.contains('open'))) $('enter').classList.add('ready');
}
// 자동으로 펴지지 않음: 직접 눌러서 펴 봄
function playNotes() {
  $('enter').classList.remove('ready');
  noteEls.forEach((el) => el.classList.replace('open', 'folded'));
}

function goHome() {
  $('main').hidden = true;
  $('name').hidden = true;
  $('enter').hidden = false;
  playNotes();
}
$('homeBtn').addEventListener('click', goHome);

function goName() {
  const nick = store.get('nick', '');
  if (nick) return enter(nick);
  $('enter').hidden = true;
  $('name').hidden = false;
  $('nick').focus();
}
// 쪽지가 다 펴진 뒤엔 화면 어디를 눌러도 입장 (펴지는 중 누른 건 펴기만)
$('enter').addEventListener('click', (e) => {
  if (!$('enter').classList.contains('ready')) return;
  goName();
});

$('nameForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const nick = $('nick').value.trim();
  if (!nick) return;
  store.set('nick', nick);
  enter(nick);
});

/* 탭 */
document.querySelectorAll('[data-tab]').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((t) => t.setAttribute('aria-selected', t === tab));
    $('pane-hint').hidden = tab.dataset.tab !== 'hint';
    $('pane-photo').hidden = tab.dataset.tab !== 'photo';
  });
});

/* 힌트: 들어올 때마다 접힌 쪽지로. 눌러서 펴 봄 */
const MIN = 60 * 1000;
const HINT_COLORS = ['#ff3d9a', '#2f6bff', '#19c25b', '#ff8a1f'];
// 시안용: 주최자가 이미 힌트 3개를 줬다고 가정
const DEMO_HINTS = [
  { text: '엘리베이터에서 내리면 왼쪽부터 살펴보세요', at: Date.now() - 25 * MIN },
  { text: '초록색이 많은 곳에 하나 숨어 있어요', at: Date.now() - 15 * MIN },
  { text: '창문 근처, 손이 잘 안 닿는 높이', at: Date.now() - 5 * MIN },
];
const getHints = () => store.get('hints', DEMO_HINTS);

function renderHints() {
  const hints = getHints();
  $('hintEmpty').hidden = hints.length > 0;
  $('hints').replaceChildren(...hints.map((h, i) => {
    const el = makeNote(HINT_COLORS[i % HINT_COLORS.length],
      `<span class="tag">힌트 ${i + 1}</span><span class="face"><span class="no">힌트 ${i + 1}<time></time></span><p></p></span>`, 'hint-note');
    el.querySelector('time').textContent = timeText(h.at);
    el.querySelector('p').textContent = h.text;
    el.addEventListener('click', () => el.classList.replace('folded', 'open'));
    return el;
  }).reverse());
}

$('hintForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('hintText').value.trim();
  if (!text) return;
  store.set('hints', [...getHints(), { text, at: Date.now() }]);
  $('hintText').value = '';
  renderHints();
});

/* 사진 */
function resize(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, PHOTO_MAX / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => reject(new Error('사진을 열 수 없어요'));
    img.src = URL.createObjectURL(file);
  });
}

function renderPhotos() {
  const photos = store.get('photos', []);
  $('photos').replaceChildren(...photos.map((p) => {
    const li = document.createElement('li');
    li.innerHTML = '<img alt=""><time></time>';
    li.querySelector('img').src = p.src;
    li.querySelector('time').textContent = timeText(p.at);
    return li;
  }).reverse());
}

$('file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const src = await resize(file);
    const ok = store.set('photos', [...store.get('photos', []), { src, at: Date.now(), nick: store.get('nick', '') }]);
    if (!ok) throw new Error('저장 공간이 가득 찼어요');
    renderPhotos();
    tick();
  } catch (err) {
    alert(err.message);
  }
});

/* 다음 사진까지 */
function tick() {
  const photos = store.get('photos', []);
  const last = photos.length ? photos[photos.length - 1].at : 0;
  const left = last + UPLOAD_EVERY - Date.now();
  const due = !last || left <= 0;
  document.querySelector('.timer').classList.toggle('due', due);
  if (!last) { $('timerLabel').textContent = '지금 찾고 있는 모습을 찍어 올려 보세요'; $('timer').textContent = ''; return; }
  if (due)   { $('timerLabel').textContent = '지금 찍어 올릴 차례예요'; $('timer').textContent = ''; return; }
  const s = Math.ceil(left / 1000);
  $('timerLabel').textContent = '다음 사진까지';
  $('timer').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
setInterval(tick, 1000);

playNotes();
