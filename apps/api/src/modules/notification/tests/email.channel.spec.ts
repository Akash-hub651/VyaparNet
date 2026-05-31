// Jest globals: describe, it, expect — no import needed (Jest provides them automatically)
import { htmlEscape, buildEmailHtml } from '../channels/email.channel';

/**
 * EmailChannel unit tests — Phase 13 Security Hardening (§24.3 / §24.5)
 *
 * Verifies that htmlEscape() correctly protects against HTML injection in email bodies.
 *
 * GOVERNANCE:
 * - INV-S6-23: htmlEscape() is SEPARATE from TemplateService.sanitize().
 *   htmlEscape() → Email HTML context (entity-encodes &, <, >, ", ')
 *   sanitize()   → SMS/plain-text context (strips dangerous chars)
 *   NEVER use sanitize() for HTML email variables — they would NOT be entity-encoded.
 *
 * §24.5 Validation Gate:
 *   buildEmailHtml('<script>evil</script>') → rendered as '&lt;script&gt;evil&lt;/script&gt;'
 */
describe('EmailChannel — htmlEscape (Phase 13 §24.5)', () => {
  describe('htmlEscape()', () => {
    it('escapes & to &amp; (INV-S6-23)', () => {
      expect(htmlEscape('Bread & Butter')).toBe('Bread &amp; Butter');
    });

    it('escapes < to &lt; and > to &gt; (INV-S6-23)', () => {
      expect(htmlEscape('<script>alert(1)</script>')).toBe(
        '&lt;script&gt;alert(1)&lt;/script&gt;',
      );
    });

    it('escapes " to &quot; (INV-S6-23)', () => {
      expect(htmlEscape('"quoted"')).toBe('&quot;quoted&quot;');
    });

    it("escapes ' to &#x27; (INV-S6-23)", () => {
      expect(htmlEscape("it's")).toBe('it&#x27;s');
    });

    it('escapes all 5 dangerous chars in one string', () => {
      expect(htmlEscape(`<div class="test">O'Reilly & Sons</div>`)).toBe(
        `&lt;div class=&quot;test&quot;&gt;O&#x27;Reilly &amp; Sons&lt;/div&gt;`,
      );
    });

    it('returns safe string unchanged', () => {
      expect(htmlEscape('VyaparNet Order')).toBe('VyaparNet Order');
    });
  });

  describe('buildEmailHtml() — §24.5 validation gate', () => {
    // §24.5: buildEmailHtml('<script>evil</script>') → rendered as &lt;script&gt;evil&lt;/script&gt;
    it('escapes <script> tags in title via htmlEscape (§24.5)', () => {
      const html = buildEmailHtml('<script>evil</script>', 'body text');
      expect(html).toContain('&lt;script&gt;evil&lt;/script&gt;');
      expect(html).not.toContain('<script>evil</script>');
    });

    it('escapes <script> tags in body via htmlEscape (§24.5)', () => {
      const html = buildEmailHtml('title', '<img onerror=alert(1) src=x>');
      expect(html).toContain('&lt;img onerror=alert(1) src=x&gt;');
      expect(html).not.toContain('<img onerror=');
    });

    it('escapes CTA text via htmlEscape', () => {
      const html = buildEmailHtml('title', 'body', 'https://vyaparnet.com', "<script>evil</script>");
      expect(html).toContain('&lt;script&gt;evil&lt;/script&gt;');
      expect(html).not.toContain('<script>evil</script>');
    });

    it('renders plain text safely without modification', () => {
      const html = buildEmailHtml('Order Confirmed', 'Your order VN-2026-001 is confirmed.', undefined, undefined);
      expect(html).toContain('Order Confirmed');
      expect(html).toContain('Your order VN-2026-001 is confirmed.');
    });
  });
});
