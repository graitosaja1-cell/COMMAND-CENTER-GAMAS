        // DATABASE & MIGRASI
        // ================================================================
        // ================================================================
        // PENYIMPANAN LOKAL (IndexedDB) — data tersimpan permanen langsung
        // di browser/perangkat ini, TIDAK butuh server/backend apapun.
        // Objek `db` di bawah ini sengaja dibuat dengan bentuk method yang
        // SAMA seperti sebelumnya (add, bulkAdd, toArray, count, clear,
        // delete, update, where().equals().first()) supaya seluruh kode
        // aplikasi di bawah ini TIDAK PERLU diubah satu-persatu.
        // ================================================================
        let AUTH_EXPIRED = false;

        const IDB_NAME = 'GajahMas2026DB';
        // v2: menambahkan index per-field supaya query where().equals() tidak
        // perlu lagi memindai (scan) seluruh isi tabel satu per satu.
        const IDB_VERSION = 2;
        const IDB_STORES = ['sales', 'cashIncome', 'printHistory', 'trash', 'piutangNotes', 'cashNotes', 'cetakTagihanMap', 'inputHarian', 'pengeluaran'];
        // Field yang dipakai lewat db.<table>.where('field') di kode aplikasi —
        // masing-masing dibuatkan index IndexedDB supaya pencariannya cepat
        // (O(log n) lewat index) walau datanya sudah ribuan baris.
        const IDB_INDEXES = {
            cashIncome: ['bulan'],
            pengeluaran: ['bulan'],
            piutangNotes: ['noFaktur'],
            cetakTagihanMap: ['noFaktur'],
            cashNotes: ['noFaktur'],
            inputHarian: ['tanggal']
        };

        let _idbPromise = null;
        function openIdb() {
            if (_idbPromise) return _idbPromise;
            _idbPromise = new Promise((resolve, reject) => {
                const req = indexedDB.open(IDB_NAME, IDB_VERSION);
                req.onupgradeneeded = function(e) {
                    const dbi = e.target.result;
                    const tx = e.target.transaction;
                    IDB_STORES.forEach(function(name) {
                        let store;
                        if (!dbi.objectStoreNames.contains(name)) {
                            store = dbi.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
                        } else {
                            store = tx.objectStore(name);
                        }
                        (IDB_INDEXES[name] || []).forEach(function(field) {
                            if (!store.indexNames.contains(field)) {
                                store.createIndex(field, field, { unique: false });
                            }
                        });
                    });
                };
                req.onsuccess = function(e) { resolve(e.target.result); };
                req.onerror = function(e) { reject(e.target.error || new Error('Gagal membuka IndexedDB')); };
            });
            return _idbPromise;
        }

        class LocalTable {
            constructor(name) { this.name = name; }
            async _store(mode) {
                const dbi = await openIdb();
                return dbi.transaction(this.name, mode).objectStore(this.name);
            }
            async add(obj) {
                const store = await this._store('readwrite');
                return new Promise((resolve, reject) => {
                    const req = store.add(obj);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
            }
            async bulkAdd(arr) {
                if (!arr || arr.length === 0) return;
                const store = await this._store('readwrite');
                return new Promise((resolve, reject) => {
                    let i = 0;
                    function next() {
                        if (i >= arr.length) { resolve(); return; }
                        const req = store.add(arr[i]);
                        i++;
                        req.onsuccess = next;
                        req.onerror = () => reject(req.error);
                    }
                    next();
                });
            }
            async toArray() {
                const store = await this._store('readonly');
                return new Promise((resolve, reject) => {
                    const req = store.getAll();
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
            }
            async count() {
                const store = await this._store('readonly');
                return new Promise((resolve, reject) => {
                    const req = store.count();
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
            }
            async clear() {
                const store = await this._store('readwrite');
                return new Promise((resolve, reject) => {
                    const req = store.clear();
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            }
            async delete(id) {
                const store = await this._store('readwrite');
                return new Promise((resolve, reject) => {
                    const req = store.delete(id);
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            }
            async update(id, changes) {
                const store = await this._store('readwrite');
                return new Promise((resolve, reject) => {
                    const getReq = store.get(id);
                    getReq.onsuccess = () => {
                        const existing = getReq.result;
                        if (!existing) { resolve(); return; }
                        const updated = Object.assign({}, existing, changes, { id: id });
                        const putReq = store.put(updated);
                        putReq.onsuccess = () => resolve();
                        putReq.onerror = () => reject(putReq.error);
                    };
                    getReq.onerror = () => reject(getReq.error);
                });
            }
            where(field) {
                return {
                    equals: (value) => ({
                        first: async () => {
                            const store = await this._store('readonly');
                            return new Promise((resolve, reject) => {
                                if (store.indexNames.contains(field)) {
                                    // Cepat: lookup langsung lewat index, tidak perlu baca semua baris.
                                    const req = store.index(field).get(value);
                                    req.onsuccess = () => resolve(req.result);
                                    req.onerror = () => reject(req.error);
                                } else {
                                    // Fallback lama (belum ada index untuk field ini): scan manual.
                                    const req = store.getAll();
                                    req.onsuccess = () => resolve(req.result.find(row => row[field] === value));
                                    req.onerror = () => reject(req.error);
                                }
                            });
                        }
                    })
                };
            }
            // Versi IndexedDB dari syncRows (lihat FirestoreTable.syncRows untuk
            // penjelasan lengkap). IndexedDB tidak punya batas 500 operasi seperti
            // Firestore, tapi tetap dibuat "hanya tulis yang berubah" supaya
            // perilakunya konsisten dengan mode Firestore.
            async syncRows(currentRows, docIdMap, snapshotMap) {
                const store = await this._store('readwrite');
                const stillPresentIds = new Set();
                const toAdd = [], toUpdate = [], toDeleteIds = [];

                currentRows.forEach(row => {
                    const id = docIdMap.get(row);
                    if (!id) {
                        toAdd.push(row);
                    } else {
                        stillPresentIds.add(id);
                        const prevJSON = snapshotMap.get(id);
                        const curJSON = JSON.stringify(row);
                        if (prevJSON !== curJSON) toUpdate.push({ id, row });
                    }
                });
                snapshotMap.forEach((_, id) => { if (!stillPresentIds.has(id)) toDeleteIds.push(id); });

                await new Promise((resolve, reject) => {
                    let pending = toAdd.length + toUpdate.length + toDeleteIds.length;
                    if (pending === 0) { resolve(); return; }
                    let failed = null;
                    const done = () => { pending--; if (pending === 0) { failed ? reject(failed) : resolve(); } };
                    toAdd.forEach(row => {
                        const req = store.add(row);
                        req.onsuccess = () => { docIdMap.set(row, req.result); snapshotMap.set(req.result, JSON.stringify(row)); done(); };
                        req.onerror = () => { failed = req.error; done(); };
                    });
                    toUpdate.forEach(({ id, row }) => {
                        const req = store.put(Object.assign({}, row, { id }));
                        req.onsuccess = () => { snapshotMap.set(id, JSON.stringify(row)); done(); };
                        req.onerror = () => { failed = req.error; done(); };
                    });
                    toDeleteIds.forEach(id => {
                        const req = store.delete(id);
                        req.onsuccess = () => { snapshotMap.delete(id); done(); };
                        req.onerror = () => { failed = req.error; done(); };
                    });
                });
                return { added: toAdd.length, updated: toUpdate.length, deleted: toDeleteIds.length };
            }
        }

        // ================================================================
        // PENYIMPANAN: murni IndexedDB lokal di browser ini, tanpa server/
        // backend/koneksi apapun. Semua indikator "sinkron ke server" dan
        // badge status koneksi sudah dihapus karena tidak relevan lagi.
        // ================================================================
        const NAMA_TABEL = ['sales', 'cashIncome', 'printHistory', 'trash', 'piutangNotes', 'cashNotes', 'cetakTagihanMap', 'inputHarian', 'pengeluaran'];

        function buatDb() {
            const obj = {
                version: function() { return { stores: function() { return { upgrade: function() {} }; } }; },
                transaction: async function(mode, table, fn) { return await fn(); }
            };
            NAMA_TABEL.forEach(nama => {
                obj[nama] = new LocalTable(nama);
            });
            return obj;
        }

        const db = buatDb();

        // ================================================================
        // STICKY FILTER BAR — filter tetap kelihatan di bawah header & tab
        // saat halaman discroll ke bawah (tidak ikut naik/hilang lagi).
        // ================================================================
        function updateStickyFilterOffset() {
            const header = document.querySelector('.app-header');
            const tabs = document.querySelector('.tabs');
            const headerVisible = header && getComputedStyle(header).display !== 'none';
            const tabsVisible = tabs && getComputedStyle(tabs).display !== 'none';
            const headerH = headerVisible ? header.offsetHeight : 0;
            const tabsH = tabsVisible ? tabs.offsetHeight : 0;
            document.documentElement.style.setProperty('--sticky-filter-top', (headerH + tabsH) + 'px');
        }
        window.addEventListener('load', updateStickyFilterOffset);
        window.addEventListener('resize', updateStickyFilterOffset);
        document.addEventListener('DOMContentLoaded', function() {
            updateStickyFilterOffset();
            setTimeout(updateStickyFilterOffset, 300);
        });

        // ================================================================
        // FILTER LANJUTAN — toggle panel filter tambahan (ringkas/simple)
        // untuk tab Bank Data Penjualan, Cek Cash, dan Cek Piutang.
        // ================================================================
        function setupFilterAdvToggle(toggleId, panelId) {
            const toggleBtn = document.getElementById(toggleId);
            const panel = document.getElementById(panelId);
            if (!toggleBtn || !panel) return;
            toggleBtn.addEventListener('click', function() {
                const isOpen = panel.classList.toggle('show');
                toggleBtn.classList.toggle('open', isOpen);
                toggleBtn.innerHTML = isOpen
                    ? 'Sembunyikan Filter <span class="arrow">→</span>'
                    : 'Filter Lanjutan <span class="arrow">→</span>';
                setTimeout(updateStickyFilterOffset, 50);
            });
        }
        document.addEventListener('DOMContentLoaded', function() {
            setupFilterAdvToggle('salesAdvToggle', 'salesAdvPanel');
            setupFilterAdvToggle('cashAdvToggle', 'cashAdvPanel');
            setupFilterAdvToggle('ptAdvToggle', 'ptAdvPanel');
        });


        async function migrateFromLocalStorage() {
            const count = await db.sales.count();
            if (count === 0) {
                const raw = localStorage.getItem('bankDataPenjualan');
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            await db.sales.bulkAdd(parsed);
                        }
                    } catch (e) { console.warn('Gagal migrasi sales:', e); }
                }
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('gajahMasPemasukanData_')) {
                        const bulan = key.replace('gajahMasPemasukanData_', '');
                        try {
                            const raw = localStorage.getItem(key);
                            if (raw) {
                                const data = JSON.parse(raw);
                                if (Array.isArray(data) && data.length > 0) {
                                    const existing = await db.cashIncome.where('bulan').equals(bulan).first();
                                    if (!existing) {
                                        await db.cashIncome.add({ bulan, data, tanggal: new Date().toISOString() });
                                    }
                                }
                            }
                        } catch (e) { console.warn('Gagal migrasi cash:', key, e); }
                    }
                }
            }
        }

        // ================================================================
        // JARING PENGAMAN GANDA: auto-backup ke localStorage
        // Selain IndexedDB (db.sales / db.cashIncome), setiap kali data
        // berhasil disimpan juga dicadangkan otomatis ke localStorage.
        // Kalau IndexedDB browser ternyata direset (mis. mode Incognito,
        // webview aplikasi lain, atau setting "hapus data situs otomatis"),
        // saat aplikasi dibuka lagi data masih bisa dipulihkan dari sini.
        // ================================================================
        const LS_BACKUP_SALES_KEY = 'gmAutoBackupSalesV1';
        const LS_BACKUP_CASH_KEY = 'gmAutoBackupCashV1';

        function autoBackupSalesToLocalStorage() {
            try {
                localStorage.setItem(LS_BACKUP_SALES_KEY, JSON.stringify(salesData));
            } catch (e) {
                console.warn('Auto-backup sales ke localStorage gagal (mungkin penuh):', e);
            }
        }

        async function autoBackupCashToLocalStorage() {
            try {
                const all = await db.cashIncome.toArray();
                localStorage.setItem(LS_BACKUP_CASH_KEY, JSON.stringify(all));
            } catch (e) {
                console.warn('Auto-backup cash ke localStorage gagal:', e);
            }
        }

        async function cobaPulihkanDariLocalStorageBackup() {
            let dipulihkan = [];
            try {
                const salesCount = await db.sales.count();
                if (salesCount === 0) {
                    const raw = localStorage.getItem(LS_BACKUP_SALES_KEY);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            await db.sales.bulkAdd(parsed);
                            dipulihkan.push(parsed.length + ' baris Bank Data Penjualan');
                        }
                    }
                }
            } catch (e) { console.warn('Gagal pulihkan sales dari cadangan lokal:', e); }
            try {
                const cashCount = await db.cashIncome.count();
                if (cashCount === 0) {
                    const raw = localStorage.getItem(LS_BACKUP_CASH_KEY);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            await db.cashIncome.bulkAdd(parsed);
                            dipulihkan.push('Data Uang Masuk (' + parsed.length + ' catatan bulan)');
                        }
                    }
                }
            } catch (e) { console.warn('Gagal pulihkan cash dari cadangan lokal:', e); }
            if (dipulihkan.length > 0) {
                showToast('🔄 Dipulihkan otomatis dari cadangan lokal: ' + dipulihkan.join(', '), 'info');
            }
        }

        // ================================================================
        // CEK STATUS PENYIMPANAN — beri tahu pengguna jika browser/perangkat
        // yang dipakai tidak mendukung penyimpanan permanen, supaya mereka
        // tahu harus rutin klik "Save All Data" di tab Trash & Save.
        // ================================================================
        async function checkStorageStatus() {
            const bar = document.getElementById('storageStatusBar');
            if (!bar) return;

            // Kasus paling umum & paling parah: file dibuka langsung lewat
            // file:///... (double klik / File Explorer). Browser memberi
            // origin 'null' untuk kasus ini sehingga IndexedDB (tempat semua
            // data disimpan) TIDAK BISA persisten - ini penyebab utama data
            // selalu hilang saat refresh, bukan bug di aplikasi.
            if (location.protocol === 'file:') {
                bar.style.display = 'block';
                bar.style.background = '#fee2e2';
                bar.style.color = '#991b1b';
                bar.style.borderBottom = '2px solid #dc2626';
                bar.innerHTML = `
                    <span style="flex:1;cursor:pointer;">🚫 <strong>File ini dibuka langsung (file:///...)</strong> — karena itu data TIDAK BISA tersimpan permanen (dijamin selalu hilang saat refresh). Wajib dijalankan lewat web server (http://) atau hosting online. Klik untuk lihat caranya.</span>
                    <span style="cursor:pointer;font-size:18px;font-weight:700;padding:0 10px;line-height:1;" id="bannerCloseBtn">×</span>
                `;
                bar.style.display = 'flex';
                bar.style.alignItems = 'center';
                bar.style.justifyContent = 'space-between';
                bar.style.cursor = 'default';
                const textSpan = bar.querySelector('span:first-child');
                if (textSpan) {
                    textSpan.style.cursor = 'pointer';
                    textSpan.onclick = function(e) {
                        e.stopPropagation();
                        alert('CARA MEMPERBAIKI:\n\n' +
                            'CARA 1 - Hosting online gratis (paling mudah, tanpa install apa-apa):\n' +
                            '1. Buka https://app.netlify.com/drop di browser\n' +
                            '2. Seret (drag & drop) file dashboard.html ke halaman itu\n' +
                            '3. Anda akan dapat link https://xxxx.netlify.app - buka & pakai link itu seterusnya\n' +
                            '4. Di HP, buka link itu di Chrome lalu pilih "Tambahkan ke Layar Utama" supaya jadi app\n\n' +
                            'CARA 2 - Server lokal di PC (kalau paham teknis):\n' +
                            '1. Buka folder tempat dashboard.html berada\n' +
                            '2. Jalankan perintah: python -m http.server 8000\n' +
                            '3. Buka http://localhost:8000/dashboard.html di Chrome\n\n' +
                            'JANGAN dobel-klik file HTML-nya langsung lagi setelah ini.');
                    };
                }
                const closeBtn = document.getElementById('bannerCloseBtn');
                if (closeBtn) {
                    closeBtn.onclick = function(e) {
                        e.stopPropagation();
                        sessionStorage.setItem('gmBannerDismissed', 'true');
                        bar.style.display = 'none';
                    };
                }
                return; // jangan lanjut cek persist API, sudah pasti bermasalah
            }

            // Cek apakah user sudah dismiss banner dalam sesi ini
            if (sessionStorage.getItem('gmBannerDismissed') === 'true') {
                bar.style.display = 'none';
                return;
            }

            let persisted = false;
            try {
                if (navigator.storage && navigator.storage.persisted) {
                    persisted = await navigator.storage.persisted();
                    if (!persisted && navigator.storage.persist) {
                        persisted = await navigator.storage.persist();
                    }
                }
            } catch (e) { persisted = false; }

            const supportsStorageApi = !!(navigator.storage && navigator.storage.persisted);

            if (!supportsStorageApi || !persisted) {
                bar.style.display = 'flex';
                bar.style.background = '#fef3c7';
                bar.style.color = '#92400e';
                bar.style.borderBottom = '1px solid #f59e0b';
                bar.style.alignItems = 'center';
                bar.style.justifyContent = 'space-between';
                bar.style.cursor = 'default';
                bar.innerHTML = `
                    <span style="flex:1;cursor:pointer;">⚠️ Penyimpanan permanen belum terjamin di browser/perangkat ini. Data BISA hilang saat refresh. Setelah upload, segera buka tab <strong>Trash &amp; Save → Save All Data</strong> untuk backup ke file. Klik untuk buka.</span>
                    <span style="cursor:pointer;font-size:18px;font-weight:700;padding:0 10px;line-height:1;" id="bannerCloseBtn">×</span>
                `;
                const textSpan = bar.querySelector('span:first-child');
                if (textSpan) {
                    textSpan.style.cursor = 'pointer';
                    textSpan.onclick = function(e) {
                        e.stopPropagation();
                        switchTab('tab8');
                    };
                }
                const closeBtn = document.getElementById('bannerCloseBtn');
                if (closeBtn) {
                    closeBtn.onclick = function(e) {
                        e.stopPropagation();
                        sessionStorage.setItem('gmBannerDismissed', 'true');
                        bar.style.display = 'none';
                        showToast('Banner ditutup. Anda bisa buka lagi nanti di Tab Trash & Save.', 'info');
                    };
                }
            } else {
                bar.style.display = 'block';
                bar.style.background = '#d1fae5';
                bar.style.color = '#065f46';
                bar.style.borderBottom = '1px solid #10b981';
                bar.innerHTML = '💾 Penyimpanan permanen aktif — data aman tersimpan di perangkat ini.';
                bar.onclick = null;
                setTimeout(function() {
                    bar.style.display = 'none';
                    sessionStorage.setItem('gmBannerDismissed', 'true');
                }, 6000);
            }
        }

        // ================================================================
