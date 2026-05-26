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

const SCRIBD_HOST_RE = /^(www\.)?scribd\.com$/i;
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

function buildDownloadUrl(parsed) {
    // ilide.info is the viewer/downloader backend used by scribd.vdownloaders.com
    // and many similar services. The viewer takes the canonical scribd URL as a
    // query parameter and renders the document with a download option.
    const target = `${parsed.canonical}#fullscreen&from_embed`;
    return `https://ilide.info/doc-viewer-v2?url=${encodeURIComponent(target)}`;
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

    const downloadUrl = buildDownloadUrl(parsed);
    const title = buildTitle(parsed);

    return jsonResponse(200, {
        success: true,
        title,
        message: 'Dokumen siap. Klik tombol untuk membuka viewer dan menyimpan file.',
        sourceUrl: parsed.canonical,
        downloadUrl,
        docId: parsed.docId,
        kind: parsed.kind
    });
};
