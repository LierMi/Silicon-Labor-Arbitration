import * as THREE from "three";

export function createPlaceholderModel(colors) {
  const group = new THREE.Group();
  group.name = "Scroll narrative placeholder model";

  const coreMaterial = new THREE.MeshStandardMaterial({
    color: colors.coreColor,
    metalness: 0.35,
    roughness: 0.22,
  });
  const shellMaterial = new THREE.MeshStandardMaterial({
    color: colors.shellColor,
    metalness: 0.15,
    roughness: 0.38,
    transparent: true,
    opacity: 0.86,
  });
  const satelliteMaterial = new THREE.MeshStandardMaterial({
    color: colors.satelliteColor,
    metalness: 0.2,
    roughness: 0.32,
  });
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: colors.floorColor,
    roughness: 0.8,
    metalness: 0,
  });

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 2), coreMaterial);
  core.name = "Core module";

  const shell = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1.45, 0.08, 160, 18),
    shellMaterial,
  );
  shell.name = "Animated transition shell";

  const orbit = new THREE.Group();
  orbit.name = "Rotating satellite system";

  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    const satellite = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 24, 16),
      satelliteMaterial,
    );
    satellite.position.set(
      Math.cos(angle) * 2,
      Math.sin(angle) * 0.55,
      Math.sin(angle) * 2,
    );
    orbit.add(satellite);
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.2;
  floor.name = "Soft reference floor";

  group.add(core, shell, orbit);

  return {
    group,
    floor,
    parts: { core, shell, orbit },
    materials: { coreMaterial, shellMaterial, satelliteMaterial, floorMaterial },
    tick({ reduceMotion }) {
      if (reduceMotion) return;
      orbit.rotation.y += 0.008;
      shell.rotation.y += 0.004;
    },
    dispose() {
      group.traverse((node) => {
        if (node.geometry) node.geometry.dispose();
      });
      floor.geometry.dispose();
      coreMaterial.dispose();
      shellMaterial.dispose();
      satelliteMaterial.dispose();
      floorMaterial.dispose();
    },
  };
}
