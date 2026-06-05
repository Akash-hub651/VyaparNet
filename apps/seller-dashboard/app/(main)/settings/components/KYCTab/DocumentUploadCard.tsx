import React, { useState, useRef } from 'react';
import { KycDocumentConfig } from '../../../../../lib/api/settings.client';
import { useToast } from '../../../../../components/ui/Toast';

interface DocumentUploadCardProps {
  doc: KycDocumentConfig;
  onPreview: (fileUrl: string, filename: string, fileType?: string) => void;
  onUploadSuccess: (docId: string, fileData: { id: string, filename: string, url: string, sizeBytes: number }) => void;
  disabled?: boolean;
}

export function DocumentUploadCard({ doc, onPreview, onUploadSuccess, disabled }: DocumentUploadCardProps) {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (disabled) return;
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
    // Reset input so the same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processFile = (file: File) => {
    // 1. Size Validation
    const sizeInMB = file.size / (1024 * 1024);
    if (sizeInMB > doc.maxSizeMB) {
      addToast({ message: `File size ${doc.maxSizeMB}MB se choti honi chahiye`, variant: 'error' });
      return;
    }

    // 2. Simulate Upload Progress
    setIsUploading(true);
    setUploadProgress(0);

    // Read local file for simulation
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      
      // Artificial progress animation for Sprint 8 simulation
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.floor(Math.random() * 20) + 10;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          
          setTimeout(() => {
            setIsUploading(false);
            setUploadProgress(0);
            
            // Trigger success callback
            onUploadSuccess(doc.id, {
              id: `doc_${Date.now()}`,
              filename: file.name,
              url: dataUrl,
              sizeBytes: file.size,
            });
            
            addToast({ message: `${doc.name} successully process ho gaya (Preview Ready)`, variant: 'success' });
          }, 300); // short delay at 100%
        }
        setUploadProgress(progress);
      }, 150);
      
      // Store interval to allow cancellation
      uploadIntervalRef.current = interval;
    };
    reader.readAsDataURL(file);
  };

  const cancelUpload = () => {
    if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
    setIsUploading(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div 
      className={`w-full bg-surface-card border border-border-default rounded-lg p-4 mb-3 flex flex-col md:flex-row gap-4 transition-colors ${dragActive ? 'border-brand-500 bg-brand-50/30' : ''}`}
      role="region"
      aria-label={`${doc.name} upload area`}
    >
      
      {/* LEFT: Document Info */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-semibold text-text-primary">
            {doc.name} {doc.nameHindi && <span className="font-normal text-text-secondary">({doc.nameHindi})</span>}
          </h4>
          {doc.required && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-error-100 text-error-700">
              * Zaroori
            </span>
          )}
        </div>
        <p className="text-xs text-text-secondary mb-2">{doc.description}</p>
        <p className="text-xs text-text-muted">
          Accepted: {doc.acceptedFormats.join(', ')} &middot; Max {doc.maxSizeMB}MB
        </p>
        
        {doc.status === 'rejected' && doc.rejectionReason && (
          <div className="mt-2 text-xs font-medium text-error-700 bg-error-50 px-2 py-1.5 rounded border border-error-200 inline-block">
            Reason: {doc.rejectionReason}
          </div>
        )}
      </div>

      {/* RIGHT: Upload Area or Status */}
      <div className="w-full md:w-64 flex-shrink-0 flex flex-col justify-center">
        
        {/* State: Uploading */}
        {isUploading && (
          <div className="w-full border border-border-default rounded-lg p-3 bg-surface-base h-20 md:h-[80px] flex flex-col justify-center relative">
            <div className="flex justify-between items-center mb-2 pr-6">
              <span className="text-xs text-text-secondary truncate pr-2" aria-live="polite">Uploading file...</span>
              <span className="text-xs font-medium text-brand-600">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-neutral-200 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-brand-600 h-1.5 rounded-full transition-all duration-200" 
                style={{ width: `${uploadProgress}%` }}
                role="progressbar"
                aria-valuenow={uploadProgress}
                aria-valuemin={0}
                aria-valuemax={100}
              ></div>
            </div>
            <button 
              onClick={cancelUpload}
              className="absolute top-2 right-2 p-1 text-text-muted hover:text-error-600 rounded-full hover:bg-error-50 transition-colors"
              aria-label="Cancel upload"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        )}

        {/* State: Not Uploaded OR Rejected (needs re-upload) */}
        {!isUploading && (doc.status === 'not_uploaded' || doc.status === 'rejected') && (
          <div 
            className={`relative w-full border-2 border-dashed rounded-lg p-3 h-20 md:h-[80px] flex items-center justify-center transition-colors cursor-pointer group ${
              disabled 
                ? 'border-border-default bg-neutral-50 cursor-not-allowed opacity-60' 
                : dragActive 
                  ? 'border-brand-500 bg-brand-50' 
                  : doc.status === 'rejected'
                    ? 'border-error-300 bg-error-50/50 hover:bg-error-50'
                    : 'border-border-default bg-neutral-50 hover:bg-neutral-100'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !disabled && fileInputRef.current?.click()}
            role="button"
            aria-label={`${doc.name} upload karein`}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <input 
              ref={fileInputRef}
              type="file" 
              className="hidden" 
              accept={doc.acceptedFormats.map(f => `.${f.toLowerCase()}`).join(',')} 
              onChange={handleChange}
              disabled={disabled}
            />
            
            <div className="flex flex-col items-center justify-center text-center">
              <svg 
                width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`mb-1 ${doc.status === 'rejected' ? 'text-error-500' : 'text-neutral-500 group-hover:text-brand-600 transition-colors'}`}
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <span className={`text-xs font-medium ${doc.status === 'rejected' ? 'text-error-600' : 'text-text-secondary group-hover:text-brand-600 transition-colors'}`}>
                {doc.status === 'rejected' ? 'Dobara Upload Karein' : 'Upload karein'}
              </span>
            </div>
          </div>
        )}

        {/* State: Uploaded (Preview Ready) */}
        {!isUploading && doc.status === 'uploaded' && doc.currentFile && (
          <div className="w-full border border-border-default rounded-lg p-3 bg-surface-base flex items-center gap-3 relative overflow-hidden" aria-live="polite">
            <div className="w-12 h-12 rounded border border-border-default bg-neutral-100 flex-shrink-0 flex items-center justify-center overflow-hidden">
              {doc.currentFile.filename.toLowerCase().endsWith('.pdf') ? (
                <span className="text-error-500 font-bold text-xs">PDF</span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={doc.currentFile.url} alt="thumbnail" className="w-full h-full object-cover" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-success-500 flex-shrink-0"></span>
                <p className="text-xs font-medium text-text-primary truncate">Preview Ready</p>
              </div>
              <p className="text-[10px] text-text-muted truncate">{doc.currentFile.filename}</p>
              <p className="text-[10px] text-text-muted">{formatSize(doc.currentFile.sizeBytes)}</p>
            </div>

            {/* Actions overlay */}
            <div className="absolute right-2 top-2 bottom-2 flex flex-col justify-center gap-1 bg-surface-base pl-2">
              <button 
                onClick={(e) => { e.stopPropagation(); onPreview(doc.currentFile!.url, doc.currentFile!.filename); }}
                className="flex items-center gap-1.5 px-2 py-1 bg-neutral-50 hover:bg-neutral-100 text-[10px] font-medium text-text-secondary rounded transition-colors"
                aria-label="Preview document"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                Preview
              </button>
              {!disabled && (
                <button 
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  className="flex items-center gap-1.5 px-2 py-1 bg-neutral-50 hover:bg-neutral-100 text-[10px] font-medium text-text-secondary rounded transition-colors"
                  aria-label="Replace document"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  Replace
                </button>
              )}
            </div>
            {/* Hidden file input for Replace action */}
            <input 
              ref={fileInputRef}
              type="file" 
              className="hidden" 
              accept={doc.acceptedFormats.map(f => `.${f.toLowerCase()}`).join(',')} 
              onChange={handleChange}
              disabled={disabled}
            />
          </div>
        )}
      </div>
    </div>
  );
}
