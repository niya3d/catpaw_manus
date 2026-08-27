/**
 * Desktop Pet renderer: cats roam the full desktop, retain a natural personal
 * distance, and leave pawprints that softly clear only beneath the cursor path.
 */
import "./style.css";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const pawCanvas = document.querySelector("#paw-layer");
const host = document.querySelector("#three-layer");
const pawCtx = pawCanvas.getContext("2d");
const loader = new GLTFLoader();
const cats = [];
let paused = false;
let adoptedCatCount = 3;
const activeWipes = [];

// Relative asset URLs are required after Electron packages the renderer as file://.../dist/index.html.
const MODELS = ["cat-white-brown-walk.glb", "cat-white-pink-walk.glb", "cat-fold-walk.glb"].map((filename) => new URL(`./models/${filename}`, window.location.href).href);
const ROAM_BOUNDS = { minX: -6.6, maxX: 6.6, minY: -2.85, maxY: 1.1, minZ: -2.45, maxZ: 0.35 };
const STARTING_POINTS = [new THREE.Vector3(-4.6, -1.55, -1.25), new THREE.Vector3(0, -1.15, -1.65), new THREE.Vector3(4.6, -1.55, -1.25)];
const PERSONAL_SPACE = 1.55;
const random = (min, max) => min + Math.random() * (max - min);
const viewportPoint = (point) => ({ x: point.x * window.innerWidth, y: point.y * window.innerHeight });

function resizePaws() {
  const existing = document.createElement("canvas");
  existing.width = pawCanvas.width;
  existing.height = pawCanvas.height;
  existing.getContext("2d").drawImage(pawCanvas, 0, 0);
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  pawCanvas.width = Math.round(window.innerWidth * dpr);
  pawCanvas.height = Math.round(window.innerHeight * dpr);
  pawCanvas.style.width = `${window.innerWidth}px`;
  pawCanvas.style.height = `${window.innerHeight}px`;
  pawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (existing.width) pawCtx.drawImage(existing, 0, 0, existing.width, existing.height, 0, 0, window.innerWidth, window.innerHeight);
}

function stampPaw(x, y, size = 18, alpha = 0.17) {
  pawCtx.save();
  pawCtx.translate(x, y);
  pawCtx.rotate(random(-0.35, 0.35));
  pawCtx.fillStyle = `rgba(133, 141, 150, ${alpha})`;
  pawCtx.filter = "blur(1.5px)";
  pawCtx.beginPath();
  pawCtx.ellipse(0, size * 0.16, size * 0.43, size * 0.34, 0, 0, Math.PI * 2);
  pawCtx.fill();
  [[-.4,-.43,.16],[-.13,-.61,.17],[.16,-.58,.17],[.43,-.38,.14]].forEach(([tx, ty, radius]) => {
    pawCtx.beginPath();
    pawCtx.arc(tx * size, ty * size, radius * size, 0, Math.PI * 2);
    pawCtx.fill();
  });
  pawCtx.restore();
}

function queueSoftWipe(point) {
  const { x, y } = viewportPoint(point);
  activeWipes.push({ x, y, age: 0 });
  if (activeWipes.length > 80) activeWipes.splice(0, activeWipes.length - 80);
}

function applySoftWipes(dt) {
  for (let index = activeWipes.length - 1; index >= 0; index -= 1) {
    const wipe = activeWipes[index];
    wipe.age += dt;
    const progress = Math.min(wipe.age / 0.32, 1);
    const radius = 12 + progress * 9;
    const gradient = pawCtx.createRadialGradient(wipe.x, wipe.y, radius * 0.08, wipe.x, wipe.y, radius);
    gradient.addColorStop(0, "rgba(0,0,0,.38)");
    gradient.addColorStop(0.42, "rgba(0,0,0,.16)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    pawCtx.save();
    pawCtx.globalCompositeOperation = "destination-out";
    pawCtx.globalAlpha = .62 - progress * .25;
    pawCtx.filter = `blur(${2.2 + progress * 2.4}px)`;
    pawCtx.fillStyle = gradient;
    pawCtx.beginPath();
    pawCtx.arc(wipe.x, wipe.y, radius, 0, Math.PI * 2);
    pawCtx.fill();
    pawCtx.restore();
    if (progress >= 1) activeWipes.splice(index, 1);
  }
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(41, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.15, 11.2);
camera.lookAt(0, -0.55, 0);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xfff8ef, 0x61706b, 2.2));
const key = new THREE.DirectionalLight(0xfffaf2, 3.4);
key.position.set(-3, 5, 7);
scene.add(key);

function randomPointIn(bounds = ROAM_BOUNDS) {
  return new THREE.Vector3(random(bounds.minX, bounds.maxX), random(bounds.minY, bounds.maxY), random(bounds.minZ, bounds.maxZ));
}

function chooseTarget(origin) {
  let target = randomPointIn();
  let attempts = 0;
  while ((target.distanceTo(origin) < 2.4 || cats.some((cat) => cat.root.visible && cat.root.position.distanceTo(target) < PERSONAL_SPACE * 1.4)) && attempts++ < 16) target = randomPointIn();
  return target;
}

function createCat(gltf, index) {
  const root = new THREE.Group();
  const object = gltf.scene;
  const box = new THREE.Box3().setFromObject(object);
  const scale = 1.05 / Math.max(...box.getSize(new THREE.Vector3()).toArray());
  object.scale.setScalar(scale);
  const scaled = new THREE.Box3().setFromObject(object);
  object.position.y -= scaled.min.y;
  root.add(object);
  root.position.copy(STARTING_POINTS[index]);
  const target = chooseTarget(root.position);
  root.rotation.y = Math.atan2(target.x - root.position.x, target.z - root.position.z);
  root.visible = index < adoptedCatCount;
  scene.add(root);
  const mixer = new THREE.AnimationMixer(object);
  gltf.animations.map((clip) => {
    const cleanClip = clip.clone();
    cleanClip.tracks = cleanClip.tracks.filter((track) => !track.name.startsWith("tripo::Root."));
    return cleanClip;
  }).forEach((clip) => mixer.clipAction(clip).reset().play());
  cats.push({ index, root, target, mixer, nextTarget: performance.now() + random(5000, 8500), nextPrint: performance.now() + random(250, 700), phase: index * 2.1 });
}

MODELS.forEach((model, index) => loader.load(
  model,
  (gltf) => createCat(gltf, index),
  undefined,
  (error) => {
    const message = `Failed to load cat ${index + 1} from ${model}: ${error?.message || String(error)}`;
    console.error(message);
    window.pawDesktop?.reportError(message);
  },
));

const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(clock.getDelta(), 0.04);
  const now = performance.now();
  applySoftWipes(dt);
  if (!paused) {
    cats.forEach((cat) => {
      if (!cat.root.visible) return;
      const direction = cat.target.clone().sub(cat.root.position);
      if (now > cat.nextTarget || direction.length() < .5) {
        cat.target = chooseTarget(cat.root.position);
        cat.nextTarget = now + random(5800, 9200);
      }
      direction.copy(cat.target).sub(cat.root.position).normalize();
      const separation = new THREE.Vector3();
      cats.forEach((other) => {
        if (other === cat || !other.root.visible) return;
        const gap = cat.root.position.distanceTo(other.root.position);
        if (gap < PERSONAL_SPACE) {
          separation.add(cat.root.position.clone().sub(other.root.position).normalize().multiplyScalar((PERSONAL_SPACE - gap) / PERSONAL_SPACE));
        }
      });
      if (separation.lengthSq() > 0) direction.addScaledVector(separation.normalize(), 1.3).normalize();
      const heading = Math.atan2(direction.x, direction.z);
      const delta = Math.atan2(Math.sin(heading - cat.root.rotation.y), Math.cos(heading - cat.root.rotation.y));
      cat.root.rotation.y += THREE.MathUtils.clamp(delta, -dt * .62, dt * .62);
      const alignment = THREE.MathUtils.clamp(Math.cos(Math.min(Math.abs(delta), Math.PI / 2)), .45, 1);
      cat.root.position.addScaledVector(direction, dt * .46 * alignment);
      cat.root.position.x = THREE.MathUtils.clamp(cat.root.position.x, ROAM_BOUNDS.minX, ROAM_BOUNDS.maxX);
      cat.root.position.y = THREE.MathUtils.clamp(cat.root.position.y, ROAM_BOUNDS.minY, ROAM_BOUNDS.maxY);
      cat.root.position.z = THREE.MathUtils.clamp(cat.root.position.z, ROAM_BOUNDS.minZ, ROAM_BOUNDS.maxZ);
      cat.root.children[0].rotation.z = Math.sin(now * .006 + cat.phase) * .006;
      cat.mixer.timeScale = 1.08;
      cat.mixer.update(dt);
      if (now > cat.nextPrint) {
        const projected = cat.root.position.clone().project(camera);
        stampPaw((projected.x + 1) * .5 * window.innerWidth, (1 - (projected.y + 1) * .5) * window.innerHeight, random(14, 20));
        cat.nextPrint = now + random(620, 900);
      }
    });
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizePaws();
});

function setAdoptedCatCount(count) {
  adoptedCatCount = Math.max(1, Math.min(3, Number(count) || 3));
  cats.forEach((cat) => {
    cat.root.visible = cat.index < adoptedCatCount;
    if (cat.root.visible) cat.target = chooseTarget(cat.root.position);
  });
}

function clearPawprints() {
  activeWipes.length = 0;
  pawCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
}
resizePaws();
renderer.setSize(window.innerWidth, window.innerHeight);
window.pawDesktop?.onWipeAt(queueSoftWipe);
window.pawDesktop?.onPaused((value) => { paused = value; });
window.pawDesktop?.onCatCount(setAdoptedCatCount);
window.pawDesktop?.onClearPawprints(clearPawprints);
window.pawDesktop?.ready();
loop();
