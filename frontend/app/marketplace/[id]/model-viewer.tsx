"use client";

import { useEffect, useRef, useState } from "react";

export default function ModelViewer({ src, title }: { src: string; title: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let frame = 0;
    let renderer: import("three").WebGLRenderer | null = null;
    let controls: import("three/addons/controls/OrbitControls.js").OrbitControls | null = null;
    let resizeObserver: ResizeObserver | null = null;

    async function initialize() {
      try {
        const THREE = await import("three");
        const [{ GLTFLoader }, { OrbitControls }] = await Promise.all([
          import("three/addons/loaders/GLTFLoader.js"),
          import("three/addons/controls/OrbitControls.js"),
        ]);
        if (disposed || !host) return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setSize(host.clientWidth, host.clientHeight);
        host.appendChild(renderer.domElement);

        scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa2ad, 2.2));
        const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
        keyLight.position.set(4, 6, 5);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xd8e4ff, 1.2);
        fillLight.position.set(-4, 2, -4);
        scene.add(fillLight);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.07;

        const loader = new GLTFLoader();
        loader.load(
          src,
          (gltf) => {
            if (disposed) return;

            const model = gltf.scene;
            model.updateMatrixWorld(true);
            const bounds = new THREE.Box3().setFromObject(model);
            const center = bounds.getCenter(new THREE.Vector3());
            const size = bounds.getSize(new THREE.Vector3());
            const largestDimension = Math.max(size.x, size.y, size.z) || 1;
            model.position.sub(center);
            scene.add(model);

            camera.position.set(largestDimension * 1.6, largestDimension * 1.15, largestDimension * 2.7);
            camera.near = largestDimension / 100;
            camera.far = largestDimension * 100;
            camera.updateProjectionMatrix();
            if (controls) {
              controls.target.set(0, 0, 0);
              controls.minDistance = largestDimension * 1.05;
              controls.maxDistance = largestDimension * 6;
              controls.update();
            }
            setStatus("ready");
          },
          undefined,
          () => {
            if (!disposed) setStatus("error");
          },
        );

        const resize = () => {
          if (!renderer || !host) return;
          const width = host.clientWidth;
          const height = host.clientHeight;
          if (!width || !height) return;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);

        const render = () => {
          if (disposed || !renderer) return;
          frame = window.requestAnimationFrame(render);
          controls?.update();
          renderer.render(scene, camera);
        };
        render();
      } catch {
        if (!disposed) setStatus("error");
      }
    }

    void initialize();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      controls?.dispose();
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
    };
  }, []);

  return (
    <div className="relative size-full min-h-64" role="region" aria-label={`Interactive 3D model of ${title}`}>
      <div ref={hostRef} className="absolute inset-0" />
      {status !== "ready" && (
        <p className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-sm text-body" role={status === "error" ? "alert" : "status"}>
          {status === "loading" ? "Loading the 3D model…" : "The 3D model couldn’t be loaded."}
        </p>
      )}
      {status === "ready" && (
        <p className="pointer-events-none absolute bottom-3 inset-x-0 text-center text-xs text-body">Drag to rotate · scroll or pinch to zoom</p>
      )}
    </div>
  );
}
