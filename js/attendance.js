// 참석 여부 값과 화면에 보이는 이름. firestore.rules 의 허용 값과 일치해야 합니다.
export const ATTENDANCE = {
  yes: "참석",
  maybe: "미정",
  no: "불참",
};

// 숫자만 남겨 010-1234-5678 형식으로 맞춥니다. 휴대전화 번호가 아니면 빈 문자열을 돌려줍니다.
export function formatPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  const m = digits.match(/^(01[016789])(\d{3,4})(\d{4})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}
