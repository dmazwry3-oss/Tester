(function () {
    'use strict';

    const form = document.getElementById('downloader-form');
    const input = document.getElementById('scribd-url');
    const submitBtn = document.getElementById('submit-btn');
    const result = document.getElementById('result');
    const yearEl = document.getElementById('year');

    if (yearEl) yearEl.textContent = new Date().getFullYear();

    /**
     * Quick client-side validation for Scribd URLs.
     * Server still enforces this for security.
     */
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

    function downloadIcon() {
        return `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>`;
    }

    function showResult({ status, title, message, downloads, downloadUrl, sourceUrl }) {
        result.hidden = false;
        result.classList.remove('is-error', 'is-success');
        if (status === 'error') result.classList.add('is-error');
        if (status === 'success') result.classList.add('is-success');

        let html = '';
        if (title) html += `<h3>${escapeHtml(title)}</h3>`;
        if (message) html += `<p>${escapeHtml(message)}</p>`;
        if (sourceUrl) html += `<div class="url-preview">${escapeHtml(sourceUrl)}</div>`;

        const list = Array.isArray(downloads) && downloads.length
            ? downloads
            : (downloadUrl ? [{ id: 'primary', label: 'Open Download Page', url: downloadUrl }] : []);

        if (list.length) {
            html += '<div class="download-list">';
            list.forEach((opt, idx) => {
                const isPrimary = idx === 0;
                html += `
                    <a href="${escapeAttr(opt.url)}"
                       target="_blank"
                       rel="noopener noreferrer"
                       class="download-btn ${isPrimary ? 'is-primary' : 'is-secondary'}">
                        ${downloadIcon()}
                        <span class="download-btn-label">
                            <strong>${escapeHtml(opt.label || ('Mirror ' + (idx + 1)))}</strong>
                            ${opt.description ? `<small>${escapeHtml(opt.description)}</small>` : ''}
                        </span>
                    </a>`;
            });
            html += '</div>';
            html += '<p class="download-note">Tip: jika satu mirror gagal atau bilang "not found", coba mirror lain. Mirror tersebut adalah layanan pihak ketiga.</p>';
        }

        result.innerHTML = html;
        result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }
    function escapeAttr(s) { return escapeHtml(s); }

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
                message: 'URL harus dari domain scribd.com dan diawali dengan /document/, /doc/, atau /presentation/.'
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
                title: data.title || 'Siap untuk diunduh!',
                message: data.message || 'Klik salah satu tombol di bawah untuk membuka halaman download.',
                downloads: data.downloads,
                downloadUrl: data.downloadUrl,
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
})();
