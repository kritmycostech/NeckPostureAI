// /js/checkNeckRotation.js
// นับ 1 เมื่อ "หันซ้าย" หรือ "หันขวา" ถึงเกณฑ์ครั้งหนึ่ง
// (กันนับซ้ำด้วย latch: ต้องผ่อนกลับใกล้กลางก่อนจึงนับครั้งถัดไป)
export function checkNeckRotation(landmarks, state, elements) {
  const { videoWrapper, countdownElement, poseCountElement } = elements;

  const nose = landmarks[0];
  const leftEye = landmarks[2];
  const rightEye = landmarks[5];
  const leftEar = landmarks[7];
  const rightEar = landmarks[8];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  // จุดกึ่งกลางตา ใช้เป็นอ้างอิง yaw/pitch
  const eyeCenterX = (leftEye.x + rightEye.x) / 2;
  const eyeCenterY = (leftEye.y + rightEye.y) / 2;

  // เมตริก
  const yawRaw = nose.x - eyeCenterX;               // ซ้ายลบ ขวาบวก
  const pitch = Math.abs(nose.y - eyeCenterY);
  const roll = Math.abs(leftEar.y - rightEar.y);
  const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y);

  // เกณฑ์ความถูกต้องท่าพื้นฐาน (ผ่อนคลาย ไม่เข้มมาก)
  const PITCH_MAX = 0.10;
  const ROLL_MAX = 0.10;
  const SHOULDER_MAX = 0.10;
  const postureOK = pitch < PITCH_MAX && roll < ROLL_MAX && shoulderTilt < SHOULDER_MAX;

  // Smoothing (EMA)
  if (state.neck.filteredYaw == null) state.neck.filteredYaw = yawRaw;
  const ALPHA = 0.65; // มาก = ไวขึ้น
  const yaw = ALPHA * yawRaw + (1 - ALPHA) * state.neck.filteredYaw;
  state.neck.filteredYaw = yaw;

  // Threshold + hysteresis
  const ENTER = 0.022;   // ต้องหันเกินค่านี้ถึงจะ "นับ"
  const RELEASE = 0.001; // ต้องผ่อนกลับเข้ากลางต่ำกว่านี้จึง "พร้อมนับรอบใหม่"
  const HOLD_FR = 2;     // ต้องแตะฝั่งอย่างน้อยกี่เฟรม (~เร็วก็ผ่าน)

  // เตรียม state
  if (state.neck.passes == null) state.neck.passes = 0;
  if (state.neck.latch == null) state.neck.latch = false;   // true = นับไปแล้ว รอปลดเมื่อกลับกลาง
  if (state.neck.holdL == null) state.neck.holdL = 0;
  if (state.neck.holdR == null) state.neck.holdR = 0;

  const inLeftExtreme  = yaw <= -ENTER;
  const inRightExtreme = yaw >=  ENTER;
  const backToCenter   = Math.abs(yaw) <= RELEASE;

  // กรอบสี: เขียวเมื่อหันถึงเกณฑ์ซ้าย/ขวาและท่าพื้นฐานโอเค
  if (postureOK && (inLeftExtreme || inRightExtreme)) {
    videoWrapper.classList.add("green-border");
    videoWrapper.classList.remove("red-border");
  } else {
    videoWrapper.classList.add("red-border");
    videoWrapper.classList.remove("green-border");
  }

  // ถ้ายังไม่ล็อก (ยังไม่นับในรอบนี้) ให้ตรวจ hold เพื่อ "นับ"
  if (!state.neck.latch) {
    state.neck.holdL = inLeftExtreme  ? state.neck.holdL + 1 : 0;
    state.neck.holdR = inRightExtreme ? state.neck.holdR + 1 : 0;

    // ถึงเกณฑ์ฝั่งใดฝั่งหนึ่ง -> นับ 1 ครั้ง
    if ((state.neck.holdL >= HOLD_FR || state.neck.holdR >= HOLD_FR) && postureOK) {
      state.neck.passes += 1;
      countdownElement.textContent = state.neck.passes;
      state.neck.latch = true;          // ล็อกไว้จนกว่าจะกลับกลาง
      state.neck.holdL = 0;
      state.neck.holdR = 0;

      // ครบ 10 ครั้ง -> Completed +1 แล้วรีเซ็ตตัวนับครั้ง
      if (state.neck.passes >= 10) {
        state.poseCount += 1;
        poseCountElement.textContent = state.poseCount;
        state.neck.passes = 0;
        countdownElement.textContent = 0;
      }
    }
  } else {
    // รอให้ผ่อนกลับกลางก่อน จึงปลดล็อกเพื่อให้นับครั้งถัดไปได้
    if (backToCenter) {
      state.neck.latch = false;
      state.neck.holdL = 0;
      state.neck.holdR = 0;
    }
  }
}
