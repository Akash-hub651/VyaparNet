import { Segment } from '../enums';

export interface SearchParams {
  tsQuery: string;
  segment: Segment;
  limit: number;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  cursor?: {
    createdAt: Date;
    id: string;
  };
}

export interface SearchResult {
  id: string;
  name: string;
  slug: string;
  basePrice: number;
  segment: Segment;
  rank: number;
  lastIndexedAt?: Date | null;
  thumbnailUrl?: string | null;
}

export interface CategorySuggestion {
  id: string;
  name: string;
  slug: string;
  segment: Segment;
}

export interface ProductSuggestion {
  id: string;
  name: string;
  slug: string;
  thumbnailUrl?: string;
}

export interface SearchSuggestionResponse {
  queries: string[];
  categories: CategorySuggestion[];
  products: ProductSuggestion[];
}

export interface SearchableProduct {
  id: string;
  name: string;
  description?: string | null;
  segmentAttributes?: any;
  status: string;
  segment: Segment;
}

export interface SearchEngine {
  search(params: SearchParams): Promise<SearchResult[]>;
  suggest(query: string, segment: Segment): Promise<SearchSuggestionResponse>;
  index(product: SearchableProduct): Promise<void>;
  deindex(productId: string): Promise<void>;
  rebuildIndex(segment: Segment): Promise<void>;
}
