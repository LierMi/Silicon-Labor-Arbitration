import * as THREE from "three";
import { killScrollTriggers } from "../animation/createScrollTimeline.js";

export function createScene({ mount, colors }) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(colors.fogColor, 8, 22);

  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(0, 1.25, 7);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  mount.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.45);
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
  const rimLight = new THREE.PointLight(colors.rimLightColor, 6, 12);
  keyLight.position.set(4, 5, 6);
  rimLight.position.set(-3, 1.5, 4);
  scene.add(ambientLight, keyLight, rimLight);

  const cameraTarget = { x: 0, y: 0, z: 0 };

  return {
    scene,
    camera,
    cameraTarget,
    renderer,
    lights: { ambientLight, keyLight, rimLight },
    render() {
      camera.lookAt(cameraTarget.x, cameraTarget.y, cameraTarget.z);
      renderer.render(scene, camera);
    },
    resize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    },
    dispose() {
      killScrollTriggers();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    },
  };
}
