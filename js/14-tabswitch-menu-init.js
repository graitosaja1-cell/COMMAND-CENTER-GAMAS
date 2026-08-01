        // TAB SWITCHING
        // ================================================================
        async function switchTab(tabName) {
            document.querySelectorAll('.tab-btn').forEach(function(btn) {
                btn.classList.remove('active');
            });
            document.querySelectorAll('.tab-content').forEach(function(content) {
                content.classList.remove('active');
            });
            const activeBtn = document.querySelector('.tab-btn[data-tab="' + tabName + '"]');
            if (activeBtn) {
                activeBtn.classList.add('active');
            }
            const activeContent = document.getElementById(tabName);
            if (activeContent) {
                activeContent.classList.add('active');
            }
            document.querySelectorAll('.menu-dropdown.active').forEach(function(d) {
                d.classList.remove('active');
            });
            scheduleFitTableWraps();
            if (tabName === 'tab0') {
                if (!window._ptDataLoaded) {
                    await loadAllCashDataBeforePtRefresh();
                    await ptRefresh(false);
                    window._ptDataLoaded = true;
                }
                rkRender();
            }
            if (tabName === 'tab3') {
                if (!window._cekDataLoaded) {
                    await renderCek();
                    window._cekDataLoaded = true;
                }
            }
            if (tabName === 'tab4') {
                if (!window._ptDataLoaded) {
                    await loadAllCashDataBeforePtRefresh();
                    await ptRefresh(false);
                    window._ptDataLoaded = true;
                }
                ptRebuildFilterOptions();
                ptRenderTempoTable();
            }
            if (tabName === 'tab6') {
                // Rekap Tagihan (tab6) butuh data piutang tempo (ptIncomeByMonth) yang
                // biasanya dimuat saat tab4 pertama dibuka. Kalau user belum pernah
                // membuka tab4 sama sekali, muat dulu di sini supaya datanya tidak
                // kosong/salah saat ditampilkan di tab6.
                if (!window._ptDataLoaded) {
                    await loadAllCashDataBeforePtRefresh();
                    await ptRefresh(false);
                    window._ptDataLoaded = true;
                }
                renderTagihanDariPiutang();
                renderRiwayatCetak();
            }
            if (tabName === 'tab7') {
                if (!window._inputHarianInited) {
                    initInputHarian();
                    window._inputHarianInited = true;
                }
            }
            if (tabName === 'tab8') {
                renderRingkasanSaveAll();
            }
            if (tabName === 'tab10') {
                if (!window._pengeluaranDataLoaded) {
                    await loadPengeluaranData();
                    document.getElementById('pgInTanggal').value = new Date().toISOString().slice(0, 10);
                    window._pengeluaranDataLoaded = true;
                }
                pgRebuildBulanOptions();
                renderPengeluaran();
            }
        }

        document.querySelectorAll('.tab-btn[data-tab]').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const tabName = this.getAttribute('data-tab');
                switchTab(tabName);
            });
        });
        new MutationObserver(scheduleFitTableWraps).observe(document.body, { childList: true, subtree: true,
            attributes: true, attributeFilter: ['class', 'style'] });

        // ================================================================
        // MENU MODAL TOGGLE
        // ================================================================
        function setupMenuDropdown(btnId, dropdownId) {
            const btn = document.getElementById(btnId);
            const dropdown = document.getElementById(dropdownId);
            if (!btn || !dropdown) return;
            document.body.appendChild(dropdown);
            dropdown.style.position = 'fixed';
            dropdown.style.margin = '0';

            function positionDropdown() {
                const rect = btn.getBoundingClientRect();
                dropdown.style.top = Math.round(rect.bottom + 4) + 'px';
                // Ukur lebar dropdown dulu (sementara left-align) untuk cek apakah muat di layar.
                dropdown.style.right = 'auto';
                dropdown.style.left = Math.round(rect.left) + 'px';
                const dw = dropdown.offsetWidth;
                if (rect.left + dw > window.innerWidth - 8) {
                    // Kalau align-kiri bikin dropdown kepotong di kanan layar, align-kanan saja
                    // (menempel ke sisi kanan tombol), seperti menu lain.
                    dropdown.style.left = 'auto';
                    dropdown.style.right = Math.round(window.innerWidth - rect.right) + 'px';
                }
            }

            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const willOpen = !dropdown.classList.contains('active');
                document.querySelectorAll('.menu-dropdown.active').forEach(function(d) {
                    if (d !== dropdown) d.classList.remove('active');
                });
                if (willOpen) {
                    positionDropdown();
                    dropdown.classList.add('active');
                } else {
                    dropdown.classList.remove('active');
                }
            });

            dropdown.addEventListener('click', function(e) {
                e.stopPropagation();
            });

            window.addEventListener('resize', function() {
                if (dropdown.classList.contains('active')) positionDropdown();
            });
            window.addEventListener('scroll', function() {
                if (dropdown.classList.contains('active')) positionDropdown();
            }, true);
        }

        setupMenuDropdown('salesMenuBtn', 'salesMenuDropdown');
        setupMenuDropdown('pemasukanMenuBtn', 'pemasukanMenuDropdown');
        setupMenuDropdown('ptMenuBtn', 'ptMenuDropdown');
        setupMenuDropdown('ptKolomBtn', 'ptKolomDropdown');
        setupMenuDropdown('harianMenuBtn', 'harianMenuDropdown');
        setupMenuDropdown('pgMenuBtn', 'pgMenuDropdown');

        document.addEventListener('click', function() {
            document.querySelectorAll('.menu-dropdown.active').forEach(function(d) {
                d.classList.remove('active');
            });
        });

        // ================================================================
        // INIT
        // ================================================================
        function showLoginOverlay(message) {
            let el = document.getElementById('authOverlay');
            if (el) { el.style.display = 'flex'; if (message) document.getElementById('authMsg').textContent = message; return; }
        }

        async function startApp() {
            checkStorageStatus();
            try {
                try { await cobaPulihkanDariLocalStorageBackup(); } catch (e) { console.warn('Lewati pemulihan cadangan lokal:', e); }
                await loadSalesData();
                await loadTrashData();
                await loadPiutangNotes();
                await loadCashNotes();
                await loadCetakTagihanMap();

                // Filter periode bulan dibuka otomatis di bulan TERBARU: diambil dari mana yang
                // lebih baru antara tanggal sistem/perangkat saat ini dan bulan terakhir yang ada
                // di data (Bank Data Penjualan). Jadi tidak perlu diubah manual tiap bulan lagi.
                const nowForBulan = new Date();
                let defaultBulan = nowForBulan.getFullYear() + '-' + String(nowForBulan.getMonth() + 1).padStart(2, '0');
                const salesPeriodsAwal = new Set();
                salesData.forEach(r => { if (r.Tanggal) salesPeriodsAwal.add(String(r.Tanggal).slice(0, 7)); });
                if (salesPeriodsAwal.size) {
                    const latestSalesBulan = Array.from(salesPeriodsAwal).sort().pop();
                    if (latestSalesBulan > defaultBulan) defaultBulan = latestSalesBulan;
                }
                APP_DEFAULT_BULAN = defaultBulan;

                rebuildSalesFilterOptions();

                const bulanSelect = document.getElementById('bulanPemasukan');
                let found = false;
                for (let opt of bulanSelect.options) {
                    if (opt.value === defaultBulan) { opt.selected = true;
                        found = true; break; }
                }
                if (!found) bulanSelect.value = defaultBulan;
                cashBulan = bulanSelect.value;

                await loadCashData();
                renderPemasukan();
                renderSales();
                if (typeof requestIdleCallback === 'function') {
                    requestIdleCallback(() => { checkAndShowSalesAnomaliBanner(); });
                } else {
                    setTimeout(() => { checkAndShowSalesAnomaliBanner(); }, 0);
                }
                // Cuma update badge (ringan, pakai .count()) di startup — tabel
                // Trash & Save yang berat baru dirender saat Tab 8 benar-benar
                // dibuka user (lihat switchTab -> renderRingkasanSaveAll()).
                await updateRingkasanBadges();

                switchTab('tab0');
                scheduleFitTableWraps();
                checkPendingTransferBankData();
                
                // ===== LISTEN UNTUK KIRIMAN DATA DARI TAB LAIN =====
                // Ketika user klik "Kirim ke Bank Data Penjualan" di dashboard-data,
                // storage event ini akan mendeteksi dan menampilkan notification bar
                window.addEventListener('storage', function(event) {
                    if (event.key === 'gm2026_transferBankData' && event.newValue) {
                        console.log('📥 Mendeteksi data baru dari tab Rapikan Data...');
                        checkPendingTransferBankData();
                    }
                });

                console.log('✅ GAMAS 2026 FINAL — Semua tab berfungsi.');
            } catch (err) {
                console.error('Gagal inisialisasi database/aplikasi:', err);
                showToast('❌ Gagal membuka database: ' + err.message + ' — lihat peringatan di atas.', 'warning');
                const bar = document.getElementById('storageStatusBar');
                if (bar && location.protocol !== 'file:') {
                    bar.style.display = 'block';
                    bar.style.background = '#fee2e2';
                    bar.style.color = '#991b1b';
                    bar.style.borderBottom = '2px solid #dc2626';
                    bar.innerHTML = '🚫 Database gagal dibuka (' + err.message +
                        '). Coba muat ulang halaman; jika terus terjadi, buka lewat http:// bukan file://.';
                }
            }
        }

        // ================================================================
        // AUTH BOOTSTRAP — dinonaktifkan (hosting statis GitHub Pages tidak
        // punya server backend untuk /api/auth/..., jadi langsung buka app).
        // ================================================================
        (async function bootstrap() {
            startApp();
        })();

        // ================================================================
        // LOGOUT
        // ================================================================
        async function handleLogoutClick() {
            if (!confirm('Yakin mau logout dari GAMAS 2026?')) return;
            try {
                await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
            } catch (e) { /* tetap lanjut reload walau request gagal, biar UI konsisten */ }
            location.reload();
        }
        document.getElementById('btnLogoutHeader').addEventListener('click', handleLogoutClick);
        const btnLogoutFloatEl = document.getElementById('btnLogoutFloat');
        if (btnLogoutFloatEl) btnLogoutFloatEl.addEventListener('click', handleLogoutClick);

        async function handleAuthSubmit(e) {
            e.preventDefault();
            const mode = document.getElementById('authMode').value;
            const username = document.getElementById('authUsername').value.trim();
            const password = document.getElementById('authPassword').value;
            const msgEl = document.getElementById('authMsg');
            msgEl.style.color = '#991b1b';
            msgEl.textContent = '';
            if (!username || !password) { msgEl.textContent = 'Isi username dan password.'; return; }
            try {
                const url = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
                await apiFetch(url, { method: 'POST', body: JSON.stringify({ username, password }) });
                document.getElementById('authOverlay').style.display = 'none';
                AUTH_EXPIRED = false;
                startApp();
            } catch (err) {
                msgEl.textContent = '❌ ' + err.message;
            }
        }

        // Service Worker — dengan deteksi update otomatis
        // Supaya kalau ada versi baru service-worker.js/HTML di server,
        // browser langsung pakai versi itu (reload sekali), bukan nyangkut
        // di cache lama selamanya.
        if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
            window.addEventListener('load', function() {
                navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' })
                    .then(function(reg) {
                        document.addEventListener('visibilitychange', function() {
                            if (document.visibilityState === 'visible') reg.update().catch(function() {});
                        });
                        reg.addEventListener('updatefound', function() {
                            const baru = reg.installing;
                            if (!baru) return;
                            baru.addEventListener('statechange', function() {
                                if (baru.state === 'installed' && navigator.serviceWorker.controller) {
                                    baru.postMessage('SKIP_WAITING');
                                }
                            });
                        });
                    })
                    .catch(function(err) {
                        console.warn('Service worker gagal didaftarkan:', err);
                    });

                let sudahReload = false;
                navigator.serviceWorker.addEventListener('controllerchange', function() {
                    if (sudahReload) return;
                    sudahReload = true;
                    location.reload();
                });
            });
        }
