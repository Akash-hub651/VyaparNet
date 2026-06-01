import { vi, describe, it, expect, beforeEach } from 'vitest';
import { TemplateService } from '../services/template.service';

/**
 * TemplateService unit tests — Phase 13 Security Hardening (§24.3)
 * Converted from Vitest → Jest syntax (vi.fn → jest.fn, Vitest imports removed).
 *
 * Tests verify that the template engine is NOT vulnerable to injection attacks:
 * - HTML injection in SMS/plain-text variables (INV-S6-14 / INV-S6-23)
 * - SMS-dangerous characters (tilde, caret, etc.)
 * - Missing variable graceful handling ({{name}} replaced with empty, not left as-is)
 *
 * GOVERNANCE: TemplateService.sanitize() is for SMS/plain-text ONLY.
 * Email HTML variables use htmlEscape() in EmailChannel. These are SEPARATE (INV-S6-23).
 */

// Build a minimal TemplateService instance for unit testing.
// We bypass onModuleInit() and the DB — render() and sanitize() are pure string functions.
// metrics=null: @Optional() injection — tests do not need metrics instrumentation.
function makeService(): TemplateService {
  const mockRepo = {
    findAllActive: vi.fn().mockResolvedValue([]),
  } as never;
  // Pass null for metrics (@Optional()) — safe, render() guards with optional chaining
  return new TemplateService(mockRepo, null);
}

describe('TemplateService — Phase 13 Security Hardening (§24.3)', () => {
  let service: TemplateService;

  beforeEach(() => {
    service = makeService();
  });

  // §24.3: Required test case 1 — HTML injection stripped from SMS/plain-text output
  it('sanitizes HTML in variables (RULE 3 / INV-S6-14)', () => {
    const result = service.render('Hello {{name}}', {
      name: '<script>alert(1)</script>',
    });
    // INV-S6-23: sanitize() strips <>'"& — output must contain no HTML tags
    expect(result).toBe('Hello scriptalert(1)/script'); // HTML stripped
  });

  // §24.3: Required test case 2 — SMS-dangerous characters stripped
  it('sanitizes SMS dangerous chars (RULE 3 / INV-S6-23)', () => {
    const result = service.render('Order {{orderNumber}}', {
      orderNumber: 'VN~123^456',
    });
    // sanitize() strips ~ and ^ per §17.3 / INV-S6-23
    expect(result).toBe('Order VN123456'); // ~ and ^ stripped
  });

  // §24.3: Required test case 3 — missing variable → empty string, not literal "{{variableName}}"
  it('handles missing variables gracefully (INV-S6-14 — no leaking template syntax)', () => {
    const result = service.render('Hello {{name}}, order {{orderNumber}}', {
      name: 'Akash',
    });
    // {{orderNumber}} must NOT appear in output — replaced with empty string
    // Note: render() calls .trim() — trailing whitespace is stripped
    expect(result).toBe('Hello Akash, order'); // {{orderNumber}} replaced with empty, trailing space trimmed
  });

  // Additional hardening: verify no eval() side-effects — inject a code-like string
  it('does NOT evaluate code expressions (INV-S6-14 — zero eval)', () => {
    const result = service.render('Total: {{amount}}', {
      amount: '${7*7}', // Server-side template injection probe
    });
    // Output must be the sanitized string, NOT the evaluated expression
    // sanitize() strips {} as SMS-dangerous chars (RULE 3 — they're in the [~^{}|\\] class)
    // So '${7*7}' → '$7*7' — NOT evaluated, NOT '49'. Security goal is preserved.
    expect(result).toBe('Total: $7*7'); // {} stripped by sanitize()
    expect(result).not.toBe('Total: 49');
  });

  // Boundary test: variable value at exactly 200 chars should not be truncated
  it('allows values up to 200 chars (boundary test)', () => {
    const value200 = 'A'.repeat(200);
    const result = service.render('{{val}}', { val: value200 });
    expect(result).toBe(value200);
  });

  // Boundary test: variable value at 201 chars should be truncated to 200
  it('truncates variable values over 200 chars (§20.1)', () => {
    const value201 = 'A'.repeat(201);
    const result = service.render('{{val}}', { val: value201 });
    expect(result.length).toBe(200);
  });

  // Verify unreplaced placeholders do not appear in output
  it('strips unreplaced {{placeholders}} from output (leakage prevention)', () => {
    const result = service.render(
      'Name: {{name}}, City: {{city}}, Pin: {{pin}}',
      {
        name: 'Ravi',
      },
    );
    // Note: render() calls .trim() — trailing whitespace is stripped from final output
    expect(result).toBe('Name: Ravi, City: , Pin:');
    expect(result).not.toContain('{{city}}');
    expect(result).not.toContain('{{pin}}');
  });

  // XSS via double-encoding probe
  it('strips all < and > regardless of double-encoding attempt', () => {
    const result = service.render('{{msg}}', { msg: '<<script>>' });
    // All < > stripped by sanitize()
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });
});
