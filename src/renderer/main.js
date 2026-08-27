/**
 * Desktop Pet renderer: low-motion paths give each cat a direction of travel,
 * while pawprints stay behind the 3D layer and erase only at global click points.
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

// Relative asset URLs are required after Electron packages the renderer as file://.../dist/index.html.
const MODELS = ["cat-white-brown-walk.glb", "cat-white-pink-walk.glb", "cat-fold-walk.glb"].map((filename) => new URL(`./models/${filename}`, window.location.href).href);
const ACTIVITY_ZONES = [
  { minX: -6.9, maxX: -2.55, minY: -2.9, maxY: 1.05, minZ: -2.5, maxZ: 0.25 },
  { minX: -2.05, maxX: 2.05, minY: -2.9, maxY: 1.05, minZ: -2.5, maxZ: 0.25 },
  { minX: 2.55, maxX: 6.9, minY: -2.9, maxY: 1.05, minZ: -2.5, maxZ: 0.25 },
];
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

function cleanAt(point) {
  const { x, y } = viewportPoint(point);
  const radius = 24;
  const gradient = pawCtx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
  gradient.addColorStop(0, "rgba(0,0,0,1)");
  gradient.addColorStop(0.55, "rgba(0,0,0,.7)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  pawCtx.save();
  pawCtx.globalCompositeOperation = "destination-out";
  pawCtx.fillStyle = gradient;
  pawCtx.beginPath();
  pawCtx.arc(x, y, radius, 0, Math.PI * 2);
  pawCtx.fill();
  pawCtx.restore();
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

function randomPointIn(zone) {
  return new THREE.Vector3(random(zone.minX, zone.maxX), random(zone.minY, zone.maxY), random(zone.minZ, zone.maxZ));
}

function chooseTarget(origin, zone) {
  let target = randomPointIn(zone);
  let attempts = 0;
  while (target.distanceTo(origin) < 2.2 && attempts++ < 8) target = randomPointIn(zone);
  return target;
}

function createCat(gltf, index) {
  const zone = ACTIVITY_ZONES[index];
  const root = new THREE.Group();
  const object = gltf.scene;
  const box = new THREE.Box3().setFromObject(object);
  const scale = 1.05 / Math.max(...box.getSize(new THREE.Vector3()).toArray());
  object.scale.setScalar(scale);
  const scaled = new THREE.Box3().setFromObject(object);
  object.position.y -= scaled.min.y;
  root.add(object);
  root.position.copy(randomPointIn(zone));
  const target = chooseTarget(root.position, zone);
  root.rotation.y = Math.atan2(target.x - root.position.x, target.z - root.position.z);
  scene.add(root);
  const mixer = new THREE.AnimationMixer(object);
  gltf.animations.map((clip) => {
    const cleanClip = clip.clone();
    cleanClip.tracks = cleanClip.tracks.filter((track) => !track.name.startsWith("tripo::Root."));
    return cleanClip;
  }).forEach((clip) => mixer.clipAction(clip).reset().play());
  cats.push({ root, zone, target, mixer, nextTarget: performance.now() + random(5000, 8500), nextPrint: performance.now() + random(250, 700), phase: index * 2.1 });
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
  if (!paused) {
    cats.forEach((cat) => {
      const direction = cat.target.clone().sub(cat.root.position);
      if (now > cat.nextTarget || direction.length() < .5) {
        cat.target = chooseTarget(cat.root.position, cat.zone);
        cat.nextTarget = now + random(5800, 9200);
      }
      direction.copy(cat.target).sub(cat.root.position).normalize();
      const heading = Math.atan2(direction.x, direction.z);
      const delta = Math.atan2(Math.sin(heading - cat.root.rotation.y), Math.cos(heading - cat.root.rotation.y));
      cat.root.rotation.y += THREE.MathUtils.clamp(delta, -dt * .62, dt * .62);
      const alignment = THREE.MathUtils.clamp(Math.cos(Math.min(Math.abs(delta), Math.PI / 2)), .45, 1);
      cat.root.position.addScaledVector(direction, dt * .46 * alignment);
      cat.root.position.x = THREE.MathUtils.clamp(cat.root.position.x, cat.zone.minX, cat.zone.maxX);
      cat.root.position.y = THREE.MathUtils.clamp(cat.root.position.y, cat.zone.minY, cat.zone.maxY);
      cat.root.position.z = THREE.MathUtils.clamp(cat.root.position.z, cat.zone.minZ, cat.zone.maxZ);
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
resizePaws();
renderer.setSize(window.innerWidth, window.innerHeight);
window.pawDesktop?.onCleanAt(cleanAt);
window.pawDesktop?.onPaused((value) => { paused = value; });
window.pawDesktop?.ready();
loop();
