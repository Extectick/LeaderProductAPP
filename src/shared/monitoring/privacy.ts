const secretKey = /password|token|authorization|cookie|secret|api.?key|dsn|latitude|longitude|coordinates|(?:^|_)(?:lat|lng|lon)(?:$|_)|address|phone|email|document|payload|body/i;

export function redactDiagnosticText(value: string): string {
  return value
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/((?:password|token|secret|api[_-]?key)\s*[=:]\s*)[^\s,;&]+/gi, '$1[redacted]')
    .replace(/https?:\/\/[^\s]+/gi, '[url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .slice(0, 2000);
}

export function scrubDiagnosticValue(value: unknown, depth = 0): any {
  if (depth > 6) return '[truncated]';
  if (typeof value === 'string') return redactDiagnosticText(value);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => scrubDiagnosticValue(entry, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 60).map(([key, entry]) => [
      key, secretKey.test(key) ? '[redacted]' : scrubDiagnosticValue(entry, depth + 1),
    ]));
  }
  return undefined;
}

export function scrubCrashEvent(event: any): any {
  // No arbitrary request, extra context or breadcrumbs from network/console.
  delete event.request;
  delete event.extra;
  if (event.user) event.user = event.user.id ? { id: String(event.user.id) } : undefined;
  if (event.message) event.message = redactDiagnosticText(event.message);
  if (event.logentry) event.logentry = { formatted: redactDiagnosticText(event.logentry.formatted || '') };
  if (event.exception?.values) {
    for (const exception of event.exception.values) {
      if (exception.value) exception.value = redactDiagnosticText(exception.value);
      for (const frame of exception.stacktrace?.frames || []) delete frame.vars;
    }
  }
  event.tags = scrubDiagnosticValue(event.tags);
  if (event.contexts) {
    event.contexts = Object.fromEntries(Object.entries(event.contexts)
      .filter(([key]) => ['app', 'device', 'os', 'runtime', 'react_native_context'].includes(key)));
    if (event.contexts.device) delete event.contexts.device.name;
  }
  event.breadcrumbs = (event.breadcrumbs || []).filter((b: any) => b.category === 'app').map((b: any) => ({
    ...b, message: redactDiagnosticText(b.message || ''), data: scrubDiagnosticValue(b.data),
  }));
  return event;
}
