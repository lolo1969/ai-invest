import { marketDataService } from '../../services/marketData';

const HIGH_RELEVANCE_PATTERN =
  /(krieg|war|conflict|sanktion|inflat|zins|rate|rezession|börse|stock|oil|öl|fed|ecb|ezb|gdp|bip|trade|zoll|tariff|crash|rally|default|schulden|debt|bank|energy|energie|nuclear|nuklear|attack|angriff|pandem|climate|klima)/i;

/**
 * Lädt aktuelle Markt-News und baut einen formatierten Prompt-Kontext darauf auf.
 * Gibt immer einen String zurück – bei Fehler einen Fallback-Hinweis ohne erfundene Fakten.
 */
export async function buildLiveNewsContext(
  marketDataApiKey: string,
  label = 'Analyse'
): Promise<string> {
  const fallback = `
═══════════════════════════════════════
🗞️ LIVE-NEWS-SNAPSHOT (${label}):
═══════════════════════════════════════
Keine Live-News verfügbar.

STRIKT VERBOTEN:
- Erfinde KEINE geopolitischen Ereignisse, Kriege, Konflikte oder Makro-Entwicklungen.
- Behaupte NICHT, dass bestimmte Kriege andauern, Zentralbanken bestimmte Entscheidungen getroffen haben, oder geopolitische Spannungen bestehen – du hast KEINE aktuellen Informationen darüber.
- Schreibe im marketSummary EXPLIZIT: "Hinweis: Keine aktuellen Nachrichten verfügbar. Die Analyse basiert ausschließlich auf technischen Indikatoren und Kursdaten. Geopolitische/makroökonomische Einschätzungen können nicht gegeben werden."
- Beschränke die Analyse auf technische Indikatoren, Kursdaten und Chartmuster.
`;

  try {
    marketDataService.setApiKey(marketDataApiKey || '');
    const rawNews = await marketDataService.getMarketNews();

    const normalized = (rawNews || [])
      .map((n: any) => {
        const headline = (n?.headline || n?.title || '').replace(/\s+/g, ' ').trim();
        const summary = (n?.summary || '').replace(/\s+/g, ' ').trim();
        const source = (n?.source || 'Unbekannt').toString();
        const epoch = typeof n?.datetime === 'number' ? n.datetime * 1000 : NaN;
        const d = Number.isFinite(epoch) ? new Date(epoch) : new Date();
        const dateLabel = d.toLocaleString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        const text = `${headline} ${summary}`.trim();
        let score = 1;
        if (HIGH_RELEVANCE_PATTERN.test(text)) score += 3;
        return { headline, source, dateLabel, score };
      })
      .filter((n) => n.headline.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    if (normalized.length === 0) return fallback;

    const newsLines = normalized
      .map((n) => `- ${n.dateLabel} | ${n.source}: ${n.headline}`)
      .join('\n');

    return `
═══════════════════════════════════════
🗞️ LIVE-NEWS-SNAPSHOT (${label}):
═══════════════════════════════════════
${newsLines}

VERBINDLICHE REGELN FÜR DIE ANALYSE:
- Nutze diese Headlines als primäre tagesaktuelle Ereignisbasis für Makro-/Geopolitik.
- Nenne die 1-3 wichtigsten aktuellen Konflikte/Ereignisse EXPLIZIT beim Namen (nicht nur "geopolitische Spannungen").
- Wenn ein Ereignis im Snapshot enthalten ist, das das Portfolio beeinflusst (z.B. Energie, Handel, Lieferketten, regionale Konflikte), MUSS es im Markt-/Makro-Abschnitt konkret erwähnt werden.
- Erwähne NUR Geopolitik/Makro-Ereignisse die in den obigen Headlines belegt sind. Erfinde KEINE zusätzlichen Konflikte oder Entwicklungen!
- Trenne bestätigte News-Fakten klar von Schlussfolgerungen für das Portfolio.
`;
  } catch (e) {
    console.warn(`[${label}] Live-News konnten nicht geladen werden:`, e);
    return fallback;
  }
}
