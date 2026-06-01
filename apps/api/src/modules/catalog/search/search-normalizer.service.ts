import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class SearchNormalizerService implements OnModuleInit {
  private readonly logger = new Logger(SearchNormalizerService.name);
  private synonyms: Map<string, string[]> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.loadSynonyms();
    // In a real env, we might reload every 15 min or subscribe to config events.
    setInterval(() => this.loadSynonyms(), 15 * 60 * 1000);
  }

  private async loadSynonyms() {
    this.logger.debug('Loading search synonyms from config...');

    try {
      const dbSynonyms = await this.prisma.appConfig.findMany({
        where: { key: { startsWith: 'search_synonym_' } },
      });

      if (dbSynonyms.length > 0) {
        const parsedSynonyms = new Map<string, string[]>();
        for (const config of dbSynonyms) {
          const key = config.key.replace('search_synonym_', '');
          const values = config.value.split(',').map((v) => v.trim());
          parsedSynonyms.set(key, values);
        }
        this.synonyms = parsedSynonyms;
        return;
      }
    } catch (e) {
      this.logger.error('Failed to load synonyms from DB', e);
    }

    // Fallback if DB fetch fails or is empty
    const initialSynonyms = {
      kurti: ['kurtee', 'kurta set', 'kurta-set'],
      saree: ['sari', 'sarees'],
      brake: ['break', 'breakes'],
      splendor: ['splender', 'splendour'],
    };
    this.synonyms = new Map(Object.entries(initialSynonyms));
  }

  /**
   * Normalizes a raw string and converts it into a Postgres tsquery string.
   */
  normalizeAndBuildTsQuery(rawQuery: string): string {
    if (!rawQuery || rawQuery.trim() === '') {
      return '';
    }

    // 1. toLowerCase().trim()
    let query = rawQuery.toLowerCase().trim();

    // 2. Remove special chars
    query = query.replace(/[^\w\s-]/g, '');

    // 3. Split into terms
    const terms = query.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return '';

    // 4 & 5. Synonym expansion & Build tsquery
    const tsQueryParts = terms.map((term, index) => {
      let currentTermClause = term;
      const isLastTerm = index === terms.length - 1;

      // Expand synonyms
      const synonyms = this.synonyms.get(term) || [];
      if (synonyms.length > 0) {
        const expandedTerms = [term, ...synonyms].map((t) => {
          // If a synonym has spaces (e.g., 'kurta set'), we should ideally handle it,
          // but for simplicity we replace space with AND operator.
          return t.split(' ').join(' & ');
        });
        currentTermClause = `(${expandedTerms.join(' | ')})`;
      }

      // 6. Prefix last term with :* for prefix matching (suggestions/autocomplete)
      if (isLastTerm && !currentTermClause.includes('|')) {
        currentTermClause = `${currentTermClause}:*`;
      } else if (isLastTerm && currentTermClause.includes('|')) {
        // apply :* to all options inside the OR clause
        const expandedTerms = [term, ...synonyms].map((t) => {
          const parts = t.split(' ');
          parts[parts.length - 1] = `${parts[parts.length - 1]}:*`;
          return parts.join(' & ');
        });
        currentTermClause = `(${expandedTerms.join(' | ')})`;
      }

      return currentTermClause;
    });

    return tsQueryParts.join(' & ');
  }
}
