/**
 * Netlify Function: /download
 *
 * Validates a Scribd URL submitted by the client and returns multiple mirror
 * URLs from different downloader services. The frontend renders all mirrors
 * so users can pick whichever one is captcha/Cloudflare-friendly that day.
 *
 * Request:  POST { "url": "https://www.scribd.com/document/123/Title" }
 * Response: { success, title, message, sourceUrl, mirrors[], downloadUrl }
 */

'use strict';

// Accept scribd.com plus any single-label subdomain (locale prefixes such as
// id., de., fr., ro., es., pt., etc. all serve the same content).
const SCRIBD_HOST_RE = /^([a-z0-9-]+\.)?scribd\.com$/i;
const SCRIBD_PATH_RE = /^\/(document|doc|presentation)\/(\d+)(?:\/([^/?#]+))?/i;

function jsonResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify(body)
    };
}

function parseScribdUrl(raw) {
    let u;
    try {
        u = new URL(raw);
    } catch {
        return { ok: false, error: 'Format URL tidak valid.' };
    }

    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { ok: false, error: 'Protokol URL harus http atau https.' };
    }

    if (!SCRIBD_HOST_RE.test(u.hostname)) {
        return { ok: false, error: 'URL harus berasal dari domain scribd.com.' };
    }

    const m = u.pathname.match(SCRIBD_PATH_RE);
    if (!m) {
        return {
            ok: false,
            error: 'Path URL harus diawali /document/, /doc/, atau /presentation/ dan memiliki ID dokumen.'
        };
    }

    const [, kind, docId, rawSlug] = m;
    const slug = rawSlug ? decodeURIComponent(rawSlug) : '';

    // Reconstruct a canonical scribd URL (drops query/hash).
    const pathSlug = slug ? '/' + encodeURIComponent(slug) : '';
    const canonical = `https://www.scribd.com/${kind.toLowerCase()}/${docId}${pathSlug}`;

    return {
        ok: true,
        kind: kind.toLowerCase(),
        docId,
        slug,
        canonical
    };
}

/**
 * Build the list of mirror URLs.
 *
 * Two strategies are used depending on what each service supports:
 *   1. Domain swap:   replace scribd.com with the mirror's host. The mirror
 *                     parses its own URL and resolves the document.
 *   2. ?url= param:   send the canonical scribd URL as a query parameter. If
 *                     the service auto-detects it, great; if not, the user
 *                     lands on its homepage and can paste manually.
 *
 * Mirrors are ordered from most-likely-to-just-work to most-likely-to-show-
 * captcha. The first entry is treated as the recommended/default link.
 */
function buildMirrors(parsed) {
    const { kind, docId, slug, canonical } = parsed;
    const pathSlug = slug ? '/' + encodeURIComponent(slug) : '';
    const encodedCanonical = encodeURIComponent(canonical);
    const ilideTarget = encodeURIComponent(`${canonical}#fullscreen&from_embed`);

    return [
        {
            id: 'vpdfs',
            name: 'VPDFS',
            url: `https://scribd.vpdfs.com/${kind}/${docId}${pathSlug}`,
            note: 'Direct domain swap. Biasanya paling ringan dari sisi captcha.',
            recommended: true
        },
        {
            id: 'dlscrib',
            name: 'DLScrib',
            url: `https://dlscrib.com/?url=${encodedCanonical}`,
            note: 'UI modern. Kalau URL tidak auto-detect, paste manual di kotak.'
        },
        {
            id: 'docdownloader',
            name: 'DocDownloader',
            url: `https://docdownloader.com/?url=${encodedCanonical}`,
            note: 'Klasik & stabil. Kadang menampilkan iklan sebelum link muncul.'
        },
        {
            id: 'scrdownloader',
            name: 'Scrdownloader',
            url: `https://scrdownloader.com/?url=${encodedCanonical}`,
            note: 'Simpel & ringan. Cocok untuk dokumen kecil.'
        },
        {
            id: 'vdownloaders',
            name: 'VDownloaders',
            url: `https://scribd.vdownloaders.com/${kind}/${docId}${pathSlug}`,
            note: 'Domain swap menuju ilide.info. Sering minta verifikasi Cloudflare + captcha.'
        },
        {
            id: 'ilide',
            name: 'ilide.info (raw)',
            url: `https://ilide.info/doc-viewer-v2?url=${ilideTarget}`,
            note: 'Backend asli. Last resort kalau yang lain tidak berhasil.'
        }
    ];
}

function buildTitle(parsed) {
    if (parsed.slug) {
        return parsed.slug.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return `Scribd ${parsed.kind} #${parsed.docId}`;
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return jsonResponse(204, {});
    }

    if (event.httpMethod !== 'POST') {
        return jsonResponse(405, { success: false, error: 'Method not allowed. Use POST.' });
    }

    let payload;
    try {
        payload = JSON.parse(event.body || '{}');
    } catch {
        return jsonResponse(400, { success: false, error: 'Body request bukan JSON yang valid.' });
    }

    const rawUrl = typeof payload.url === 'string' ? payload.url.trim() : '';
    if (!rawUrl) {
        return jsonResponse(400, { success: false, error: 'Field "url" wajib diisi.' });
    }

    const parsed = parseScribdUrl(rawUrl);
    if (!parsed.ok) {
        return jsonResponse(400, { success: false, error: parsed.error });
    }

    const mirrors = buildMirrors(parsed);
    const title = buildTitle(parsed);

    return jsonResponse(200, {
        success: true,
        title,
        message: 'Pilih salah satu mirror di bawah. Kalau yang satu kena Cloudflare atau captcha, tinggal coba yang lain.',
        sourceUrl: parsed.canonical,
        docId: parsed.docId,
        kind: parsed.kind,
        mirrors,
        // Backward-compat: legacy clients still get a single downloadUrl.
        downloadUrl: mirrors[0].url
    });
};
