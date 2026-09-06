import { useEffect, useRef, useState } from 'react';
import { usePdfSession } from '../session/PdfSession';
import { NavBackLabel } from '../ui/NavBackLabel';

export function Signature() {
  const { addSignature, backToEditor } = usePdfSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const drawnRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const paintStyle = (ctx: CanvasRenderingContext2D, dpr: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = '#111';
    };
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const snapshot = drawnRef.current ? canvas.toDataURL() : '';
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      paintStyle(ctx, dpr);
      if (!snapshot) return;
      const image = new Image();
      image.onload = () => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        paintStyle(ctx, dpr);
      };
      image.src = snapshot;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    last.current = point(event);
    drawnRef.current = true;
    setHasDrawn(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const next = point(event);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    last.current = next;
  }

  function onPointerUp() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#111';
    drawnRef.current = false;
    setHasDrawn(false);
  }

  function confirm() {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    addSignature(canvas.toDataURL('image/png'));
  }

  return (
    <div className="subpage">
      <div className="topbar">
        <div className="topbar-main">
          <button className="nav-btn" onClick={backToEditor}>
            <NavBackLabel>取消</NavBackLabel>
          </button>
          <div className="file-name">手写签名</div>
          <button className="text-btn" onClick={confirm} disabled={!hasDrawn}>
            确认
          </button>
        </div>
      </div>
      <div className="sig-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {!hasDrawn && <div className="sig-hint">在这里写下签名</div>}
      </div>
      <button className="danger-btn" onClick={clear}>
        清除，重新签
      </button>
    </div>
  );
}
