import Link from 'next/link';
import { KycStatus } from '../../../../../lib/api/settings.client';
import { formatRelativeTime, formatDate } from '../../../../../lib/formatters';

interface KycStatusCardProps {
  status: KycStatus | null;
  submittedAt?: string;
  verifiedAt?: string;
  rejectedAt?: string;
  rejectionReasons?: string[];
  onScrollToDocs: () => void;
}

export function KycStatusCard({
  status,
  submittedAt,
  verifiedAt,
  rejectedAt,
  rejectionReasons,
  onScrollToDocs,
}: KycStatusCardProps) {
  if (!status) return null;

  switch (status) {
    case 'NOT_SUBMITTED':
      return (
        <div className="w-full bg-neutral-50 border-[1.5px] border-neutral-200 rounded-lg p-5 mb-8 flex flex-col md:flex-row items-start md:items-center gap-5 relative">
          <div className="flex-shrink-0 text-neutral-400">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg md:text-xl font-bold text-text-primary mb-1">KYC abhi submit nahi hua</h3>
            <p className="text-sm text-text-secondary">
              KYC ke bina aap RFQ feature use nahi kar sakte.<br className="hidden md:block" />
              Documents submit karein aur 24-48 ghante mein verify ho jayega.
            </p>
          </div>
          <div className="w-full md:w-auto mt-2 md:mt-0">
            <button
              onClick={onScrollToDocs}
              className="w-full md:w-auto px-5 h-10 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Documents Section Pe Jayein
            </button>
          </div>
        </div>
      );

    case 'PENDING':
      return (
        <div role="status" className="w-full bg-warning-50 border-[1.5px] border-warning-300 rounded-lg p-5 mb-8 flex flex-col md:flex-row items-start md:items-center gap-5 relative">
          <div className="flex-shrink-0 text-warning-500">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-lg md:text-xl font-bold text-text-primary">KYC Review Mein Hai</h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-warning-100 text-warning-700 border border-warning-200">
                PENDING
              </span>
            </div>
            <p className="text-sm text-text-secondary">
              Aapke documents admin ke paas review ke liye hain. 24-48 ghante lagenge.
            </p>
            {submittedAt && (
              <p className="text-xs text-text-muted mt-2">Submitted: {formatRelativeTime(submittedAt)}</p>
            )}
          </div>
        </div>
      );

    case 'VERIFIED':
      return (
        <div role="status" className="w-full bg-success-50 border-[1.5px] border-success-300 rounded-lg p-5 mb-8 flex flex-col md:flex-row items-start md:items-center gap-5 relative">
          <div className="flex-shrink-0 text-success-500">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg md:text-xl font-bold text-text-primary mb-1">KYC Verified! ✅</h3>
            <p className="text-sm text-text-secondary">
              Congratulations! Aapki identity verify ho gayi. Sab features available hain.
            </p>
            {verifiedAt && (
              <p className="text-xs text-text-muted mt-2">Verified: {formatDate(verifiedAt)}</p>
            )}
          </div>
          <div className="w-full md:w-auto mt-2 md:mt-0">
            <Link
              href="/rfq"
              className="inline-flex w-full md:w-auto items-center justify-center px-4 h-10 text-brand-600 bg-brand-50 hover:bg-brand-100 text-sm font-medium rounded-lg transition-colors border border-brand-200"
            >
              RFQ feature ab available hai &rarr;
            </Link>
          </div>
        </div>
      );

    case 'REJECTED':
      return (
        <div role="alert" className="w-full bg-error-50 border-[1.5px] border-error-300 rounded-lg p-5 mb-8 flex flex-col items-start gap-4 relative">
          <div className="flex items-start md:items-center gap-5 w-full">
            <div className="flex-shrink-0 text-error-500 mt-1 md:mt-0">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg md:text-xl font-bold text-text-primary mb-1">KYC Reject Ho Gaya</h3>
              <p className="text-sm text-text-secondary">
                Kuch documents reject hue hain. Neeche reasons dekh kar dobara submit karein.
              </p>
              {rejectedAt && (
                <p className="text-xs text-text-muted mt-1">Rejected: {formatRelativeTime(rejectedAt)}</p>
              )}
            </div>
          </div>
          
          {(rejectionReasons && rejectionReasons.length > 0) && (
            <div className="w-full bg-error-100/50 rounded-md p-4 mt-2">
              <h4 className="text-sm font-semibold text-error-700 mb-2">Rejection Reasons:</h4>
              <ul className="list-disc pl-5 space-y-1">
                {rejectionReasons.map((reason, idx) => (
                  <li key={idx} className="text-sm text-error-700">{reason}</li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="w-full mt-2">
            <button
              onClick={onScrollToDocs}
              className="w-full h-10 bg-error-600 hover:bg-error-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Dobara Submit Ke Liye Documents Upload Karein
            </button>
          </div>
        </div>
      );
      
    default:
      return null;
  }
}
