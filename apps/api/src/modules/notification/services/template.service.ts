import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { NotificationType } from '@vyaparnet/database';
import { NotificationTemplateRepository } from '../repositories/notification-template.repository';
import { NotificationMetricsService } from './notification-metrics.service';

/**
 * CompiledTemplate — the in-memory cached representation of a NotificationTemplate.
 *
 * Compiled once at startup from DB. Immutable for the lifetime of the process.
 * INV-S6-14: Template render is string substitution ONLY. Zero eval().
 */
export interface CompiledTemplate {
  title: string;
  body: string;
  type: NotificationType;
}

/**
 * TemplateService — Phase 9 full implementation.
 *
 * GOVERNANCE:
 * - INV-S6-14: render() uses replaceAll() ONLY — never eval(), new Function(), or template literals.
 * - Performance: onModuleInit() pre-compiles ALL templates into in-memory Map.
 *   getTemplate() is O(1) synchronous. NO DB read per notification.
 * - Fallback: Unknown template → returns generic message. Never crashes the worker.
 * - sanitize() is for SMS/plain-text values ONLY.
 *   htmlEscape() (in EmailChannel) is for HTML email variables ONLY.
 *   These are SEPARATE functions (INV-S6-23). NEVER use sanitize() for HTML email variables.
 *
 * FIX-6: NotificationMetricsService injected as @Optional() — observes
 *   notification_template_render_ms histogram on every render() call.
 *   @Optional() keeps unit tests working without mocking the metrics service.
 */
@Injectable()
export class TemplateService implements OnModuleInit {
  private readonly logger = new Logger(TemplateService.name);

  // In-memory compiled template cache — loaded once at startup (INV-S6-14-note: SC.5)
  // Key format: `${template.name}_hi` or `${template.name}_en`
  private readonly templateCache = new Map<string, CompiledTemplate>();

  constructor(
    private readonly notificationTemplateRepository: NotificationTemplateRepository,
    // FIX-6: @Optional() so tests that don't provide metrics still work.
    // In production, NotificationModule always provides NotificationMetricsService.
    @Optional() private readonly metrics: NotificationMetricsService | null,
  ) {}

  /**
   * Called by NestJS at module initialization.
   * Loads all active templates from DB into templateCache.
   * Subsequent getTemplate() calls are O(1) synchronous Map lookups.
   */
  async onModuleInit(): Promise<void> {
    await this.compileAllTemplates();
    this.logger.log(`TemplateService: ${this.templateCache.size} templates compiled`);
  }

  /**
   * Fetch all active templates from DB and populate the in-memory cache.
   * Called only once at startup — never called per notification send.
   */
  private async compileAllTemplates(): Promise<void> {
    const templates = await this.notificationTemplateRepository.findAllActive();
    for (const template of templates) {
      // Cache both language variants for each template
      this.templateCache.set(`${template.name}_hi`, {
        title: template.titleHi,
        body: template.bodyHi,
        type: template.type,
      });
      this.templateCache.set(`${template.name}_en`, {
        title: template.titleEn,
        body: template.bodyEn,
        type: template.type,
      });
    }
  }

  /**
   * Get a compiled template by name and language.
   * SYNCHRONOUS — O(1) cache lookup. No DB access.
   *
   * Fallback chain:
   *   1. Requested language key
   *   2. Hindi fallback (`${name}_hi`)
   *   3. Generic fallback message (TEMPLATE_NOT_FOUND log emitted)
   *
   * INV-S6-14 / FOOTGUN-9-C: Never throws. Worker must never crash on a missing template.
   */
  getTemplate(name: string, language: 'hi' | 'en'): CompiledTemplate {
    const key = `${name}_${language}`;
    const template =
      this.templateCache.get(key) ??
      this.templateCache.get(`${name}_hi`); // Fallback to Hindi

    if (!template) {
      this.logger.error({ templateName: name, language }, 'TEMPLATE_NOT_FOUND');
      // Fallback: generic safe message — never crash worker (FOOTGUN-9-C avoidance)
      return {
        title: language === 'hi' ? 'VyaparNet se update' : 'Update from VyaparNet',
        body: language === 'hi'
          ? 'Aapke account mein kuch hua hai.'
          : 'Something happened in your account.',
        type: NotificationType.SYSTEM,
      };
    }
    return template;
  }

  /**
   * Render a template string by substituting {{variable}} tokens.
   *
   * INV-S6-14: Safe string substitution ONLY.
   * - Uses replaceAll() against fixed `{{key}}` patterns.
   * - ALL variable values are sanitized by sanitize() before injection.
   * - Any unreplaced {{variable}} tokens are stripped to prevent leaking template syntax.
   * - Zero eval(). Zero new Function(). Zero dynamic template literals.
   *
   * FIX-6: Observes notification_template_render_ms histogram for P95 latency visibility.
   *
   * NOTE: sanitize() is for SMS/plain-text. For HTML email, use htmlEscape() in EmailChannel.
   * These are SEPARATE functions (INV-S6-23). Do NOT use sanitize() for HTML email variables.
   */
  render(template: string, variables: Record<string, string>): string {
    // FIX-6: Start timer for notification_template_render_ms histogram
    const renderStart = Date.now();

    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      // INV-S6-14: sanitize() strips HTML/SMS-dangerous chars; caps at 200 chars per variable
      const sanitized = this.sanitize(value);
      result = result.replaceAll(`{{${key}}}`, sanitized);
    }

    // Catch any unreplaced variables — replace with empty string (never leave {{variableName}} in message)
    result = result.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, '');

    // FIX-6: Observe render latency — swallow if metrics unavailable (test env, startup race)
    try {
      this.metrics?.notificationTemplateRenderMs.observe(Date.now() - renderStart);
    } catch {
      // swallow — metrics failure must never crash the render path
    }

    return result.trim();
  }

  /**
   * Sanitize a plain-text variable value for SMS/In-App contexts.
   *
   * INV-S6-23 / RULE 3: This is NOT htmlEscape(). These are SEPARATE functions.
   * - sanitize() → SMS and plain-text: strips HTML chars + SMS-dangerous chars, caps at 200 chars
   * - htmlEscape() → Email HTML: replaces & < > " ' with entities (lives in EmailChannel)
   *
   * FOOTGUN-9-B avoidance: Never call sanitize() for HTML email template variables.
   */
  private sanitize(value: string): string {
    return String(value)
      .replace(/[<>'"&]/g, '')          // Strip HTML-dangerous chars (INV-S6-23)
      .replace(/[~^{}|\\]/g, '')        // Strip SMS-dangerous chars
      .slice(0, 200);                   // Max 200 chars per variable (§20.1)
  }
}
