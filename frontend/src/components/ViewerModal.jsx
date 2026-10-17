import { useEffect, useState } from 'react';

export const fileKind = (name = '') => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  return 'other';
};

// In-house viewer. PDFs/images render through OUR backend stream endpoint
// (correct inline Content-Type, same origin → zero CORS/CSP/worker issues).
// { file: { url, name }, onSave (optional download fn), onClose }
export default function ViewerModal({ file, onSave, onClose }) {
  const [closing, setClosing] = useState(false);
  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 170); // let pop-out finish
  };
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  if (!file) return null;
  const kind = fileKind(file.name);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className={`absolute inset-0 bg-slate-950/80 backdrop-blur-sm ${closing ? 'anim-fade-out' : 'anim-fade-in'}`} onClick={close} />
      <div className={`relative w-full max-w-2xl max-h-[92vh] flex flex-col card !p-3 sm:!p-4 ${closing ? 'pop-out' : 'pop-in'}`}>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="font-bold text-sm truncate flex-1">👁 {file.name}</h3>
          {onSave && <button className="btn-primary text-xs !py-1 shrink-0" onClick={onSave}>⬇ Save</button>}
          <button className="btn-ghost text-xs !py-1 shrink-0" onClick={close}>✕</button>
        </div>
        <div className="overflow-auto rounded-xl bg-slate-100 dark:bg-slate-950 min-h-[50vh] max-h-[75vh]">
          {kind === 'image' && (
            <img src={file.url} alt={file.name} className="w-full max-h-[75vh] object-contain" />
          )}
          {kind === 'pdf' && (
            <iframe src={file.url} title={file.name} className="w-full h-[70vh] rounded-xl bg-white" />
          )}
          {kind === 'other' && (
            <div className="p-8 text-center text-sm">
              <p className="text-3xl mb-2">📄</p>
              <p className="opacity-70">No in-app preview for this file type.</p>
              {onSave
                ? <button className="btn-primary text-sm mt-3" onClick={onSave}>Save to device ⬇</button>
                : <p className="opacity-60 mt-1">Use Save to view it on your device.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
