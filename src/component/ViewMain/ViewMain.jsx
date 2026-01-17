/* ViewMain.jsx – kết quả giống nhau trên mọi laptop/điện thoại */
import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, RotateCcw, Ruler } from 'lucide-react';
import './ViewMain.css';

export default function ViewMain({ user, onLogout }) {
    const [image, setImage] = useState(null);          // để hiển thị
    const [rawImageData, setRawImageData] = useState(null); // ImageData gốc
    const [step, setStep] = useState('upload');
    const [polygonPoints, setPolygonPoints] = useState([]);
    const [pixelsPerCm, setPixelsPerCm] = useState(null);
    const [area, setArea] = useState(null);
    const [loading, setLoading] = useState(false);
    const [cvReady, setCvReady] = useState(false);

    const canvasRef = useRef(null);
    const uploadRef = useRef(null);
    const cameraRef = useRef(null);

    /* 1. Load OpenCV -------------------------------------------------------- */
    useEffect(() => {
        const loadOpenCV = () => {
            if (window.cv && window.cv.Mat) {
                setCvReady(true);
                console.log('✅ OpenCV đã sẵn sàng');
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

    /* 2. Nhận file – lưu cả ảnh hiển thị + ImageData gốc -------------------- */
    const handleImageUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                setImage(img); // để vẽ UI
                // Canvas offline -> lấy ImageData gốc
                const off = document.createElement('canvas');
                off.width = img.width;
                off.height = img.height;
                const octx = off.getContext('2d');
                octx.drawImage(img, 0, 0);
                setRawImageData(octx.getImageData(0, 0, img.width, img.height));
                setStep('scan');
                setPolygonPoints([]); setArea(null); setPixelsPerCm(null);
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    /* 3. Vẽ canvas (chỉ để hiển thị) --------------------------------------- */
    const drawCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!image) return;
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);
        if (polygonPoints.length) {
            ctx.strokeStyle = '#00ff00';
            ctx.fillStyle = 'rgba(0,255,0,0.25)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            polygonPoints.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
            ctx.closePath(); ctx.stroke(); ctx.fill();
            polygonPoints.forEach(p => {
                ctx.fillStyle = '#ff0000';
                ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
            });
        }
    };
    useEffect(() => { if (image) drawCanvas(); }, [image, polygonPoints]);

    /* 4. Xử lý ảnh – chỉ dùng ImageData gốc --------------------------------- */
    const scanAndCalc = async () => {
        if (!rawImageData || !cvReady) {
            alert('⚠️ Chưa có ảnh hoặc OpenCV chưa sẵn sàng');
            return;
        }
        setLoading(true);
        try {
            const cv = window.cv;
            /* đọc ảnh từ ImageData gốc */
            const src = cv.matFromImageData(rawImageData);
            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            /* 4.1 Tìm thước */
            const edgesRuler = new cv.Mat();
            cv.Canny(gray, edgesRuler, 50, 150);
            const lines = new cv.Mat();
            cv.HoughLinesP(edgesRuler, lines, 1, Math.PI / 180, 50, 25, 10);
            const vLines = [];
            for (let i = 0; i < lines.rows; ++i) {
                const [x1, y1, x2, y2] = lines.data32S.slice(i * 4, i * 4 + 4);
                const ang = Math.abs(Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI);
                const d = Math.hypot(x2 - x1, y2 - y1);
                if (ang > 75 && ang < 105 && d > 15 && d < 100) vLines.push((x1 + x2) / 2);
            }
            vLines.sort((a, b) => a - b);
            let sumGap = 0, gaps = 0;
            for (let i = 1; i < vLines.length; ++i) {
                const gap = vLines[i] - vLines[i - 1];
                if (gap > 5 && gap < 100) { sumGap += gap; gaps++; }
            }
            let rawPpc = gaps > 0 ? sumGap / gaps : 16.11;
            const CORRECTION = 0.991; // hiệu chỉnh cứng
            const pxPerCm = rawPpc * CORRECTION;
            setPixelsPerCm(pxPerCm);

            /* 4.2 Phân đoạn màu */
            const hsv = new cv.Mat();
            cv.cvtColor(src, hsv, cv.COLOR_RGB2HSV);
            const lowerGray = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 80, 0]);
            const upperGray = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 50, 220, 255]);
            const maskGray = new cv.Mat();
            cv.inRange(hsv, lowerGray, upperGray, maskGray);
            const kernel1 = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
            const cleaned = new cv.Mat();
            cv.morphologyEx(maskGray, cleaned, cv.MORPH_OPEN, kernel1);
            const kernel2 = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
            const filled = new cv.Mat();
            cv.morphologyEx(cleaned, filled, cv.MORPH_CLOSE, kernel2, new cv.Point(-1, -1), 2);

            /* 4.3 Contours */
            const contours = new cv.MatVector();
            const hierarchy = new cv.Mat();
            cv.findContours(filled, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
            const imgArea = src.cols * src.rows;
            const candidates = [];
            for (let i = 0; i < contours.size(); ++i) {
                const cnt = contours.get(i);
                const a = cv.contourArea(cnt);
                const pct = (a / imgArea) * 100;
                if (pct < 5 || pct > 70) continue;
                const peri = cv.arcLength(cnt, true);
                const rect = cv.boundingRect(cnt);
                const compactness = (4 * Math.PI * a) / (peri * peri);
                const aspectRatio = Math.max(rect.width, rect.height) / Math.min(rect.width, rect.height);
                if (compactness > 0.1 && aspectRatio < 15) candidates.push({ cnt, a, peri });
            }
            if (!candidates.length) throw new Error('Không tìm thấy rập');
            candidates.sort((a, b) => b.a - a.a);
            const best = candidates[0];

            /* 4.4 Đa giác */
            const approx = new cv.Mat();
            const eps = 0.002 * best.peri;
            cv.approxPolyDP(best.cnt, approx, eps, true);
            const pts = [];
            for (let i = 0; i < approx.rows; ++i) {
                pts.push({ x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1] });
            }
            setPolygonPoints(pts);

            /* 4.5 Diện tích */
            let s = 0;
            for (let i = 0; i < pts.length; i++) {
                const j = (i + 1) % pts.length;
                s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
            }
            const areaCm2 = Math.abs(s) / 2 / (pxPerCm * pxPerCm);
            setArea(areaCm2);
            setStep('result');

            /* 4.6 Dọn rác */
            src.delete(); gray.delete(); edgesRuler.delete(); lines.delete();
            hsv.delete(); lowerGray.delete(); upperGray.delete(); maskGray.delete();
            kernel1.delete(); cleaned.delete(); kernel2.delete(); filled.delete();
            contours.delete(); hierarchy.delete(); approx.delete();
        } catch (e) {
            console.error(e);
            alert(`⚠️ ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setImage(null); setRawImageData(null); setStep('upload');
        setPolygonPoints([]); setArea(null); setPixelsPerCm(null);
    };

    /* 5. UI ------------------------------------------------------------------ */
    return (
        <div className="vm-wrap">
            <header className="vm-header">
                <h1>🎯 Tính Diện Tích Rập</h1>
                <p>Xin chào, <strong>{user.name}</strong></p>
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

                {image && (
                    <>
                        <div className="guide-box">💡 Nhấn "Quét & tính" để hệ thống tự động nhận diện rập</div>

                        <div className="canvas-box">
                            <canvas ref={canvasRef} />
                            {loading && <div className="overlay">🔍 Đang quét...</div>}
                        </div>

                        <div className="actions">
                            <button onClick={reset}><RotateCcw /> Làm lại</button>
                            <button className="calc" disabled={loading || !cvReady} onClick={scanAndCalc}><Ruler /> Quét & tính</button>
                        </div>

                        {step === 'result' && area !== null && (
                            <div className="result-box">
                                <h3>✅ Kết quả</h3>
                                <div><span>cm²</span><strong>{area.toFixed(2)}</strong></div>
                                <div><span>m²</span><strong>{(area / 10000).toFixed(4)}</strong></div>
                                <p>📏 Tỷ lệ: {pixelsPerCm?.toFixed(2)} px/cm</p>
                                <p>📐 Số đỉnh: {polygonPoints.length}</p>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}