import { useEffect, useRef, useState } from "react";
import Button from "../ui/Button";

function CameraCapture({ onCapture }) {
  const videoRef = useRef(null);
  const [error, setError] = useState("");
  const [stream, setStream] = useState(null);

  useEffect(() => {
    let activeStream = null;

    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        activeStream = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (cameraError) {
        setError("Camera access denied. Please allow permission or upload manually.");
      }
    }

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleCapture = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL("image/jpeg", 0.92);
    onCapture(imageData);
  };

  return (
    <div className="glass-card space-y-4 p-4">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
        <video ref={videoRef} autoPlay playsInline className="aspect-video w-full bg-slate-950" />
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={handleCapture} disabled={!stream}>
          Capture Image
        </Button>
      </div>
    </div>
  );
}

export default CameraCapture;
