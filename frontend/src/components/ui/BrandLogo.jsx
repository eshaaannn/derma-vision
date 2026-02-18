import { useState } from "react";
import { LOGO_CANDIDATES } from "../../utils/brand";

function BrandLogo({ className = "h-10 w-10", alt = "Derma Vision Logo" }) {
  const [candidateIndex, setCandidateIndex] = useState(0);

  if (candidateIndex >= LOGO_CANDIDATES.length) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-xl bg-medical-gradient text-sm font-extrabold text-white ${className}`}
        aria-label={alt}
      >
        DV
      </span>
    );
  }

  return (
    <img
      src={LOGO_CANDIDATES[candidateIndex]}
      alt={alt}
      className={`rounded-xl object-contain ${className}`}
      onError={() => setCandidateIndex((current) => current + 1)}
    />
  );
}

export default BrandLogo;
