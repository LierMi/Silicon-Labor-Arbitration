export const scroll3dConfig = {
  title: "3D Scroll Story Page",
  eyebrow: "MOSS 3D WEB PROTOTYPE",
  intro:
    "A modular Three.js + GSAP prototype: validate scroll interaction first, then replace the placeholder with a real GLB model.",
  exportFilenames: {
    screenshot: "moss-3d-scroll-frame.png",
    scene: "moss-scroll-scene.glb",
  },
  scene: {
    fogColor: 0xf5f4ef,
    floorColor: 0xe8e6dc,
    coreColor: 0x2d6cdf,
    shellColor: 0x12a886,
    satelliteColor: 0xffbf47,
    rimLightColor: 0x61c7ff,
  },
  scroll: {
    scrub: 0.85,
    start: "top top",
    end: "bottom bottom",
  },
  chapters: [
    {
      eyebrow: "01 / Scene Setup",
      title: "Scroll Drives 3D State",
      body: "The scroll position controls placeholder model rotation, scale, position, and material color. A GLB model can replace it later.",
    },
    {
      eyebrow: "02 / Camera Motion",
      title: "Camera Follows The Story",
      body: "ScrollTrigger scrub maps progress to camera movement, creating a smooth sequence of product-style shots.",
    },
    {
      eyebrow: "03 / Transitions",
      title: "Object Changes Stay Continuous",
      body: "A GSAP timeline links key visual states so rotation, movement, lighting, and opacity change without jumps.",
    },
    {
      eyebrow: "04 / Export And Embed",
      title: "Export The Frame Or Scene",
      body: "The action buttons export a screenshot or GLB scene, making this useful as both a prototype and a 3D workflow reference.",
    },
  ],
};
