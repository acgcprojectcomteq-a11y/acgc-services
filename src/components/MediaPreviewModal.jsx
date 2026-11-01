import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const isVideoUrl = (url = "") => /\.(mp4|webm|mov)(?:[?#]|$)/i.test(url);
const isPdfUrl = (url = "") => /\.pdf(?:[?#]|$)/i.test(url);

export default function MediaPreviewModal({ src, name = "Photo preview", darkMode = false, onClose }) {
  useEffect(() => {
    if (!src) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [src, onClose]);

  if (!src || typeof document === "undefined") return null;
  const content = isPdfUrl(src) || String(name).toLowerCase().endsWith(".pdf")
    ? <iframe src={src} title={name} className="h-[min(82vh,900px)] w-[min(92vw,1000px)] rounded-xl bg-white" />
    : isVideoUrl(src)
      ? <video src={src} title={name} controls autoPlay className="max-h-[88vh] max-w-[94vw] rounded-xl" />
      : <img src={src} alt={name} className="max-h-[88vh] max-w-[94vw] rounded-xl object-contain" />;

  return createPortal(
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section role="dialog" aria-modal="true" aria-label={name} className={`relative flex max-h-[94vh] max-w-[96vw] items-center justify-center rounded-2xl border p-3 shadow-2xl ${darkMode ? "border-slate-600 bg-slate-900" : "border-white/70 bg-white"}`}>
        <button type="button" onClick={onClose} aria-label="Close preview" className="absolute -right-2 -top-2 z-10 flex size-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-800 shadow-lg hover:bg-slate-100"><X size={19} /></button>
        {content}
      </section>
    </div>,
    document.body,
  );
}
