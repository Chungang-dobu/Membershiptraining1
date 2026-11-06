import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, isConfigured } from "./firebase.js";
import { COLLECTION } from "./firebase-config.js";
import { ATTENDANCE, formatPhone } from "./attendance.js";
import { SCHEDULE, buildCalendar, dayLabel, formatDay, formatDays } from "./schedule.js";

const form = document.getElementById("survey-form");
const formError = document.getElementById("form-error");
const submitBtn = document.getElementById("submit-btn");
const phoneInput = document.getElementById("phone");
const conflictSection = document.getElementById("conflict-section");
const pickedEl = document.getElementById("picked");
const done = document.getElementById("done");

if (!isConfigured) {
  document.getElementById("config-warning").hidden = false;
  submitBtn.disabled = true;
}

document.getElementById("range-text").textContent = `${formatDay(SCHEDULE.start)} ~ ${formatDay(SCHEDULE.end)}`;

// 후보 기간 달력: 날짜마다 체크박스 하나
buildCalendar(document.getElementById("calendar"), (day, showMonth) => {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = "conflictDates";
  input.value = day.key;
  input.setAttribute("aria-label", formatDay(day.key));
  const span = document.createElement("span");
  span.textContent = dayLabel(day, showMonth);
  label.append(input, span);
  return label;
});

function checkedDates() {
  return [...form.querySelectorAll('input[name="conflictDates"]:checked')].map((el) => el.value);
}

function updatePicked() {
  const dates = checkedDates();
  pickedEl.textContent = dates.length ? `선택한 날 (${dates.length}일): ${formatDays(dates)}` : "선택한 날이 없습니다.";
}

form.addEventListener("change", (e) => {
  if (e.target.name === "attendance") conflictSection.hidden = e.target.value !== "yes";
  if (e.target.name === "conflictDates") updatePicked();
});

// 다시 입력하기 시작하면 이전 오류 문구는 지웁니다.
form.addEventListener("input", () => showError(""));

// 입력을 마치면 010-1234-5678 형식으로 정리해서 보여 줍니다.
phoneInput.addEventListener("blur", () => {
  const formatted = formatPhone(phoneInput.value);
  if (formatted) phoneInput.value = formatted;
});

function showError(message) {
  formError.textContent = message;
  formError.hidden = !message;
}

function readForm() {
  const data = new FormData(form);
  const value = (key) => (data.get(key) || "").toString().trim();
  const attending = value("attendance") === "yes";
  return {
    name: value("name"),
    phone: formatPhone(value("phone")),
    attendance: value("attendance"),
    // 불가 일정은 참석하는 사람만 저장합니다.
    conflictDates: attending ? checkedDates().sort() : [],
    conflictNote: attending ? value("conflictNote") : "",
  };
}

function validate(r) {
  if (!r.name) return "이름을 입력해 주세요.";
  if (!r.phone) return "휴대전화 번호를 올바르게 입력해 주세요. (예: 010-1234-5678)";
  if (!(r.attendance in ATTENDANCE)) return "참석 여부를 선택해 주세요.";
  return "";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = readForm();
  const error = validate(r);
  showError(error);
  if (error) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "제출 중...";
  try {
    await addDoc(collection(db, COLLECTION), { ...r, createdAt: serverTimestamp() });
    form.hidden = true;
    done.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    console.error(err);
    showError("제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "제출하기";
  }
});

document.getElementById("again-btn").addEventListener("click", () => {
  form.reset();
  conflictSection.hidden = true;
  updatePicked();
  showError("");
  done.hidden = true;
  form.hidden = false;
});
