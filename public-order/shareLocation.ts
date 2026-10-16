const tokenPattern = /^(?:[A-Za-z0-9_-]{12}|[A-Za-z0-9_-]{43})$/;

/** Support old fragment links and new messenger-preview-safe paths. */
export function shareTokenFromLocation(location: { pathname: string; hash: string }): string | null {
  if (location.hash) {
    const token = location.hash.slice(1);
    return tokenPattern.test(token) ? token : null;
  }
  const match = /^\/order\/([^/]+)\/?$/.exec(location.pathname);
  return match && tokenPattern.test(match[1]) ? match[1] : null;
}
