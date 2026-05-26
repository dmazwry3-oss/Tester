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

        // After a successful Scribd lookup, surface a small CTA pointing to the
        // PDF Translate tab. Skipped on errors to avoid clutter.
        if (status === 'success' && Array.isArray(mirrors) && mirrors.length > 0) {
            body += `
                <div class="translate-suggest">
                    <p>Habis download? Lanjut translate PDF langsung di tab berikutnya.</p>
                    <button type="button" id="goto-translate">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                        Translate PDF
                    </button>
                </div>
            `;
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

        // Cross-feature: jump to translate tab
        const gotoTranslateBtn = result.querySelector('#goto-translate');
        if (gotoTranslateBtn) {
            gotoTranslateBtn.addEventListener('click', () => {
                if (typeof window.__dmazSwitchToTranslate === 'function') {
                    window.__dmazSwitchToTranslate();
                    // Smooth scroll to top of hero so the translate panel is visible
                    const hero = document.querySelector('.hero');
                    if (hero) hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
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

    // ============================================================
    // PDF Translate feature
    // ============================================================
    const tabDownload  = document.getElementById('tab-download');
    const tabTranslate = document.getElementById('tab-translate');
    const panelDownload  = document.getElementById('panel-download');
    const panelTranslate = document.getElementById('panel-translate');
    const langFrom  = document.getElementById('lang-from');
    const langTo    = document.getElementById('lang-to');
    const langSwap  = document.getElementById('lang-swap');
    const translatorList   = document.getElementById('translator-list');
    const translatorOpenAll = document.getElementById('translator-open-all');
    const translatorCount   = document.getElementById('translator-count');

    /**
     * Languages supported. Codes follow Google Translate conventions
     * (which other services mostly accept too). Names are in Indonesian.
     */
    const LANGUAGES = [
        { code: 'auto',  name: 'Deteksi otomatis', sourceOnly: true },
        { code: 'af',    name: 'Afrikaans' },
        { code: 'sq',    name: 'Albania' },
        { code: 'am',    name: 'Amharik' },
        { code: 'ar',    name: 'Arab' },
        { code: 'hy',    name: 'Armenia' },
        { code: 'az',    name: 'Azerbaijan' },
        { code: 'eu',    name: 'Bask' },
        { code: 'be',    name: 'Belarussia' },
        { code: 'nl',    name: 'Belanda' },
        { code: 'bn',    name: 'Bengali' },
        { code: 'bs',    name: 'Bosnia' },
        { code: 'bg',    name: 'Bulgaria' },
        { code: 'my',    name: 'Burma (Myanmar)' },
        { code: 'ca',    name: 'Katalan' },
        { code: 'ceb',   name: 'Sebuano' },
        { code: 'zh-CN', name: 'China (Sederhana)' },
        { code: 'zh-TW', name: 'China (Tradisional)' },
        { code: 'cs',    name: 'Ceko' },
        { code: 'da',    name: 'Denmark' },
        { code: 'en',    name: 'Inggris' },
        { code: 'eo',    name: 'Esperanto' },
        { code: 'et',    name: 'Estonia' },
        { code: 'tl',    name: 'Tagalog (Filipina)' },
        { code: 'fi',    name: 'Finlandia' },
        { code: 'fr',    name: 'Prancis' },
        { code: 'gl',    name: 'Galisia' },
        { code: 'ka',    name: 'Georgia' },
        { code: 'de',    name: 'Jerman' },
        { code: 'el',    name: 'Yunani' },
        { code: 'gu',    name: 'Gujarati' },
        { code: 'ht',    name: 'Kreol Haiti' },
        { code: 'haw',   name: 'Hawaii' },
        { code: 'iw',    name: 'Ibrani' },
        { code: 'hi',    name: 'Hindi' },
        { code: 'hu',    name: 'Hungaria' },
        { code: 'is',    name: 'Islandia' },
        { code: 'id',    name: 'Indonesia' },
        { code: 'ga',    name: 'Irlandia' },
        { code: 'it',    name: 'Italia' },
        { code: 'ja',    name: 'Jepang' },
        { code: 'jw',    name: 'Jawa' },
        { code: 'kn',    name: 'Kannada' },
        { code: 'kk',    name: 'Kazakh' },
        { code: 'km',    name: 'Khmer' },
        { code: 'ko',    name: 'Korea' },
        { code: 'la',    name: 'Latin' },
        { code: 'lv',    name: 'Latvia' },
        { code: 'lt',    name: 'Lituania' },
        { code: 'mk',    name: 'Makedonia' },
        { code: 'ms',    name: 'Melayu' },
        { code: 'ml',    name: 'Malayalam' },
        { code: 'mt',    name: 'Malta' },
        { code: 'mi',    name: 'Maori' },
        { code: 'mr',    name: 'Marathi' },
        { code: 'mn',    name: 'Mongolia' },
        { code: 'ne',    name: 'Nepal' },
        { code: 'no',    name: 'Norwegia' },
        { code: 'fa',    name: 'Persia' },
        { code: 'pl',    name: 'Polandia' },
        { code: 'pt',    name: 'Portugis' },
        { code: 'pa',    name: 'Punjabi' },
        { code: 'ro',    name: 'Rumania' },
        { code: 'ru',    name: 'Rusia' },
        { code: 'sr',    name: 'Serbia' },
        { code: 'sk',    name: 'Slovakia' },
        { code: 'sl',    name: 'Slovenia' },
        { code: 'so',    name: 'Somali' },
        { code: 'es',    name: 'Spanyol' },
        { code: 'su',    name: 'Sunda' },
        { code: 'sw',    name: 'Swahili' },
        { code: 'sv',    name: 'Swedia' },
        { code: 'ta',    name: 'Tamil' },
        { code: 'te',    name: 'Telugu' },
        { code: 'th',    name: 'Thai' },
        { code: 'tr',    name: 'Turki' },
        { code: 'uk',    name: 'Ukraina' },
        { code: 'ur',    name: 'Urdu' },
        { code: 'uz',    name: 'Uzbek' },
        { code: 'vi',    name: 'Vietnam' },
        { code: 'cy',    name: 'Wales' },
        { code: 'yi',    name: 'Yiddi' },
        { code: 'yo',    name: 'Yoruba' },
        { code: 'zu',    name: 'Zulu' }
    ];

    /**
     * Translator services. Each entry can build its own URL from the
     * selected language pair. Services that don't support pre-fill via
     * URL params just open their homepage / file form.
     */
    const TRANSLATORS = [
        {
            id: 'google',
            name: 'Google Translate (Dokumen)',
            note: 'Drag & drop PDF, DOCX, PPTX, atau XLSX hingga 10 MB. Cepat, 100+ bahasa, gratis.',
            iconClass: 't-icon-google',
            recommended: true,
            buildUrl: ({ from, to }) =>
                `https://translate.google.com/?sl=${encodeURIComponent(from || 'auto')}&tl=${encodeURIComponent(to || 'id')}&op=docs`
        },
        {
            id: 'onlinedoc',
            name: 'OnlineDocTranslator',
            note: 'Berbasis Google Translate dengan fokus mempertahankan format. Mendukung PDF, DOCX, ODT, dll.',
            iconClass: 't-icon-onlinedoc',
            buildUrl: () => 'https://www.onlinedoctranslator.com/en/translationform'
        },
        {
            id: 'deepl',
            name: 'DeepL Document',
            note: 'Kualitas terjemahan terbaik untuk bahasa Eropa. Free tier: 5 MB/file, 3 dokumen/bulan.',
            iconClass: 't-icon-deepl',
            buildUrl: ({ to }) => {
                // DeepL uses a path-based locale on the homepage; fall back to /files for the upload screen.
                const deeplTarget = ({ id: 'id', en: 'en-us', de: 'de', ja: 'ja', ko: 'ko', zh: 'zh', es: 'es', fr: 'fr', pt: 'pt-br', ru: 'ru', it: 'it', nl: 'nl' })[to] || '';
                return deeplTarget
                    ? `https://www.deepl.com/${deeplTarget}/translator/files`
                    : 'https://www.deepl.com/translator/files';
            }
        },
        {
            id: 'doctrans',
            name: 'DocTranslator.com',
            note: 'Mendukung file lebih besar. Cocok untuk dokumen panjang seperti tesis & laporan.',
            iconClass: 't-icon-doctrans',
            buildUrl: () => 'https://doctranslator.com/'
        },
        {
            id: 'pdf24',
            name: 'PDF24 Translate',
            note: 'Khusus PDF. Tidak butuh signup. Maks 100 MB. Bahasa terbatas tapi solid.',
            iconClass: 't-icon-pdf24',
            buildUrl: () => 'https://tools.pdf24.org/en/translate-pdf'
        },
        {
            id: 'ilovepdf',
            name: 'iLovePDF Translate',
            note: 'UI bersih, khusus PDF, mempertahankan layout. Gratis dengan limit harian.',
            iconClass: 't-icon-ilovepdf',
            buildUrl: () => 'https://www.ilovepdf.com/translate-pdf'
        }
    ];

    const TRANSLATE_PREFS_KEY = 'dmaz-tester:translate-prefs';

    function loadTranslatePrefs() {
        try {
            const raw = localStorage.getItem(TRANSLATE_PREFS_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch { return null; }
    }
    function saveTranslatePrefs(prefs) {
        try { localStorage.setItem(TRANSLATE_PREFS_KEY, JSON.stringify(prefs)); } catch {}
    }

    function populateLangSelect(select, includeAuto) {
        const frag = document.createDocumentFragment();
        LANGUAGES.forEach((lang) => {
            if (lang.sourceOnly && !includeAuto) return;
            const opt = document.createElement('option');
            opt.value = lang.code;
            opt.textContent = lang.name;
            frag.appendChild(opt);
        });
        select.appendChild(frag);
    }

    function getCurrentLangPair() {
        return {
            from: langFrom ? langFrom.value : 'auto',
            to:   langTo   ? langTo.value   : 'id'
        };
    }

    function renderTranslators() {
        if (!translatorList) return;
        const langs = getCurrentLangPair();

        translatorList.innerHTML = TRANSLATORS.map((t, idx) => {
            const isPrimary = t.recommended || idx === 0;
            const url = t.buildUrl(langs);
            const badge = isPrimary
                ? '<span class="mirror-badge">Recommended</span>'
                : '';
            return `
                <li class="mirror-item${isPrimary ? ' is-primary' : ''}">
                    <div class="mirror-card">
                        <a class="mirror-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" data-translator-id="${escapeAttr(t.id)}">
                            <span class="mirror-icon ${t.iconClass}">${ICONS.external}</span>
                            <span class="mirror-main">
                                <span class="mirror-name">${escapeHtml(t.name)}${badge}</span>
                                <span class="mirror-note">${escapeHtml(t.note)}</span>
                            </span>
                        </a>
                        <button type="button" class="copy-btn" data-copy="${escapeAttr(url)}" title="Salin link" aria-label="Salin link ${escapeAttr(t.name)}">
                            ${ICONS.copy}
                        </button>
                    </div>
                </li>
            `;
        }).join('');

        if (translatorCount) {
            translatorCount.textContent = `${TRANSLATORS.length} translator tersedia`;
        }

        translatorList.querySelectorAll('.copy-btn').forEach((btn) => {
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
    }

    function switchTab(target) {
        const isTranslate = target === 'translate';
        if (tabDownload && tabTranslate) {
            tabDownload.classList.toggle('is-active', !isTranslate);
            tabDownload.setAttribute('aria-selected', String(!isTranslate));
            tabTranslate.classList.toggle('is-active', isTranslate);
            tabTranslate.setAttribute('aria-selected', String(isTranslate));
        }
        if (panelDownload && panelTranslate) {
            panelDownload.hidden = isTranslate;
            panelDownload.classList.toggle('is-active', !isTranslate);
            panelTranslate.hidden = !isTranslate;
            panelTranslate.classList.toggle('is-active', isTranslate);
        }
    }

    if (langFrom && langTo) {
        populateLangSelect(langFrom, true);
        populateLangSelect(langTo, false);

        const prefs = loadTranslatePrefs() || { from: 'auto', to: 'id' };
        langFrom.value = LANGUAGES.some((l) => l.code === prefs.from) ? prefs.from : 'auto';
        langTo.value   = LANGUAGES.some((l) => l.code === prefs.to && !l.sourceOnly) ? prefs.to : 'id';

        const onLangChange = () => {
            saveTranslatePrefs({ from: langFrom.value, to: langTo.value });
            renderTranslators();
        };
        langFrom.addEventListener('change', onLangChange);
        langTo.addEventListener('change', onLangChange);
    }

    if (langSwap) {
        langSwap.addEventListener('click', () => {
            if (!langFrom || !langTo) return;
            // 'auto' can't be a target. If source is auto, swap is a no-op.
            if (langFrom.value === 'auto') {
                toast('Bahasa sumber sedang Deteksi otomatis — pilih bahasa spesifik dulu untuk swap.', 'info');
                return;
            }
            const a = langFrom.value;
            const b = langTo.value;
            langFrom.value = b;
            langTo.value   = a;
            saveTranslatePrefs({ from: langFrom.value, to: langTo.value });
            renderTranslators();
        });
    }

    if (translatorOpenAll) {
        translatorOpenAll.addEventListener('click', () => {
            const langs = getCurrentLangPair();
            let opened = 0;
            let blocked = false;
            TRANSLATORS.forEach((t, i) => {
                setTimeout(() => {
                    const w = window.open(t.buildUrl(langs), '_blank', 'noopener,noreferrer');
                    if (w) opened += 1;
                    else blocked = true;
                    if (i === TRANSLATORS.length - 1) {
                        if (blocked) toast('Popup blocker aktif — izinkan popup untuk buka semua.', 'error');
                        else toast(`${opened} translator dibuka di tab baru.`, 'success');
                    }
                }, i * 120);
            });
        });
    }

    if (tabDownload) tabDownload.addEventListener('click', () => switchTab('download'));
    if (tabTranslate) tabTranslate.addEventListener('click', () => switchTab('translate'));

    // Initial render of translator list
    renderTranslators();

    // Expose a way for the download flow to nudge users into translate mode
    window.__dmazSwitchToTranslate = () => switchTab('translate');

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
