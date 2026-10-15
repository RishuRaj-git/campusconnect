import { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export const fileKind = (name = '') => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  return 'other';
};

// In-house viewer: images full-screen, PDFs rendered page-by-page on site.
// { file: { url, name }, onSave (optional download fn), onClose }
export default function ViewerModal({ file, onSave, onClose }) {
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);
  const kind = fileKind(file?.name);
  const width = Math.min(640, (typeof window !== 'undefined' ? window.innerWidth : 700) - 48);

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [onClose]);
  useEffect(() => { setPage(1); setPages(0); setFailed(false); }, [file?.url]);

  if (!file) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm anim-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col card !p-3 sm:!p-4 anim-pop">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="font-bold text-sm truncate flex-1">👁 {file.name}</h3>
          {onSave && <button className="btn-primary text-xs !py-1 shrink-0" onClick={onSave}>⬇ Save</button>}
          <button className="btn-ghost text-xs !py-1 shrink-0" onClick={onClose}>✕</button>
        </div>
        <div className="overflow-auto rounded-xl bg-slate-100 dark:bg-slate-950 grid place-items-center min-h-[30vh]">
          {kind === 'image' && (
            <img src={file.url} alt={file.name} className="max-h-[70vh] w-auto object-contain" />
          )}
          {kind === 'pdf' && !failed && (
            <Document
              file={file.url}
              onLoadSuccess={({ numPages }) => setPages(numPages)}
              onLoadError={() => setFailed(true)}
              loading={<p className="p-8 text-sm opacity-60">Loading pages… ⏳</p>}
            >
              <Page pageNumber={page} width={width} loading="" />
            </Document>
          )}
          {(kind === 'other' || failed) && (
            <div className="p-8 text-center text-sm">
              <p className="text-3xl mb-2">📄</p>
              <p className="opacity-70">No in-app preview for this file type.</p>
              {onSave
                ? <button className="btn-primary text-sm mt-3" onClick={onSave}>Save to device ⬇</button>
                : <p className="opacity-60 mt-1">Use Save to view it on your device.</p>}
            </div>
          )}
        </div>
        {kind === 'pdf' && !failed && pages > 0 && (
          <div className="flex items-center justify-center gap-3 mt-2 text-sm">
            <button className="btn-ghost !py-1 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
            <span className="opacity-70">{page} / {pages}</span>
            <button className="btn-ghost !py-1 text-xs" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
