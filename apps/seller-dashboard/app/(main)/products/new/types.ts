/**
 * Types for Screen 05 (Product Create / Edit)
 */

export interface UploadedMedia {
  mediaId: string;
  url: string;
  mediaClass: "PRODUCT_IMAGE" | "SWATCH";
  name: string;
}

export interface DraftData {
  step: number;
  name: string;
  categoryId: string;
  description: string;
  tags: string;
  segmentAttributes: Record<string, string>;
  basePrice: string;
  mrp: string;
  moq: string;
  unit: string;
  hsnCode: string;
  gstPercent: string;
  initialStock: string;
  lowStockAlert: string;
  mediaIds: string[];
}

export const EMPTY_DRAFT: DraftData = {
  step: 1,
  name: "",
  categoryId: "",
  description: "",
  tags: "",
  segmentAttributes: {},
  basePrice: "",
  mrp: "",
  moq: "1",
  unit: "piece",
  hsnCode: "",
  gstPercent: "",
  initialStock: "",
  lowStockAlert: "",
  mediaIds: [],
};
