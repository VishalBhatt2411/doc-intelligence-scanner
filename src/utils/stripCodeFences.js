function stripCodeFences(raw) {
  let s = (raw == null ? '' : String(raw)).trim();
  if (s.startsWith('```')) {
    const firstBreak = s.indexOf('\n');
    s = firstBreak >= 0 ? s.substring(firstBreak + 1) : s;
    if (s.endsWith('```')) {
      s = s.substring(0, s.lastIndexOf('```'));
    }
  }
  return s.trim();
}

module.exports = { stripCodeFences };
