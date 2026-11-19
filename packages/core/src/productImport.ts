import { CATALOG, type CatalogEntry, type FurnitureCategory, type FurnitureShape, type MaterialRole } from "./catalog";
import { createId } from "./ids";

/**
 * Möbel aus Online-Shops übernehmen.
 *
 * Reine Funktionen (kein DOM, kein Netzwerk) – laufen auf dem Server (Link-Import) und im Browser
 * (Lesezeichen-Import). Quellen in absteigender Verlässlichkeit:
 *   1. schema.org-Produktdaten (JSON-LD): Name, Bild, Preis, Farbe, teils Maße
 *   2. Meta-Tags (Open Graph / product:price)
 *   3. Seitentext: „Breite: 228 cm“, „B/H/T: 220/85/95 cm“, „Maße (B x T x H): 160 x 200 x 40 cm“, „Liegefläche 160 x 200“ …
 */

export interface Dimensions {
  width?: number;
  depth?: number;
  height?: number;
}

export interface ProductInfo {
  url: string;
  shop: string;
  name: string;
  imageUrl?: string;
  price?: number;
  currency?: string;
  colorName?: string;
  /** Farbe aus dem Farbnamen (wenn erkannt) */
  color?: string;
  /** Erkannte Maße in Metern */
  dimensions: Dimensions;
  shape: FurnitureShape;
  category: FurnitureCategory;
  material: MaterialRole;
}

// ---------- Maße ----------

const UNIT: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1 };
const num = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));
const sane = (m: number | undefined) => (m !== undefined && Number.isFinite(m) && m >= 0.02 && m <= 6 ? Math.round(m * 1000) / 1000 : undefined);

/** Fehlt die Einheit, gilt: ≥ 1000 → mm, sonst cm (Möbel-Shops nutzen fast immer cm). */
function toMeters(value: number, unit?: string): number | undefined {
  if (unit) return sane(value * (UNIT[unit.toLowerCase()] ?? 0.01));
  return sane(value >= 1000 ? value * 0.001 : value * 0.01);
}

const LETTER: Record<string, keyof Dimensions> = {
  b: "width", w: "width", l: "width",
  t: "depth", d: "depth",
  h: "height",
};

const N = String.raw`(\d{1,4}(?:[.,]\d{1,2})?)`;
const U = String.raw`\s*(mm|cm|m)?\b`;
const NOT_LETTER_BEFORE = String.raw`(?<![\p{L}])`;

/**
 * Maße aus Freitext. Reihenfolge: benannte Einzelwerte → kodierte Tripel (B/H/T, BxTxH, W x D x H) →
 * Liegefläche (Betten) → unbenanntes Tripel „220 x 95 x 85 cm“ (als B x T x H gelesen).
 */
export function extractDimensions(text: string): Dimensions {
  const t = text.replace(/ /g, " ").replace(/[×✕]/g, "x");
  const dims: Dimensions = {};

  // 1) Benannte Einzelwerte: „Breite: 228 cm“, „Gesamthöhe 83 cm“, „Width: 90 cm“
  const named: [keyof Dimensions, string][] = [
    ["width", String.raw`(?:gesamt)?breite|width|länge|laenge|length`],
    ["depth", String.raw`(?:gesamt)?tiefe|depth`],
    ["height", String.raw`(?:gesamt)?höhe|(?:gesamt)?hoehe|height`],
  ];
  for (const [key, words] of named) {
    const re = new RegExp(`${NOT_LETTER_BEFORE}(?:${words})(?:\\s*\\([^)]{0,20}\\))?\\s*[:=]?\\s*(?:ca\\.?\\s*)?${N}${U}`, "iu");
    const m = re.exec(t);
    if (m) {
      const v = toMeters(num(m[1]!), m[2]);
      // „Länge“ zählt nur als Breite, wenn keine echte Breite angegeben ist
      if (v !== undefined && dims[key] === undefined) dims[key] = v;
    }
  }
  if (dims.width && dims.depth && dims.height) return dims;

  // 2) Kodierte Tripel: „B/H/T: 220/85/95 cm“, „BxTxH 160 x 200 x 40 cm“, „(B x T x H): …“, „W x D x H: …“
  const coded = new RegExp(
    String.raw`${NOT_LETTER_BEFORE}([BHTWDL])\s*[/x*]\s*([BHTWDL])\s*[/x*]\s*([BHTWDL])\s*\)?\s*(?:in\s*(mm|cm|m)\s*)?[:=]?\s*(?:ca\.?\s*)?${N}\s*(?:mm|cm|m)?\s*[/x*]\s*${N}\s*(?:mm|cm|m)?\s*[/x*]\s*${N}${U}`,
    "iu",
  );
  const c = coded.exec(t);
  if (c) {
    const unit = c[8] ?? c[4];
    const letters = [c[1]!, c[2]!, c[3]!].map((l) => LETTER[l.toLowerCase()]);
    const values = [c[5]!, c[6]!, c[7]!].map((v) => toMeters(num(v), unit));
    letters.forEach((key, i) => { if (key && dims[key] === undefined && values[i] !== undefined) dims[key] = values[i]; });
    if (dims.width && dims.depth && dims.height) return dims;
  }

  // 2b) Abwechselnd Buchstabe und Zahl: „W 90 x D 40 x H 180 cm“, „B: 160 / T: 200 / H: 40 cm“
  const L = String.raw`([BHTWDL])\s*[:.]?\s*`;
  const SEP = String.raw`\s*(?:mm|cm|m)?\s*[/x*,]\s*`;
  const inter = new RegExp(`${NOT_LETTER_BEFORE}${L}${N}${SEP}${L}${N}${SEP}${L}${N}${U}`, "iu").exec(t);
  if (inter) {
    const unit = inter[7];
    for (const [li, vi] of [[1, 2], [3, 4], [5, 6]] as const) {
      const key = LETTER[inter[li]!.toLowerCase()];
      const v = toMeters(num(inter[vi]!), unit);
      if (key && dims[key] === undefined && v !== undefined) dims[key] = v;
    }
    if (dims.width && dims.depth && dims.height) return dims;
  }

  // 3) Liegefläche bei Betten: Bett ist etwa 10 cm größer als die Matratze
  const lying = new RegExp(String.raw`liegefl(?:ä|ae)che[^\d]{0,15}${N}\s*x\s*${N}${U}`, "iu").exec(t);
  if (lying) {
    const a = toMeters(num(lying[1]!), lying[3]);
    const b = toMeters(num(lying[2]!), lying[3]);
    if (a && b) {
      dims.width ??= Math.round((Math.min(a, b) + 0.1) * 100) / 100;
      dims.depth ??= Math.round((Math.max(a, b) + 0.1) * 100) / 100;
    }
  }

  // 4) Unbenanntes Tripel mit Einheit: „220 x 95 x 85 cm“ → B x T x H
  if (!dims.width || !dims.depth) {
    const plain = new RegExp(String.raw`${N}\s*x\s*${N}\s*x\s*${N}\s*(mm|cm|m)\b`, "iu").exec(t);
    if (plain) {
      const [w, d, h] = [plain[1]!, plain[2]!, plain[3]!].map((v) => toMeters(num(v), plain[4]));
      dims.width ??= w;
      dims.depth ??= d;
      dims.height ??= h;
    }
  }
  return dims;
}

// ---------- Möbeltyp ----------

interface KindRule {
  words: RegExp;
  shape: FurnitureShape;
  category: FurnitureCategory;
  material: MaterialRole;
}

/** Reihenfolge ist wichtig: spezifische Begriffe zuerst (Couchtisch vor Tisch, Schreibtisch vor Tisch …). */
const KIND_RULES: KindRule[] = [
  { words: /couchtisch|beistelltisch|coffee ?table|side ?table/i, shape: "table", category: "wohnen", material: "wood" },
  { words: /nachttisch|nachtkonsole|bedside|nightstand/i, shape: "nightstand", category: "schlafen", material: "wood" },
  { words: /schreibtisch|desk|arbeitstisch/i, shape: "desk", category: "arbeiten", material: "lacquer" },
  { words: /bürostuhl|buerostuhl|drehstuhl|office ?chair|gaming ?chair/i, shape: "chair", category: "arbeiten", material: "fabric" },
  { words: /tv[- ]?(?:board|lowboard|möbel|schrank|bank)|lowboard|media ?console/i, shape: "tv", category: "wohnen", material: "lacquer" },
  { words: /sofa|couch|ecksofa|wohnlandschaft|schlafsofa|récamière|recamiere|sectional/i, shape: "sofa", category: "wohnen", material: "fabric" },
  { words: /sessel|armchair|ohrensessel|lounge ?chair/i, shape: "armchair", category: "wohnen", material: "fabric" },
  { words: /boxspring|bett(?!w(ä|ae)sche)|bed\b|futon/i, shape: "bed", category: "schlafen", material: "fabric" },
  { words: /kleiderschrank|wardrobe|drehtürenschrank|schwebetürenschrank|pax/i, shape: "wardrobe", category: "schlafen", material: "lacquer" },
  { words: /esstisch|dining ?table|küchentisch|kuechentisch|tisch|table/i, shape: "table", category: "essen", material: "wood" },
  { words: /stuhl|chair|hocker|stool|bank\b|bench/i, shape: "chair", category: "essen", material: "lacquer" },
  { words: /regal|bücherregal|shelf|bookcase|shelving|vitrine/i, shape: "shelf", category: "wohnen", material: "wood" },
  { words: /sideboard|kommode|anrichte|highboard|dresser|chest of drawers|schrank|cabinet/i, shape: "sideboard", category: "wohnen", material: "wood" },
  { words: /teppich|rug|carpet|läufer|laeufer/i, shape: "rug", category: "deko", material: "textile" },
  { words: /stehlampe|stehleuchte|lampe|leuchte|lamp/i, shape: "lamp", category: "deko", material: "textile" },
  { words: /pflanze|plant|monstera|ficus|olivenbaum/i, shape: "plant", category: "deko", material: "plant" },
  { words: /badewanne|bathtub/i, shape: "bathtub", category: "bad", material: "ceramic" },
  { words: /waschtisch|waschbecken|vanity|sink/i, shape: "sink", category: "bad", material: "ceramic" },
  { words: /kühlschrank|kuehlschrank|fridge|refrigerator/i, shape: "fridge", category: "kueche", material: "metal" },
  { words: /küchenzeile|kuechenzeile|einbauküche|kitchen/i, shape: "kitchen", category: "kueche", material: "lacquer" },
];

export function guessKind(name: string): { shape: FurnitureShape; category: FurnitureCategory; material: MaterialRole } {
  const rule = KIND_RULES.find((r) => r.words.test(name));
  return rule ? { shape: rule.shape, category: rule.category, material: rule.material } : { shape: "sideboard", category: "wohnen", material: "wood" };
}

/** Typische Maße einer Möbelart (für fehlende Werte). */
export function defaultDimensions(shape: FurnitureShape): Required<Dimensions> {
  const e = CATALOG.find((x) => x.shape === shape) ?? CATALOG[0]!;
  return { width: e.width, depth: e.depth, height: e.height };
}

// ---------- Farbe ----------

const COLOR_NAMES: [RegExp, string][] = [
  [/anthrazit|graphit|graphite/i, "#3d3f42"], [/dunkelgrau|dark ?gr[ae]y/i, "#55585c"], [/hellgrau|light ?gr[ae]y/i, "#b9b9b6"],
  [/grau|gr[ae]y/i, "#8a8c8e"], [/schwarz|black/i, "#222222"], [/weiß|weiss|white/i, "#f1f0ec"], [/creme|cream|ecru|off-?white/i, "#ece4d4"],
  [/beige|sand|natur|natural|leinen|linen/i, "#d8ccb8"], [/taupe/i, "#9b8e80"], [/cognac/i, "#9a5a2e"], [/braun|brown|mocca|mokka/i, "#6b4b36"],
  [/eiche|oak/i, "#c4a27a"], [/nussbaum|walnut/i, "#5f4130"], [/buche|beech/i, "#d1ad83"], [/kiefer|pine/i, "#d9b98a"],
  [/olive|oliv/i, "#6f7450"], [/salbei|sage/i, "#a3b09a"], [/dunkelgrün|dark ?green|tannengrün/i, "#2f4a3c"], [/grün|green/i, "#5f7d5a"],
  [/petrol|teal/i, "#2e5e64"], [/navy|marine|dunkelblau|dark ?blue/i, "#283a57"], [/blau|blue/i, "#4c6a8c"],
  [/senf|mustard|ocker|ochre/i, "#c79a3b"], [/gelb|yellow/i, "#e0c050"], [/terrakotta|terracotta|rost|rust/i, "#b8613e"],
  [/orange/i, "#d07a3c"], [/rosa|rosé|pink|altrosa/i, "#d9a8a4"], [/bordeaux|weinrot|burgundy/i, "#6e2633"], [/rot|red/i, "#a8392f"],
  [/gold|messing|brass/i, "#b08d57"], [/silber|chrom|chrome|silver/i, "#c4c8cb"],
];

export function colorFromName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  return COLOR_NAMES.find(([re]) => re.test(name))?.[1];
}

// ---------- HTML ----------

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü").replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü").replace(/&szlig;/g, "ß");

function metaContent(html: string, key: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0];
  const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1];
  return content ? decodeEntities(content).trim() : undefined;
}

type Json = Record<string, unknown>;

function jsonLdProducts(html: string): Json[] {
  const out: Json[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let data: unknown;
    try { data = JSON.parse(m[1]!.trim()); } catch { continue; }
    const stack: unknown[] = [data];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) { stack.push(...node); continue; }
      if (!node || typeof node !== "object") continue;
      const obj = node as Json;
      const type = obj["@type"];
      const types = Array.isArray(type) ? type : [type];
      if (types.some((x) => x === "Product" || x === "ProductGroup" || x === "IndividualProduct")) out.push(obj);
      if (obj["@graph"]) stack.push(obj["@graph"]);
      if (Array.isArray(obj.hasVariant)) stack.push(...obj.hasVariant);
    }
  }
  return out;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);

function imageOf(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return imageOf(v[0]);
  if (v && typeof v === "object") return str((v as Json).url) ?? str((v as Json).contentUrl);
  return undefined;
}

function offerOf(v: unknown): { price?: number; currency?: string } {
  const o = (Array.isArray(v) ? v[0] : v) as Json | undefined;
  if (!o || typeof o !== "object") return {};
  const raw = str(o.price) ?? str(o.lowPrice) ?? str((o.priceSpecification as Json | undefined)?.price);
  const price = raw ? Number(raw.replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")) : undefined;
  return { price: price !== undefined && Number.isFinite(price) ? price : undefined, currency: str(o.priceCurrency) ?? str((o.priceSpecification as Json | undefined)?.priceCurrency) };
}

const UNIT_CODES: Record<string, string> = { CMT: "cm", MMT: "mm", MTR: "m" };

function quantity(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "number") return toMeters(v);
  if (typeof v === "string") {
    const m = new RegExp(`${N}${U}`, "iu").exec(v);
    return m ? toMeters(num(m[1]!), m[2]) : undefined;
  }
  if (typeof v === "object") {
    const q = v as Json;
    const value = typeof q.value === "number" ? q.value : str(q.value) ? num(str(q.value)!) : undefined;
    if (value === undefined) return undefined;
    const unit = UNIT_CODES[str(q.unitCode) ?? ""] ?? str(q.unitText)?.toLowerCase();
    return toMeters(value, unit && UNIT[unit] ? unit : undefined);
  }
  return undefined;
}

/** additionalProperty [{name: "Breite", value: "220 cm"}] → Text, den extractDimensions versteht */
function propertiesText(v: unknown): string {
  if (!Array.isArray(v)) return "";
  return v.map((p) => (p && typeof p === "object" ? `${str((p as Json).name) ?? ""}: ${str((p as Json).value) ?? ""} ${str((p as Json).unitText) ?? ""}` : "")).join(" \n ");
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/td|\/th|\/dd|\/dt|\/h\d)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  ).replace(/[ \t]+/g, " ");
}

export function shopName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Analysiert eine Produktseite. Wirft nie – fehlende Werte bleiben leer. */
export function parseProductHtml(html: string, url: string): ProductInfo {
  const page = html.slice(0, 3_000_000);
  const product = jsonLdProducts(page)[0];

  let name = str(product?.name) ?? metaContent(page, "og:title") ?? decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(page)?.[1] ?? "").trim();
  name = name.replace(/\s*[|–-]\s*(?:jetzt|online|kaufen|bestellen|günstig).*$/i, "").replace(/\s+/g, " ").slice(0, 160) || "Importiertes Möbel";

  let imageUrl = imageOf(product?.image) ?? metaContent(page, "og:image");
  if (imageUrl) {
    try { imageUrl = new URL(imageUrl, url).toString(); } catch { imageUrl = undefined; }
  }

  const offer = offerOf(product?.offers);
  const metaPrice = metaContent(page, "product:price:amount") ?? metaContent(page, "og:price:amount");
  const price = offer.price ?? (metaPrice ? Number(metaPrice.replace(",", ".")) : undefined);
  const currency = offer.currency ?? metaContent(page, "product:price:currency") ?? metaContent(page, "og:price:currency");

  // Maße: strukturierte Felder → additionalProperty/Beschreibung → Seitentext
  const dims: Dimensions = {
    width: quantity(product?.width),
    depth: quantity(product?.depth),
    height: quantity(product?.height),
  };
  const sources = [propertiesText(product?.additionalProperty), str(product?.description) ?? "", htmlToText(page).slice(0, 400_000)];
  for (const text of sources) {
    if (dims.width && dims.depth && dims.height) break;
    const found = extractDimensions(text);
    dims.width ??= found.width;
    dims.depth ??= found.depth;
    dims.height ??= found.height;
  }

  const colorName = str(product?.color);
  const kind = guessKind(`${name} ${str(product?.category) ?? ""}`);
  return {
    url,
    shop: shopName(url),
    name,
    imageUrl,
    price: price !== undefined && Number.isFinite(price) ? price : undefined,
    currency,
    colorName,
    color: colorFromName(colorName) ?? colorFromName(name),
    dimensions: dims,
    ...kind,
  };
}

export interface ImportOverrides {
  name?: string;
  shape?: FurnitureShape;
  width?: number;
  depth?: number;
  height?: number;
  color?: string;
}

/** Macht aus einem erkannten Produkt einen Katalogeintrag (fehlende Maße: typische Werte der Möbelart). */
export function productToCatalogEntry(info: ProductInfo, o: ImportOverrides = {}): CatalogEntry {
  const shape = o.shape ?? info.shape;
  const kind = o.shape && o.shape !== info.shape ? guessKindForShape(shape) : { category: info.category, material: info.material };
  const fallback = defaultDimensions(shape);
  const width = o.width ?? info.dimensions.width ?? fallback.width;
  const depth = o.depth ?? info.dimensions.depth ?? fallback.depth;
  const height = o.height ?? info.dimensions.height ?? fallback.height;
  return {
    id: createId("shop"),
    name: (o.name ?? info.name).slice(0, 200),
    category: kind.category,
    material: kind.material,
    shape,
    width,
    depth,
    height,
    color: o.color ?? info.color ?? CATALOG.find((e) => e.shape === shape)?.color ?? "#a0a0a0",
    promptHint: info.name.slice(0, 200),
    source: {
      url: info.url,
      shop: info.shop,
      imageUrl: info.imageUrl,
      price: info.price,
      currency: info.currency,
      measured: {
        width: o.width === undefined && info.dimensions.width !== undefined,
        depth: o.depth === undefined && info.dimensions.depth !== undefined,
        height: o.height === undefined && info.dimensions.height !== undefined,
      },
    },
  };
}

function guessKindForShape(shape: FurnitureShape): { category: FurnitureCategory; material: MaterialRole } {
  const e = CATALOG.find((x) => x.shape === shape);
  return e ? { category: e.category, material: e.material } : { category: "wohnen", material: "wood" };
}

/** Summe und Liste der importierten Möbel eines Plans (Einkaufsliste). */
export function shoppingList(plan: { furniture: { catalogId: string }[]; customCatalog?: CatalogEntry[] }) {
  const byId = new Map((plan.customCatalog ?? []).map((e) => [e.id, e]));
  const counts = new Map<string, number>();
  for (const f of plan.furniture) if (byId.has(f.catalogId)) counts.set(f.catalogId, (counts.get(f.catalogId) ?? 0) + 1);
  const items = [...counts.entries()].map(([id, qty]) => ({ entry: byId.get(id)!, qty }));
  const total = items.reduce((s, i) => s + (i.entry.source?.price ?? 0) * i.qty, 0);
  const currency = items.find((i) => i.entry.source?.currency)?.entry.source?.currency ?? "EUR";
  return { items, total, currency, missingPrices: items.filter((i) => i.entry.source?.price === undefined).length };
}
