/********************
 * 설정
 ********************/
const ADMIN_PIN = "0228";
const CATEGORIES = ["토티쌤", "캔바", "학자시"];
const COUNT = 5;
const TOKENS = { 1: "A1", 2: "B2", 3: "C3", 4: "D4" };

const K = {
  Q: "qr_questions_v1",
  BOOTH: "qr_booth_v1",
  ADMIN: "qr_admin_authed_v1",
};

/********************
 * 문항 데이터 (3x5 고정)
 ********************/
function defaultQuestions() {
  const list = [];
  for (const cat of CATEGORIES) {
    for (let i = 1; i <= COUNT; i++) {
      list.push({
        id: `${cat}-${i}`,
        category: cat,
        index: i,
        enabled: true,
        question: `${cat} ${i}번 문제를 입력하세요`,
        choices: ["보기1", "보기2", "보기3", "보기4"],
        answer: 0, // 0~3
      });
    }
  }
  return list;
}

function normalizeQuestions(loaded) {
  const defaults = defaultQuestions();
  const map = new Map((loaded || []).map(q => [q.id, q]));
  return defaults.map(d => ({ ...d, ...(map.get(d.id) || {}) }));
}

function loadQuestions() {
  try {
    const raw = localStorage.getItem(K.Q);
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizeQuestions(parsed);
  } catch {
    return defaultQuestions();
  }
}

function saveQuestions(list) {
  const normalized = normalizeQuestions(list);
  localStorage.setItem(K.Q, JSON.stringify(normalized));
  return normalized;
}

function getBooth() {
  const b = Number(localStorage.getItem(K.BOOTH) || "1");
  return [1,2,3,4].includes(b) ? b : 1;
}
function setBooth(b) { localStorage.setItem(K.BOOTH, String(b)); }
function $(id) { return document.getElementById(id); }

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}
function escapeAttr(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll('"',"&quot;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}
function escapeJs(s) {
  return String(s ?? "").replaceAll("\\","\\\\").replaceAll("'","\\'");
}
function cssEscape(s) {
  return String(s ?? "").replaceAll(/[^a-zA-Z0-9_-]/g, (m) => "_" + m.charCodeAt(0) + "_");
}

/********************
 * BLE (Web Bluetooth) - Nordic UART
 ********************/
const UART_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX      = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // write

let ble = { device: null, server: null, rx: null, connected: false };

async function bleConnect(onState) {
  if (!navigator.bluetooth) {
    alert("이 브라우저는 Web Bluetooth를 지원하지 않아요. 갤럭시 크롬에서 실행하세요.");
    return;
  }

  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [UART_SERVICE] }],
    optionalServices: [UART_SERVICE],
  });

  device.addEventListener("gattserverdisconnected", () => {
    ble = { device, server: null, rx: null, connected: false };
    onState?.(false);
  });

  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(UART_SERVICE);
  const rx = await service.getCharacteristic(UART_RX);

  ble = { device, server, rx, connected: true };
  onState?.(true);
}

async function bleDisconnect(onState) {
  try {
    if (ble?.device?.gatt?.connected) ble.device.gatt.disconnect();
  } catch {}
  ble = { device: ble.device, server: null, rx: null, connected: false };
  onState?.(false);
}

async function bleSendStart() {
  if (!ble.connected || !ble.rx) throw new Error("BLE not connected");
  const booth = getBooth();
  const token = TOKENS[booth];
  const msg = `START:${token}\n`;
  await ble.rx.writeValue(new TextEncoder().encode(msg));
}

/********************
 * 페이지 분기
 ********************/
document.addEventListener("DOMContentLoaded", () => {
  if (location.pathname.endsWith("admin.html")) initAdmin();
  else initPlay();
});

/********************
 * 사용자 페이지
 ********************/
function initPlay() {
  const stage = $("stage");
  const badge = $("badge");
  const btnConnect = $("btnConnect");
  const btnDisconnect = $("btnDisconnect");
  const deviceNameEl = $("deviceName");
  const boothInfoEl = $("boothInfo");

  let questions = loadQuestions();
  let category = null;
  let pickedIndex = null;

  function setConnectedUI(connected) {
    const booth = getBooth();
    boothInfoEl.textContent = `${booth}번 (TOKEN ${TOKENS[booth]})`;
    deviceNameEl.textContent = ble?.device?.name || "-";

    if (connected) {
      badge.className = "inline-flex items-center gap-2 px-4 py-2 rounded-full text-lg font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-200";
      badge.innerHTML = "✅ <span class='leading-none'>연결됨</span>";
      btnDisconnect.classList.remove("hidden");
      btnConnect.innerHTML = "<span class='text-xl'>🔁</span><span class='leading-none'>재연결</span>";
      btnConnect.className = "h-12 px-4 rounded-xl bg-emerald-600 text-white font-extrabold text-lg shadow-md hover:bg-emerald-700 inline-flex items-center justify-center gap-2 leading-none";
    } else {
      badge.className = "inline-flex items-center gap-2 px-4 py-2 rounded-full text-lg font-extrabold bg-amber-100 text-amber-900 border border-amber-200";
      badge.innerHTML = "🔌 <span class='leading-none'>연결 필요</span>";
      btnDisconnect.classList.add("hidden");
      btnConnect.innerHTML = "<span class='text-xl'>🔗</span><span class='leading-none'>BLE 연결</span>";
      btnConnect.className = "h-12 px-4 rounded-xl bg-indigo-600 text-white font-extrabold text-lg shadow-md hover:bg-indigo-700 inline-flex items-center justify-center gap-2 leading-none";
    }
  }

  btnConnect.onclick = async () => {
    try {
      await bleConnect(setConnectedUI);
      setConnectedUI(true);
    } catch (e) {
      alert("연결 실패: " + (e?.message || e));
      setConnectedUI(false);
    }
  };

  btnDisconnect.onclick = async () => {
    await bleDisconnect(setConnectedUI);
  };

  function render() {
    stage.innerHTML = "";

    // 1) 카테고리
    if (!category) {
      const grid = document.createElement("div");
      grid.className = "grid grid-cols-1 md:grid-cols-3 gap-6";
      CATEGORIES.forEach(c => {
        const emoji = c === "토티쌤" ? "🧑‍🏫" : c === "캔바" ? "🎨" : "🧠";
        const btn = document.createElement("button");
        btn.className = "rounded-3xl bg-white border border-white shadow-lg p-8 text-left hover:shadow-xl hover:-translate-y-0.5 transition";
        btn.innerHTML = `
          <div class="flex items-center gap-4">
            <div class="h-16 w-16 rounded-2xl bg-slate-50 flex items-center justify-center text-4xl">${emoji}</div>
            <div>
              <div class="text-3xl font-extrabold text-slate-900">${c}</div>
              <div class="mt-1 text-xl text-slate-600">시작하기 →</div>
            </div>
          </div>`;
        btn.onclick = () => { category = c; pickedIndex = null; render(); };
        grid.appendChild(btn);
      });
      stage.appendChild(grid);
      return;
    }

    // 2) 문항 번호(1~5)
    if (!pickedIndex) {
      stage.innerHTML = `
        <div class="flex items-center justify-between gap-4">
          <h2 class="text-2xl font-extrabold">${category} 문항 선택 (1~5)</h2>
          <button id="backCat" class="h-12 px-5 rounded-xl bg-white border shadow-sm text-lg font-extrabold hover:bg-slate-50">← 영역 다시 선택</button>
        </div>
        <div class="mt-6 grid grid-cols-5 gap-4" id="slots"></div>
        <p class="mt-6 text-lg text-slate-600">* 문항 내용은 번호를 고른 뒤에만 보여요.</p>
      `;
      $("backCat").onclick = () => { category = null; render(); };

      const slots = $("slots");
      for (let i = 1; i <= COUNT; i++) {
        const b = document.createElement("button");
        b.className = "h-20 rounded-3xl bg-indigo-600 text-white text-3xl font-extrabold shadow-md hover:bg-indigo-700 active:scale-[0.99]";
        b.textContent = i;
        b.onclick = () => { pickedIndex = i; render(); };
        slots.appendChild(b);
      }
      return;
    }

    // 3) 문제 풀이
    const q = questions.find(x => x.id === `${category}-${pickedIndex}`);
    const disabled = !q?.enabled;

    stage.innerHTML = `
      <div class="flex items-center justify-between gap-4">
        <h2 class="text-2xl font-extrabold">${category} ${pickedIndex}번 문제</h2>
        <button id="backSlots" class="h-12 px-5 rounded-xl bg-white border shadow-sm text-lg font-extrabold hover:bg-slate-50">← 다른 문항 고르기</button>
      </div>

      <div class="mt-6 rounded-3xl bg-white border shadow-sm p-6">
        <div class="text-2xl font-extrabold text-slate-900">${escapeHtml(q?.question || "")}</div>
        ${disabled ? `<div class="mt-4 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-xl font-bold text-amber-800">
          이 문항은 비활성화되어 있어요. 다른 문항을 선택해 주세요.
        </div>` : ""}

        <div class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4" id="choices"></div>

        <div class="mt-6" id="resultBox"></div>

        <button id="btnSpin" class="mt-4 w-full h-14 rounded-2xl bg-indigo-600 text-white text-2xl font-extrabold hover:bg-indigo-700 disabled:opacity-40" disabled>
          🎡 룰렛 돌리기
        </button>
      </div>
    `;

    $("backSlots").onclick = () => { pickedIndex = null; render(); };

    const choicesDiv = $("choices");
    (q?.choices || ["", "", "", ""]).slice(0,4).forEach((text, i) => {
      const btn = document.createElement("button");
      btn.className = "h-20 rounded-3xl border bg-white shadow-sm text-xl font-extrabold text-slate-800 hover:bg-slate-50";
      btn.innerHTML = `${i+1}. ${escapeHtml(text)}`;
      btn.onclick = () => {
        if (disabled) return;
        if (i === Number(q.answer)) {
          showResult(true);
        } else {
          showResult(false);
        }
      };
      choicesDiv.appendChild(btn);
    });

    $("btnSpin").onclick = async () => {
      try {
        await bleSendStart();
        alert("룰렛 START 전송 완료!");
      } catch (e) {
        alert("전송 실패: " + (e?.message || e) + "\nBLE 연결을 확인하세요.");
      }
    };

    function showResult(correct) {
      const box = $("resultBox");
      const spin = $("btnSpin");

      if (correct) {
        box.innerHTML = `
          <div class="rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
            <div class="text-2xl font-extrabold text-emerald-700">정답! 🎉 룰렛을 돌려보세요!</div>
          </div>
        `;
        spin.disabled = false;
      } else {
        box.innerHTML = `
          <div class="rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xl font-bold text-rose-700">
            아쉬워요! 😢 다른 문항으로 다시 도전해도 돼요.
          </div>
        `;
        spin.disabled = true;
      }
    }
  }

  setConnectedUI(false);
  render();
}

/********************
 * 관리자 페이지
 ********************/
function initAdmin() {
  // PIN 가드
  if (localStorage.getItem(K.ADMIN) !== "true") {
    const pin = prompt("관리자 PIN을 입력하세요 (4자리)");
    if (pin !== ADMIN_PIN) {
      alert("PIN이 올바르지 않습니다.");
      location.href = "index.html";
      return;
    }
    localStorage.setItem(K.ADMIN, "true");
  }

  $("btnLogout").onclick = () => {
    localStorage.removeItem(K.ADMIN);
    alert("로그아웃 완료");
    location.href = "index.html";
  };

  // booth 설정
  const boothSelect = $("boothSelect");
  boothSelect.value = String(getBooth());
  boothSelect.onchange = () => setBooth(Number(boothSelect.value));

  // JSON 버튼
  $("btnExport").onclick = () => downloadJson("quiz-questions.json", loadQuestions());
  $("btnReset").onclick = () => {
    if (!confirm("기본값으로 리셋할까요?")) return;
    saveQuestions(defaultQuestions());
    alert("리셋 완료!");
    render();
  };

  $("fileImport").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    try {
      const parsed = JSON.parse(text);
      saveQuestions(parsed);
      alert("가져오기 완료!");
      render();
    } catch {
      alert("JSON 형식이 올바르지 않습니다.");
    }
  });

  render();

  function render() {
    const questions = loadQuestions();
    const area = $("adminArea");

    area.innerHTML = `
      <div class="mt-8 rounded-3xl bg-white border shadow-sm p-6">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-2xl font-extrabold">문항 편집</h2>
          <button id="btnSaveAll"
            class="h-12 px-5 rounded-xl bg-emerald-600 text-white font-extrabold text-lg hover:bg-emerald-700 shadow">
            전체 저장
          </button>
        </div>

        <div class="mt-6 space-y-4">
          ${questions.map(q => cardHtml(q)).join("")}
        </div>
      </div>
    `;

    $("btnSaveAll").onclick = () => {
      const list = loadQuestions();
      const next = list.map(q => readCard(q.id, list));
      saveQuestions(next);
      alert("저장 완료!");
      render();
    };
  }

  function cardHtml(q) {
    const sid = cssEscape(q.id);
    const choices = (q.choices || ["","","",""]).slice(0,4);

    return `
      <div class="rounded-2xl border bg-white shadow-sm p-5">
        <div class="flex items-center justify-between gap-3">
          <div class="text-xl font-extrabold">${q.category} · ${q.index}번 <span class="text-slate-400 text-sm">(${q.id})</span></div>
          <label class="inline-flex items-center gap-2 font-bold">
            <input type="checkbox" class="h-5 w-5" id="en-${sid}" ${q.enabled ? "checked" : ""}/>
            활성화
          </label>
        </div>

        <div class="mt-4">
          <label class="font-bold">문제</label>
          <input id="qq-${sid}" class="mt-2 w-full h-12 rounded-xl border px-4 text-lg"
                 value="${escapeAttr(q.question)}" />
        </div>

        <div class="mt-4">
          <label class="font-bold">보기(4개)</label>
          <div class="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
            ${choices.map((c,i)=>`
              <input id="c${i}-${sid}" class="h-12 rounded-xl border px-4 text-lg"
                     value="${escapeAttr(c)}" placeholder="보기 ${i+1}" />
            `).join("")}
          </div>
        </div>

        <div class="mt-4">
          <label class="font-bold">정답 선택</label>
          <div class="mt-2 flex flex-wrap gap-4">
            ${[0,1,2,3].map(i => `
              <label class="inline-flex items-center gap-2 text-lg font-extrabold">
                <input type="radio" name="ans-${sid}" value="${i}" ${Number(q.answer)===i ? "checked" : ""}/>
                ${i+1}번
              </label>
            `).join("")}
          </div>
        </div>

        <div class="mt-4 flex gap-3">
          <button class="h-11 px-4 rounded-xl bg-indigo-600 text-white font-extrabold hover:bg-indigo-700"
                  onclick="window.__saveOne('${escapeJs(q.id)}')">
            이 문항만 저장
          </button>
        </div>
      </div>
    `;
  }

  window.__saveOne = (qid) => {
    const list = loadQuestions();
    const updated = readCard(qid, list);
    const next = list.map(q => q.id === qid ? updated : q);
    saveQuestions(next);
    alert(`${qid} 저장 완료!`);
    render();
  };

  function readCard(qid, list) {
    const sid = cssEscape(qid);
    const base = list.find(q => q.id === qid);

    const enabled = document.getElementById(`en-${sid}`).checked;
    const question = document.getElementById(`qq-${sid}`).value;
    const choices = [0,1,2,3].map(i => document.getElementById(`c${i}-${sid}`).value);

    const radios = document.querySelectorAll(`input[name="ans-${sid}"]`);
    let answer = 0;
    radios.forEach(r => { if (r.checked) answer = Number(r.value); });

    return { ...base, enabled, question, choices, answer };
  }

  function downloadJson(filename, list) {
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

