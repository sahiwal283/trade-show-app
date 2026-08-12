/**
 * Human-readable text for the advisories Midas returns on an expense write.
 *
 * These arrive as `midasWarnings` on the created/updated expense. They are
 * non-blocking — the expense saved either way — but they must be shown.
 * Trade Show deleted its own duplicate detection precisely because Midas runs
 * that check and reports it here, so discarding these silently would remove
 * duplicate detection from the product entirely.
 */

export interface MidasWarning {
  code: string;
  message?: string;
  matches?: Array<{ id?: string; merchant?: string; amount?: number; date?: string }>;
}

function describeMatch(m: NonNullable<MidasWarning['matches']>[number]): string {
  const parts = [m.merchant, typeof m.amount === 'number' ? `$${m.amount.toFixed(2)}` : null, m.date];
  return parts.filter(Boolean).join(' · ');
}

/** One toast-ready string per warning. Unknown codes fall back to Midas's own message. */
export function describeMidasWarnings(warnings: unknown): string[] {
  if (!Array.isArray(warnings)) return [];

  return warnings.flatMap((raw) => {
    const w = raw as MidasWarning;
    if (!w || typeof w.code !== 'string') return [];

    if (w.code === 'POSSIBLE_DUPLICATE') {
      const matches = (w.matches || []).map(describeMatch).filter(Boolean);
      return matches.length
        ? [`Possible duplicate of: ${matches.join('; ')}. Saved anyway — review if unintended.`]
        : ['This looks like a possible duplicate. Saved anyway — review if unintended.'];
    }

    if (w.code === 'CATEGORY_FALLBACK') {
      return [
        w.message ||
          'That category was not recognised, so it was filed under "Other". You can change it in Midas.',
      ];
    }

    // Unknown code — surface rather than swallow, so a new Midas warning is
    // visible to users before we have specific copy for it.
    return [w.message || `Midas reported: ${w.code}`];
  });
}
