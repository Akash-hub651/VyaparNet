import React, { useState } from 'react';
import { FormModal } from '../../../../components/ui/Modal';
import { Button } from '../../../../components/ui/Button';
import { useToast } from '../../../../components/ui/Toast';
import { useSellerPermissions } from '../../../../lib/hooks/useSellerPermissions';
import { confirmDispatchProof, getDispatchProofUploadUrl } from '../../../../lib/api/orders.client';

export interface ShippingModalProps {
  orderId: string;
  orderNumber: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ShippingModal({ orderId, orderNumber, isOpen, onClose, onSuccess }: ShippingModalProps) {
  const { addToast } = useToast();
  const perms = useSellerPermissions();
  const [carrier, setCarrier] = useState('Delhivery');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [shipDate, setShipDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 5 * 1024 * 1024) {
        addToast({ variant: 'error', message: 'File 5MB se choti honi chahiye' });
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingNumber.trim()) {
      addToast({ variant: 'error', message: 'Tracking number zaroori hai' });
      return;
    }
    if (!file) {
      addToast({ variant: 'error', message: 'Dispatch proof upload karna zaroori hai' });
      return;
    }

    setIsSubmitting(true);
    try {
      // Step 1: Get S3 upload URL (mock)
      const uploadUrlRes = await getDispatchProofUploadUrl(orderId, file.name, file.type, 'mock-token');
      if (!uploadUrlRes.success) {
        throw new Error(uploadUrlRes.error || 'Upload URL nahi mili');
      }
      if (!uploadUrlRes.data) {
        throw new Error('Upload URL response missing');
      }

      // Step 2: Simulate actual file upload to S3 (in production this would be a PUT to uploadUrlRes.data.uploadUrl)
      await new Promise(resolve => setTimeout(resolve, 800)); 

      // Step 3: Confirm dispatch proof and ship order
      const confirmRes = await confirmDispatchProof(
        orderId, 
        uploadUrlRes.data.key, 
        { carrier, trackingNumber, shipDate }, 
        'mock-token'
      );

      if (!confirmRes.success) {
        throw new Error(confirmRes.error);
      }

      addToast({ variant: 'success', message: `${orderNumber} ship mark ho gaya!` });
      onSuccess();
      onClose();
    } catch (err: any) {
      addToast({ variant: 'error', message: err.message || 'Kuch galat ho gaya. Phir try karein.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormModal isOpen={isOpen} onClose={onClose} title={`Ship Order ${orderNumber}`} size="md">
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div>
          <label htmlFor="carrier" className="block text-sm font-medium text-text-primary mb-1">
            Carrier / Courier
          </label>
          <select
            id="carrier"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            className="w-full px-3 py-2 text-base sm:text-sm border border-border-default rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface-default"
            disabled={isSubmitting}
          >
            <option value="Delhivery">Delhivery</option>
            <option value="BlueDart">BlueDart</option>
            <option value="EcomExpress">EcomExpress</option>
            <option value="Shadowfax">Shadowfax</option>
            <option value="Xpressbees">Xpressbees</option>
            <option value="Other">Other / Self Ship</option>
          </select>
        </div>

        <div>
          <label htmlFor="trackingNumber" className="block text-sm font-medium text-text-primary mb-1">
            Tracking Number
          </label>
          <input
            id="trackingNumber"
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="e.g. 1234567890"
            className="w-full px-3 py-2 text-base sm:text-sm border border-border-default rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface-default"
            disabled={isSubmitting}
            required
          />
        </div>

        <div>
          <label htmlFor="shipDate" className="block text-sm font-medium text-text-primary mb-1">
            Ship Date
          </label>
          <input
            id="shipDate"
            type="date"
            value={shipDate}
            onChange={(e) => setShipDate(e.target.value)}
            className="w-full px-3 py-2 text-base sm:text-sm border border-border-default rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface-default"
            disabled={isSubmitting}
            required
            max={new Date().toISOString().split('T')[0]} // Cannot ship in future
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Dispatch Proof (Image/PDF)
          </label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-border-default border-dashed rounded-md">
            <div className="space-y-1 text-center">
              <svg className="mx-auto h-12 w-12 text-neutral-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="flex justify-center text-sm text-text-secondary">
                <label htmlFor="file-upload" className="relative cursor-pointer bg-surface-default rounded-md font-medium text-brand-600 hover:text-brand-800 focus-within:outline-none focus-within:ring-2 focus-within:ring-brand-500">
                  <span>Upload a file</span>
                  <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept="image/*,.pdf" disabled={isSubmitting} />
                </label>
              </div>
              <p className="text-xs text-text-muted">
                {file ? file.name : "PNG, JPG, PDF up to 5MB"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-4 border-t border-border-default">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting} disabled={isSubmitting || perms.isSuspended}>
            Confirm Shipment
          </Button>
        </div>
      </form>
    </FormModal>
  );
}
