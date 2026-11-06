// Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱(웹 앱)의 firebaseConfig 값을 그대로 붙여넣으세요.
// 이 값들은 공개되어도 괜찮은 식별자입니다. 데이터 보호는 firestore.rules 가 담당합니다.
export const firebaseConfig = {
  apiKey: "AIzaSyD2XuLNoRLbLU6QAJ1gXX3Rw2U2gaa0sy8",
  authDomain: "membershiptraing1.firebaseapp.com",
  projectId: "membershiptraing1",
  storageBucket: "membershiptraing1.firebasestorage.app",
  messagingSenderId: "44657691612",
  appId: "1:44657691612:web:9d48ba650717affd71dd19",
};

// 응답이 저장될 Firestore 컬렉션 이름 (firestore.rules 와 일치해야 합니다)
export const COLLECTION = "responses";
