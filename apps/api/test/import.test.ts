import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { loadEnv } from "../src/env";
import { assertPublicUrl, isPrivateAddress } from "../src/safeFetch";
import { decodeHtml } from "../src/importRoutes";

const env = loadEnv({});
const sofaHtml = readFileSync(new URL("../../../packages/core/test/fixtures/jsonld-sofa.html", import.meta.url), "utf8");

/** Gefälschtes Internet: Hostname → IP, URL → Antwort */
function fakeNet(routes: Record<string, () => Response>, dns: Record<string, string[]> = {}) {
  const calls: string[] = [];
  const fetchImpl = (async (input: URL | string) => {
    const url = String(input);
    calls.push(url);
    const r = routes[url];
    return r ? r() : new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  const lookup = async (host: string) => dns[host] ?? ["93.184.216.34"];
  return { fetchImpl, lookup, calls };
}

const post = (app: ReturnType<typeof createApp>, url: string) =>
  app.request("/api/import/product", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });

describe("SSRF-Schutz", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.0.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "224.0.0.1"])(
    "%s ist intern", (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["93.184.216.34", "2606:4700::1111", "8.8.8.8"])("%s ist öffentlich", (ip) => expect(isPrivateAddress(ip)).toBe(false));

  it("blockiert localhost, interne IPs, fremde Ports, Zugangsdaten und Nicht-HTTP", async () => {
    const lookup = async (h: string) => (h === "evil.example" ? ["10.0.0.5"] : ["93.184.216.34"]);
    for (const url of ["http://localhost/x", "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data", "http://evil.example/", "http://shop.example:8080/", "http://user:pw@shop.example/", "file:///etc/passwd", "ftp://shop.example/"]) {
      await expect(assertPublicUrl(url, { lookup }), url).rejects.toThrow();
    }
    await expect(assertPublicUrl("https://shop.example/p/1", { lookup })).resolves.toBeInstanceOf(URL);
  });

  it("prüft auch Weiterleitungsziele", async () => {
    const net = fakeNet({
      "https://shop.example/p": () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }),
    });
    const app = createApp({ env, importDeps: net });
    const res = await post(app, "https://shop.example/p");
    expect(res.status).toBe(400);
    expect(net.calls).toEqual(["https://shop.example/p"]);
  });

  it("begrenzt die Antwortgröße", async () => {
    const big = "x".repeat(5 * 1024 * 1024);
    const app = createApp({ env, importDeps: fakeNet({ "https://shop.example/big": () => new Response(big, { headers: { "content-type": "text/html" } }) }) });
    expect((await post(app, "https://shop.example/big")).status).toBe(502);
  });
});

describe("Produkt-Import", () => {
  it("liest eine Produktseite (inkl. Weiterleitung)", async () => {
    const net = fakeNet({
      "https://shop.example/kurz": () => new Response(null, { status: 301, headers: { location: "/p/soederhamn" } }),
      "https://shop.example/p/soederhamn": () => new Response(sofaHtml, { headers: { "content-type": "text/html; charset=utf-8" } }),
    });
    const app = createApp({ env, importDeps: net });
    const res = await post(app, "https://shop.example/kurz");
    expect(res.status).toBe(200);
    const { product, warnings } = (await res.json()) as { product: Record<string, unknown>; warnings: string[] };
    expect(product).toMatchObject({ name: "SÖDERHAMN 3er-Sofa, Tonerud grau", shape: "sofa", price: 899, dimensions: { width: 1.98, depth: 0.99, height: 0.83 }, imageUrl: "https://shop.example/images/soederhamn.jpg" });
    expect(warnings).toEqual([]);
  });

  it("meldet gesperrte Shops verständlich", async () => {
    const app = createApp({ env, importDeps: fakeNet({ "https://shop.example/p": () => new Response("no", { status: 403 }) }) });
    const res = await post(app, "https://shop.example/p");
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: "blocked" });
  });

  it("lehnt Nicht-Links und Nicht-HTML ab", async () => {
    const app = createApp({ env, importDeps: fakeNet({ "https://shop.example/pdf": () => new Response("%PDF", { headers: { "content-type": "application/pdf" } }) }) });
    expect((await post(app, "kein link")).status).toBe(400);
    expect((await post(app, "https://shop.example/pdf")).status).toBe(400);
  });

  it("Bild-Proxy liefert nur Bilder", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const app = createApp({ env, importDeps: fakeNet({
      "https://cdn.example/a.png": () => new Response(png, { headers: { "content-type": "image/png" } }),
      "https://cdn.example/a.html": () => new Response("<script>", { headers: { "content-type": "text/html" } }),
    }) });
    const ok = await app.request(`/api/import/image?url=${encodeURIComponent("https://cdn.example/a.png")}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect((await app.request(`/api/import/image?url=${encodeURIComponent("https://cdn.example/a.html")}`)).status).toBe(400);
  });

  it("dekodiert Latin-1-Seiten", () => {
    const bytes = new Uint8Array([...new TextEncoder().encode("<meta charset=\"iso-8859-1\"><title>H"), 0xf6, ...new TextEncoder().encode("he</title>")]);
    expect(decodeHtml(bytes, "text/html")).toContain("Höhe");
  });
});
