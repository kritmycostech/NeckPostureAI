// /js/checkShoulderBladeSqueeze.js
// ตรวจท่า Shoulder Blade Squeeze ด้วย "หัวไหล่" เท่านั้น
// เงื่อนไขท่าถูก: จากท่าพัก → หุบสะบัก (ระยะหัวไหล่แคบลง) + ไหล่ถอย "ไปด้านหลัง" ค้างไว้
// จับเวลา 10 วินาทีจึงนับ Completed +1 (ผิดท่าต่อเนื่อง >2 วิ รีเซ็ต)

export function checkShoulderBladeSqueeze(landmarks, state, elements) {
  const { videoWrapper, countdownElement, poseCountElement } = elements;

  // --- Pose indices ---
  const LEFT_SH = 11, RIGHT_SH = 12;
  const lSh = landmarks[LEFT_SH];
  const rSh = landmarks[RIGHT_SH];
  if (!lSh || !rSh) return;

  // --- Helpers ---
  const dist2D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // --- Params (จูนได้) ---
  const CALI_FRAMES = 30;           // เก็บ baseline ~0.5s ที่ 60fps
  const RETRACT_RATIO_THR = 0.05;   // ระยะหัวไหล่ต้อง "แคบลง" >= 5% จาก baseline
  const Z_BACK_THR = 0.016;         // ไหล่ต้อง "ถอยหลัง" เมื่อเทียบ baseline (ตามทิศที่เรียนรู้)
  const Z_EST_MIN = 0.005;          // ค่าขั้นต่ำเพื่ออนุมานทิศของ z เมื่อมีการหุบ (กัน noise)

  // --- เตรียม state สำหรับท่านี้ ---
  // sbs = shoulder-blade squeeze
  if (!state.sbs) {
    state.sbs = {
      calibrating: true,
      n: 0,
      baseShoulderDist: 0,     // baseline ระยะหัวไหล่ (2D)
      baseShoulderZ: 0,        // baseline z เฉลี่ยของหัวไหล่
      dirSign: null            // ทิศทาง "ด้านหลัง" ของ z (+1 หรือ -1) เรียนรู้ครั้งเดียว
    };
  }

  // ค่าปัจจุบัน
  const shoulderDist = dist2D(lSh, rSh);
  const avgZ = ((lSh.z ?? 0) + (rSh.z ?? 0)) / 2;

  // ---- Calibration ช่วงต้น ----
  if (state.sbs.calibrating) {
    // ระยะหัวไหล่
    state.sbs.baseShoulderDist =
      (state.sbs.baseShoulderDist * state.sbs.n + shoulderDist) / (state.sbs.n + 1);
    // z เฉลี่ยหัวไหล่
    state.sbs.baseShoulderZ =
      (state.sbs.baseShoulderZ * state.sbs.n + avgZ) / (state.sbs.n + 1);

    state.sbs.n += 1;
    if (state.sbs.n >= CALI_FRAMES) {
      state.sbs.calibrating = false;
    }

    // UI ระหว่างคาลิเบรต
    videoWrapper.classList.remove("green-border");
    videoWrapper.classList.add("red-border");
    countdownElement.textContent = 10;
    return;
  }

  const baseDist = state.sbs.baseShoulderDist || shoulderDist;
  const baseZ   = state.sbs.baseShoulderZ || avgZ;

  // --- สัญญาณ "หุบสะบัก" ---
  const shouldersRetracted = shoulderDist < baseDist * (1 - RETRACT_RATIO_THR);

  // --- เรียนรู้ทิศ "ด้านหลัง" ของ z หนึ่งครั้ง เมื่อเห็นว่าหุบสะบักจริง ---
  if (state.sbs.dirSign == null && shouldersRetracted) {
    const dz = avgZ - baseZ;
    if (Math.abs(dz) > Z_EST_MIN) {
      state.sbs.dirSign = Math.sign(dz); // +1 หรือ -1 แล้วแต่โมเดล/กล้อง
    }
  }

  // --- สัญญาณ "ถอยไปด้านหลัง" เทียบ baseline (เมื่อรู้ทิศแล้ว) ---
  let shouldersBack = true; // ก่อนรู้ทิศ อนุญาตผ่านด้วยสัญญาณระยะอย่างเดียว
  if (state.sbs.dirSign != null) {
    const dzSigned = (avgZ - baseZ) * state.sbs.dirSign;
    shouldersBack = dzSigned > Z_BACK_THR;
  }

  // --- ท่าถูกต้อง = หุบสะบัก + ถอยหลัง (ตามทิศที่เรียนรู้ ถ้ายังไม่รู้ทิศให้ผ่านด้วยระยะ) ---
  const correctPose = shouldersRetracted && shouldersBack;

  // --- Timer / UI ---
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

      // รีเซ็ตสำหรับรอบถัดไป
      state.poseTimer = 0;
      state.wrongPoseTimer = 0;
      countdownElement.textContent = 10;

      // อัปเดต baseline เล็กน้อย (กัน drift)
      state.sbs.baseShoulderDist = baseDist * 0.7 + shoulderDist * 0.3;
      state.sbs.baseShoulderZ    = baseZ   * 0.7 + avgZ         * 0.3;
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
