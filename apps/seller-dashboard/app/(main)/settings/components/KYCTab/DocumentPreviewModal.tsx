import React, { useEffect } from 'react';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  filename: string;
  fileType?: string;
}

export function DocumentPreviewModal({ isOpen, onClose, fileUrl, filename, fileType }: DocumentPreviewModalProps) {
  // Focus trap and escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isPdf = fileType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-10 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
    >
      <div className="bg-surface-base w-full max-w-4xl h-full md:h-[90vh] rounded-xl flex flex-col shadow-2 overflow-hidden relative">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-default bg-surface-card">
          <h2 id="preview-modal-title" className="text-base font-semibold text-text-primary truncate pr-4">
            {filename}
          </h2>
          <button 
            onClick={onClose}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-neutral-100 rounded-full transition-colors shrink-0"
            aria-label="Close preview"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 bg-neutral-100 flex items-center justify-center overflow-auto p-4">
          {isPdf ? (
            <div className="w-full h-full flex flex-col items-center justify-center space-y-4">
              <div className="text-neutral-400">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </div>
              <p className="text-text-secondary">PDF preview not available in local simulation</p>
              <a 
                href={fileUrl} 
                download={filename}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
              >
                Download PDF
              </a>
            </div>
          ) : (
            // eslint-disable-next-line
            <img 
              src={fileUrl} 
              alt={filename} 
              className="max-w-full max-h-full object-contain shadow-1"
            />
          )}
        </div>
      </div>
    </div>
  );
}
