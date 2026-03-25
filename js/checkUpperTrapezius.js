// /js/checkUpperTrapezius.js
// Upper Trapezius Stretch
// - Hold เอียงศีรษะด้านซ้าย/ขวา 10 วิ → Completed +1
// - หลังสำเร็จ "ห้ามเริ่มนับใหม่" จนกว่าจะสลับไปเอียง "อีกข้าง"
// - ผ่อนเกณฑ์อัตโนมัติเมื่อผู้ทำตัวเล็ก (เช่น เด็ก) โดยอิงความกว้างไหล่

export function checkUpperTrapezius(landmarks, state, elements) {
  const { videoWrapper, countdownElement, poseCountElement } = elements;

  // -------- Pose indices (MediaPipe Pose) --------
  const LEFT_EAR = 7, RIGHT_EAR = 8, LEFT_SH = 11, RIGHT_SH = 12;
  const lEar = landmarks[LEFT_EAR], rEar = landmarks[RIGHT_EAR];
  const lSh  = landmarks[LEFT_SH],  rSh  = landmarks[RIGHT_SH];
  if (!lEar || !rEar || !lSh || !rSh) return;

  // -------- Helpers --------
  const dist2D = (a,b) => Math.hypot(a.x - b.x, a.y - b.y);
  // ค่าพื้นฐาน
  const earDX = lEar.x - rEar.x;
  const earDY = lEar.y - rEar.y;               // ใช้คำนวณ "มุมเอียงศีรษะ"
  const shDX  = lSh.x - rSh.x;
  const shDY  = lSh.y - rSh.y;

  // -------- Smoothing (กันสั่นเล็กน้อย) --------
  if (!state._upper) state._upper = { fEarDX: earDX, fEarDY: earDY, fShDY: shDY };
  const ALPHA = 0.6; // มาก = ไวขึ้น
  state._upper.fEarDX = ALPHA * earDX + (1 - ALPHA) * state._upper.fEarDX;
  state._upper.fEarDY = ALPHA * earDY + (1 - ALPHA) * state._upper.fEarDY;
  state._upper.fShDY  = ALPHA * shDY  + (1 - ALPHA) * state._upper.fShDY;

  // มุมเอียงศีรษะ (องศา) จากเส้นหูซ้าย-ขวา (scale-invariant)
  const headTiltDeg = Math.abs(Math.atan2(state._upper.fEarDY, state._upper.fEarDX) * 180 / Math.PI);

  // ความกว้างไหล่ (normalize) + ระดับไหล่
  const shoulderSpan = Math.hypot(shDX, shDY) || 1e-6;
  const shouldersLevelRatio = Math.abs(state._upper.fShDY) / shoulderSpan;

  // -------- Kids mode (ตัวเล็ก/ไกลกล้อง) --------
  const KIDS_SPAN_THRESH = 0.18;               // < 0.18 ถือว่าเป็น scale เด็ก/ตัวเล็ก
  const isKidScale = shoulderSpan < KIDS_SPAN_THRESH;

  const TILT_OK_DEG   = isKidScale ? 8   : 12; // เด็กใช้เกณฑ์เอียงน้อยลง
  const SHOULDER_LVL  = isKidScale ? 0.20 : 0.15; // เด็กยอมให้ไหล่เอียงมากขึ้น
  const WRONG_RESET_S = isKidScale ? 3.0 : 2.0;   // เด็กให้เวลาหลุดท่านานขึ้นก่อนรีเซ็ต

  // -------- หา "ข้าง" ที่เอียง โดยดู ear-to-shoulder ที่ใกล้กว่า --------
  // วิธีนี้ทนต่อการ mirror/สัญญาณสลับทิศได้ดี
  const dLeft  = Math.abs(lEar.y - lSh.y);
  const dRight = Math.abs(rEar.y - rSh.y);

  let currentSide = null; // 'left' | 'right' | null
  if (headTiltDeg >= TILT_OK_DEG) {
    currentSide = (dLeft <= dRight) ? 'left' : 'right';
  }

  const shouldersLevelOK = shouldersLevelRatio < SHOULDER_LVL;

  // ====== กฎหลัก: ต้องเอียงถึงเกณฑ์ + ไหล่ไม่เอียงมาก ======
  const poseOK = !!currentSide && shouldersLevelOK;

  // ====== Enforce: สำเร็จฝั่งหนึ่งแล้ว ต้องสลับข้างก่อนค่อยเริ่มนับใหม่ ======
  if (poseOK && state.lastSide && state.lastSide === currentSide) {
    // ยังค้างอยู่ฝั่งที่เพิ่งสำเร็จ → ยังไม่อนุญาตเริ่มนับใหม่
    videoWrapper.classList.remove("green-border");
    videoWrapper.classList.add("red-border");
    countdownElement.textContent = 10;
    // ไม่ถือว่า "ผิดท่า" (จึงไม่สะสม wrongPoseTimer)
    return;
  }

  // ====== Timer / UI ======
  if (poseOK) {
    // ท่าถูกต้องในฝั่งที่อนุญาตให้เริ่มนับ
    state.wrongPoseTimer = 0;
    videoWrapper.classList.remove("red-border");
    videoWrapper.classList.add("green-border");

    state.poseTimer = (state.poseTimer || 0) + 1 / 60; // ~60fps
    const leftSec = Math.max(10 - Math.floor(state.poseTimer), 0);
    countdownElement.textContent = leftSec;

    if (state.poseTimer >= 10) {
      // ครบ 10 วินาที → นับสำเร็จ
      state.poseCount = (state.poseCount || 0) + 1;
      poseCountElement.textContent = state.poseCount;

      // จดจำฝั่งที่เพิ่งสำเร็จ และรีเซ็ตเวลา
      state.lastSide = currentSide;
      state.poseTimer = 0;
      state.wrongPoseTimer = 0;
      countdownElement.textContent = 10;
      // กรอบยังคงตามเฟรมถัดไปจาก poseOK / not OK
    }
  } else if (state.isPoseDetectionActive) {
    // ท่าผิด → สะสมเวลา "ผิดท่า" แล้วค่อยรีเซ็ต
    state.wrongPoseTimer = (state.wrongPoseTimer || 0) + 1 / 60;
    if (state.wrongPoseTimer > WRONG_RESET_S) {
      state.poseTimer = 0;
      state.wrongPoseTimer = 0;
      countdownElement.textContent = 10;
      videoWrapper.classList.remove("green-border");
      videoWrapper.classList.add("red-border");
      // ไม่แตะ state.lastSide เพื่อยังบังคับให้สลับข้างอยู่ (จะเคลียร์เมื่อ STOP)
    }
  }
}
