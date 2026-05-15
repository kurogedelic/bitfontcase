import React, { useRef, useState, useEffect } from 'react';

type Glyph = boolean[];

function createGlyphs(count: number, size: number): Glyph[] {
  return Array.from({ length: count }, () => Array(size).fill(false) as Glyph);
}

function App() {
  const [glyphWidth, setGlyphWidth] = useState(16);
  const [glyphHeight, setGlyphHeight] = useState(16);
  const [glyphCols, setGlyphCols] = useState(4);
  const [startCode, setStartCode] = useState(0x20);
  const [glyphs, setGlyphs] = useState<Glyph[]>(() =>
    createGlyphs(32, 16 * 16)
  );
  const [selected, setSelected] = useState(0);
  const [viewScale, setViewScale] = useState(8);
  const [viewOffsetX, setViewOffsetX] = useState(0);
  const [viewOffsetY, setViewOffsetY] = useState(0);
  const [tool, setTool] = useState<'pen' | 'erase' | 'line'>('pen');
  const [isDrawing, setIsDrawing] = useState(false);
  const [lineStart, setLineStart] =
    useState<{ x: number; y: number } | null>(null);
  const [panStart, setPanStart] =
    useState<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [history, setHistory] = useState<Glyph[][]>([]);
  const [redoStack, setRedoStack] = useState<Glyph[][]>([]);
  const [copyBuffer, setCopyBuffer] = useState<Glyph | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const editThreshold = 8;

  function commitHistory() {
    setHistory((prev) => [...prev, glyphs.map((g) => [...g])]);
    setRedoStack([]);
  }

  function undo() {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((rd) => [glyphs.map((g) => [...g]), ...rd]);
      setGlyphs(last.map((g) => [...g]));
      return prev.slice(0, -1);
    });
  }

  function redo() {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const first = prev[0];
      setHistory((h) => [...h, glyphs.map((g) => [...g])]);
      setGlyphs(first.map((g) => [...g]));
      return prev.slice(1);
    });
  }

  function setPixel(index: number, x: number, y: number, val: boolean) {
    setGlyphs((gs) => {
      const copy = gs.map((g) => [...g]);
      const g = copy[index];
      g[y * glyphWidth + x] = val;
      copy[index] = g;
      return copy;
    });
  }

  function togglePixel(index: number, x: number, y: number) {
    setGlyphs((gs) => {
      const copy = gs.map((g) => [...g]);
      const g = copy[index];
      const idx = y * glyphWidth + x;
      g[idx] = !g[idx];
      copy[index] = g;
      return copy;
    });
  }

  function drawLine(
    index: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    val: boolean
  ) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0;
    let cy = y0;
    const updates: [number, number][] = [];
    while (true) {
      updates.push([cx, cy]);
      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
    setGlyphs((gs) => {
      const copy = gs.map((g) => [...g]);
      const g = copy[index];
      updates.forEach(([x, y]) => {
        if (x >= 0 && x < glyphWidth && y >= 0 && y < glyphHeight) {
          g[y * glyphWidth + x] = val;
        }
      });
      copy[index] = g;
      return copy;
    });
  }

  function shiftSelected(dx: number, dy: number) {
    commitHistory();
    setGlyphs((gs) => {
      const copy = gs.map((g) => [...g]);
      const g = copy[selected];
      const newG = new Array(g.length).fill(false) as Glyph;
      for (let y = 0; y < glyphHeight; y++) {
        for (let x = 0; x < glyphWidth; x++) {
          const v = g[y * glyphWidth + x];
          if (v) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < glyphWidth && ny >= 0 && ny < glyphHeight) {
              newG[ny * glyphWidth + nx] = true;
            }
          }
        }
      }
      copy[selected] = newG;
      return copy;
    });
  }

  function rotateSelected() {
    commitHistory();
    setGlyphs((gs) => {
      const copy = gs.map((g) => [...g]);
      const g = copy[selected];
      const newG = new Array(g.length).fill(false) as Glyph;
      for (let y = 0; y < glyphHeight; y++) {
        for (let x = 0; x < glyphWidth; x++) {
          const v = g[y * glyphWidth + x];
          if (v) {
            const nx = y;
            const ny = glyphWidth - 1 - x;
            if (nx < glyphHeight && ny < glyphWidth) {
              newG[ny * glyphWidth + nx] = true;
            }
          }
        }
      }
      copy[selected] = newG;
      return copy;
    });
  }

  function handleCopy() {
    if (viewScale <= editThreshold) {
      setCopyBuffer([...glyphs[selected]]);
    }
  }

  function handlePaste() {
    if (copyBuffer) {
      commitHistory();
      setGlyphs((gs) => {
        const copy = gs.map((g) => [...g]);
        copy[selected] = [...copyBuffer];
        return copy;
      });
    }
  }

  function addGlyph() {
    commitHistory();
    setGlyphs((gs) => {
      const newG = gs.map((g) => [...g]);
      newG.push(new Array(glyphWidth * glyphHeight).fill(false) as Glyph);
      return newG;
    });
    setSelected(glyphs.length);
  }

  function clearSelected() {
    commitHistory();
    setGlyphs((gs) => {
      const copy = gs.map((g) => [...g]);
      copy[selected] = new Array(glyphWidth * glyphHeight).fill(false) as Glyph;
      return copy;
    });
  }

  function exportBDF(): string {
    const lines: string[] = [];
    lines.push('STARTFONT 2.1');
    lines.push(`FONT bitfontcase`);
    lines.push(`SIZE ${glyphHeight} 75 75`);
    lines.push(`CHARS ${glyphs.length}`);
    glyphs.forEach((g, i) => {
      const code = startCode + i;
      const hexCode = code.toString(16).toUpperCase().padStart(4, '0');
      lines.push(`STARTCHAR U+${hexCode}`);
      lines.push(`ENCODING ${code}`);
      lines.push(`SWIDTH ${glyphWidth * 50} 0`);
      lines.push(`DWIDTH ${glyphWidth} 0`);
      lines.push(`BBX ${glyphWidth} ${glyphHeight} 0 0`);
      lines.push('BITMAP');
      for (let y = 0; y < glyphHeight; y++) {
        let row = 0;
        let bitCount = 0;
        let rowStr = '';
        for (let x = 0; x < glyphWidth; x++) {
          row = (row << 1) | (g[y * glyphWidth + x] ? 1 : 0);
          bitCount++;
          if (bitCount % 4 === 0) {
            rowStr += row.toString(16).toUpperCase();
            row = 0;
          }
        }
        if (glyphWidth % 4 !== 0) {
          row = row << (4 - (glyphWidth % 4));
          rowStr += row.toString(16).toUpperCase();
        }
        if (rowStr === '') rowStr = '0';
        lines.push(rowStr.padStart(Math.ceil(glyphWidth / 4), '0'));
      }
      lines.push('ENDCHAR');
    });
    lines.push('ENDFONT');
    return lines.join('\n');
  }

  function exportU8g2(): string {
    const lines: string[] = [];
    glyphs.forEach((g, i) => {
      const code = startCode + i;
      const hexCode = code.toString(16).toUpperCase();
      lines.push(`/* U+${hexCode} */`);
      let bits: number[] = [];
      let buffer = 0;
      let count = 0;
      for (let y = 0; y < glyphHeight; y++) {
        for (let x = 0; x < glyphWidth; x++) {
          buffer = (buffer << 1) | (g[y * glyphWidth + x] ? 1 : 0);
          count++;
          if (count === 8) {
            bits.push(buffer);
            buffer = 0;
            count = 0;
          }
        }
      }
      if (count > 0) {
        buffer = buffer << (8 - count);
        bits.push(buffer);
      }
      const line = bits
        .map((b) => '0x' + b.toString(16).padStart(2, '0'))
        .join(', ');
      lines.push(line + ',');
    });
    return lines.join('\n');
  }

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glyphs, viewScale, viewOffsetX, viewOffsetY, selected]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.save();
    ctx.translate(viewOffsetX, viewOffsetY);
    ctx.scale(viewScale, viewScale);
    const totalCols = glyphCols;
    ctx.fillStyle = '#000';
    for (let i = 0; i < glyphs.length; i++) {
      const col = i % totalCols;
      const row = Math.floor(i / totalCols);
      const gx = col * glyphWidth;
      const gy = row * glyphHeight;
      const g = glyphs[i];
      for (let y = 0; y < glyphHeight; y++) {
        for (let x = 0; x < glyphWidth; x++) {
          if (g[y * glyphWidth + x]) {
            ctx.fillRect(gx + x, gy + y, 1, 1);
          }
        }
      }
      if (i === selected) {
        ctx.strokeStyle = '#00f';
        ctx.lineWidth = 0.1;
        ctx.strokeRect(gx - 0.5, gy - 0.5, glyphWidth + 1, glyphHeight + 1);
      }
    }
    const plusIndex = glyphs.length;
    const pcol = plusIndex % glyphCols;
    const prow = Math.floor(plusIndex / glyphCols);
    const px = pcol * glyphWidth;
    const py = prow * glyphHeight;
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 0.1;
    ctx.strokeRect(px, py, glyphWidth, glyphHeight);
    ctx.font = '8px sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText('+', px + glyphWidth / 2 - 2, py + glyphHeight / 2 + 3);
    if (viewScale > editThreshold) {
      const scol = selected % glyphCols;
      const srow = Math.floor(selected / glyphCols);
      const sx = scol * glyphWidth;
      const sy = srow * glyphHeight;
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.02;
      for (let x = 0; x <= glyphWidth; x++) {
        ctx.beginPath();
        ctx.moveTo(sx + x, sy);
        ctx.lineTo(sx + x, sy + glyphHeight);
        ctx.stroke();
      }
      for (let y = 0; y <= glyphHeight; y++) {
        ctx.beginPath();
        ctx.moveTo(sx, sy + y);
        ctx.lineTo(sx + glyphWidth, sy + y);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,0,0,0.3)';
      ctx.beginPath();
      ctx.moveTo(sx, sy + glyphHeight - 4);
      ctx.lineTo(sx + glyphWidth, sy + glyphHeight - 4);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,255,0.3)';
      ctx.beginPath();
      ctx.moveTo(sx, sy + glyphHeight - 2);
      ctx.lineTo(sx + glyphWidth, sy + glyphHeight - 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (e.button === 1) {
      setPanStart({ x, y, ox: viewOffsetX, oy: viewOffsetY });
      return;
    }
    const worldX = (x - viewOffsetX) / viewScale;
    const worldY = (y - viewOffsetY) / viewScale;
    const col = Math.floor(worldX / glyphWidth);
    const row = Math.floor(worldY / glyphHeight);
    const index = row * glyphCols + col;
    if (index < glyphs.length) {
      if (viewScale <= editThreshold) {
        setSelected(index);
      } else {
        const px = Math.floor(worldX - col * glyphWidth);
        const py = Math.floor(worldY - row * glyphHeight);
        if (tool === 'line') {
          setLineStart({ x: px, y: py });
          setIsDrawing(true);
        } else {
          commitHistory();
          if (tool === 'pen') {
            setPixel(index, px, py, true);
          } else {
            setPixel(index, px, py, false);
          }
          setIsDrawing(true);
        }
      }
    } else if (index === glyphs.length) {
      addGlyph();
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (panStart) {
      const dx = x - panStart.x;
      const dy = y - panStart.y;
      setViewOffsetX(panStart.ox + dx);
      setViewOffsetY(panStart.oy + dy);
      return;
    }
    if (!isDrawing) return;
    const worldX = (x - viewOffsetX) / viewScale;
    const worldY = (y - viewOffsetY) / viewScale;
    const col = Math.floor(worldX / glyphWidth);
    const row = Math.floor(worldY / glyphHeight);
    const index = row * glyphCols + col;
    if (index === selected && index < glyphs.length && viewScale > editThreshold) {
      const px = Math.floor(worldX - col * glyphWidth);
      const py = Math.floor(worldY - row * glyphHeight);
      if (tool === 'pen') {
        setPixel(index, px, py, true);
      } else if (tool === 'erase') {
        setPixel(index, px, py, false);
      }
    }
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (panStart) {
      setPanStart(null);
      return;
    }
    if (!isDrawing) return;
    if (tool === 'line' && lineStart) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const worldX = (x - viewOffsetX) / viewScale;
      const worldY = (y - viewOffsetY) / viewScale;
      const col = Math.floor(worldX / glyphWidth);
      const row = Math.floor(worldY / glyphHeight);
      const index = row * glyphCols + col;
      if (index === selected) {
        const px = Math.floor(worldX - col * glyphWidth);
        const py = Math.floor(worldY - row * glyphHeight);
        commitHistory();
        drawLine(index, lineStart.x, lineStart.y, px, py, true);
      }
      setLineStart(null);
    }
    setIsDrawing(false);
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const { clientX, clientY, deltaY } = e;
    const zoomFactor = deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.min(Math.max(viewScale * zoomFactor, 2), 64);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const worldX = (x - viewOffsetX) / viewScale;
    const worldY = (y - viewOffsetY) / viewScale;
    const newOffsetX = x - worldX * newScale;
    const newOffsetY = y - worldY * newScale;
    setViewScale(newScale);
    setViewOffsetX(newOffsetX);
    setViewOffsetY(newOffsetY);
  }

  const icons = {
    pen: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M12.94 2.06a1 1 0 0 1 1.41 0l7.59 7.59a1 1 0 0 1 0 1.41l-11 11a2 2 0 0 1-1 0.52l-5 1a1 1 0 0 1-1.2-1.2l1-5a2 2 0 0 1 0.53-1l11-11z" />
        <line x1="15" y1="5" x2="19" y2="9" />
      </svg>
    ),
    erase: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M21 7l-6-6H8a2 2 0 0 0-2 2v4l6 6-6 6v4a2 2 0 0 0 2 2h7l6-6v-7z" />
      </svg>
    ),
    line: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <line x1="4" y1="20" x2="20" y2="4" />
      </svg>
    ),
    copy: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <rect x="2" y="2" width="13" height="13" rx="2" ry="2" />
      </svg>
    ),
    paste: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M19 21H8a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3" />
        <rect x="13" y="3" width="5" height="5" rx="1" />
        <polyline points="16 7 16 3 21 3 21 21" />
      </svg>
    ),
    undo: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M9 14l-5-5 5-5" />
        <path d="M20 14v3a4 4 0 0 1-4 4H5" />
      </svg>
    ),
    redo: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M15 10l5 5-5 5" />
        <path d="M4 10V7a4 4 0 0 1 4-4h11" />
      </svg>
    ),
    rotate: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1 2.81-9.39" />
      </svg>
    ),
    shiftUp: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <line x1="12" y1="19" x2="12" y2="5" />
        <polyline points="5 12 12 5 19 12" />
      </svg>
    ),
    shiftDown: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <polyline points="5 12 12 19 19 12" />
      </svg>
    ),
    shiftLeft: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 5 5 12 12 19" />
      </svg>
    ),
    shiftRight: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </svg>
    ),
    export: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M12 5v14" />
        <path d="M5 12l7-7 7 7" />
        <path d="M5 20h14" />
      </svg>
    ),
    preview: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      </svg>
    ),
    settings: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 1 .33 1.82 2 2 0 0 1-2.85 2.85 1.65 1.65 0 0 1-1.82-.33 1.65 1.65 0 0 0-1-0.27H12a1.65 1.65 0 0 0-1.52.36 2 2 0 1 1-2.84-2.84 1.65 1.65 0 0 1 .32-1.82A1.65 1.65 0 0 0 8.73 12a1.65 1.65 0 0 0 .36-1.52V9.69a1.65 1.65 0 0 0-.33-1.82 2 2 0 0 1 2.84-2.84 1.65 1.65 0 0 0 1.82.33H12a1.65 1.65 0 0 0 1.52-.36 2 2 0 1 1 2.84 2.84 1.65 1.65 0 0 0-.32 1.82V12a1.65 1.65 0 0 0 .33 1.82z" />
      </svg>
    ),
    home: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-5H10v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
      </svg>
    ),
    zoomIn: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="11" y1="8" x2="11" y2="14" />
        <line x1="8" y1="11" x2="14" y2="11" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
    zoomOut: (
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="8" y1="11" x2="14" y2="11" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  };

  const previewRef = useRef<HTMLCanvasElement>(null);
  const [previewText, setPreviewText] = useState('');

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = 400;
    const height = glyphHeight + 2;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    let xPos = 0;
    previewText.split('').forEach((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      const idx = code - startCode;
      if (idx >= 0 && idx < glyphs.length) {
        const g = glyphs[idx];
        ctx.fillStyle = '#000';
        for (let y = 0; y < glyphHeight; y++) {
          for (let cx = 0; cx < glyphWidth; cx++) {
            if (g[y * glyphWidth + cx]) {
              ctx.fillRect(xPos + cx, y, 1, 1);
            }
          }
        }
      }
      xPos += glyphWidth + 2;
    });
  }, [previewText, glyphs, glyphHeight, glyphWidth, startCode]);

  const [showSettings, setShowSettings] = useState(false);
  const [tmpWidth, setTmpWidth] = useState(glyphWidth.toString());
  const [tmpHeight, setTmpHeight] = useState(glyphHeight.toString());
  const [tmpCols, setTmpCols] = useState(glyphCols.toString());
  const [tmpStartCode, setTmpStartCode] = useState(startCode.toString());

  function openSettings() {
    setTmpWidth(glyphWidth.toString());
    setTmpHeight(glyphHeight.toString());
    setTmpCols(glyphCols.toString());
    setTmpStartCode(startCode.toString());
    setShowSettings(true);
  }

  function applySettings() {
    const newWidth = parseInt(tmpWidth, 10);
    const newHeight = parseInt(tmpHeight, 10);
    const newCols = parseInt(tmpCols, 10);
    const newStart = parseInt(tmpStartCode, 10);
    if (
      isNaN(newWidth) ||
      isNaN(newHeight) ||
      isNaN(newCols) ||
      isNaN(newStart)
    ) {
      setShowSettings(false);
      return;
    }
    commitHistory();
    setGlyphs((gs) => {
      const newGlyphs: Glyph[] = gs.map((g) => {
        const ng = new Array(newWidth * newHeight).fill(false) as Glyph;
        const minW = Math.min(newWidth, glyphWidth);
        const minH = Math.min(newHeight, glyphHeight);
        for (let y = 0; y < minH; y++) {
          for (let x = 0; x < minW; x++) {
            ng[y * newWidth + x] = g[y * glyphWidth + x];
          }
        }
        return ng;
      });
      return newGlyphs;
    });
    setGlyphWidth(newWidth);
    setGlyphHeight(newHeight);
    setGlyphCols(newCols);
    setStartCode(newStart);
    setShowSettings(false);
  }

  function resetView() {
    setViewScale(8);
    setViewOffsetX(0);
    setViewOffsetY(0);
  }

  return (
    <div className="w-screen h-screen flex flex-col">
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair bg-white"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
        />
        <div className="absolute top-4 left-4 flex flex-col space-y-2 bg-white/70 p-2 rounded shadow">
          <button
            onClick={() => {
              setViewScale((v) => Math.min(v * 1.2, 64));
            }}
          >
            {icons.zoomIn}
          </button>
          <button onClick={resetView}>{icons.home}</button>
          <button
            onClick={() => {
              setViewScale((v) => Math.max(v * 0.8, 2));
            }}
          >
            {icons.zoomOut}
          </button>
        </div>
        <div className="absolute bottom-24 right-4 bg-white/80 p-2 rounded shadow text-sm">
          <div>
            Glyph: {String.fromCodePoint(startCode + selected)} (
            {'U+' +
              (startCode + selected)
                .toString(16)
                .toUpperCase()
                .padStart(4, '0')}
            )
          </div>
          <div>Index: {selected}</div>
        </div>
      </div>
      <div className="px-4 py-2 bg-gray-100 flex items-center space-x-4">
        <input
          className="border px-2 py-1 flex-grow"
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          placeholder="Type to preview..."
        />
        <canvas ref={previewRef}></canvas>
      </div>
      <div className="flex items-center justify-between bg-white border-t px-4 py-2">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setTool('pen')}
            className={tool === 'pen' ? 'text-blue-600' : ''}
          >
            {icons.pen}
          </button>
          <button
            onClick={() => setTool('erase')}
            className={tool === 'erase' ? 'text-blue-600' : ''}
          >
            {icons.erase}
          </button>
          <button
            onClick={() => setTool('line')}
            className={tool === 'line' ? 'text-blue-600' : ''}
          >
            {icons.line}
          </button>
          <button onClick={handleCopy}>{icons.copy}</button>
          <button onClick={handlePaste} disabled={!copyBuffer}>
            {icons.paste}
          </button>
          <button
            onClick={() => {
              commitHistory();
              clearSelected();
            }}
          >
            {icons.erase}
          </button>
          <button onClick={() => shiftSelected(0, -1)}>{icons.shiftUp}</button>
          <button onClick={() => shiftSelected(0, 1)}>{icons.shiftDown}</button>
          <button onClick={() => shiftSelected(-1, 0)}>{icons.shiftLeft}</button>
          <button onClick={() => shiftSelected(1, 0)}>{icons.shiftRight}</button>
          <button onClick={rotateSelected}>{icons.rotate}</button>
          <button onClick={undo} disabled={history.length === 0}>
            {icons.undo}
          </button>
          <button onClick={redo} disabled={redoStack.length === 0}>
            {icons.redo}
          </button>
          <button
            onClick={() => {
              const bdf = exportBDF();
              const blob = new Blob([bdf], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'font.bdf';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {icons.export}
          </button>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={openSettings}>{icons.settings}</button>
        </div>
      </div>
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-4 rounded shadow space-y-2">
            <div className="flex space-x-2">
              <label className="flex flex-col text-xs">
                Width
                <input
                  className="border px-1"
                  value={tmpWidth}
                  onChange={(e) => setTmpWidth(e.target.value)}
                />
              </label>
              <label className="flex flex-col text-xs">
                Height
                <input
                  className="border px-1"
                  value={tmpHeight}
                  onChange={(e) => setTmpHeight(e.target.value)}
                />
              </label>
              <label className="flex flex-col text-xs">
                Columns
                <input
                  className="border px-1"
                  value={tmpCols}
                  onChange={(e) => setTmpCols(e.target.value)}
                />
              </label>
              <label className="flex flex-col text-xs">
                Start code
                <input
                  className="border px-1"
                  value={tmpStartCode}
                  onChange={(e) => setTmpStartCode(e.target.value)}
                />
              </label>
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setShowSettings(false)}
                className="px-2 py-1 border"
              >
                Cancel
              </button>
              <button
                onClick={applySettings}
                className="px-2 py-1 border bg-blue-500 text-white"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;