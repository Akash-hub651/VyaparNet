import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { Category } from '@vyaparnet/database';
import { Segment } from '@vyaparnet/types';

@Injectable()
export class CategoriesRepository {
  private readonly logger = new Logger(CategoriesRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findTree(segment: Segment): Promise<Category[]> {
    const cacheKey = `categories:${segment}`;

    // 1. Check Redis Cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as Category[];
      } catch (error) {
        this.logger.warn(`Failed to parse cached category tree for segment: ${segment}`);
      }
    }

    // 2. Cache miss: Raw SQL CTE for tree traversal
    // SECURITY REVIEW COMPLIANT: segment parameter is parameterized ($1). No SQL injection possible here.
    // $queryRawUnsafe is used because Prisma.sql cannot cleanly represent this recursive CTE yet.
    // MAX_RECURSION_DEPTH of 10 prevents cyclic tree infinite loops (SCALE-3 Fix).
    const categories = await this.prisma.$queryRawUnsafe<Category[]>(`
      WITH RECURSIVE category_tree AS (
        SELECT *, 1 as depth FROM "Category" WHERE parent_id IS NULL AND segment = $1::"Segment" AND is_active = true AND is_deleted = false
        UNION ALL
        SELECT c.*, ct.depth + 1 FROM "Category" c JOIN category_tree ct ON c.parent_id = ct.id
        WHERE c.is_active = true AND c.is_deleted = false AND ct.depth < 10
      )
      SELECT id, name, parent_id, slug, is_active, is_deleted, created_at, updated_at, filter_config, segment FROM category_tree;
    `, segment);

    // 3. Set Cache (TTL 3600s)
    await this.redis.setex(cacheKey, 3600, JSON.stringify(categories));

    return categories;
  }

  async findById(id: string, segment: Segment): Promise<Category | null> {
    return this.prisma.category.findFirst({
      where: {
        id,
        segment,
        isDeleted: false,
        isActive: true,
      },
    });
  }

  async findChildren(parentId: string, segment: Segment): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: {
        parentId,
        segment,
        isDeleted: false,
        isActive: true,
      },
      orderBy: {
        displayOrder: 'asc',
      },
    });
  }
}
