/* ViewMain.jsx – Fix: Hỗ trợ cảm ứng mobile + Thanh trượt điều chỉnh thước */
import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, RotateCcw, Ruler } from 'lucide-react';
import './ViewMain.css';

export default function ViewMain({ user, onLogout }) {
    const [image, setImage] = useState(null);
    const [rawImageData, setRawImageData] = useState(null);
    const [step, setStep] = useState('upload');
    const [polygonPoints, setPolygonPoints] = useState([]);
    const [pixelsPerCm, setPixelsPerCm] = useState(null);
    const [area, setArea] = useState(null);
    const [loading, setLoading] = useState(false);
    const [cvReady, setCvReady] = useState(false);

    const [rulerPos, setRulerPos] = useState({ x: 100, y: 100 });
    const [rulerLength, setRulerLength] = useState(300);
    const [rulerAngle, setRulerAngle] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const canvasRef = useRef(null);
    const uploadRef = useRef(null);
    const cameraRef = useRef(null);

    useEffect(() => {
        const loadOpenCV = () => {
            if (window.cv && window.cv.Mat) {
                setCvReady(true);
                console.log('✅ OpenCV ready');
            } else {
                setTimeout(loadOpenCV, 100);
            }
        };
        if (!document.getElementById('opencv-script')) {
            const script = document.createElement('script');
            script.id = 'opencv-script';
            script.src = 'https://docs.opencv.org/4.5.2/opencv.js';
            script.async = true;
            script.onload = () => loadOpenCV();
            document.body.appendChild(script);
        } else {
            loadOpenCV();
        }
    }, []);

    const handleImageUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                setImage(img);
                const off = document.createElement('canvas');
                off.width = img.width;
                off.height = img.height;
                const octx = off.getContext('2d');
                octx.drawImage(img, 0, 0);
                setRawImageData(octx.getImageData(0, 0, img.width, img.height));
                setStep('calibrate');
                setPolygonPoints([]);
                setArea(null);
                setPixelsPerCm(null);
                setRulerPos({ x: img.width * 0.75, y: img.height * 0.2 });
                setRulerLength(img.height * 0.6);
                setRulerAngle(90);
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const drawCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!image) return;
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);

        if (step === 'calibrate') {
            drawVirtualRuler(ctx);
        }

        if (polygonPoints.length) {
            ctx.strokeStyle = '#00ff00';
            ctx.fillStyle = 'rgba(0,255,0,0.25)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            polygonPoints.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
            ctx.closePath();
            ctx.stroke();
            ctx.fill();
            polygonPoints.forEach(p => {
                ctx.fillStyle = '#ff0000';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    };

    const drawVirtualRuler = (ctx) => {
        ctx.save();
        ctx.translate(rulerPos.x, rulerPos.y);
        ctx.rotate((rulerAngle * Math.PI) / 180);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(-12, 0, 24, rulerLength);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.strokeRect(-12, 0, 24, rulerLength);

        const cmCount = 30;
        const pxPerCm = rulerLength / cmCount;
        for (let i = 0; i <= cmCount; i++) {
            const y = i * pxPerCm;
            const isMajor = i % 5 === 0;
            ctx.strokeStyle = isMajor ? '#ff0000' : '#666';
            ctx.lineWidth = isMajor ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(isMajor ? -12 : -6, y);
            ctx.lineTo(isMajor ? 12 : 6, y);
            ctx.stroke();
            if (isMajor && i > 0) {
                ctx.fillStyle = '#000';
                ctx.font = 'bold 11px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(i.toString(), 0, y - 4);
            }
        }
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    };

    useEffect(() => {
        if (image) drawCanvas();
    }, [image, polygonPoints, step, rulerPos, rulerLength, rulerAngle]);

    // ==================== MOUSE EVENTS (Desktop) ====================
    const handleMouseDown = (e) => {
        if (step !== 'calibrate') return;
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        startDrag(x, y);
    };

    const handleMouseMove = (e) => {
        if (!isDragging || step !== 'calibrate') return;
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        doDrag(x, y);
    };

    const handleMouseUp = () => setIsDragging(false);

    // ==================== TOUCH EVENTS (Mobile) ====================
    const handleTouchStart = (e) => {
        if (step !== 'calibrate') return;
        e.preventDefault(); // Ngăn cuộn trang
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (touch.clientX - rect.left) * scaleX;
        const y = (touch.clientY - rect.top) * scaleY;
        startDrag(x, y);
    };

    const handleTouchMove = (e) => {
        if (!isDragging || step !== 'calibrate') return;
        e.preventDefault(); // Ngăn cuộn trang
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (touch.clientX - rect.left) * scaleX;
        const y = (touch.clientY - rect.top) * scaleY;
        doDrag(x, y);
    };

    const handleTouchEnd = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    // ==================== DRAG LOGIC ====================
    const startDrag = (x, y) => {
        const rad = (-rulerAngle * Math.PI) / 180;
        const dx = x - rulerPos.x;
        const dy = y - rulerPos.y;
        const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
        const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

        if (Math.abs(localX) < 20 && localY >= -10 && localY <= rulerLength + 10) {
            setIsDragging(true);
            setDragStart({ x: dx, y: dy });
        }
    };

    const doDrag = (x, y) => {
        setRulerPos({ x: x - dragStart.x, y: y - dragStart.y });
    };

    const rotateRuler = (delta) => setRulerAngle(prev => (prev + delta + 360) % 360);

    const confirmCalibration = () => {
        const calculatedPixelsPerCm = rulerLength / 30;
        setPixelsPerCm(calculatedPixelsPerCm);
        setStep('scan');
        alert(`✅ Đã hiệu chuẩn: ${calculatedPixelsPerCm.toFixed(2)} px/cm`);
    };

    /* QUÉT RẬP */
    const scanAndCalc = async () => {
        if (!rawImageData || !cvReady || !pixelsPerCm) {
            alert('⚠️ Chưa hiệu chuẩn hoặc OpenCV chưa sẵn sàng');
            return;
        }
        setLoading(true);
        try {
            const cv = window.cv;
            const src = cv.matFromImageData(rawImageData);
            const hsv = new cv.Mat();
            cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
            cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

            const lowerGray = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 100, 0]);
            const upperGray = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 50, 255, 255]);
            const mask = new cv.Mat();
            cv.inRange(hsv, lowerGray, upperGray, mask);

            const kernelOpen = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
            const cleaned = new cv.Mat();
            cv.morphologyEx(mask, cleaned, cv.MORPH_OPEN, kernelOpen, new cv.Point(-1, -1), 1);

            const kernelClose = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
            const filled = new cv.Mat();
            cv.morphologyEx(cleaned, filled, cv.MORPH_CLOSE, kernelClose, new cv.Point(-1, -1), 1);

            const contours = new cv.MatVector();
            const hierarchy = new cv.Mat();
            cv.findContours(filled, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            let bestCnt = null;
            let maxScore = 0;
            const imgArea = src.cols * src.rows;
            const imgW = src.cols;
            const imgH = src.rows;

            for (let i = 0; i < contours.size(); ++i) {
                const cnt = contours.get(i);
                const area = cv.contourArea(cnt);
                const pct = (area / imgArea) * 100;
                if (pct < 5 || pct > 90) continue;

                const rect = cv.boundingRect(cnt);
                const peri = cv.arcLength(cnt, true);
                const aspectRatio = Math.max(rect.width, rect.height) / Math.min(rect.width, rect.height);

                const touchesBorder = (
                    rect.x <= 10 || rect.y <= 10 ||
                    rect.x + rect.width >= imgW - 10 ||
                    rect.y + rect.height >= imgH - 10
                );

                if (touchesBorder) continue;
                if (aspectRatio > 6) continue;

                const compactness = (4 * Math.PI * area) / (peri * peri);
                const score = area * compactness;

                if (score > maxScore) {
                    maxScore = score;
                    bestCnt = cnt;
                }
            }

            if (!bestCnt) throw new Error('Không tìm thấy rập!');

            const peri = cv.arcLength(bestCnt, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(bestCnt, approx, 0.002 * peri, true);

            const pts = [];
            for (let i = 0; i < approx.rows; ++i) {
                pts.push({ x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1] });
            }

            if (pts.length < 4) {
                const hull = new cv.Mat();
                cv.convexHull(bestCnt, hull, false, true);
                pts.length = 0;
                for (let i = 0; i < hull.data32S.length; i += 2) {
                    pts.push({ x: hull.data32S[i], y: hull.data32S[i + 1] });
                }
                hull.delete();
            }

            setPolygonPoints(pts);

            let s = 0;
            for (let i = 0; i < pts.length; i++) {
                const j = (i + 1) % pts.length;
                s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
            }
            const areaPx = Math.abs(s) / 2;
            const areaCm2 = areaPx / (pixelsPerCm * pixelsPerCm);
            setArea(areaCm2);
            setStep('result');

            src.delete(); hsv.delete(); lowerGray.delete(); upperGray.delete(); mask.delete();
            kernelOpen.delete(); cleaned.delete(); kernelClose.delete(); filled.delete();
            contours.delete(); hierarchy.delete(); approx.delete();

        } catch (e) {
            alert(`⚠️ ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setImage(null); setRawImageData(null); setStep('upload');
        setPolygonPoints([]); setArea(null); setPixelsPerCm(null);
    };

    return (
        <div className="vm-wrap">
            <header className="vm-header">
                <h1>🎯 Tính Diện Tích Rập</h1>
                <p>Xin chào, <strong>{user?.name || 'User'}</strong></p>
                <button className="btn-logout" onClick={onLogout}>Đăng xuất</button>
            </header>

            <main className="vm-main">
                {!cvReady && <div className="cv-loading">⏳ Đang tải OpenCV...</div>}

                {step === 'upload' && (
                    <div className="upload-area">
                        <input ref={uploadRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />
                        <button disabled={!cvReady} onClick={() => uploadRef.current?.click()}><Upload /> Tải ảnh</button>
                        <button disabled={!cvReady} onClick={() => cameraRef.current?.click()}><Camera /> Chụp ảnh</button>
                    </div>
                )}

                {step === 'calibrate' && image && (
                    <>
                        <div className="guide-box">
                            📏 <strong>Bước 1: Hiệu chuẩn</strong><br />
                            <small>• Kéo thả hoặc dùng thanh trượt • 30 vạch = 30cm</small>
                        </div>

                        <div className="canvas-box">
                            <canvas
                                ref={canvasRef}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
                                onTouchStart={handleTouchStart}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                            />
                        </div>

                        {/* THANH TRƯỢT + ĐIỀU CHỈNH */}
                        <div className="controls-panel">
                            <div className="slider-group">
                                <label>Chiều dài thước:</label>
                                <input
                                    type="range"
                                    min="100"
                                    max={image?.height || 800}
                                    value={rulerLength}
                                    onChange={(e) => setRulerLength(Number(e.target.value))}
                                    className="ruler-slider"
                                />
                                <div className="ruler-info">
                                    <span>{Math.round(rulerLength)}px</span>
                                    <span className="px-cm">{(rulerLength / 30).toFixed(1)} px/cm</span>
                                </div>
                            </div>

                            <div className="angle-controls">
                                <label>Xoay thước:</label>
                                <div className="angle-buttons">
                                    <button onClick={() => rotateRuler(-5)}>↺ -5°</button>
                                    <span className="angle-value">{rulerAngle}°</span>
                                    <button onClick={() => rotateRuler(5)}>↻ +5°</button>
                                    <button onClick={() => setRulerAngle(90)}>90°</button>
                                    <button onClick={() => setRulerAngle(0)}>0°</button>
                                </div>
                            </div>
                        </div>

                        <div className="actions">
                            <button onClick={reset}><RotateCcw /> Làm lại</button>
                            <button className="calc" onClick={confirmCalibration}>
                                ✓ Xác nhận ({(rulerLength / 30).toFixed(1)} px/cm)
                            </button>
                        </div>
                    </>
                )}

                {(step === 'scan' || step === 'result') && image && (
                    <>
                        <div className="guide-box">
                            {step === 'scan' ? '🔍 Bước 2: Quét rập' : '✅ Kết quả'}<br />
                            <small>Tỷ lệ: <strong>{pixelsPerCm?.toFixed(2)} px/cm</strong></small>
                        </div>

                        <div className="canvas-box">
                            <canvas ref={canvasRef} />
                            {loading && <div className="overlay"><div className="spinner"></div>🔍 Đang quét...</div>}
                        </div>

                        {step === 'scan' && (
                            <div className="actions">
                                <button onClick={reset}><RotateCcw /> Làm lại</button>
                                <button onClick={() => setStep('calibrate')}>← Hiệu chuẩn lại</button>
                                <button className="calc" disabled={loading} onClick={scanAndCalc}><Ruler /> Quét & Tính</button>
                            </div>
                        )}

                        {step === 'result' && area !== null && (
                            <>
                                <div className="result-box">
                                    <h3>Kết quả</h3>
                                    <div className="result-grid">
                                        <div className="result-item"><span>Diện tích</span><strong>{area.toFixed(2)} cm²</strong></div>
                                        <div className="result-item"><span>m²</span><strong>{(area / 10000).toFixed(4)}</strong></div>
                                        <div className="result-item"><span>px/cm</span><strong>{pixelsPerCm?.toFixed(2)}</strong></div>
                                        <div className="result-item"><span>Đỉnh</span><strong>{polygonPoints.length}</strong></div>
                                    </div>
                                </div>
                                <div className="actions">
                                    <button onClick={reset}><RotateCcw /> Đo rập khác</button>
                                    <button onClick={() => { setStep('scan'); setPolygonPoints([]); setArea(null); }}>← Quét lại</button>
                                </div>
                            </>
                        )}
                    </>
                )}
            </main>

            <style jsx>{`
                .vm-wrap { max-width: 1200px; margin: 0 auto; padding: 20px; font-family: system-ui, sans-serif; }
                .vm-header { display: flex; justify-content: space-between; align-items: center; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }
                .btn-logout { padding: 8px 16px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; border-radius: 6px; cursor: pointer; }
                .cv-loading { text-align: center; padding: 40px; background: #f8f9fa; border-radius: 12px; margin-bottom: 20px; color: #666; }
                .upload-area { display: flex; gap: 20px; justify-content: center; padding: 60px 20px; background: #f8f9fa; border: 3px dashed #ddd; border-radius: 12px; flex-wrap: wrap; }
                .upload-area button { display: flex; align-items: center; gap: 8px; padding: 16px 32px; font-size: 16px; border: none; border-radius: 8px; background: #667eea; color: white; cursor: pointer; }
                .upload-area button:disabled { opacity: 0.5; cursor: not-allowed; }
                .hidden { display: none; }
                .guide-box { background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin-bottom: 15px; border-radius: 8px; line-height: 1.6; }
                .canvas-box { position: relative; display: flex; justify-content: center; background: #2d2d2d; border-radius: 12px; overflow: hidden; margin-bottom: 15px; min-height: 300px; touch-action: none; /* Quan trọng cho mobile */ }
                .canvas-box canvas { max-width: 100%; height: auto; display: block; }
                .overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; gap: 10px; }
                .spinner { width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }
                
                /* CONTROLS PANEL */
                .controls-panel { background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 20px; }
                .slider-group { display: flex; flex-direction: column; gap: 10px; }
                .slider-group label { font-weight: 600; color: #333; font-size: 14px; }
                .ruler-slider { width: 100%; height: 8px; border-radius: 4px; background: #ddd; outline: none; -webkit-appearance: none; }
                .ruler-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 28px; height: 28px; border-radius: 50%; background: #667eea; cursor: pointer; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
                .ruler-slider::-moz-range-thumb { width: 28px; height: 28px; border-radius: 50%; background: #667eea; cursor: pointer; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
                .ruler-info { display: flex; gap: 15px; align-items: center; }
                .ruler-info span { font-family: monospace; background: white; padding: 6px 12px; border-radius: 6px; border: 1px solid #ddd; font-weight: 600; color: #333; }
                .px-cm { color: #667eea !important; background: #e3f2fd !important; border-color: #667eea !important; }
                
                .angle-controls { display: flex; flex-direction: column; gap: 10px; }
                .angle-controls label { font-weight: 600; color: #333; font-size: 14px; }
                .angle-buttons { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
                .angle-buttons button { padding: 10px 16px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer; font-size: 14px; }
                .angle-buttons button:hover { background: #e9ecef; }
                .angle-value { min-width: 50px; text-align: center; font-family: monospace; background: white; padding: 10px; border-radius: 6px; border: 1px solid #ddd; font-weight: 600; font-size: 16px; }
                
                .actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 20px; }
                .actions button { display: flex; align-items: center; gap: 6px; padding: 12px 24px; border: 1px solid #ddd; background: white; border-radius: 8px; cursor: pointer; font-size: 15px; touch-action: manipulation; }
                .actions button.calc { background: #28a745; color: white; border-color: #28a745; }
                .actions button:disabled { opacity: 0.5; cursor: not-allowed; }
                
                .result-box { background: #d4edda; border: 1px solid #c3e6cb; border-radius: 12px; padding: 24px; margin-bottom: 20px; text-align: center; }
                .result-box h3 { margin: 0 0 20px 0; color: #155724; }
                .result-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 15px; }
                .result-item { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
                .result-item span { display: block; font-size: 12px; color: #666; margin-bottom: 5px; text-transform: uppercase; }
                .result-item strong { display: block; font-size: 20px; color: #28a745; }
                
                @media (max-width: 600px) { 
                    .vm-header { flex-direction: column; text-align: center; } 
                    .controls-panel { padding: 15px; }
                    .angle-buttons button { padding: 8px 12px; font-size: 13px; }
                }
            `}</style>
        </div>
    );
}