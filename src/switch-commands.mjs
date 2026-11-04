export function parseVerifierCommand(body, name = 'crossrepo-verifier') {
  if (typeof body !== 'string' || body.length > 1000) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const text = body.trim().replace(new RegExp(`^@${escaped}[\\s,:]+`, 'i'), '').trim().toLowerCase();
  return text === 'status' || text === 'check' ? text : null;
}
