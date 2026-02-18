import { useRef } from "react";
import { motion } from "framer-motion";

function DropzoneUpload({ onFilesSelect }) {
  const inputRef = useRef(null);

  const handleDrop = (event) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []).filter((file) =>
      file.type.startsWith("image/")
    );
    if (files.length) {
      onFilesSelect(files);
    }
  };

  const handleBrowse = (event) => {
    const files = Array.from(event.target.files || []).filter((file) =>
      file.type.startsWith("image/")
    );
    if (files.length) {
      onFilesSelect(files);
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      onDrop={handleDrop}
      onDragOver={(event) => event.preventDefault()}
      className="glass-card flex flex-col items-center justify-center gap-3 border-2 border-dashed border-blue-300 p-8 text-center dark:border-blue-800"
    >
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        Drag and drop one or more lesion images here
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        JPG/PNG, upload multiple angles for better clarity
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleBrowse}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-lg bg-blue-100 px-4 py-2 text-sm font-semibold text-medicalBlue transition hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-200"
      >
        Browse Gallery
      </button>
    </motion.div>
  );
}

export default DropzoneUpload;
