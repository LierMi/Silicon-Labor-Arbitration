# 3D Scroll Interaction Demo

This is a standalone React + Vite + Three.js + GSAP ScrollTrigger prototype. It can stay as a reference demo, or its modules can be moved into an existing React frontend.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Features

- Full-screen Three.js WebGL scene
- Placeholder 3D model, lights, and reference floor
- Scroll-driven model rotation, scale, position, material, and camera motion
- GSAP `scrub` smoothing
- PNG screenshot export
- GLB scene export
- `prefers-reduced-motion` fallback

## Structure

- `src/components/Scroll3DSection.jsx`: embeddable React component.
- `src/config/scroll3dConfig.js`: chapters, colors, scroll settings, and export names.
- `src/three/createScene.js`: Three.js scene, camera, renderer, lights, resize, and cleanup.
- `src/three/createPlaceholderModel.js`: placeholder model factory; replace this with real GLB loading later.
- `src/animation/createScrollTimeline.js`: GSAP ScrollTrigger timeline.
- `src/utils/exportScene.js`: screenshot and GLB export helpers.

## Integrating Into An Existing Frontend

For React/Vite, move `src/components`, `src/config`, `src/three`, `src/animation`, and `src/utils` into the target frontend, then render:

```jsx
<Scroll3DSection config={scroll3dConfig} />
```

For Next.js, keep the 3D component as a client component. When a `.glb` or `.gltf` model is ready, add a dedicated loader under `src/three` instead of putting model loading logic into the page component.
