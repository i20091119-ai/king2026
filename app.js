/********************
 * 공통 설정
 ********************/
const ADMIN_PIN = "0228";
const CATEGORIES = ["토티쌤", "캔바", "학자시"];
const COUNT = 5;

const TOKENS = { 1: "A1", 2: "B2", 3: "C3", 4: "D4" };

const K = {
  Q: "qr_questions",
  BOOTH: "qr_booth",
  ADMIN: "qr_admin",
  BLE: "qr_ble_id",
};

/********************
 * 문항 데이터
 ********************/
function defaultQuestions() {
  const list = [];
  CATEGORIES.forEach(c => {
    for (let i = 1; i <= COUNT; i++) {
      list.push({
        id: `${c}-${i}`,
        category: c,
        index: i,
        question: `${c} ${i}번 문제`,
        choices: ["보기1", "보기2", "보기3", "보기4"],
        answer: 0,
        enabled: true
      });
    }
  });
  return list;
}

function loadQuestions() {
  const raw = localStorage.getItem(K.Q);
  return raw ? JSON.parse(raw) : defaultQuestions();
}

function saveQuestions(q) {
  localStorage.setItem(K.Q, JSON.stringify(q));
}

/********************
 * BLE (Web Bluetooth)
 ********************/
const UART_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

let ble = { device: null, rx: null };

async function connectBLE(update) {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: "ROULETTE-" }],
    optionalServices: [UART_SERVICE],
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(UART_SERVICE);
  const rx = await service.getCharacteristic(UART_RX);

  ble = { device, rx };
  update(true);
}

async function sendStart() {
  const booth = Number(localStorage.getItem(K.BOOTH) || "1");
  const msg = `START:${TOKENS[booth]}\n`;
  await ble.rx.writeValue(new TextEncoder().encode(msg));
}

/********************
 * 페이지 분기
 ********************/
document.addEventListener("DOMContentLoaded", () => {
  if (location.pathname.endsWith("admin.html")) adminPage();
  else playPage();
});

/********************
 * 사용자 페이지
 ********************/
function playPage() {
  const stage = document.getElementById("stage");
  const badge = document.getElementById("badge");
  const btnConnect = document.getElementById("btnConnect");
  const btnDisconnect = document.getElementById("btnDisconnect");
  const deviceName = document.getElementById("deviceName");
  const boothInfo = document.getElementById("boothInfo");

  let questions = loadQuestions();
  let cat = null;
  let idx = null;

  function updateUI(connected) {
    const booth = Number(localStorage.getItem(K.BOOTH) || "1");
    boothInfo.textContent = `${booth}번 (${TOKENS[booth]})`;

    if (connected) {
      badge.textContent = "✅ 연결됨";
      badge.className = "inline-flex px-4 py-2 rounded-full text-lg font-bold bg-emerald-100";
      deviceName.textContent = ble.device.name;
      btnDisconnect.classList.remove("hidden");
    }
  }

  btnConnect.onclick = async () => {
    try {
      await connectBLE(updateUI);
    } catch {
      alert("BLE 연결 실패");
    }
  };

  btnDisconnect.onclick = () => {
    ble.device?.gatt?.disconnect();
    location.reload();
  };

  function render() {
    stage.innerHTML = "";

    if (!cat) {
      stage.innerHTML = `<div class="grid grid-cols-3 gap-6">
        ${CATEGORIES.map(c => `
          <button class="p-8 bg-white rounded-3xl shadow text-3xl font-bold"
            onclick="window.selectCat('${c}')">${c}</button>
        `).join("")}
      </div>`;
      window.selectCat = c => { cat = c; render(); };
      return;
    }

    if (!idx) {
      stage.innerHTML = `<div class="grid grid-cols-5 gap-4">
        ${[1,2,3,4,5].map(i => `
          <button class="h-20 text-3xl font-bold bg-indigo-600 text-white rounded-3xl"
            onclick="window.pick(${i})">${i}</button>
        `).join("")}
      </div>`;
      window.pick = i => { idx = i; render(); };
      return;
    }

    const q = questions.find(x => x.id === `${cat}-${idx}`);

    stage.innerHTML = `
      <div class="space-y-4">
        <h2 class="text-2xl font-bold">${q.question}</h2>
        ${q.choices.map((c,i)=>`
          <button class="block w-full p-4 border rounded-xl text-xl"
            onclick="window.answer(${i})">${c}</button>
        `).join("")}
        <button id="spin" class="hidden w-full h-14 bg-emerald-600 text-white rounded-xl text-2xl font-bold">
          🎡 룰렛 돌리기
        </button>
      </div>
    `;

    window.answer = i => {
      if (i === q.answer) {
        document.getElementById("spin").classList.remove("hidden");
        document.getElementById("spin").onclick = sendStart;
      } else {
        alert("틀렸어요! 다른 문항 선택!");
        idx = null;
        render();
      }
    };
  }

  render();
}

/********************
 * 관리자 페이지
 ********************/
function adminPage() {
  if (localStorage.getItem(K.ADMIN) !== "true") {
    const pin = prompt("관리자 PIN 입력");
    if (pin !== ADMIN_PIN) {
      alert("PIN 오류");
      location.href = "index.html";
      return;
    }
    localStorage.setItem(K.ADMIN, "true");
  }

  const area = document.getElementById("adminArea");
  let questions = loadQuestions();

  area.innerHTML = questions.map(q => `
    <div class="border p-4 rounded-xl mb-3">
      <b>${q.id}</b><br/>
      <input value="${q.question}" class="border p-2 w-full"/><br/>
      ${q.choices.map((c,i)=>`
        <input value="${c}" class="border p-2 w-full mt-1"/>
      `).join("")}
    </div>
  `).join("");

  document.getElementById("boothSelect").value =
    localStorage.getItem(K.BOOTH) || "1";

  document.getElementById("boothSelect").onchange = e =>
    localStorage.setItem(K.BOOTH, e.target.value);
}
