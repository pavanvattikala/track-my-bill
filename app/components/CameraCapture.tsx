"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Camera, X, ZoomIn, RotateCcw } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export default function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(
    async (facing: "environment" | "user") => {
      stopStream();
      setIsReady(false);
      setError(null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            setIsReady(true);
          };
        }
      } catch (err) {
        console.error("Camera error:", err);
        setError(
          "Could not access camera. Please allow camera permission and try again."
        );
      }
    },
    [stopStream]
  );

  // Check if multiple cameras exist (for flip button)
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      setHasMultipleCameras(videoDevices.length > 1);
    });
  }, []);

  // Start camera on mount / when facingMode changes
  useEffect(() => {
    startCamera(facingMode);
    return () => stopStream();
  }, [facingMode, startCamera, stopStream]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !isReady) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const capturedFile = new File([blob], `receipt-${timestamp}.jpg`, {
          type: "image/jpeg",
        });
        stopStream();
        onCapture(capturedFile);
      },
      "image/jpeg",
      0.92
    );
  }, [isReady, stopStream, onCapture]);

  const handleFlip = useCallback(() => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }, []);

  const handleClose = useCallback(() => {
    stopStream();
    onClose();
  }, [stopStream, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <span className="text-white font-semibold text-sm flex items-center gap-2">
          <Camera className="w-4 h-4" /> Take Photo
        </span>
        <button
          onClick={handleClose}
          className="text-white p-2 rounded-full hover:bg-white/10 transition"
          aria-label="Close camera"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Viewfinder */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-black">
        {error ? (
          <div className="text-center px-8">
            <p className="text-red-400 text-sm mb-4">{error}</p>
            <button
              onClick={() => startCamera(facingMode)}
              className="flex items-center gap-2 mx-auto px-4 py-2 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20 transition"
            >
              <RotateCcw className="w-4 h-4" /> Try Again
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Overlay guide */}
            {isReady && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-[85%] h-[60%] border-2 border-white/40 rounded-2xl" />
              </div>
            )}
            {!isReady && !error && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-around px-8 py-6 bg-black/80">
        {/* Placeholder for layout balance */}
        <div className="w-10 h-10" />

        {/* Shutter button */}
        <button
          onClick={handleCapture}
          disabled={!isReady || !!error}
          aria-label="Capture photo"
          className="w-16 h-16 rounded-full border-4 border-white bg-white/20 flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
        >
          <div className="w-12 h-12 rounded-full bg-white" />
        </button>

        {/* Flip camera button */}
        {hasMultipleCameras ? (
          <button
            onClick={handleFlip}
            aria-label="Flip camera"
            className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition"
          >
            <ZoomIn className="w-5 h-5 rotate-90" />
          </button>
        ) : (
          <div className="w-10 h-10" />
        )}
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
