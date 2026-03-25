import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

import { HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

import { checkUpperTrapezius } from "./checkUpperTrapezius.js";
import { checkChinTucks } from "./checkChinTucks.js";
import { checkNeckRotation } from "./checkNeckRotation.js";
import { checkShoulderBladeSqueeze } from "./checkShoulderBladeSqueeze.js";

/* ---------- DOM ---------- */
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const videoWrapper = document.getElementById("videoWrapper");
const countdownElement = document.getElementById("countdown");
const poseCountElement = document.getElementById("poseCount");
const poseDetail = document.getElementById("pose-detail");

/* Mobile UI */
const mobileMenu = document.getElementById("mobileMenu");
const mobileSheet = document.getElementById("mobileSheet");
const mobileSheetClose = document.getElementById("mobileSheetClose");
const mobilePoseDetail = document.getElementById("mobilePoseDetail");

/* ---------- App State ---------- */
let poseLandmarker;
let handLandmarker;
let running = false;
let draw;

const state = {
  selectedPose: null,          // 'upper' | 'chin' | 'sbs' | 'neck'
  isPoseDetectionActive: false,
  poseTimer: 0,
  wrongPoseTimer: 0,
  poseCount: 0,

  // Chin-tucks calibration
  chin: { baselineNoseZ: null, baselineCount: 0, calibrating: false },

  neck: {
    passes: 0,
    committedSide: null, // 'L' | 'R' | null
    holdL: 0,
    holdR: 0,
    centerHold: 0,
    readySwitch: false,
    filteredYaw: 0
  }
};

const elements = { videoWrapper, countdownElement, poseCountElement };
let startStopBtn = null;

/* ---------- Desktop: pose buttons ---------- */
document.querySelectorAll(".pose-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (state.isPoseDetectionActive) stopPoseCheck();  // safety
    state.selectedPose = btn.dataset.pose;
    renderPoseDetailDesktop(state.selectedPose);
  });
});

/* ---------- Mobile: bottom menu buttons ---------- */
document.querySelectorAll(".mobile-pose-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (state.isPoseDetectionActive) stopPoseCheck();  // safety
    state.selectedPose = btn.dataset.pose;
    openMobileSheet(state.selectedPose);
  });
});

if (mobileSheetClose) {
  mobileSheetClose.addEventListener("click", closeMobileSheet);
}

/* ---------- Desktop panel render ---------- */
function renderPoseDetailDesktop(pose) {
  let html = "";
  if (pose === "upper") {
    html = `
      <h3>Upper Trapezius Stretch</h3>
      <ol>
        <li>นั่งบนเก้าอี้ มือข้างหนึ่งจับขอบเก้าอี้</li>
        <li>เอียงศีรษะไปอีกด้านหนึ่ง ใช้มือด้านที่เอียงศรีษะไปดึงศีรษะเพิ่มเล็กน้อย ค้างไว้ 10 วินาที</li>
        <li>ทำสลับข้าง</li>		
      </ol>
      <img
        class="pose-detail-img"
        src="images/upper_trapezius.png"
        alt="Upper Trapezius Stretch"
        loading="lazy"
        decoding="async"
      />
      <div><button id="startBtn" class="pose-btn start-green">START</button></div>
    `;
  } else if (pose === "chin") {
    html = `
      <h3>Chin Tucks</h3>
      <ol>
        <li>นั่งหรือยืนหลังตรง มองตรงไปข้างหน้า </li>
		    <li>ค่อย ๆ ดันคางถอยหลังราวกับจะทำให้คอ “หดสั้นลง”จนรู้สึกตึงบริเวณต้นคอด้านหลังค้างไว้ 10 วินาที ทำ 3 ครั้ง </li>	
      </ol>
      <img
        class="pose-detail-img"
        src="images/chin_tuck.png"
        alt="Chin Tucks"
        loading="lazy"
        decoding="async"
      />      
      <button id="startBtn" class="pose-btn start-green">START</button>
    `;  
  } else if (pose === "neck") {
    html = `
      <h3>Neck Rotation</h3>
      <ol>
        <li>นั่งหลังตรง ค่อย ๆ หมุนศีรษะไปทางซ้ายจนรู้สึกตึงแล้วทำสลับข้าง</li>
        <li>ทำสลับซ้ายขวา 10 ครั้งนับเป็น 1รอบ  ทำ 3รอบ</li>
      </ol>
       <img
        class="pose-detail-img"
        src="images/neck_rotation.png"
        alt="neck rotation"
        loading="lazy"
        decoding="async"
      />      
      <button id="startBtn" class="pose-btn start-green">START</button>
    `;
  } else if (pose === "sbs") {
    html = `
      <h3>Shoulder Blade Squeeze</h3>
      <ol>
        <li> ถอยหลัง นั่งตัวตรงให้เห็นหัวไหล่ทั้ง2 ข้าง </li>
	      <li> บีบสะบักเข้าหากันเหมือนจะหนีบอะไรไว้ระหว่างหลัง ค้างไว้ 5 วินาที ทำ 10ครั้ง </li>
      </ol>
      <img
        class="pose-detail-img"
        src="images/shoulder_blade.png"
        alt="shoulder blade"
        loading="lazy"
        decoding="async"
      />      
      <button id="startBtn" class="pose-btn start-green">START</button>
    `;
  } else {
    html = `<h3>Select a posture above</h3>`;
  }

  poseDetail.innerHTML = html;
  startStopBtn = document.getElementById("startBtn");
  if (startStopBtn) startStopBtn.addEventListener("click", onStartClickedDesktop, { once: true });
}

/* ---------- Mobile bottom sheet ---------- */
function openMobileSheet(pose) {
  document.body.style.overflow = "hidden";
  mobileSheet.setAttribute("aria-hidden", "false");
  mobileSheet.classList.add("open");
  renderPoseDetailMobile(pose);
}

function closeMobileSheet() {
  document.body.style.overflow = "";
  mobileSheet.setAttribute("aria-hidden", "true");
  mobileSheet.classList.remove("open");
  mobilePoseDetail.innerHTML = "";
}

/* ✅ เดเลเกต: กดปุ่ม × หรือแตะพื้นหลัง (โปร่งใส) เพื่อปิด */
mobileSheet.addEventListener("click", (e) => {
  const onCloseBtn = e.target.closest(".mobile-sheet__close");
  const onBackdrop = e.target === mobileSheet;
  if (onCloseBtn || onBackdrop) closeMobileSheet();
});

function renderPoseDetailMobile(pose) {
  let html = "";
  if (pose === "upper") {
    html = `
      <button class="mobile-sheet__close" aria-label="Close">×</button>
      <div class="mobile-sheet__content">
        <h3 style="margin:6px 0 8px">Upper Trapezius Stretch</h3>
        <ol style="margin:0 0 12px 0px">
          <li>นั่งบนเก้าอี้ มือข้างหนึ่งจับขอบเก้าอี้</li>
          <li>เอียงศีรษะไปอีกด้านหนึ่ง ใช้มือด้านที่เอียงศรีษะไปดึงศีรษะเพิ่มเล็กน้อย ค้างไว้ 10 วินาที</li>
          <li>ทำสลับข้าง</li>		
        </ol>
        <img
          class="pose-detail-img"
          src="images/upper_trapezius.png"
          alt="Upper Trapezius Stretch"
          loading="lazy"
          decoding="async"
        />
        <button id="startBtnMobile" class="pose-btn mobile-btn-start start-green" style="padding:8px 14px">START</button>
      </div>
    `;
  } else if (pose === "chin") {
    html = `
      <button class="mobile-sheet__close" aria-label="Close">×</button>
      <div class="mobile-sheet__content">
        <h3 style="margin:6px 0 8px">Chin Tucks</h3>
        <ol style="margin:0 0 12px 0px">
          <li>นั่งหรือยืนหลังตรง มองตรงไปข้างหน้า </li>
		      <li>ค่อย ๆ ดันคางถอยหลังราวกับจะทำให้คอ “หดสั้นลง”จนรู้สึกตึงบริเวณต้นคอด้านหลังค้างไว้ 10 วินาที ทำ 3 ครั้ง </li>	
        </ol>
         <img
        class="pose-detail-img"
        src="images/chin_tuck.png"
        alt="Chin Tuck"
        loading="lazy"
        decoding="async"
      />      
        <button id="startBtnMobile" class="pose-btn mobile-btn-start start-green" style="padding:8px 14px">START</button>
      </div>
    `;
  } else if (pose === "neck") {
    html = `
      <button class="mobile-sheet__close" aria-label="Close">×</button>
      <div class="mobile-sheet__content">
        <h3 style="margin:6px 0 8px">Neck Rotation</h3>
        <ol style="margin:0 0 12px 0px">
          <li>นั่งหลังตรง ค่อย ๆ หมุนศีรษะไปทางซ้ายจนรู้สึกตึงแล้วทำสลับข้าง</li>
          <li>ทำสลับซ้ายขวา 10 ครั้งนับเป็น 1รอบ  ทำ 3รอบ</li>        
        </ol>
        <img
        class="pose-detail-img"
        src="images/neck_rotation.png"
        alt="neck rotation"
        loading="lazy"
        decoding="async"
      />      
        <button id="startBtnMobile" class="pose-btn mobile-btn-start start-green" style="padding:8px 14px">START</button>
      </div>
    `;
  } else if (pose === "sbs") {
    html = `
      <button class="mobile-sheet__close" aria-label="Close">×</button>
      <div class="mobile-sheet__content">
        <h3 style="margin:6px 0 8px">Shoulder Blade Squeeze</h3>
        <ol style="margin:0 0 12px 0px">
          <li> ถอยหลัง นั่งตัวตรงให้เห็นหัวไหล่ทั้ง2 ข้าง </li>
	        <li> บีบสะบักเข้าหากันเหมือนจะหนีบอะไรไว้ระหว่างหลัง ค้างไว้ 5 วินาที ทำ 10ครั้ง </li>
        </ol>
        <img
        class="pose-detail-img"
        src="images/shoulder_blade.png"
        alt="shoulder blade"
        loading="lazy"
        decoding="async"
      />      
        <button id="startBtnMobile" class="pose-btn mobile-btn-start start-green" style="padding:8px 14px">START</button>
      </div>
    `;
  } 

  mobilePoseDetail.innerHTML = html;

  // bind close + start/stop
  startStopBtn = document.getElementById("startBtnMobile");
  if (startStopBtn) startStopBtn.addEventListener("click", onStartClickedMobile, { once: true });
}

/* ---------- START/STOP (Desktop) ---------- */
function onStartClickedDesktop() {
  startPoseCheck();
  if (startStopBtn) {
    startStopBtn.textContent = "STOP";
    startStopBtn.classList.remove("start-green");
    startStopBtn.classList.add("stop-red");
    startStopBtn.addEventListener("click", onStopClickedDesktop, { once: true });

    if (state.selectedPose === "sbs") {
      state.sbs = null; // ให้ฟังก์ชันสร้าง state ใหม่และคาลิเบรตเอง
    }
  }
}
function onStopClickedDesktop() {
  stopPoseCheck();
  if (startStopBtn) {
    startStopBtn.textContent = "START";
    startStopBtn.classList.remove("stop-red");
    startStopBtn.classList.add("start-green");
    startStopBtn.addEventListener("click", onStartClickedDesktop, { once: true });
  }
}

/* ---------- START/STOP (Mobile sheet) ---------- */
function onStartClickedMobile() {
  startPoseCheck();
  closeMobileSheet();        // ✅ ข้อ 1: ซ่อน bottom sheet ทันที
  setMobileStopMode();       // ✅ ข้อ 2: แทนแถบด้วย STOP  
}
function onStopClickedMobile() {
  stopPoseCheck();
  setMobileMenuMode();       // ✅ ข้อ 3: เอาแถบปุ่มท่ากลับมา
  openMobileSheet(state.selectedPose); // ✅ เปิดแผงรายละเอียดกลับมา  
}

function getMobileMenuHTML() {
  return `
    <button class="mobile-pose-btn blue"   data-pose="upper">Upper</button>
    <button class="mobile-pose-btn green"  data-pose="chin">Chin</button>
    <button class="mobile-pose-btn yellow" data-pose="neck">Rotation</button>
    <button class="mobile-pose-btn purple" data-pose="sbs">Shoulder</button>         
  `;
}

function bindMobilePoseButtons() {
  mobileMenu.querySelectorAll(".mobile-pose-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (state.isPoseDetectionActive) stopPoseCheck(); // ความปลอดภัย
      state.selectedPose = btn.dataset.pose;
      openMobileSheet(state.selectedPose);
    });
  });
}

function setMobileMenuMode() {           // โหมดปุ่มท่าปกติ
  mobileMenu.classList.remove("stop-mode");
  mobileMenu.innerHTML = getMobileMenuHTML();
  bindMobilePoseButtons();
}

function setMobileStopMode() {           // โหมด STOP เต็มแถบ
  mobileMenu.classList.add("stop-mode");
  mobileMenu.innerHTML = `<button id="mobileStop" class="mobile-stop-btn">STOP</button>`;
  document.getElementById("mobileStop")
    .addEventListener("click", onStopClickedMobile, { once: true });
}

/* ---------- Core START/STOP ---------- */
function startPoseCheck() {
  state.isPoseDetectionActive = true;
  state.poseTimer = 0;
  state.wrongPoseTimer = 0;

  if (state.selectedPose === "chin") {
    state.chin.baselineNoseZ = null;
    state.chin.baselineCount = 0;
    state.chin.calibrating = true;
    state.chin.lastTs = null; 
  }

  if (state.selectedPose === "neck") {
    state.neck = {
      passes: 0,
      latch: false,
      holdL: 0,
      holdR: 0,
      filteredYaw: 0
    };
    countdownElement.textContent = 0;   // เริ่มที่ 0
  } else {
    countdownElement.textContent = 10;
  }

  videoWrapper.classList.remove("green-border");
  videoWrapper.classList.add("red-border");

  countdownElement.style.display = "block";
  countdownElement.textContent = (state.selectedPose === "neck")
    ? state.neck.passes
    : 10;
}

function stopPoseCheck() {
  state.isPoseDetectionActive = false;
  state.poseTimer = 0;
  state.wrongPoseTimer = 0;
  state.poseCount = 0;
  state.lastSide = null; 

  state.chin.baselineNoseZ = null;
  state.chin.baselineCount = 0;
  state.chin.calibrating = false;
  state.chin.lastTs = null;

  // ✅ neck reset
  state.neck = { passes: 0, latch: false, holdL: 0, holdR: 0, filteredYaw: 0 };

  poseCountElement.textContent = 0;
  countdownElement.textContent = (state.selectedPose === "neck") ? 0 : 10;
  videoWrapper.classList.remove("red-border", "green-border");

  // ถ้าเปิด bottom sheet อยู่ ให้ค้างไว้หรือปิดก็ได้
  // closeMobileSheet();
}

/* ---------- Mediapipe Init & Loop ---------- */
async function init() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numPoses: 1
  });

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numHands: 2
  });

  startVideo();
}

function startVideo() {
  navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.play();
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      running = true;
      draw = new DrawingUtils(ctx);
      requestAnimationFrame(loop);
    };
  });
}

function loop() {
  if (!running) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // เริ่ม mirror
  ctx.save();
  ctx.scale(-1, 1);
  ctx.translate(-canvas.width, 0);

  // วาดภาพจากกล้อง
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  if (state.isPoseDetectionActive) {
    const result = poseLandmarker.detectForVideo(video, performance.now());
    if (result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];

      let handLM = [];
      if (state.selectedPose === "chin") {
        const h = handLandmarker.detectForVideo(video, performance.now());
        handLM = h.landmarks || [];  // อาจว่างได้
      }

      // วาดโครงร่างใน context เดียวกัน (จะ mirror ด้วย)
      draw.drawLandmarks(landmarks, { color: "red", radius: 4 });
      draw.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { color: "green", lineWidth: 2 });

      // ตรวจแต่ละท่า → ใช้ landmarks ตรง ๆ (ไม่กระทบเพราะ landmark เป็นข้อมูลตำแหน่งจริง)
      if (state.selectedPose === "upper") {
        checkUpperTrapezius(landmarks, state, elements);
      } else if (state.selectedPose === "chin") {
        checkChinTucks(landmarks, state, elements, handLM);       
      } else if (state.selectedPose === "neck") {
        checkNeckRotation(landmarks, state, elements);
      } else if (state.selectedPose === "sbs") {
        checkShoulderBladeSqueeze(landmarks, state, elements);
      }
    }
  }

  ctx.restore(); // จบการ mirror

  requestAnimationFrame(loop);
}

init();
