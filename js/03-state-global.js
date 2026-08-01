        // STATE GLOBAL
        // ================================================================
        let cashDataMap = {};
        let salesData = [];
        // ------------------------------------------------------------------
        // Pelacak sinkronisasi INKREMENTAL untuk salesData (Bank Data Penjualan).
        // Dulu setiap simpan = hapus SEMUA dokumen sales lalu tulis ulang semua
        // dari awal (rawan gagal & boros kalau datanya sudah banyak). Sekarang
        // hanya baris yang benar-benar baru/berubah/dihapus yang dikirim ke
        // server, memakai 2 struktur ini:
        //   - salesDocIds: WeakMap dari OBJEK baris -> id dokumen Firestore-nya
        //     (row yang belum pernah tersimpan tidak ada di sini = dianggap baru)
        //   - salesSyncedSnapshot: Map dari id dokumen -> isi baris (dalam
        //     bentuk JSON string) SEPERTI TERAKHIR KALI dikonfirmasi tersimpan
        //     di server, dipakai untuk mendeteksi baris mana yang isinya
        //     berubah sejak save terakhir (supaya tidak ikut ditulis ulang
        //     kalau memang tidak berubah).
        // ------------------------------------------------------------------
        let salesDocIds = new WeakMap();
        let salesSyncedSnapshot = new Map();
        let cashBulan = '2026-07';
        let cashFiltered = [];
        let cashPage = 1;
        const cashRowsPerPage = 20;
        let salesCurrentDateIndex = Infinity;
        let salesIsPiutangMode = false;
        let rawCashSales = [];
        let rawCashDrop = [];
        let cekFilterFaktur = '',
            cekFilterTanggal = '',
            cekFilterSales = '',
            cekFilterBulan = '',
            cekFilterKategori = '',
            cekFilterKet = '';
        let APP_DEFAULT_BULAN = '';
        let userSetBulan = { sales: false, cek: false, pt: false, rp: false };
        const filterCache = new Map();
        const CACHE_MAX = 50;

        let ptPage = 1;
        const ptRowsPerPage = 25;

        // State checkbox piutang (dipakai Tab 4 dan Tab 6)
        let ptChecked = {};
        // State checkbox faktur cash (dipakai Tab 3 dan Tab 6)
        let cashChecked = {};
        // State checkbox baris Bank Data Penjualan yang mau dipindah ke Data Sampah (Tab 1)
        let salesRowsSelected = new Set();
        // Data Sampah (baris yang dipindahkan manual dari Bank Data Penjualan karena salah/gagal/batal)
        let trashData = [];
        // State filter/pagination/pilihan untuk Tab 8 (Trash & Save)
        let trashSearchQuery = '';
        let trashSalesFilterVal = '';
        let trashAlasanFilterVal = '';
        let trashPage = 1;
        const trashRowsPerPage = 15;
        let trashRowsSelected = new Set();
        // Catatan per No.Faktur untuk Cek Piutang (Tab 4)
        let piutangNotesMap = {};
        let ptCurrentDetailFaktur = null;
        // Catatan per No.Faktur untuk Cek Cash (Tab 3)
        let cashNotesMap = {};
        let cashCurrentDetailFaktur = null;

        // Pagination untuk Tab 3 (Cek Cash) satu tabel
        let cashTablePage = 1;
        const cashTableRowsPerPage = 25;
        let cashTableFiltered = [];

        function escapeHtml(str) {
            return String(str == null ? '' : str)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        // ================================================================
