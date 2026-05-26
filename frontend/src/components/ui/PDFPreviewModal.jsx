'use client';
import { useEffect, useRef, useState } from 'react';
import { X, Download, Loader2, FileText, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

/**
 * PDFPreviewModal — Reusable PDF preview overlay
 *
 * Props:
 *   isOpen      boolean        — show/hide
 *   onClose     () => void     — close callback
 *   fetchFn     () => Promise  — async function that returns axios response (responseType:'blob')
 *   filename    string         — suggested download filename  e.g. "PO-VND-001.pdf"
 *   title       string         — header title                e.g. "Preview PO Vendor"
 */
export default function PDFPreviewModal({ isOpen, onClose, fetchFn, filename = 'dokumen.pdf', title = 'Preview Dokumen' }) {
  const [blobUrl, setBlobUrl]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [zoom, setZoom]         = useState(100);
  const prevFetchRef            = useRef(null);

  /* Fetch PDF whenever modal opens or fetchFn changes */
  useEffect(() => {
    if (!isOpen || !fetchFn) return;
    // avoid re-fetching same function reference
    if (prevFetchRef.current === fetchFn && blobUrl) return;
    prevFetchRef.current = fetchFn;

    let objectUrl;
    setLoading(true);
    setError(null);
    setBlobUrl(null);
    setZoom(100);

    fetchFn()
      .then((res) => {
        objectUrl = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
        setBlobUrl(objectUrl);
      })
      .catch(() => setError('Gagal memuat PDF. Coba lagi.'))
      .finally(() => setLoading(false));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isOpen, fetchFn]);

  /* Revoke when modal closes */
  useEffect(() => {
    if (!isOpen && blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
      setError(null);
      prevFetchRef.current = null;
    }
  }, [isOpen]);

  /* Close on Escape */
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.click();
  };

  const zoomIn  = () => setZoom((z) => Math.min(z + 25, 200));
  const zoomOut = () => setZoom((z) => Math.max(z - 25, 50));
  const resetZoom = () => setZoom(100);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex flex-col" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 flex flex-col w-full h-full max-w-5xl mx-auto my-4 rounded-2xl overflow-hidden shadow-2xl bg-gray-900">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-blue-400" />
            <span className="text-white font-semibold text-sm truncate max-w-xs">{title}</span>
          </div>

          <div className="flex items-center gap-1">
            {/* Zoom controls */}
            {blobUrl && (
              <>
                <button onClick={zoomOut} disabled={zoom <= 50}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg disabled:opacity-30 transition-colors"
                  title="Perkecil">
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button onClick={resetZoom}
                  className="px-2 py-1 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg text-xs font-mono transition-colors min-w-[44px] text-center"
                  title="Reset zoom">
                  {zoom}%
                </button>
                <button onClick={zoomIn} disabled={zoom >= 200}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg disabled:opacity-30 transition-colors"
                  title="Perbesar">
                  <ZoomIn className="w-4 h-4" />
                </button>
                <div className="w-px h-5 bg-gray-600 mx-1" />
              </>
            )}

            {/* Download */}
            <button onClick={handleDownload} disabled={!blobUrl}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg disabled:opacity-40 transition-colors">
              <Download className="w-3.5 h-3.5" />
              Unduh
            </button>

            {/* Close */}
            <button onClick={onClose}
              className="ml-1 p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-auto bg-gray-700 flex items-start justify-center p-4">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-300">
              <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
              <p className="text-sm">Memuat dokumen…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-red-400">
              <FileText className="w-12 h-12 opacity-50" />
              <p className="text-sm font-medium">{error}</p>
              <button onClick={() => { prevFetchRef.current = null; setBlobUrl(null); }}
                className="text-xs px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 rounded-lg transition-colors">
                Coba Lagi
              </button>
            </div>
          )}

          {blobUrl && !loading && (
            <div style={{ width: `${zoom}%`, minWidth: '320px', transition: 'width 0.2s' }}>
              <iframe
                src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                className="w-full rounded-lg shadow-2xl bg-white"
                style={{ height: 'calc(100vh - 140px)', minHeight: '500px', border: 'none' }}
                title={title}
              />
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-2 bg-gray-800 border-t border-gray-700 shrink-0">
          <span className="text-gray-500 text-xs truncate">{filename}</span>
          <span className="text-gray-500 text-xs">Tekan Esc untuk menutup</span>
        </div>
      </div>
    </div>
  );
}
