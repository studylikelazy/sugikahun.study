/**
 * Exchange Floor style: quiet isometric market lounge behind the React HUD.
 * Deep navy geometry and blue structural lights support—not compete with—market decisions.
 */
import { useEffect, useRef } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { createGameScene, type GameHandle } from "@/game/scene";

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const handleRef = useRef<GameHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || engineRef.current) return;

    const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: true });
    engineRef.current = engine;
    let disposed = false;

    void createGameScene(engine, canvas).then((handle) => {
      if (disposed) {
        handle.dispose();
        return;
      }
      handleRef.current = handle;
      engine.runRenderLoop(() => handle.scene.render());
    });

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      engine.stopRenderLoop();
      handleRef.current?.dispose();
      handleRef.current = null;
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return <div className="exchange-floor" aria-hidden="true"><canvas ref={canvasRef} /></div>;
}
