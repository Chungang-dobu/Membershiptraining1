import {
  collection, query, orderBy, onSnapshot, doc, deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { db, auth, isConfigured } from "./firebase.js";
import { COLLECTION } from "./firebase-config.js";
import { ATTENDANCE } from "./attendance.js";

const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const dashboard = document.getElementById("dashboard");
const rowsEl = document.getElementById("rows");
const emptyEl = document.getElementById("empty");
const searchEl = document.getElementById("search");
const filterEl = document.getElementById("filter");
const latestOnlyEl = document.getElementById("latest-only");

// 제출 순서(오래된 것 → 최근)대로 정렬된 응답 목록
let responses = [];
let unsubscribe = null;

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

// 같은 연락처로 여러 번 제출했다면 가장 최근 응답만 유효한 응답으로 봅니다.
function analyze() {
  const latestIdByPhone = new Map();
  const countByPhone = new Map();
  responses.forEach((r) => {
    latestIdByPhone.set(r.phone, r.id);
    countByPhone.set(r.phone, (countByPhone.get(r.phone) || 0) + 1);
  });
  return responses.map((r) => ({
    ...r,
    isLatest: latestIdByPhone.get(r.phone) === r.id,
    submitCount: countByPhone.get(r.phone),
  }));
}

function note(r) {
  if (!r.isLatest) return "이전 응답";
  if (r.submitCount > 1) return `재제출 (총 ${r.submitCount}회)`;
  return "";
}

function formatDate(ts) {
  if (!ts || typeof ts.toDate !== "function") return "";
  const d = ts.toDate();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function countBy(list) {
  const counts = { yes: 0, maybe: 0, no: 0 };
  list.forEach((r) => {
    if (r.attendance in counts) counts[r.attendance] += 1;
  });
  return counts;
}

function visibleResponses(all) {
  const keyword = searchEl.value.trim().toLowerCase();
  const keywordDigits = keyword.replace(/\D/g, "");
  const filter = filterEl.value;
  return all.filter((r) => {
    if (latestOnlyEl.checked && !r.isLatest) return false;
    if (filter !== "all" && r.attendance !== filter) return false;
    if (!keyword) return true;
    if ((r.name || "").toLowerCase().includes(keyword)) return true;
    return keywordDigits !== "" && (r.phone || "").replace(/\D/g, "").includes(keywordDigits);
  });
}

function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function render() {
  const all = analyze();
  const latest = all.filter((r) => r.isLatest);
  const counts = countBy(latest);
  document.getElementById("stat-total").textContent = latest.length;
  document.getElementById("stat-yes").textContent = counts.yes;
  document.getElementById("stat-maybe").textContent = counts.maybe;
  document.getElementById("stat-no").textContent = counts.no;

  const list = visibleResponses(all);
  rowsEl.replaceChildren();
  list.forEach((r, i) => {
    const tr = document.createElement("tr");
    if (!r.isLatest) tr.className = "row-old";
    tr.append(
      cell(i + 1),
      cell(r.name),
      cell(r.phone || ""),
      cell(ATTENDANCE[r.attendance] || "", `badge badge-${r.attendance}`),
      cell(formatDate(r.createdAt)),
      cell(note(r), "muted"),
    );
    const actions = document.createElement("td");
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-danger";
    del.textContent = "삭제";
    del.addEventListener("click", () => removeResponse(r));
    actions.append(del);
    tr.append(actions);
    rowsEl.append(tr);
  });
  emptyEl.hidden = list.length > 0;
}

async function removeResponse(r) {
  if (!confirm(`${r.name} 님의 응답(${formatDate(r.createdAt)})을 삭제할까요? 되돌릴 수 없습니다.`)) return;
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

document.getElementById("export-btn").addEventListener("click", () => {
  const all = analyze();
  const list = visibleResponses(all);
  if (list.length === 0) {
    alert("내보낼 응답이 없습니다.");
    return;
  }

  const header = ["No.", "이름", "연락처", "참석 여부", "제출 일시", "비고"];
  const rows = list.map((r, i) => [
    i + 1,
    r.name,
    r.phone || "",
    ATTENDANCE[r.attendance] || "",
    formatDate(r.createdAt),
    note(r),
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = [6, 12, 16, 10, 18, 18].map((wch) => ({ wch }));
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) };

  // 집계 시트는 화면 상단 숫자와 같습니다 (사람별 최신 응답 기준, 검색·필터와 무관).
  const latest = all.filter((r) => r.isLatest);
  const counts = countBy(latest);
  const summary = XLSX.utils.aoa_to_sheet([
    ["구분", "인원"],
    [ATTENDANCE.yes, counts.yes],
    [ATTENDANCE.maybe, counts.maybe],
    [ATTENDANCE.no, counts.no],
    ["합계", latest.length],
  ]);
  summary["!cols"] = [{ wch: 10 }, { wch: 10 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "응답 목록");
  XLSX.utils.book_append_sheet(book, summary, "집계");

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  XLSX.writeFile(book, `mt_survey_${stamp}.xlsx`);
});
