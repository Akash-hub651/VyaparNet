'use client';

import React, { Fragment } from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Whether the action requires a reason string */
  requireReason?: boolean;
  reasonPlaceholder?: string;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

/**
 * ConfirmModal — accessible confirmation dialog for irreversible admin actions.
 * Traps focus inside the dialog when open.
 */
export default function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  requireReason = false,
  reasonPlaceholder = 'Enter reason...',
  onConfirm,
  onCancel,
}: ConfirmModalProps): React.JSX.Element | null {
  const [reason, setReason] = React.useState('');

  if (!open) return null;

  const handleConfirm = (): void => {
    if (requireReason && !reason.trim()) return;
    onConfirm(requireReason ? reason.trim() : undefined);
    setReason('');
  };

  const handleCancel = (): void => {
    setReason('');
    onCancel();
  };

  return (
    <Fragment>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        aria-hidden="true"
        onClick={handleCancel}
      />
      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-xl shadow-xl p-6"
      >
        <h2 id="confirm-modal-title" className="text-lg font-semibold text-[#1E293B] mb-2">
          {title}
        </h2>
        <p className="text-sm text-[#64748B] mb-4">{description}</p>

        {requireReason && (
          <textarea
            className="w-full border border-[#E2E8F0] rounded-lg p-3 text-sm text-[#1E293B] mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            rows={3}
            placeholder={reasonPlaceholder}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-[#64748B] bg-[#F1F5F9] rounded-lg hover:bg-[#E2E8F0] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={requireReason && !reason.trim()}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              ${destructive
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-[#2563EB] hover:bg-[#1D4ED8]'
              }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Fragment>
  );
}
