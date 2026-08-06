import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportRendererScreenshot(renderer, filename) {
  if (!renderer) return;

  const link = document.createElement("a");
  link.download = filename;
  link.href = renderer.domElement.toDataURL("image/png");
  link.click();
}

export function exportThreeScene(scene, filename) {
  if (!scene) return;

  const exporter = new GLTFExporter();
  exporter.parse(
    scene,
    (result) => {
      if (result instanceof ArrayBuffer) {
        saveBlob(new Blob([result], { type: "model/gltf-binary" }), filename);
        return;
      }

      const gltfFilename = filename.replace(/\.glb$/i, ".gltf");
      saveBlob(
        new Blob([JSON.stringify(result, null, 2)], { type: "model/gltf+json" }),
        gltfFilename,
      );
    },
    (error) => {
      console.error("Failed to export scene", error);
    },
    { binary: true },
  );
}
