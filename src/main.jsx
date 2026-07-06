import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { removeBackground } from '@imgly/background-removal';
import {
  Download,
  Brush,
  Eraser,
  FileImage,
  ImagePlus,
  Lightbulb,
  Printer,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react';
import './styles.css';

const PHOTO_PRESETS = {
  india: { label: 'India 35 x 45 mm', widthMm: 35, heightMm: 45 },
  twoByTwo: { label: 'US 2 x 2 in', widthMm: 50.8, heightMm: 50.8 },
  visa: { label: 'Visa 40 x 50 mm', widthMm: 40, heightMm: 50 },
};

const DPI = 600;
const MM_TO_IN = 1 / 25.4;
const A4 = {
  width: Math.round(210 * MM_TO_IN * DPI),
  height: Math.round(297 * MM_TO_IN * DPI),
};
const COPIES_PER_ROW = 6;
const QUANTITY_OPTIONS = [1, 2, 4, 6, 8, 10, 12, 18, 24, 30, 36, 42, 48];

function mmToPx(mm) {
  return Math.round(mm * MM_TO_IN * DPI);
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mime });
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function createMaskedPhoto(sourceImage, maskImage) {
  if (!sourceImage) return null;

  const width = sourceImage.naturalWidth || sourceImage.width;
  const height = sourceImage.naturalHeight || sourceImage.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceImage, 0, 0, width, height);

  if (maskImage) {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;

    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    maskCtx.clearRect(0, 0, width, height);
    maskCtx.drawImage(maskImage, 0, 0, width, height);

    const maskData = maskCtx.getImageData(0, 0, width, height);
    const maskPixels = maskData.data;

    for (let index = 3; index < maskPixels.length; index += 4) {
      const alpha = maskPixels[index];
      if (alpha < 45) {
        maskPixels[index] = 0;
      } else if (alpha < 220) {
        maskPixels[index] = Math.min(255, alpha + 20);
      } else {
        maskPixels[index] = 255;
      }
    }

    maskCtx.putImageData(maskData, 0, 0);

    const featheredMask = document.createElement('canvas');
    featheredMask.width = width;
    featheredMask.height = height;
    const featheredCtx = featheredMask.getContext('2d');
    featheredCtx.clearRect(0, 0, width, height);
    featheredCtx.filter = 'blur(1.1px)';
    featheredCtx.drawImage(maskCanvas, 0, 0, width, height);
    featheredCtx.filter = 'none';

    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(featheredMask, 0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }

  return canvas;
}

function drawCover(ctx, image, x, y, width, height) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let sourceWidth = image.width;
  let sourceHeight = image.height;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.height * targetRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / targetRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }

  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function sharpenCanvas(ctx, width, height, amount = 0.18) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const source = imageData.data;
  const output = new Uint8ClampedArray(source);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const top = index - width * 4;
      const bottom = index + width * 4;
      const left = index - 4;
      const right = index + 4;

      for (let channel = 0; channel < 3; channel += 1) {
        const sharpened =
          source[index + channel] * (1 + amount * 4) -
          amount *
            (source[top + channel] + source[bottom + channel] + source[left + channel] + source[right + channel]);
        output[index + channel] = Math.max(0, Math.min(255, sharpened));
      }
    }
  }

  ctx.putImageData(new ImageData(output, width, height), 0, 0);
}

function buildPassportCanvas(image, preset, options) {
  const width = mmToPx(preset.widthMm);
  const height = mmToPx(preset.heightMm);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = options.background;
  ctx.fillRect(0, 0, width, height);

  const padding = Math.round(width * 0.025);
  ctx.save();
  ctx.filter = `brightness(${options.brightness}%) contrast(${options.contrast}%) saturate(${options.saturation}%)`;
  drawCover(ctx, image, padding, padding, width - padding * 2, height - padding * 2);
  ctx.restore();

  if (options.smoothing > 0) {
    ctx.save();
    ctx.globalAlpha = options.smoothing / 100;
    ctx.filter = 'blur(1.6px)';
    drawCover(ctx, image, padding, padding, width - padding * 2, height - padding * 2);
    ctx.restore();
  }

  if (options.sharpen) {
    sharpenCanvas(ctx, width, height);
  }

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.16)';
  ctx.lineWidth = Math.max(2, Math.round(width * 0.004));
  ctx.strokeRect(1, 1, width - 2, height - 2);

  return canvas;
}

function normalizeQuantity(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return 1;
  return Math.min(120, Math.max(1, parsed));
}

function buildA4Canvas(photoCanvas, quantity) {
  const canvas = document.createElement('canvas');
  canvas.width = A4.width;
  canvas.height = A4.height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gap = mmToPx(3); // minimal cutting space
  const copies = normalizeQuantity(quantity);
  const cols = COPIES_PER_ROW;
  const rows = Math.ceil(copies / cols);

  const maxBlockWidth = canvas.width - mmToPx(20); // keep side margins
  const rawBlockWidth = photoCanvas.width * cols + gap * (cols - 1);
  const maxBlockHeight = canvas.height - mmToPx(18); // slim print margins only
  const rawBlockHeight = photoCanvas.height * rows + gap * (rows - 1);

  // Scale down (never upscale) to keep exactly 6 columns per row and all requested rows on A4.
  const scale = Math.min(1, maxBlockWidth / rawBlockWidth, maxBlockHeight / rawBlockHeight);

  const photoW = Math.round(photoCanvas.width * scale);
  const photoH = Math.round(photoCanvas.height * scale);
  const scaledGap = Math.round(gap * scale);

  const blockWidth = photoW * cols + scaledGap * (cols - 1);
  const startX = Math.round((canvas.width - blockWidth) / 2);
  const startY = mmToPx(8);

  for (let index = 0; index < copies; index += 1) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const x = startX + col * (photoW + scaledGap);
    const y = startY + row * (photoH + scaledGap);
    ctx.drawImage(photoCanvas, x, y, photoW, photoH);
  }

  return canvas;
}


function App() {
  const [sourcePreview, setSourcePreview] = useState('');
  const [processedImage, setProcessedImage] = useState(null);
  const [status, setStatus] = useState('Upload a portrait to begin.');
  const [isWorking, setIsWorking] = useState(false);
  const [presetKey, setPresetKey] = useState('india');
  const [quantity, setQuantity] = useState('6');
  const [editMode, setEditMode] = useState('erase');
  const [brushSize, setBrushSize] = useState(28);
  const [editedPassportDataUrl, setEditedPassportDataUrl] = useState('');
  const [editedPassportImage, setEditedPassportImage] = useState(null);
  const [originalPassportImage, setOriginalPassportImage] = useState(null);
  const [options, setOptions] = useState({
    background: '#ffffff',
    brightness: 100,
    contrast: 100,
    saturation: 100,
    smoothing: 0,
    sharpen: true,
  });
  const fileInput = useRef(null);
  const editorCanvas = useRef(null);
  const isPainting = useRef(false);
  const lastPaintPoint = useRef(null);

  const selectedPreset = PHOTO_PRESETS[presetKey];
  const selectedQuantity = normalizeQuantity(quantity);

  const passportDataUrl = useMemo(() => {
    if (!processedImage) return '';
    return buildPassportCanvas(processedImage, selectedPreset, options).toDataURL('image/png');
  }, [processedImage, selectedPreset, options]);

  useEffect(() => {
    setEditedPassportDataUrl(passportDataUrl);

    if (!passportDataUrl) {
      setOriginalPassportImage(null);
      return;
    }

    let isCurrent = true;
    dataUrlToImage(passportDataUrl)
      .then((image) => {
        if (isCurrent) setOriginalPassportImage(image);
      })
      .catch((error) => {
        console.error(error);
        setStatus('Could not load the restore brush source.');
      });

    return () => {
      isCurrent = false;
    };
  }, [passportDataUrl]);

  useEffect(() => {
    let isCurrent = true;

    async function loadEditedImage() {
      if (!editedPassportDataUrl) {
        setEditedPassportImage(null);
        return;
      }

      const image = await dataUrlToImage(editedPassportDataUrl);
      if (!isCurrent) return;

      setEditedPassportImage(image);
      const canvas = editorCanvas.current;
      if (!canvas) return;

      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
    }

    loadEditedImage().catch((error) => {
      console.error(error);
      setStatus('Could not load the editable output preview.');
    });

    return () => {
      isCurrent = false;
    };
  }, [editedPassportDataUrl]);

  const sheetDataUrl = useMemo(() => {
    if (!editedPassportImage) return '';
    return buildA4Canvas(editedPassportImage, selectedQuantity).toDataURL('image/png');
  }, [editedPassportImage, selectedQuantity]);

  async function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus('Please upload a JPG, PNG, or WebP image.');
      return;
    }

    setIsWorking(true);
    setStatus('Reading portrait...');
    setSourcePreview(URL.createObjectURL(file));

    try {
      const originalImage = await fileToImage(file);
      setStatus('Removing background with the in-browser AI model...');
      const cutout = await removeBackground(file, {
        // imgly resolves model/assets relative to this URL; BASE_URL can be empty/misconfigured.
        publicPath: new URL('background-removal/', window.location.href).toString(),
        model: 'medium',
        proxyToWorker: false,
        output: { format: 'image/png', quality: 1 },
        progress: (phase, current, total) => {
          if (phase.startsWith('fetch:')) {
            const percent = total ? Math.round((current / total) * 100) : 0;
            setStatus(`Loading local AI model assets... ${percent}%`);
          } else if (phase.startsWith('compute:')) {
            setStatus('Removing background and cleaning portrait...');
          }
        },
      });
      setStatus('Using the original photo with the AI mask to preserve detail...');
      const maskImage = await blobToImage(cutout);
      const maskedPhoto = createMaskedPhoto(originalImage, maskImage);
      setProcessedImage(maskedPhoto);
      setStatus('Ready. Download or print the A4 sheet.');
    } catch (error) {
      console.error(error);
      const detail = error instanceof Error ? error.message : 'Unknown processing error';
      setStatus(`Could not process this image: ${detail}`);
    } finally {
      setIsWorking(false);
    }
  }

  function downloadSheet() {
    if (!sheetDataUrl) return;
    downloadDataUrl(sheetDataUrl, `passport-photo-a4-${selectedQuantity}-copies.png`);
  }

  function printSheet() {
    if (!sheetDataUrl) return;

    const sheetUrl = URL.createObjectURL(dataUrlToBlob(sheetDataUrl));

    // Print at source pixel size (no CSS scaling) to avoid resampling noise/blur.
    // Browsers often resample when an image is scaled via CSS to physical units.
    const html = `<!doctype html>

      <html>
        <head>
          <title>Print passport photo sheet</title>
          <style>
            @page { size: A4; margin: 0; }
            html, body {
              width: 210mm;
              height: 297mm;
              margin: 0;
              background: #ffffff;
            }
            /* Disable interpolation/resampling blur */
            img {
              display: block;
              image-rendering: pixelated;
              image-rendering: -moz-crisp-edges;
              image-rendering: crisp-edges;
            }
          </style>
        </head>
        <body>
          <img id="sheet" src="${sheetUrl}" alt="Passport photo A4 sheet" />
          <script>
            (function () {
              const image = document.getElementById('sheet');
              function tryPrint() {
                try { window.focus(); } catch (e) {}
                window.print();
              }
              image.addEventListener('load', function () {
                // Compute a 1:1 CSS pixel-to-printer-pt mapping as much as possible.
                // We keep the image's intrinsic pixel size and only scale the whole page.
                // This avoids per-image resampling artifacts.
                const pxToMm = 25.4 / 96; // typical CSS px per inch assumption
                const targetWidthMm = 210;
                const targetHeightMm = 297;

                // Use CSS transform on a container rather than changing img width/height.
                const wMm = (image.naturalWidth * pxToMm);
                const hMm = (image.naturalHeight * pxToMm);
                const scale = Math.min(targetWidthMm / wMm, targetHeightMm / hMm);

                image.style.transformOrigin = 'top left';
                image.style.transform = 'scale(' + scale + ')';

                tryPrint();
              }, { once: true });

              // Fallback: print even if load doesn't fire in some production cases.
              setTimeout(tryPrint, 2000);
              window.addEventListener('afterprint', function () {
                try { window.close(); } catch (e) {}
              });
            })();
          </script>
        </body>
      </html>`;


    let revoked = false;
    const revoke = () => {
      if (revoked) return;
      revoked = true;
      URL.revokeObjectURL(sheetUrl);
    };

    // 1) Try popup printing (best UX)
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      try {
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
      } catch (e) {
        setStatus('Could not render print window. Trying fallback...');
      }
      setTimeout(revoke, 60000);
      return;
    }

    // 2) Fallback: iframe-based printing (works when popups are blocked)
    try {
      setStatus('Popups blocked. Using print fallback...');

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);

      const cleanup = () => {
        try { document.body.removeChild(iframe); } catch (e) {}
        revoke();
      };

      const iframeDoc = iframe.contentWindow?.document;
      if (!iframeDoc) {
        cleanup();
        setStatus('Print failed: could not access print document.');
        return;
      }

      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      setTimeout(cleanup, 60000);
    } catch (e) {
      revoke();
      setStatus('Please allow popups to print the A4 sheet.');
    }
  }


  function getCanvasPoint(event) {
    const canvas = editorCanvas.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const clientX = event.clientX ?? event.touches?.[0]?.clientX;
    const clientY = event.clientY ?? event.touches?.[0]?.clientY;

    if (clientX === undefined || clientY === undefined) return null;

    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function paintOutput(event) {
    if (!isPainting.current) return;

    const canvas = editorCanvas.current;
    const point = getCanvasPoint(event);
    if (!canvas || !point) return;

    const ctx = canvas.getContext('2d');
    const radius = Math.max(6, brushSize);
    const previous = lastPaintPoint.current || point;

    ctx.save();
    if (editMode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = radius * 2;
      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    } else if (originalPassportImage) {
      ctx.globalCompositeOperation = 'source-over';
      const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
      const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 2)));

      for (let step = 0; step <= steps; step += 1) {
        const progress = step / steps;
        const x = previous.x + (point.x - previous.x) * progress;
        const y = previous.y + (point.y - previous.y) * progress;

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(originalPassportImage, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
    }

    ctx.restore();
    lastPaintPoint.current = point;
  }

  function startPainting(event) {
    if (!editedPassportDataUrl) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    isPainting.current = true;
    lastPaintPoint.current = getCanvasPoint(event);
    paintOutput(event);
  }

  function finishPainting() {
    if (!isPainting.current) return;
    isPainting.current = false;
    lastPaintPoint.current = null;
    const canvas = editorCanvas.current;
    if (!canvas) return;
    setEditedPassportDataUrl(canvas.toDataURL('image/png'));
  }

  function resetManualEdits() {
    setEditedPassportDataUrl(passportDataUrl);
    setStatus('Manual edits reset to the AI output.');
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="panel controls-panel">
          <div className="brand">
            <div className="brand-mark">
              <FileImage size={22} />
            </div>
            <div>
              <h1>Passport Photo Studio</h1>
              <p>Background removal, light cleanup, crop, and print sheet export.</p>
            </div>
          </div>

          <button className="upload-zone" onClick={() => fileInput.current?.click()} disabled={isWorking}>
            <Upload size={26} />
            <span>Upload user photo</span>
            <small>JPG, PNG, or WebP portrait</small>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={(event) => handleFile(event.target.files?.[0])}
            hidden
          />

          <div className="status-row" aria-live="polite">
            {isWorking ? <RefreshCw className="spin" size={17} /> : <Sparkles size={17} />}
            <span>{status}</span>
          </div>

          <div className="control-group">
            <label htmlFor="preset">Photo size</label>
            <select id="preset" value={presetKey} onChange={(event) => setPresetKey(event.target.value)}>
              {Object.entries(PHOTO_PRESETS).map(([key, preset]) => (
                <option value={key} key={key}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="quantity">Copies needed</label>
            <input
              id="quantity"
              type="number"
              list="quantity-options"
              min="1"
              max="120"
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value.replace(/\D/g, '').slice(0, 3))}
              onBlur={() => setQuantity(String(selectedQuantity))}
            />
            <datalist id="quantity-options">
              {QUANTITY_OPTIONS.map((option) => (
                <option value={option} key={option} />
              ))}
            </datalist>
          </div>

          <div className="control-grid">
            <label>
              <span>Background</span>
              <input
                type="color"
                value={options.background}
                onChange={(event) => setOptions({ ...options, background: event.target.value })}
              />
            </label>
            <label>
              <span>Brightness</span>
              <input
                type="range"
                min="90"
                max="125"
                value={options.brightness}
                onChange={(event) => setOptions({ ...options, brightness: Number(event.target.value) })}
              />
            </label>
            <label>
              <span>Contrast</span>
              <input
                type="range"
                min="90"
                max="125"
                value={options.contrast}
                onChange={(event) => setOptions({ ...options, contrast: Number(event.target.value) })}
              />
            </label>
            <label>
              <span>Saturation</span>
              <input
                type="range"
                min="85"
                max="120"
                value={options.saturation}
                onChange={(event) => setOptions({ ...options, saturation: Number(event.target.value) })}
              />
            </label>
            <label>
              <span>Face cleanup</span>
              <input
                type="range"
                min="0"
                max="35"
                value={options.smoothing}
                onChange={(event) => setOptions({ ...options, smoothing: Number(event.target.value) })}
              />
            </label>
          </div>

          <label className="check-row">
            <input
              type="checkbox"
              checked={options.sharpen}
              onChange={(event) => setOptions({ ...options, sharpen: event.target.checked })}
            />
            <span>Keep final image crisp</span>
          </label>

          <div className="actions">
            <button onClick={downloadSheet} disabled={!sheetDataUrl}>
              <Download size={18} />
              Download sheet
            </button>
            <button onClick={printSheet} disabled={!sheetDataUrl}>
              <Printer size={18} />
              Print sheet
            </button>
          </div>
        </aside>

        <section className="preview-area">
          <div className="preview-grid">
            <div className="preview-frame source-frame">
              <div className="frame-title">
                <ImagePlus size={17} />
                Original
              </div>
              {sourcePreview ? <img src={sourcePreview} alt="Original uploaded portrait" /> : <EmptyState label="No image uploaded" />}
            </div>

            <div className="preview-frame passport-frame">
              <div className="frame-title">
                <Eraser size={17} />
                Passport output
              </div>
              {editedPassportDataUrl ? (
                <div className="editor-panel">
                  <div className="edit-toolbar">
                    <div className="tool-buttons" aria-label="Manual edit tools">
                      <button
                        type="button"
                        className={editMode === 'erase' ? 'active' : ''}
                        onClick={() => setEditMode('erase')}
                        title="Erase unwanted area"
                      >
                        <Eraser size={17} />
                        Erase
                      </button>
                      <button
                        type="button"
                        className={editMode === 'restore' ? 'active' : ''}
                        onClick={() => setEditMode('restore')}
                        title="Restore original AI output"
                      >
                        <Brush size={17} />
                        Restore
                      </button>
                    </div>
                    <label className="brush-control">
                      <span>Size</span>
                      <input
                        type="range"
                        min="8"
                        max="90"
                        value={brushSize}
                        onChange={(event) => setBrushSize(Number(event.target.value))}
                      />
                    </label>
                    <button type="button" className="reset-edits" onClick={resetManualEdits} title="Reset manual edits">
                      <RotateCcw size={17} />
                    </button>
                  </div>
                  <div className="editor-surface">
                    <canvas
                      ref={editorCanvas}
                      className="editor-canvas"
                      aria-label="Editable passport output"
                      onPointerDown={startPainting}
                      onPointerMove={paintOutput}
                      onPointerUp={finishPainting}
                      onPointerCancel={finishPainting}
                      onPointerLeave={finishPainting}
                    />
                  </div>
                </div>
              ) : (
                <EmptyState label="Processed photo appears here" />
              )}
            </div>
          </div>

          <div className="sheet-preview">
            <div className="frame-title">
              <Lightbulb size={17} />
              A4 sheet with {selectedQuantity} copies
            </div>
            {sheetDataUrl ? <img src={sheetDataUrl} alt="A4 sheet with six passport photos" /> : <EmptyState label="A4 printable sheet appears here" />}
          </div>
        </section>
      </section>
    </main>
  );
}

function EmptyState({ label }) {
  return (
    <div className="empty-state">
      <FileImage size={34} />
      <span>{label}</span>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
