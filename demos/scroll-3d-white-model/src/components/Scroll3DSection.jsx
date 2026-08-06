import React, { useEffect, useRef, useState } from "react";
import {
  createScrollTimeline,
  refreshScrollTriggers,
} from "../animation/createScrollTimeline.js";
import { createPlaceholderModel } from "../three/createPlaceholderModel.js";
import { createScene } from "../three/createScene.js";
import {
  exportRendererScreenshot,
  exportThreeScene,
} from "../utils/exportScene.js";
import { prefersReducedMotion } from "../utils/motion.js";

export function Scroll3DSection({ config }) {
  const rootRef = useRef(null);
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!rootRef.current || !mountRef.current) return undefined;

    const runtime = createScene({
      mount: mountRef.current,
      colors: config.scene,
    });
    const model = createPlaceholderModel(config.scene);
    const reduceMotion = prefersReducedMotion();
    let animationFrame = 0;

    runtime.scene.add(model.group, model.floor);
    sceneRef.current = runtime.scene;
    rendererRef.current = runtime.renderer;

    if (reduceMotion) {
      model.group.rotation.set(0.25, -0.35, 0);
      model.group.scale.setScalar(1.08);
      runtime.camera.position.set(0, 1.2, 6.6);
    } else {
      createScrollTimeline({
        root: rootRef.current,
        camera: runtime.camera,
        cameraTarget: runtime.cameraTarget,
        model,
        rimLight: runtime.lights.rimLight,
        scroll: config.scroll,
      });
    }

    const render = () => {
      animationFrame = requestAnimationFrame(render);
      model.tick({ reduceMotion });
      runtime.render();
    };

    const resize = () => {
      runtime.resize();
      refreshScrollTriggers();
    };

    window.addEventListener("resize", resize);
    render();
    setIsReady(true);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrame);
      runtime.dispose();
      model.dispose();
      sceneRef.current = null;
      rendererRef.current = null;
      setIsReady(false);
    };
  }, [config]);

  return (
    <main className="page-shell" ref={rootRef}>
      <div className="scene-layer" aria-label="Scroll-driven 3D scene">
        <div className="scene-canvas" ref={mountRef} />
        <div className="scene-actions" aria-live="polite">
          <button
            type="button"
            onClick={() =>
              exportRendererScreenshot(
                rendererRef.current,
                config.exportFilenames.screenshot,
              )
            }
            disabled={!isReady}
          >
            Export PNG
          </button>
          <button
            type="button"
            onClick={() =>
              exportThreeScene(sceneRef.current, config.exportFilenames.scene)
            }
            disabled={!isReady}
          >
            Export GLB
          </button>
        </div>
      </div>

      <section className="hero-panel">
        <div className="copy-block">
          <p className="eyebrow">{config.eyebrow}</p>
          <h1>{config.title}</h1>
          <p>{config.intro}</p>
        </div>
      </section>

      <div className="story-rail" aria-label="3D page scroll chapters">
        {config.chapters.map((chapter) => (
          <section className="story-panel" key={chapter.eyebrow}>
            <div className="copy-block">
              <p className="eyebrow">{chapter.eyebrow}</p>
              <h2>{chapter.title}</h2>
              <p>{chapter.body}</p>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
