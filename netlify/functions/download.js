/**
 * Netlify Function: /download
 *
 * Validates a Scribd URL submitted by the client and returns a downloader/viewer
 * URL that resolves the document. We use the ilide.info viewer pattern that the
 * popular scribd.vdownloaders.com service relies on as its backend.
 *
 * Request:  POST { "url": "https://www.scribd.com/document/123/Title" }
 * Response: { success, title, message, downloadUrl, sourceUrl }
 */

'use strict';

// Accepts scribd.com, www.scribd.com, and country-code subdomains
// like id.scribd.com, es.scribd.com, pt.scribd.com, fr.scribd.com, etc.
const SCRIBD_HOST_RE = /^(?:[a-z0-9-]+\.)?scribd\.com$/i;
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
    const canonical = `https://www.scribd.com/${kind.toLowerCase()}/${docId}${slug ? '/' + encodeURIComponent(slug) : ''}`;

    return {
        ok: true,
        kind: kind.toLowerCase(),
        docId,
        slug,
        canonical
    };
}

/**
 * Build a list of mirror/downloader URLs that may serve the document.
 *
 * No single public Scribd downloader works for every document, so we return
 * the primary one (which most reliably works for fresh URLs) plus a few
 * alternatives. The frontend renders all of them so the user can try the
 * next one if the first one fails.
 */
function buildDownloadUrls(parsed) {
    const { kind, docId, slug } = parsed;
    const slugPart = slug ? `/${encodeURIComponent(slug)}` : '';
    const path = `/${kind}/${docId}${slugPart}`;
    const canonical = parsed.canonical;

    return [
        {
            id: 'vdownloaders',
            label: 'VDownloaders',
            description: 'Pola substitusi domain (www.scribd.com → scribd.vdownloaders.com).',
            url: `https://scribd.vdownloaders.com${path}`
        },
        {
            id: 'scrdownloader',
            label: 'ScrDownloader',
            description: 'Mirror lain dengan pola substitusi domain.',
            url: `https://scrdownloader.com${path}`
        },
        {
            id: 'dlscrib',
            label: 'DLScrib',
            description: 'Buka halaman DLScrib dengan URL Scribd Anda.',
            url: `https://dlscrib.com/queue?url=${encodeURIComponent(canonical)}`
        },
        {
            id: 'ilide',
            label: 'iLIDE Viewer',
            description: 'Viewer iLIDE — bekerja kalau dokumen sudah terindeks di sana.',
            url: `https://ilide.info/doc-viewer-v2?url=${encodeURIComponent(canonical + '#fullscreen&from_embed')}`
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

    const downloads = buildDownloadUrls(parsed);
    const title = buildTitle(parsed);

    return jsonResponse(200, {
        success: true,
        title,
        message: 'Dokumen siap. Coba salah satu link di bawah — jika satu gagal, coba alternatif berikutnya.',
        sourceUrl: parsed.canonical,
        downloadUrl: downloads[0].url, // backwards-compat (primary)
        downloads,
        docId: parsed.docId,
        kind: parsed.kind
    });
};
