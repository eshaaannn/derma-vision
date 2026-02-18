import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import Button from "../ui/Button";
import { getCroppedImage } from "../../utils/cropImage";

function ImageCropperModal({ image, onCancel, onComplete }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const onCropComplete = useCallback((_, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    setIsSaving(true);
    setError("");
    try {
      const cropped = await getCroppedImage(image, croppedAreaPixels);
      onComplete(cropped);
    } catch (cropError) {
      setError("Cropping failed. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl dark:bg-slate-900">
        <h3 className="mb-3 text-base font-bold text-slate-900 dark:text-slate-100">Crop Image</h3>
        <div className="relative h-72 overflow-hidden rounded-xl bg-slate-900">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="mt-3">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="mt-2 w-full"
            />
          </label>
        </div>
        {error ? (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={isSaving}>
            Save Crop
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ImageCropperModal;
