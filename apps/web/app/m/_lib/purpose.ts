export function parseHeadlineToPurposeParts(
  headline: string,
  presets: readonly string[],
): { purposePresets: string[]; purposeText: string } {
  const normalized = headline.trim();
  if (!normalized) {
    return { purposePresets: [], purposeText: '' };
  }

  const knownPresets = new Set<string>(presets);
  const idx = normalized.indexOf(' — ');
  const presetPart = idx > 0 ? normalized.slice(0, idx) : normalized;
  const restPart = idx > 0 ? normalized.slice(idx + 3).trim() : '';
  const maybePresets = presetPart
    .split(' · ')
    .map((value) => value.trim())
    .filter(Boolean);

  if (
    maybePresets.length > 0 &&
    maybePresets.every((value) => knownPresets.has(value))
  ) {
    return { purposePresets: maybePresets, purposeText: restPart };
  }

  return { purposePresets: [], purposeText: normalized };
}
