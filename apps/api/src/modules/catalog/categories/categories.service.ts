import { Injectable, NotFoundException } from '@nestjs/common';
import { CategoriesRepository } from './categories.repository';
import { Segment, CategoryTreeResponse } from '@vyaparnet/types';
import { Category } from '@vyaparnet/database';

@Injectable()
export class CategoriesService {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  async getTree(segment: Segment): Promise<CategoryTreeResponse[]> {
    const flatCategories = await this.categoriesRepository.findTree(segment);
    return this.buildTree(flatCategories);
  }

  async getById(id: string, segment: Segment): Promise<CategoryTreeResponse> {
    const category = await this.categoriesRepository.findById(id, segment);
    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found in segment ${segment}`);
    }
    
    // Convert to response type
    return this.mapToResponse(category);
  }

  private buildTree(flatCategories: Category[]): CategoryTreeResponse[] {
    const map = new Map<string, CategoryTreeResponse>();
    const roots: CategoryTreeResponse[] = [];

    // First pass: create map of all items
    for (const cat of flatCategories) {
      map.set(cat.id, { ...this.mapToResponse(cat), children: [] });
    }

    // Second pass: build the tree
    for (const cat of flatCategories) {
      const node = map.get(cat.id);
      if (!node) continue;

      if (cat.parentId) {
        const parent = map.get(cat.parentId);
        if (parent) {
          // Initialize children array if somehow undefined
          if (!parent.children) parent.children = [];
          parent.children.push(node);
        } else {
          // Parent is missing from the result set (maybe inactive/deleted), treat as root or ignore
          // Treating as root for safety if it was returned by query
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    // Sort children by displayOrder
    this.sortTree(roots);

    return roots;
  }

  private sortTree(nodes: CategoryTreeResponse[]) {
    nodes.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        this.sortTree(node.children);
      }
    }
  }

  private mapToResponse(cat: Category): CategoryTreeResponse {
    return {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      segment: cat.segment as Segment,
      parentId: cat.parentId,
      imageUrl: cat.imageUrl,
      displayOrder: cat.displayOrder,
      isActive: cat.isActive,
      filterConfig: cat.filterConfig,
    };
  }
}
