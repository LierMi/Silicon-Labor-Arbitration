import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function createScrollTimeline({
  root,
  camera,
  cameraTarget,
  model,
  rimLight,
  scroll,
}) {
  return gsap
    .timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: root,
        start: scroll.start,
        end: scroll.end,
        scrub: scroll.scrub,
      },
    })
    .to(model.group.rotation, { y: Math.PI * 1.3, x: 0.25 }, 0)
    .to(model.group.position, { x: -1.15, y: 0.2, z: 0.4 }, 0.14)
    .to(camera.position, { x: 2.4, y: 1.65, z: 5.1 }, 0.14)
    .to(cameraTarget, { x: -0.35, y: 0.1, z: 0 }, 0.14)
    .to(model.materials.coreMaterial.color, { r: 0.89, g: 0.26, b: 0.23 }, 0.3)
    .to(model.parts.shell.rotation, { z: Math.PI * 1.5, x: Math.PI * 0.55 }, 0.3)
    .to(model.group.scale, { x: 1.45, y: 1.45, z: 1.45 }, 0.3)
    .to(model.group.position, { x: 1.2, y: -0.05, z: -0.2 }, 0.5)
    .to(camera.position, { x: -2.2, y: 2.1, z: 4.7 }, 0.5)
    .to(cameraTarget, { x: 0.4, y: 0.05, z: 0 }, 0.5)
    .to(rimLight.position, { x: 3.5, y: 2.4, z: 2.8 }, 0.5)
    .to(model.materials.shellMaterial, { opacity: 0.35 }, 0.68)
    .to(model.group.rotation, { y: Math.PI * 2.25, z: -0.22 }, 0.68)
    .to(camera.position, { x: 0, y: 1.35, z: 6.8 }, 0.68)
    .to(cameraTarget, { x: 0, y: 0, z: 0 }, 0.68);
}

export function refreshScrollTriggers() {
  ScrollTrigger.refresh();
}

export function killScrollTriggers() {
  ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
}
