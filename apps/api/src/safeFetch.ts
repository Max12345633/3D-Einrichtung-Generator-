import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Abruf fremder URLs im Auftrag von Nutzern – mit Schutz gegen SSRF:
 *  - nur http/https, Standard-Ports, keine Zugangsdaten in der URL
 *  - alle aufgelösten IP-Adressen müssen öffentlich sein (kein localhost, 10.x, 169.254.x – Cloud-Metadaten! – usw.)
 *  - Weiterleitungen werden manuell verfolgt und jedes Ziel erneut geprüft
 *  - Zeitlimit und Größenlimit für die Antwort
 *
 * Restrisiko: DNS-Rebinding zwischen Prüfung und Verbindung. Für Produktion die Verbindung auf die
 * geprüfte IP festnageln (undici Agent mit eigenem lookup) – siehe docs/ARCHITEKTUR.md.
 */

export type LookupFn = (hostname: string) => Promise<string[]>;

export interface SafeFetchOptions {
  maxBytes: number;
  timeoutMs?: number;
  accept?: string;
  fetchImpl?: typeof fetch;
  lookup?: LookupFn;
  /** Nur für lokale Tests (Fixture-Server auf 127.0.0.1) – niemals in Produktion */
  allowPrivate?: boolean;
  maxRedirects?: number;
}

export class FetchBlockedError extends Error {}
export class UpstreamError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const defaultLookup: LookupFn = async (hostname) => (await dnsLookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number, number, number];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    const mapped = /^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return (
      lower === "::" || lower === "::1" ||
      /^f[cd][0-9a-f]{2}:/.test(lower) || // fc00::/7
      /^fe[89ab][0-9a-f]:/.test(lower) || // fe80::/10
      /^ff[0-9a-f]{2}:/.test(lower) // Multicast
    );
  }
  return true; // keine gültige IP → sicherheitshalber blockieren
}

export async function assertPublicUrl(raw: string, opts: Pick<SafeFetchOptions, "lookup" | "allowPrivate">): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchBlockedError("Ungültige Adresse");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchBlockedError("Nur http- und https-Links sind erlaubt");
  if (url.username || url.password) throw new FetchBlockedError("Links mit Zugangsdaten sind nicht erlaubt");
  if (opts.allowPrivate) return url;
  if (url.port && url.port !== "80" && url.port !== "443") throw new FetchBlockedError("Nur Standard-Ports sind erlaubt");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new FetchBlockedError("Interne Adressen sind nicht erlaubt");
  }
  const addresses = isIP(host) ? [host] : await (opts.lookup ?? defaultLookup)(host).catch(() => {
    throw new FetchBlockedError("Die Adresse konnte nicht aufgelöst werden");
  });
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new FetchBlockedError("Interne Adressen sind nicht erlaubt");
  return url;
}

export interface SafeResponse {
  url: string;
  contentType: string;
  body: Uint8Array<ArrayBuffer>;
}

export async function safeFetch(raw: string, opts: SafeFetchOptions): Promise<SafeResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let current = raw;
  for (let hop = 0; hop <= (opts.maxRedirects ?? 4); hop++) {
    const url = await assertPublicUrl(current, opts);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000);
    try {
      const res = await fetchImpl(url, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; RaumwerkImport/0.1)",
          accept: opts.accept ?? "*/*",
          "accept-language": "de-DE,de;q=0.9,en;q=0.7",
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new UpstreamError("Weiterleitung ohne Ziel", 502);
        current = new URL(loc, url).toString();
        continue;
      }
      if (!res.ok) throw new UpstreamError(`Shop antwortet mit ${res.status}`, res.status);
      const body = await readLimited(res, opts.maxBytes);
      return { url: url.toString(), contentType: res.headers.get("content-type") ?? "", body };
    } catch (e) {
      if (e instanceof FetchBlockedError || e instanceof UpstreamError) throw e;
      if ((e as Error).name === "AbortError") throw new UpstreamError("Zeitüberschreitung", 504);
      throw new UpstreamError("Seite nicht erreichbar", 502);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new UpstreamError("Zu viele Weiterleitungen", 502);
}

async function readLimited(res: Response, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(res.headers.get("content-length"));
  if (declared && declared > maxBytes) throw new UpstreamError("Antwort zu groß", 413);
  if (!res.body) return new Uint8Array(new ArrayBuffer(0));
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new UpstreamError("Antwort zu groß", 413);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(new ArrayBuffer(total));
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}
