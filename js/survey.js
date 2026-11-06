import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, isConfigured } from "./firebase.js";
import { COLLECTION } from "./firebase-config.js";
import { ATTENDANCE, formatPhone } from "./attendance.js";

const form = document.getElementById("survey-form");
const formError = document.getElementById("form-error");
const submitBtn = document.getElementById("submit-btn");
const phoneInput = document.getElementById("phone");
const done = document.getElementById("done");

if (!isConfigured) {
  document.getElementById("config-warning").hidden = false;
  submitBtn.disabled = true;
}

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
  return {
    name: value("name"),
    phone: formatPhone(value("phone")),
    attendance: value("attendance"),
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
  showError("");
  done.hidden = true;
  form.hidden = false;
});
