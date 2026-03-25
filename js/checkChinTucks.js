// /js/checkChinTucks.js
export function checkChinTucks(landmarks, state, elements, handLandmarks = []) {
  const { videoWrapper, countdownElement, poseCountElement } = elements;

  const NOSE = 0, LEFT_EAR = 7, RIGHT_EAR = 8, LEFT_SH = 11, RIGHT_SH = 12;
  const nose = landmarks[NOSE];
  const leftEar = landmarks[LEFT_EAR];
  const rightEar = landmarks[RIGHT_EAR];
  const leftShoulder = landmarks[LEFT_SH];
  const rightShoulder = landmarks[RIGHT_SH];
  if (!nose || !leftShoulder || !rightShoulder) return;

  /* ================== ปรับค่าง่ายขึ้น ================== */
  const LEVEL_TOL = 0.05;        // ผ่อนความเอียง
  const TUCK_THRESHOLD = 0.005;  // << สำคัญ: ไม่ต้องดันคางเยอะ
  const CHIN_X_HALF = 0.12;
  const CHIN_Y_MIN_K = 0.12;
  const CHIN_Y_MAX_K = 0.30;
  const REQUIRE_CLUSTER_FOR_MULTI = false; // << สำคัญ: ผ่านง่ายขึ้น

  /* ================== ศีรษะ/ไหล่ตรง ================== */
  const earDiffY = Math.abs((leftEar?.y ?? 0) - (rightEar?.y ?? 0));
  const shoulderDiffY = Math.abs(leftShoulder.y - rightShoulder.y);
  const headLevel = earDiffY < LEVEL_TOL && shoulderDiffY < LEVEL_TOL;

  /* ================== กล่องคาง ================== */
  const shoulderSpan = Math.hypot(
    leftShoulder.x - rightShoulder.x,
    leftShoulder.y - rightShoulder.y
  );

  const chinBox = {
    xMin: nose.x - CHIN_X_HALF,
    xMax: nose.x + CHIN_X_HALF,
    yMin: nose.y + CHIN_Y_MIN_K * shoulderSpan,
    yMax: nose.y + CHIN_Y_MAX_K * shoulderSpan
  };

  /* ================== ตรวจมือ ================== */
  const TIP_IDS = [4, 8, 12, 16, 20];
  let handOnChin = false;

  for (const hand of handLandmarks) {
    if (!hand) continue;
    for (const id of TIP_IDS) {
      const p = hand[id];
      if (!p) continue;
      if (
        p.x >= chinBox.xMin && p.x <= chinBox.xMax &&
        p.y >= chinBox.yMin && p.y <= chinBox.yMax
      ) {
        handOnChin = true; // แค่ 1 นิ้วพอ
        break;
      }
    }
    if (handOnChin) break;
  }

  /* ================== Calibration ================== */
  if (state.chin?.calibrating) {
    const n = state.chin.baselineCount || 0;
    state.chin.baselineNoseZ =
      n === 0 ? nose.z : (state.chin.baselineNoseZ * n + nose.z) / (n + 1);
    state.chin.baselineCount = n + 1;

    if (state.chin.baselineCount >= 20) {
      state.chin.calibrating = false;
    }
    videoWrapper.classList.add("red-border");
    countdownElement.textContent = 10;
    return;
  }

  if (state.chin.baselineNoseZ == null) {
    state.chin.baselineNoseZ = nose.z;
  }

  const deltaZ = nose.z - state.chin.baselineNoseZ;

  /* ================== Timer: ใช้เวลาจริง ================== */
  const now = performance.now();
  if (!state.chin.lastTs) state.chin.lastTs = now;
  const dt = Math.min((now - state.chin.lastTs) / 1000, 0.15);
  state.chin.lastTs = now;

  state.poseTimer ||= 0;
  state.wrongPoseTimer ||= 0;

  const correctPose = headLevel && handOnChin && deltaZ > TUCK_THRESHOLD;

  if (correctPose) {
    state.wrongPoseTimer = 0;
    videoWrapper.classList.remove("red-border");
    videoWrapper.classList.add("green-border");

    state.poseTimer += dt;

    // เห็นว่าเวลาเดินทันที
    countdownElement.textContent = Math.max(Math.ceil(10 - state.poseTimer), 0);

    if (state.poseTimer >= 10) {
      state.poseCount++;
      poseCountElement.textContent = state.poseCount;
      state.poseTimer = 0;
      countdownElement.textContent = 10;
    }
  } else if (state.isPoseDetectionActive) {
    state.wrongPoseTimer += dt;
    if (state.wrongPoseTimer > 3) {
      state.poseTimer = 0;
      state.wrongPoseTimer = 0;
      countdownElement.textContent = 10;
      videoWrapper.classList.add("red-border");
      videoWrapper.classList.remove("green-border");
    }
  }
}
