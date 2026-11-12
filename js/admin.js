import {
  collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc, writeBatch, deleteField, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { db, auth, isConfigured } from "./firebase.js";
import { COLLECTION } from "./firebase-config.js";
import { ATTENDANCE } from "./attendance.js";
import { buildCalendar, dayLabel, formatDay, formatDays, scheduleDays } from "./schedule.js";

const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const dashboard = document.getElementById("dashboard");
const rowsEl = document.getElementById("rows");
const emptyEl = document.getElementById("empty");
const searchEl = document.getElementById("search");
const filterEl = document.getElementById("filter");
const latestOnlyEl = document.getElementById("latest-only");
const calendarEl = document.getElementById("calendar");
const dateFilterEl = document.getElementById("date-filter");
const orderHintEl = document.getElementById("order-hint");

// 실제 제출 순서(오래된 것 → 최근)대로 정렬된 응답 목록
let responses = [];
let unsubscribe = null;
// 달력에서 고른 날짜: 그날 안 되는 사람만 목록에 표시
let selectedDate = "";
// 제출 일시를 고치는 중인 응답의 id 와 입력 중인 값
let editingId = "";
let editingValue = "";

if (!isConfigured) {
  document.getElementById("config-warning").hidden = false;
}

onAuthStateChanged(auth, (user) => {
  loginForm.hidden = !!user;
  dashboard.hidden = !user;
  document.getElementById("logout-btn").hidden = !user;
  if (user) {
    subscribe();
  } else {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    responses = [];
    editingId = "";
    render();
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  try {
    await signInWithEmailAndPassword(
      auth,
      document.getElementById("email").value.trim(),
      document.getElementById("password").value,
    );
  } catch (err) {
    console.error(err);
    loginError.textContent = "로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.";
    loginError.hidden = false;
  }
});

document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

function subscribe() {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "asc"));
  unsubscribe = onSnapshot(q, (snap) => {
    responses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, (err) => {
    console.error(err);
    alert("데이터를 불러오지 못했습니다. 관리자 권한(firestore.rules)을 확인해 주세요.");
  });
}

const toMillis = (ts) => (ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0);

// 같은 연락처로 여러 번 제출했다면 실제로 가장 나중에 제출한 응답만 유효한 응답으로 봅니다.
// 목록 순서는 관리자가 고친 시각(orderAt)이 있으면 그 시각, 없으면 실제 제출 시각(createdAt) 기준입니다.
function analyze() {
  const latestIdByPhone = new Map();
  const countByPhone = new Map();
  responses.forEach((r) => {
    latestIdByPhone.set(r.phone, r.id);
    countByPhone.set(r.phone, (countByPhone.get(r.phone) || 0) + 1);
  });
  return responses
    .map((r) => ({
      ...r,
      conflictDates: Array.isArray(r.conflictDates) ? r.conflictDates : [],
      conflictNote: r.conflictNote || "",
      isLatest: latestIdByPhone.get(r.phone) === r.id,
      submitCount: countByPhone.get(r.phone),
      submittedAt: toMillis(r.createdAt),
      time: r.orderAt ? toMillis(r.orderAt) : toMillis(r.createdAt),
      timeEdited: !!r.orderAt,
    }))
    .sort((a, b) => a.time - b.time || a.submittedAt - b.submittedAt || a.id.localeCompare(b.id));
}

const hasConflict = (r) => r.attendance === "yes" && (r.conflictDates.length > 0 || r.conflictNote !== "");

// 날짜별 집계: 참석자(최신 응답) 중 그날 안 되는 사람과 가능한 인원
function dateSummary(attendees) {
  return scheduleDays().map((day) => {
    const busy = attendees.filter((r) => r.conflictDates.includes(day.key));
    return { ...day, busy, available: attendees.length - busy.length };
  });
}

function note(r) {
  if (!r.isLatest) return "이전 응답";
  if (r.submitCount > 1) return `재제출 (총 ${r.submitCount}회)`;
  return "";
}

const pad = (n) => String(n).padStart(2, "0");

function formatTime(ms, withSeconds = false) {
  if (!ms) return "";
  const d = new Date(ms);
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withSeconds ? `${base}:${pad(d.getSeconds())}` : base;
}

// <input type="datetime-local"> 값 형식: 2026-11-06T10:00:05
const toInputValue = (ms) => formatTime(ms, true).replace(" ", "T");

// 검색·필터가 없을 때만 순서를 바꿀 수 있습니다. (가려진 응답이 있으면 위아래 이동 결과가 헷갈리기 때문)
const canReorder = () => !searchEl.value.trim() && filterEl.value === "all" && !selectedDate;

function visibleResponses(all) {
  const keyword = searchEl.value.trim().toLowerCase();
  const keywordDigits = keyword.replace(/\D/g, "");
  const filter = filterEl.value;
  return all.filter((r) => {
    if (latestOnlyEl.checked && !r.isLatest) return false;
    if (filter === "conflict" ? !hasConflict(r) : filter !== "all" && r.attendance !== filter) return false;
    if (selectedDate && !(r.attendance === "yes" && r.conflictDates.includes(selectedDate))) return false;
    if (!keyword) return true;
    if ([r.name, r.conflictNote].some((v) => (v || "").toLowerCase().includes(keyword))) return true;
    return keywordDigits !== "" && (r.phone || "").replace(/\D/g, "").includes(keywordDigits);
  });
}

function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function button(text, className, onClick, label) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = text;
  if (label) btn.setAttribute("aria-label", label);
  btn.addEventListener("click", onClick);
  return btn;
}

function selectDate(key) {
  selectedDate = selectedDate === key ? "" : key;
  render();
}

function renderCalendar(summary) {
  const best = Math.max(0, ...summary.map((d) => d.available));
  const byKey = new Map(summary.map((d) => [d.key, d]));
  buildCalendar(calendarEl, (day, showMonth) => {
    const s = byKey.get(day.key);
    const btn = document.createElement("button");
    btn.type = "button";
    if (best > 0 && s.available === best) btn.classList.add("best");
    if (selectedDate === day.key) btn.classList.add("selected");
    btn.title = s.busy.length ? `안 되는 사람: ${s.busy.map((r) => r.name).join(", ")}` : "안 되는 사람 없음";
    const date = document.createElement("span");
    date.className = "cal-date";
    date.textContent = dayLabel(day, showMonth);
    const count = document.createElement("span");
    count.className = "cal-count";
    count.textContent = `${s.available}명`;
    const busy = document.createElement("span");
    busy.className = "cal-busy";
    busy.textContent = s.busy.length ? `불가 ${s.busy.length}` : "";
    btn.append(date, count, busy);
    btn.addEventListener("click", () => selectDate(day.key));
    return btn;
  });
}

// No. 칸: 순번 + 위/아래 이동 버튼
function orderCell(r, i, list, reorder) {
  const td = document.createElement("td");
  td.className = "order";
  const num = document.createElement("span");
  num.className = "order-num";
  num.textContent = i + 1;
  td.append(num);
  if (reorder) {
    const up = button("▲", "btn btn-icon", () => move(list, i, -1), `${r.name} 위로`);
    const down = button("▼", "btn btn-icon", () => move(list, i, 1), `${r.name} 아래로`);
    up.disabled = i === 0;
    down.disabled = i === list.length - 1;
    td.append(up, down);
  }
  return td;
}

// 제출 일시 칸: 보기 / 고치기
function timeCell(r) {
  const td = document.createElement("td");
  td.className = "time";
  if (editingId === r.id) {
    const input = document.createElement("input");
    input.type = "datetime-local";
    input.step = "1";
    input.value = editingValue;
    input.className = "time-input";
    input.addEventListener("input", () => { editingValue = input.value; });
    const actions = document.createElement("div");
    actions.className = "time-actions";
    actions.append(
      button("저장", "btn btn-small btn-primary", () => saveTime(r)),
      button("취소", "btn btn-small", () => { editingId = ""; render(); }),
    );
    if (r.timeEdited) actions.append(button("원래대로", "btn btn-small", () => resetTime(r)));
    td.append(input, actions);
    return td;
  }
  const time = document.createElement("span");
  time.textContent = formatTime(r.time);
  const edit = button("수정", "btn btn-link", () => {
    editingId = r.id;
    editingValue = toInputValue(r.time);
    render();
  }, `${r.name} 제출 일시 수정`);
  td.append(time, edit);
  if (r.timeEdited) {
    const original = document.createElement("span");
    original.className = "time-original";
    original.textContent = `수정됨 · 실제 ${formatTime(r.submittedAt)}`;
    td.append(original);
  }
  return td;
}

function render() {
  const all = analyze();
  const latest = all.filter((r) => r.isLatest);
  const attendees = latest.filter((r) => r.attendance === "yes");
  document.getElementById("stat-total").textContent = latest.length;
  document.getElementById("stat-yes").textContent = attendees.length;
  document.getElementById("stat-no").textContent = latest.filter((r) => r.attendance === "no").length;
  document.getElementById("stat-conflict").textContent = attendees.filter(hasConflict).length;
  document.getElementById("cal-base").textContent = attendees.length;
  renderCalendar(dateSummary(attendees));

  dateFilterEl.hidden = !selectedDate;
  document.getElementById("date-filter-text").textContent = selectedDate ? `${formatDay(selectedDate)}에 안 되는 사람만 보는 중` : "";

  const reorder = canReorder();
  orderHintEl.textContent = reorder
    ? "▲▼ 버튼으로 순서를 바꾸거나, 제출 일시의 ‘수정’을 눌러 시각을 고칠 수 있습니다. 실제 제출 시각은 따로 보관됩니다."
    : "검색·필터·날짜 선택을 해제하면 ▲▼ 버튼으로 순서를 바꿀 수 있습니다.";

  const list = visibleResponses(all);
  rowsEl.replaceChildren();
  list.forEach((r, i) => {
    const tr = document.createElement("tr");
    if (!r.isLatest) tr.className = "row-old";
    tr.append(
      orderCell(r, i, list, reorder),
      cell(r.name),
      cell(r.phone || ""),
      cell(ATTENDANCE[r.attendance] || "", `badge badge-${r.attendance}`),
      cell(formatDays(r.conflictDates), "dates"),
      cell(r.conflictNote, "memo"),
      timeCell(r),
      cell(note(r), "muted"),
    );
    const actions = document.createElement("td");
    actions.append(button("삭제", "btn btn-danger", () => removeResponse(r)));
    tr.append(actions);
    rowsEl.append(tr);
  });
  emptyEl.hidden = list.length > 0;
}

// 기준 시각을 ms 로 정합니다. 실제 제출 시각과 같아지면 수정 기록(orderAt)을 지워 원래 상태로 돌립니다.
function timeValue(r, ms) {
  return ms === r.submittedAt ? deleteField() : Timestamp.fromMillis(ms);
}

async function saveTime(r) {
  const date = new Date(editingValue);
  if (!editingValue || Number.isNaN(date.getTime())) {
    alert("날짜와 시각을 올바르게 입력해 주세요.");
    return;
  }
  try {
    await updateDoc(doc(db, COLLECTION, r.id), { orderAt: timeValue(r, date.getTime()) });
    editingId = "";
    render();
  } catch (err) {
    console.error(err);
    alert("시각을 바꾸지 못했습니다. 관리자 권한(firestore.rules)을 확인해 주세요.");
  }
}

async function resetTime(r) {
  try {
    await updateDoc(doc(db, COLLECTION, r.id), { orderAt: deleteField() });
    editingId = "";
    render();
  } catch (err) {
    console.error(err);
    alert("원래 시각으로 되돌리지 못했습니다.");
  }
}

// 바로 위(아래) 응답과 기준 시각을 맞바꿔 순서를 바꿉니다.
async function move(list, i, dir) {
  const a = list[i];
  const b = list[i + dir];
  if (!b) return;
  const batch = writeBatch(db);
  if (a.time === b.time) {
    // 시각이 같으면 1초 앞(뒤)으로 옮깁니다.
    batch.update(doc(db, COLLECTION, a.id), { orderAt: timeValue(a, b.time + dir * 1000) });
  } else {
    batch.update(doc(db, COLLECTION, a.id), { orderAt: timeValue(a, b.time) });
    batch.update(doc(db, COLLECTION, b.id), { orderAt: timeValue(b, a.time) });
  }
  try {
    await batch.commit();
  } catch (err) {
    console.error(err);
    alert("순서를 바꾸지 못했습니다. 관리자 권한(firestore.rules)을 확인해 주세요.");
  }
}

async function removeResponse(r) {
  if (!confirm(`${r.name} 님의 응답(${formatTime(r.time)})을 삭제할까요? 되돌릴 수 없습니다.`)) return;
  try {
    await deleteDoc(doc(db, COLLECTION, r.id));
  } catch (err) {
    console.error(err);
    alert("삭제에 실패했습니다.");
  }
}

searchEl.addEventListener("input", render);
filterEl.addEventListener("change", render);
latestOnlyEl.addEventListener("change", render);
document.getElementById("date-filter-clear").addEventListener("click", () => selectDate(""));

document.getElementById("export-btn").addEventListener("click", () => {
  const all = analyze();
  const list = visibleResponses(all);
  if (list.length === 0) {
    alert("내보낼 응답이 없습니다.");
    return;
  }

  const header = ["순서", "이름", "연락처", "참석 여부", "안 되는 날", "일정 내용", "제출 일시", "실제 제출 일시(수정한 경우)", "비고"];
  const rows = list.map((r, i) => [
    i + 1,
    r.name,
    r.phone || "",
    ATTENDANCE[r.attendance] || "",
    formatDays(r.conflictDates),
    r.conflictNote,
    formatTime(r.time),
    r.timeEdited ? formatTime(r.submittedAt) : "",
    note(r),
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = [6, 12, 16, 10, 30, 40, 18, 24, 18].map((wch) => ({ wch }));
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) };

  // 집계·날짜별 시트는 화면 상단 숫자·달력과 같습니다 (사람별 최신 응답 기준, 검색·필터와 무관).
  const latest = all.filter((r) => r.isLatest);
  const attendees = latest.filter((r) => r.attendance === "yes");
  const summary = XLSX.utils.aoa_to_sheet([
    ["구분", "인원"],
    [ATTENDANCE.yes, attendees.length],
    [ATTENDANCE.no, latest.length - attendees.length],
    ["합계", latest.length],
    [],
    ["참석자 중 불가 일정 있음", attendees.filter(hasConflict).length],
  ]);
  summary["!cols"] = [{ wch: 24 }, { wch: 10 }];

  const byDate = XLSX.utils.aoa_to_sheet([
    ["날짜", "참석 가능", "불가", "안 되는 사람"],
    ...dateSummary(attendees).map((d) => [formatDay(d.key), d.available, d.busy.length, d.busy.map((r) => r.name).join(", ")]),
  ]);
  byDate["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 50 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "응답 목록");
  XLSX.utils.book_append_sheet(book, summary, "집계");
  XLSX.utils.book_append_sheet(book, byDate, "날짜별 가능 인원");

  const now = new Date();
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  XLSX.writeFile(book, `mt_survey_${stamp}.xlsx`);
});
