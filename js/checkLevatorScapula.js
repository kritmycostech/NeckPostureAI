// /js/checkLevatorScapula.js
// หลักการ (เวอร์ชันผ่อนเกณฑ์):
// 1) มือซ้าย/ขวา "อยู่บนหัว" (หลวมขึ้น: อยู่ใกล้หู หรืออยู่สูงกว่าระดับตาและอยู่ใกล้หูในแนวนอน)
// 2) ก้มหน้า (pitch down) + หันหน้า (yaw) ไปทางเดียวกับมือที่อยู่บนหัว
// 3) จับเวลา 10 วินาที (ผิดท่าเกิน 2 วิรีเซ็ต)

export function checkLevatorScapula(landmarks, state, elements) {
  const { videoWrapper, countdownElement, poseCountElement } = elements;

  // ---- Pose indices ----
  const NOSE = 0, LEFT_EYE = 2, RIGHT_EYE = 5, LEFT_EAR = 7, RIGHT_EAR = 8,
        LEFT_SH = 11, RIGHT_SH = 12, LEFT_WRIST = 15, RIGHT_WRIST = 16;

  const nose = landmarks[NOSE];
  const lEye = landmarks[LEFT_EYE], rEye = landmarks[RIGHT_EYE];
  const lEar = landmarks[LEFT_EAR], rEar = landmarks[RIGHT_EAR];
  const lSh = landmarks[LEFT_SH], rSh = landmarks[RIGHT_SH];
  const lWr = landmarks[LEFT_WRIST], rWr = landmarks[RIGHT_WRIST];

  if (!nose || !lEye || !rEye || !lSh || !rSh || !lWr || !rWr || !lEar || !rEar) return;

  // --------- Helper ---------
  const eyeCX = (lEye.x + rEye.x) / 2;
  const eyeCY = (lEye.y + rEye.y) / 2;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // --------- ผ่อนเกณฑ์: มือ "อยู่บนหัว" ---------
  // ให้ผ่านได้ 2 เงื่อนไขอย่างใดอย่างหนึ่ง (ฝั่งละ):
  // (A) ข้อมือห่างจากหูฝั่งเดียวกัน < HEAD_NEAR หรือ
  // (B) ข้อมือสูงกว่าระดับตา + อยู่ใกล้หูในแนวนอน
  const HEAD_NEAR = 0.18;              // เดิม ~0.10–0.12 → ผ่อนเป็น 0.18
  const HORIZ_NEAR = 0.20;             // แนวนอนใกล้หู
  const ABOVE_EYE_PAD = 0.10;          // ยอมให้ต่ำกว่าตานิดหน่อย (ยิ่งมากยิ่งผ่อน)

  const leftHandOnHead =
    dist(lWr, lEar) < HEAD_NEAR ||
    ((lWr.y <= eyeCY + ABOVE_EYE_PAD) && Math.abs(lWr.x - lEar.x) <= HORIZ_NEAR);

  const rightHandOnHead =
    dist(rWr, rEar) < HEAD_NEAR ||
    ((rWr.y <= eyeCY + ABOVE_EYE_PAD) && Math.abs(rWr.x - rEar.x) <= HORIZ_NEAR);

  // เลือก "ฝั่งเป้าหมาย" จากมือที่อยู่บนหัว (ถ้าสองมือ ให้เลือกฝั่งที่ใกล้หูกว่า)
  let side = null; // 'L' | 'R'
  if (leftHandOnHead && rightHandOnHead) {
    side = (dist(lWr, lEar) <= dist(rWr, rEar)) ? 'L' : 'R';
  } else if (leftHandOnHead) side = 'L';
  else if (rightHandOnHead) side = 'R';

  // --------- คำนวณทิศศีรษะ ---------
  // yaw: <0 หันซ้าย, >0 หันขวา ; pitchDown: >0 ก้มลง
  const yawRaw = nose.x - eyeCX;
  const pitchDownRaw = nose.y - eyeCY;

  // smoothing เล็กน้อย (กันสั่น แต่ยังไว)
  if (!state.levator) state.levator = {};
  const S_ALPHA = 0.6; // มาก = ไวขึ้น
  state.levator.fYaw = (state.levator.fYaw == null) ? yawRaw
                        : S_ALPHA * yawRaw + (1 - S_ALPHA) * state.levator.fYaw;
  state.levator.fPitch = (state.levator.fPitch == null) ? pitchDownRaw
                        : S_ALPHA * pitchDownRaw + (1 - S_ALPHA) * state.levator.fPitch;

  const yaw = state.levator.fYaw;
  const pitchDown = state.levator.fPitch;

  // --------- Thresholds (ผ่อนเกณฑ์) ---------
  const ROTATE_THR = 0.02;        // เดิม 0.03 → 0.02 (หันนิดเดียวก็ผ่าน)
  const LOOKDOWN_THR = 0.02;      // เดิม 0.03 → 0.02 (ก้มน้อยลงก็ผ่าน)
  const SHOULDER_LEVEL_MAX = 0.10; // เดิม 0.05–0.06 → 0.10 (ยอมไหล่เอียงมากขึ้น)

  const shoulderTilt = Math.abs(lSh.y - rSh.y);

  // --------- เงื่อนไขท่าที่ถูกต้อง ---------
  let correctPose = false;
  if (side === 'L') {
    // มือซ้ายบนหัว → ต้องก้ม + หันซ้าย
    correctPose = (yaw < -ROTATE_THR) && (pitchDown > LOOKDOWN_THR) && (shoulderTilt < SHOULDER_LEVEL_MAX);
  } else if (side === 'R') {
    // มือขวาบนหัว → ต้องก้ม + หันขวา
    correctPose = (yaw > ROTATE_THR) && (pitchDown > LOOKDOWN_THR) && (shoulderTilt < SHOULDER_LEVEL_MAX);
  } else {
    // ยังไม่มีมือบนหัว → ยังไม่เริ่มจับ
    correctPose = false;
  }

  // --------- นับเวลา / แสดงผล ---------
  if (correctPose) {
    state.wrongPoseTimer = 0;
    videoWrapper.classList.remove("red-border");
    videoWrapper.classList.add("green-border");

    state.poseTimer += 1 / 60; // ~60fps
    const leftSec = Math.max(10 - Math.floor(state.poseTimer), 0);
    countdownElement.textContent = leftSec;

    if (state.poseTimer >= 10) {
      state.poseCount += 1;
      poseCountElement.textContent = state.poseCount;

      // รีเซ็ต
      state.poseTimer = 0;
      state.wrongPoseTimer = 0;
      countdownElement.textContent = 10;
    }
  } else if (state.isPoseDetectionActive) {
    state.wrongPoseTimer = (state.wrongPoseTimer || 0) + 1 / 60;
    if (state.wrongPoseTimer > 2) {
      state.poseTimer = 0;
      state.wrongPoseTimer = 0;
      countdownElement.textContent = 10;
      videoWrapper.classList.remove("green-border");
      videoWrapper.classList.add("red-border");
    }
  }
}
