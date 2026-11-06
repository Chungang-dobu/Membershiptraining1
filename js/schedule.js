// MT 후보 기간. 이 범위의 날짜가 설문(불가 날짜 선택)과 관리자 페이지(날짜별 인원)에 표시됩니다.
export const SCHEDULE = {
  start: "2026-11-21",
  end: "2026-12-13",
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function parse(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toKey(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 후보 기간의 날짜 목록: [{ key: "2026-11-21", month: 11, day: 21, weekday: 6 }, ...]
export function scheduleDays() {
  const days = [];
  for (let d = parse(SCHEDULE.start); d <= parse(SCHEDULE.end); d.setDate(d.getDate() + 1)) {
    days.push({ key: toKey(d), month: d.getMonth() + 1, day: d.getDate(), weekday: d.getDay() });
  }
  return days;
}

// "2026-11-28" → "11/28(토)"
export function formatDay(key) {
  const d = parse(key);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

export function formatDays(keys) {
  return [...(keys || [])].sort().map(formatDay).join(", ");
}

// 요일 머리글 + 달력 칸을 만들어 container 에 넣습니다. renderDay(day) 가 각 날짜 칸의 내용을 돌려줍니다.
export function buildCalendar(container, renderDay) {
  const days = scheduleDays();
  const cells = WEEKDAYS.map((w, i) => {
    const el = document.createElement("div");
    el.className = `cal-head${i === 0 ? " sun" : ""}${i === 6 ? " sat" : ""}`;
    el.textContent = w;
    return el;
  });
  for (let i = 0; i < days[0].weekday; i++) {
    const blank = document.createElement("div");
    blank.className = "cal-blank";
    cells.push(blank);
  }
  days.forEach((day, i) => {
    const el = renderDay(day, i === 0 || day.day === 1);
    el.classList.add("cal-day");
    if (day.weekday === 0) el.classList.add("sun");
    if (day.weekday === 6) el.classList.add("sat");
    cells.push(el);
  });
  container.replaceChildren(...cells);
}

// 달력 칸에 쓰는 날짜 글자: 첫 칸과 매월 1일은 "12/1", 나머지는 "2"
export function dayLabel(day, showMonth) {
  return showMonth ? `${day.month}/${day.day}` : String(day.day);
}
