const sensitiveKey = /password|token|authorization|cookie|secret|api.?key|dsn|latitude|longitude|coordinates|(?:^|_)(?:lat|lng|lon)(?:$|_)|address|phone|email|document|payload|body/i;

export function redactDiagnosticText(value: string): string {
  return value
    .replace(/(?:\{|\[\s*(?:\{|"))[\s\S]*$/g, '[structured data omitted]')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/((?:password|token|secret|api[_-]?key|authorization)\s*["']?\s*[=:]\s*["']?)[^\s,;&"']+/gi, '$1[redacted]')
    .replace(/https?:\/\/[^\s]+/gi, '[url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .slice(0, 2000);
}

export function scrubDiagnosticValue(value: unknown, depth = 0): any {
  if (depth > 5) return '[truncated]';
  if (typeof value === 'string') return redactDiagnosticText(value);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 30).map(item => scrubDiagnosticValue(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, entry]) => [
      key, sensitiveKey.test(key) ? '[redacted]' : scrubDiagnosticValue(entry, depth + 1),
    ]));
  }
  return undefined;
}

export function scrubCrashEvent(event: any): any {
  delete event.request;
  delete event.extra;
  delete event.server_name;
  delete event.transaction;
  event.user = /^\d{1,20}$/.test(String(event.user?.id || '')) ? { id: String(event.user.id) } : undefined;
  if (event.message) event.message = redactDiagnosticText(event.message);
  if (event.logentry) event.logentry = { formatted: redactDiagnosticText(event.logentry.formatted || '') };
  for (const exception of event.exception?.values || []) {
    if (exception.value) exception.value = redactDiagnosticText(exception.value);
    for (const frame of exception.stacktrace?.frames || []) delete frame.vars;
  }
  for (const frame of event.stacktrace?.frames || []) delete frame.vars;
  event.tags = Object.fromEntries(Object.entries(event.tags || {})
    .filter(([key]) => ['app_version', 'build_number', 'runtime_version', 'ota_update_id', 'screen', 'capture_mode', 'installation_id', 'app_session_id', 'qa_smoke'].includes(key))
    .map(([key, value]) => [key, scrubDiagnosticValue(value)]));
  event.contexts = Object.fromEntries(Object.entries(event.contexts || {})
    .filter(([key]) => ['app', 'device', 'os', 'runtime', 'react_native_context'].includes(key))
    .map(([key, value]) => [key, scrubDiagnosticValue(value)]));
  if (event.contexts.device) {
    delete event.contexts.device.name;
    delete event.contexts.device.id;
  }
  if (event.contexts.app) delete event.contexts.app.device_app_hash;
  event.breadcrumbs = (event.breadcrumbs || []).filter((b: any) => b.category === 'app').map((b: any) => ({
    category: 'app', level: b.level, timestamp: b.timestamp,
    message: /^[a-z_.:/-]{1,80}$/i.test(b.message || '') ? b.message : '[app event]',
    // Arbitrary app data can contain customer/order details. Omit it entirely.
  }));
  return event;
}
