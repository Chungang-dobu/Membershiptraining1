import {
  collection, query, orderBy, onSnapshot, doc, deleteDoc,
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

// 실제 제출 순서(오래된 것 → 최근)대로 정렬된 응답 목록
let responses = [];
let unsubscribe = null;
// 달력에서 고른 날짜: 그날 안 되는 사람만 목록에 표시
let selectedDate = "";

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

// 같은 연락처로 여러 번 제출했다면 가장 나중에 제출한 응답만 유효한 응답으로 봅니다.
// 목록 순서는 제출한 순서입니다. 예전에 관리자가 바꿔 둔 순서(orderAt)가 있으면 그 순서를 그대로 따릅니다.
// 시각은 화면·엑셀 어디에도 표시하지 않고 순서를 정하는 데만 씁니다.
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

function button(text, className, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = text;
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

  const list = visibleResponses(all);
  rowsEl.replaceChildren();
  list.forEach((r, i) => {
    const tr = document.createElement("tr");
    if (!r.isLatest) tr.className = "row-old";
    tr.append(
      cell(i + 1, "order"),
      cell(r.name),
      cell(r.phone || ""),
      cell(ATTENDANCE[r.attendance] || "", `badge badge-${r.attendance}`),
      cell(formatDays(r.conflictDates), "dates"),
      cell(r.conflictNote, "memo"),
      cell(note(r), "muted"),
    );
    const actions = document.createElement("td");
    actions.append(button("삭제", "btn btn-danger", () => removeResponse(r)));
    tr.append(actions);
    rowsEl.append(tr);
  });
  emptyEl.hidden = list.length > 0;
}

async function removeResponse(r) {
  if (!confirm(`${r.name} 님의 ${r.isLatest ? "응답" : "이전 응답"}을 삭제할까요? 되돌릴 수 없습니다.`)) return;
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

  const header = ["순서", "이름", "연락처", "참석 여부", "안 되는 날", "일정 내용", "비고"];
  const rows = list.map((r, i) => [
    i + 1,
    r.name,
    r.phone || "",
    ATTENDANCE[r.attendance] || "",
    formatDays(r.conflictDates),
    r.conflictNote,
    note(r),
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = [6, 12, 16, 10, 30, 40, 18].map((wch) => ({ wch }));
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
