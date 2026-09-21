// Only application-managed source assets or embedded raster diagrams are valid.
// Stored/client-supplied references must not introduce external tracking URLs,
// executable links, SVG data documents or protocol-relative URLs.
export function safeSourceUrl(value: string) {
  if (/^data:image\/(?:png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/.test(value))
    return true;
  if (/^\/source-questions\/[A-Za-z0-9_.-]+\.png$/.test(value)) return true;
  if (!value.startsWith('/api/source-assets?') || /[\\\r\n]/.test(value))
    return false;
  const url = new URL(value, 'https://studio.invalid');
  const name = url.searchParams.get('name');
  return (
    url.pathname === '/api/source-assets' &&
    !url.hash &&
    [...url.searchParams.keys()].length === 1 &&
    !!name &&
    name.length <= 300 &&
    !name.includes('..') &&
    /^[A-Za-z0-9_./-]+$/.test(name)
  );
}
