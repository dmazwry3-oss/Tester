/**
 * Dmaz Tester - Frontend logic
 *
 * Features:
 *  - Submit URL → fetch /api/download → render mirror cards
 *  - Paste-from-clipboard helper (uses Clipboard API with permission prompt)
 *  - Copy individual mirror URL to clipboard
 *  - Open all mirrors in new tabs (rate-limited via setTimeout)
 *  - Recent downloads list backed by localStorage (5 most recent)
 *  - Toast notifications for transient feedback
 */
(function () {
    'use strict';

    // ---------- DOM refs ----------
    const form         = document.getElementById('downloader-form');
    const input        = document.getElementById('scribd-url');
    const submitBtn    = document.getElementById('submit-btn');
    const pasteBtn     = document.getElementById('paste-btn');
    const result       = document.getElementById('result');
    const recentEl     = document.getElementById('recent');
    const recentList   = document.getElementById('recent-list');
    const recentClear  = document.getElementById('recent-clear');
    const toastEl      = document.getElementById('toast');
    const yearEl       = document.getElementById('year');

    if (yearEl) yearEl.textContent = new Date().getFullYear();

    const RECENT_KEY = 'dmaz-tester:recent';
    const RECENT_MAX = 5;

    // ---------- utils ----------
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }
    function escapeAttr(s) { return escapeHtml(s); }

    function isValidScribdUrl(value) {
        try {
            const u = new URL(value);
            const host = u.hostname.replace(/^www\./, '');
            if (host !== 'scribd.com' && !host.endsWith('.scribd.com')) return false;
            return /^\/(document|doc|presentation)\//i.test(u.pathname);
        } catch {
            return false;
        }
    }

    // ---------- toast ----------
    let toastTimer = null;
    function toast(message, kind = 'info') {
        if (!toastEl) return;
        const icons = {
            success: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
            error:   '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
            info:    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };

        toastEl.className = 'toast is-' + kind;
        toastEl.innerHTML = `<span class="toast-icon">${icons[kind] || icons.info}</span><span>${escapeHtml(message)}</span>`;
        toastEl.hidden = false;
        // Force reflow so the transition triggers when re-shown quickly.
        // eslint-disable-next-line no-unused-expressions
        toastEl.offsetHeight;
        toastEl.classList.add('is-visible');

        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toastEl.classList.remove('is-visible');
            setTimeout(() => { toastEl.hidden = true; }, 250);
        }, 2400);
    }

    // ---------- icons ----------
    const ICONS = {
        download: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
        external: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
        copy:     `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
        check:    `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
        success:  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
        error:    `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    };

    // ---------- result rendering ----------
    function renderMirrorList(mirrors) {
        if (!Array.isArray(mirrors) || mirrors.length === 0) return '';

        const items = mirrors.map((m, idx) => {
            const isPrimary = m.recommended || idx === 0;
            const badge = isPrimary
                ? '<span class="mirror-badge">Recommended</span>'
                : '';
            return `
                <li class="mirror-item${isPrimary ? ' is-primary' : ''}">
                    <div class="mirror-card">
                        <a class="mirror-link" href="${escapeAttr(m.url)}" target="_blank" rel="noopener noreferrer">
                            <span class="mirror-icon">${ICONS.download}</span>
                            <span class="mirror-main">
                                <span class="mirror-name">${escapeHtml(m.name)}${badge}</span>
                                ${m.note ? `<span class="mirror-note">${escapeHtml(m.note)}</span>` : ''}
                            </span>
                        </a>
                        <button type="button" class="copy-btn" data-copy="${escapeAttr(m.url)}" title="Salin link" aria-label="Salin link ${escapeAttr(m.name)}">
                            ${ICONS.copy}
                        </button>
                    </div>
                </li>
            `;
        }).join('');

        return `
            <div class="mirror-toolbar">
                <span class="mirror-toolbar-label">${mirrors.length} mirror tersedia</span>
                <button type="button" class="open-all-btn" id="open-all">
                    ${ICONS.external}
                    <span>Buka semua di tab baru</span>
                </button>
            </div>
            <ul class="mirror-list">${items}</ul>
        `;
    }

    function renderLegacyButton(downloadUrl) {
        return `
            <a href="${escapeAttr(downloadUrl)}" target="_blank" rel="noopener noreferrer" class="download-btn">
                ${ICONS.download}
                Open Download Page
            </a>
        `;
    }

    function showResult({ status, title, message, mirrors, downloadUrl, sourceUrl }) {
        result.hidden = false;
        result.classList.remove('is-error', 'is-success');
        if (status === 'error')   result.classList.add('is-error');
        if (status === 'success') result.classList.add('is-success');

        const icon = status === 'error' ? ICONS.error : ICONS.success;
        const headHtml = `
            <div class="result-head">
                <div class="result-icon" aria-hidden="true">${icon}</div>
                <div>
                    ${title ? `<h3>${escapeHtml(title)}</h3>` : ''}
                    ${message ? `<p>${escapeHtml(message)}</p>` : ''}
                </div>
            </div>
        `;

        let body = '';
        if (sourceUrl) body += `<div class="url-preview">${escapeHtml(sourceUrl)}</div>`;
        if (Array.isArray(mirrors) && mirrors.length > 0) {
            body += renderMirrorList(mirrors);
        } else if (downloadUrl) {
            body += renderLegacyButton(downloadUrl);
        }

        result.innerHTML = headHtml + body;
        result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        bindResultActions(mirrors);
    }

    function bindResultActions(mirrors) {
        // Copy buttons
        result.querySelectorAll('.copy-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const url = btn.getAttribute('data-copy');
                try {
                    await navigator.clipboard.writeText(url);
                    btn.classList.add('is-copied');
                    btn.innerHTML = ICONS.check;
                    toast('Link tersalin ke clipboard', 'success');
                    setTimeout(() => {
                        btn.classList.remove('is-copied');
                        btn.innerHTML = ICONS.copy;
                    }, 1600);
                } catch {
                    toast('Browser memblokir clipboard. Salin manual.', 'error');
                }
            });
        });

        // Open all
        const openAllBtn = result.querySelector('#open-all');
        if (openAllBtn && Array.isArray(mirrors)) {
            openAllBtn.addEventListener('click', () => {
                let opened = 0;
                let blocked = false;
                mirrors.forEach((m, i) => {
                    setTimeout(() => {
                        const w = window.open(m.url, '_blank', 'noopener,noreferrer');
                        if (w) opened += 1;
                        else blocked = true;

                        if (i === mirrors.length - 1) {
                            if (blocked) {
                                toast('Popup blocker aktif — izinkan popup untuk buka semua mirror.', 'error');
                            } else {
                                toast(`${opened} mirror dibuka di tab baru.`, 'success');
                            }
                        }
                    }, i * 120);
                });
            });
        }
    }

    // ---------- recent downloads (localStorage) ----------
    function loadRecent() {
        try {
            const raw = localStorage.getItem(RECENT_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    }

    function saveRecent(arr) {
        try {
            localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, RECENT_MAX)));
        } catch { /* localStorage might be disabled in private mode */ }
    }

    function addRecent(entry) {
        const all = loadRecent().filter((x) => x.sourceUrl !== entry.sourceUrl);
        all.unshift({
            title: entry.title || 'Dokumen Scribd',
            sourceUrl: entry.sourceUrl,
            ts: Date.now()
        });
        saveRecent(all);
        renderRecent();
    }

    function clearRecent() {
        try { localStorage.removeItem(RECENT_KEY); } catch {}
        renderRecent();
        toast('Riwayat dibersihkan', 'info');
    }

    function timeAgo(ts) {
        const diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 60) return 'baru saja';
        if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
        return `${Math.floor(diff / 86400)} hari lalu`;
    }

    function renderRecent() {
        const items = loadRecent();
        if (!items.length) {
            recentEl.hidden = true;
            recentList.innerHTML = '';
            return;
        }
        recentEl.hidden = false;
        recentList.innerHTML = items.map((it) => `
            <li>
                <span class="recent-title" title="${escapeAttr(it.sourceUrl)}">${escapeHtml(it.title)}</span>
                <span class="recent-meta">${escapeHtml(timeAgo(it.ts))}</span>
                <button type="button" data-recent-url="${escapeAttr(it.sourceUrl)}">Reload</button>
            </li>
        `).join('');

        recentList.querySelectorAll('button[data-recent-url]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const url = btn.getAttribute('data-recent-url');
                input.value = url;
                input.focus();
                form.requestSubmit();
            });
        });
    }

    if (recentClear) {
        recentClear.addEventListener('click', clearRecent);
    }
    renderRecent();

    // ---------- paste from clipboard ----------
    if (pasteBtn) {
        pasteBtn.addEventListener('click', async () => {
            try {
                const text = (await navigator.clipboard.readText()).trim();
                if (!text) {
                    toast('Clipboard kosong', 'info');
                    return;
                }
                input.value = text;
                input.focus();
                if (isValidScribdUrl(text)) {
                    toast('URL Scribd terdeteksi — tinggal klik Get Mirrors', 'success');
                } else {
                    toast('Tertempel, tapi bukan URL Scribd valid', 'info');
                }
            } catch {
                toast('Browser tidak izinkan akses clipboard. Paste manual (Ctrl+V).', 'error');
                input.focus();
            }
        });
    }

    // ---------- form submit ----------
    function setLoading(loading) {
        submitBtn.disabled = loading;
        submitBtn.classList.toggle('is-loading', loading);
        input.disabled = loading;
    }

    async function handleSubmit(e) {
        e.preventDefault();
        const value = input.value.trim();

        if (!value) {
            showResult({
                status: 'error',
                title: 'URL kosong',
                message: 'Silakan masukkan URL dokumen Scribd terlebih dahulu.'
            });
            return;
        }

        if (!isValidScribdUrl(value)) {
            showResult({
                status: 'error',
                title: 'URL tidak valid',
                message: 'URL harus dari domain scribd.com (termasuk subdomain locale) dan diawali dengan /document/, /doc/, atau /presentation/.'
            });
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/.netlify/functions/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: value })
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data.success) {
                showResult({
                    status: 'error',
                    title: 'Gagal memproses',
                    message: data.error || 'Terjadi kesalahan saat memproses URL. Coba lagi.',
                    sourceUrl: value
                });
                return;
            }

            showResult({
                status: 'success',
                title: data.title || 'Mirror siap',
                message: data.message || 'Pilih salah satu mirror di bawah. Mulai dari yang Recommended.',
                mirrors: data.mirrors,
                downloadUrl: data.downloadUrl,
                sourceUrl: data.sourceUrl || value
            });

            addRecent({
                title: data.title,
                sourceUrl: data.sourceUrl || value
            });
        } catch (err) {
            showResult({
                status: 'error',
                title: 'Network error',
                message: 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.',
                sourceUrl: value
            });
        } finally {
            setLoading(false);
        }
    }

    form.addEventListener('submit', handleSubmit);

    // ---------- nice-to-have: keyboard shortcut '/' to focus input ----------
    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== input && !e.metaKey && !e.ctrlKey && !e.altKey) {
            const tag = (document.activeElement && document.activeElement.tagName) || '';
            if (!/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) {
                e.preventDefault();
                input.focus();
            }
        }
    });
})();
