const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// ─── STATIC DATA ─────────────────────────────────────────────────────────────

const departments = [
  { name: 'Teknologi Informasi', code: 'IT',  description: 'Divisi IT & Sistem Informasi' },
  { name: 'Keuangan & Akuntansi', code: 'FIN', description: 'Divisi Keuangan dan Akuntansi' },
  { name: 'Sumber Daya Manusia', code: 'HR',  description: 'Divisi Human Resources' },
  { name: 'Operasional',          code: 'OPS', description: 'Divisi Operasional' },
  { name: 'Pemasaran',            code: 'MKT', description: 'Divisi Marketing & Sales' },
  { name: 'Legal & Compliance',   code: 'LGL', description: 'Divisi Legal' },
  { name: 'Produksi',             code: 'PRD', description: 'Divisi Produksi' },
  { name: 'Logistik',             code: 'LOG', description: 'Divisi Logistik & Supply Chain' },
];

const categories = [
  { name: 'Hardware',  code: 'HARDWARE',  color: '#EF4444', slaHours: 8,  description: 'Masalah perangkat keras' },
  { name: 'Software',  code: 'SOFTWARE',  color: '#3B82F6', slaHours: 4,  description: 'Masalah perangkat lunak & aplikasi' },
  { name: 'Network',   code: 'NETWORK',   color: '#8B5CF6', slaHours: 2,  description: 'Masalah jaringan & konektivitas' },
  { name: 'Email',     code: 'EMAIL',     color: '#F59E0B', slaHours: 4,  description: 'Masalah email & komunikasi' },
  { name: 'Printer',   code: 'PRINTER',   color: '#10B981', slaHours: 8,  description: 'Masalah printer & periferal' },
  { name: 'Security',  code: 'SECURITY',  color: '#DC2626', slaHours: 1,  description: 'Masalah keamanan sistem' },
  { name: 'Lainnya',   code: 'OTHER',     color: '#6B7280', slaHours: 24, description: 'Permintaan lainnya' },
];

const ticketSamples = [
  { title: 'Laptop tidak bisa menyala',        cat: 'HARDWARE', pri: 'HIGH',     desc: 'Laptop tiba-tiba mati dan tidak mau menyala kembali. Sudah dicoba charge semalaman. Butuh segera untuk presentasi besok.' },
  { title: 'VPN gagal terhubung',              cat: 'NETWORK',  pri: 'HIGH',     desc: 'Koneksi VPN selalu gagal dengan pesan "Authentication Failed". Sudah coba restart modem tapi tetap tidak bisa.' },
  { title: 'Email tidak terkirim ke eksternal',cat: 'EMAIL',    pri: 'MEDIUM',   desc: 'Email ke klien eksternal bounced dengan error "550 User Unknown". Email ke sesama internal masih normal.' },
  { title: 'Printer kantor error saat cetak',  cat: 'PRINTER',  pri: 'MEDIUM',   desc: 'Printer di lantai 3 selalu paper jam meskipun kertas sudah diganti. Lampu merah berkedip terus.' },
  { title: 'Aplikasi ERP crash saat input',    cat: 'SOFTWARE', pri: 'CRITICAL', desc: 'Aplikasi ERP tiba-tiba menutup saat input data transaksi. Data tidak tersimpan. Ini sudah terjadi 3 kali hari ini.' },
  { title: 'Internet sangat lambat di lantai 2',cat:'NETWORK',  pri: 'HIGH',     desc: 'Seluruh pengguna di lantai 2 mengeluh internet sangat lambat sejak pagi. Speed test menunjukkan < 1 Mbps.' },
  { title: 'Lupa password Windows',            cat: 'SOFTWARE', pri: 'LOW',      desc: 'Karyawan baru lupa password Windows setelah PC direset admin. Perlu reset untuk bisa masuk sistem.' },
  { title: 'Monitor bergaris horizontal',      cat: 'HARDWARE', pri: 'MEDIUM',   desc: 'Layar monitor menampilkan garis-garis horizontal berwarna yang mengganggu. Sudah coba ganti kabel VGA tapi sama saja.' },
  { title: 'Keyboard beberapa tombol rusak',   cat: 'HARDWARE', pri: 'LOW',      desc: 'Tombol A, S, D tidak merespons. Keyboard sudah dicoba di PC lain dan hasilnya sama, sepertinya memang rusak.' },
  { title: 'Virus terdeteksi di PC accounting', cat:'SECURITY', pri: 'CRITICAL', desc: 'Windows Defender mendeteksi trojan di PC bagian accounting. Khawatir data keuangan bocor. Mohon segera tangani.' },
  { title: 'Shared folder tidak bisa diakses', cat: 'NETWORK',  pri: 'MEDIUM',   desc: 'Folder shared di server tidak bisa diakses dari beberapa PC. Error "Network path not found".' },
  { title: 'Update Windows gagal terus',       cat: 'SOFTWARE', pri: 'LOW',      desc: 'Windows Update selalu error 0x80070005 saat dijalankan. Sudah coba manual update tapi tetap gagal.' },
  { title: 'License software expired',         cat: 'SOFTWARE', pri: 'HIGH',     desc: 'AutoCAD muncul notifikasi license expired. Desainer tidak bisa bekerja. Perlu aktivasi ulang segera.' },
  { title: 'PC sangat lambat saat startup',    cat: 'HARDWARE', pri: 'LOW',      desc: 'PC di meja resepsionis butuh 15 menit untuk bisa dipakai sejak dinyalakan. Sudah lama bermasalah.' },
  { title: 'Projector ruang rapat tidak terdeteksi', cat:'HARDWARE', pri:'MEDIUM', desc: 'Laptop tidak mendeteksi projector di ruang rapat utama. Ada meeting penting siang ini.' },
  { title: 'Backup otomatis gagal',            cat: 'SOFTWARE', pri: 'HIGH',     desc: 'Backup server malam tadi gagal dengan error "Insufficient disk space". Perlu cek segera sebelum data hilang.' },
  { title: 'Akun email karyawan terkunci',     cat: 'EMAIL',    pri: 'MEDIUM',   desc: 'Akun email terkunci setelah beberapa kali salah password. Karyawan tidak bisa terima email penting dari klien.' },
  { title: 'Switch jaringan di gudang mati',   cat: 'NETWORK',  pri: 'CRITICAL', desc: 'Switch jaringan di gudang tidak nyala. Seluruh perangkat gudang (barcode scanner, PC) offline semua.' },
  { title: 'Software desain tidak bisa install',cat:'SOFTWARE', pri: 'MEDIUM',   desc: 'Adobe Illustrator gagal install dengan error "Insufficient privileges". Admin rights tidak membantu.' },
  { title: 'Telepon IP tidak bisa call keluar', cat:'OTHER',    pri: 'HIGH',     desc: 'Telepon IP di meja direksi tidak bisa melakukan panggilan keluar. Terima panggilan masih bisa.' },
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding database...');

  // ── CLEANUP ──────────────────────────────────────────────────────────────────
  await prisma.activityLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.ticketComment.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.refreshToken.deleteMany();

  // PO cleanup
  await prisma.tandaTerimaAttachment.deleteMany();
  await prisma.tandaTerimaItem.deleteMany();
  await prisma.tandaTerima.deleteMany();
  await prisma.selisihPOAttachment.deleteMany();
  await prisma.selisihPOItem.deleteMany();
  await prisma.selisihPO.deleteMany();
  await prisma.internalPOAttachment.deleteMany();
  await prisma.internalPOItem.deleteMany();
  await prisma.internalPO.deleteMany();
  await prisma.vendorPOAttachment.deleteMany();
  await prisma.vendorPOItem.deleteMany();
  await prisma.vendorPO.deleteMany();
  await prisma.pOAttachment.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();

  // Asset cleanup
  await prisma.asset.deleteMany();

  await prisma.user.deleteMany();
  await prisma.category.deleteMany();
  await prisma.department.deleteMany();
  await prisma.branchRegulation.deleteMany();
  await prisma.branch.deleteMany();

  console.log('✅ Cleaned existing data');

  // ── BRANCHES ─────────────────────────────────────────────────────────────────
  const branchData = [
    {
      name: 'Kantor Pusat Jakarta',
      code: 'HQ',
      city: 'Jakarta',
      address: 'Jl. Jend. Sudirman No. 52-53, Kebayoran Baru',
      phone: '021-5255555',
      email: 'info@itticket.co.id',
      managerName: 'Direktur Utama',
      isHeadOffice: true,
      isActive: true,
      sigCreator:  'Budi Santoso\nIT Support Staff',
      sigChecker:  'Siti Rahayu\nIT Supervisor',
      sigApprover: 'Ahmad Fauzi\nKepala IT',
    },
    {
      name: 'Cabang Bandung',
      code: 'BDG',
      city: 'Bandung',
      address: 'Jl. Asia Afrika No. 10, Sumur Bandung',
      phone: '022-4200000',
      email: 'bandung@itticket.co.id',
      managerName: 'Kepala Cabang Bandung',
      isActive: true,
      sigCreator:  'Dewi Kusuma\nIT Staff Bandung',
      sigChecker:  'Roni Kurniawan\nIT Coordinator',
      sigApprover: 'Hendra Gunawan\nKepala Cabang',
    },
    {
      name: 'Cabang Surabaya',
      code: 'SBY',
      city: 'Surabaya',
      address: 'Jl. Pemuda No. 31-37, Genteng',
      phone: '031-5454545',
      email: 'surabaya@itticket.co.id',
      managerName: 'Kepala Cabang Surabaya',
      isActive: true,
      sigCreator:  'Wahyu Susanto\nIT Staff Surabaya',
      sigChecker:  'Fitri Handayani\nIT Coordinator',
      sigApprover: 'Bambang Sutrisno\nKepala Cabang',
    },
  ];

  const createdBranches = [];
  for (const b of branchData) {
    createdBranches.push(await prisma.branch.create({ data: b }));
  }
  const [hq, bdg, sby] = createdBranches;
  console.log(`✅ Branches: ${createdBranches.length} created`);

  // ── REGULATIONS ───────────────────────────────────────────────────────────────
  await prisma.branchRegulation.createMany({
    data: [
      { branchId: hq.id, title: 'SLA Tiket Critical', content: 'Tiket prioritas Critical wajib ditangani dalam 1 jam. Jika 30 menit belum direspons, eskalasi otomatis ke Kepala IT.', type: 'SLA', orderIndex: 1 },
      { branchId: hq.id, title: 'SLA Tiket High', content: 'Tiket High harus diselesaikan dalam 4 jam kerja. Update progres wajib setiap 1 jam.', type: 'SLA', orderIndex: 2 },
      { branchId: hq.id, title: 'Prosedur Eskalasi', content: 'Tiket yang melebihi 2x SLA wajib dieskalasi dengan menambah komentar [ESKALASI] dan re-assign ke Kepala IT.', type: 'ESCALATION', orderIndex: 3 },
      { branchId: hq.id, title: 'Keamanan Perangkat', content: 'Insiden keamanan harus dilaporkan dalam 15 menit. Perangkat terinfeksi langsung diisolasi dari jaringan.', type: 'SECURITY', orderIndex: 4 },
      { branchId: hq.id, title: 'Jam Operasional IT Support', content: 'Layanan tersedia Senin–Jumat 08.00–17.00 WIB. Di luar jam kerja, hanya tiket Critical yang ditangani via on-call.', type: 'OPERATIONAL', orderIndex: 5 },
      { branchId: bdg.id, title: 'SLA Cabang Bandung', content: 'Tiket dari cabang Bandung wajib direspons dalam 2 jam kerja. Teknisi lokal menjadi prioritas pertama.', type: 'SLA', orderIndex: 1 },
      { branchId: bdg.id, title: 'Koordinasi dengan Pusat', content: 'Akses ke server pusat wajib dikomunikasikan ke tim IT Pusat sebelum penanganan.', type: 'OPERATIONAL', orderIndex: 2 },
      { branchId: sby.id, title: 'SLA Cabang Surabaya', content: 'Tiket dari cabang Surabaya direspons dalam 2 jam. Koordinasi dengan pusat untuk tiket Critical.', type: 'SLA', orderIndex: 1 },
    ],
  });
  console.log('✅ Branch regulations created');

  // ── DEPARTMENTS & CATEGORIES ──────────────────────────────────────────────────
  const createdDepts = [];
  for (const d of departments) createdDepts.push(await prisma.department.create({ data: d }));

  const createdCats = [];
  for (const c of categories) createdCats.push(await prisma.category.create({ data: c }));
  const catMap = Object.fromEntries(createdCats.map(c => [c.code, c]));

  console.log(`✅ ${createdDepts.length} departments, ${createdCats.length} categories`);

  // ── USERS ────────────────────────────────────────────────────────────────────
  const pw = await bcrypt.hash('password123', 12);
  const itDept = createdDepts[0]; // IT

  // Admin
  const admin = await prisma.user.create({ data: {
    employeeId: 'EMP-001', name: 'Admin IT',      email: 'admin@company.com',
    password: pw, role: 'ADMIN', phone: '081234567890',
    departmentId: itDept.id, branchId: hq.id, isActive: true,
  }});

  // IT Staff — HQ
  const staffHQ = [];
  for (const [idx, s] of [
    { employeeId: 'EMP-002', name: 'Budi Santoso',  email: 'budi@company.com',  phone: '081234567891' },
    { employeeId: 'EMP-003', name: 'Siti Rahayu',   email: 'siti@company.com',  phone: '081234567892' },
    { employeeId: 'EMP-004', name: 'Ahmad Fauzi',   email: 'ahmad@company.com', phone: '081234567893' },
  ].entries()) {
    staffHQ.push(await prisma.user.create({ data: { ...s, password: pw, role: 'IT_STAFF', departmentId: itDept.id, branchId: hq.id, isActive: true } }));
  }

  // IT Staff — branches
  const staffBDG = await prisma.user.create({ data: {
    employeeId: 'EMP-005', name: 'Dewi Kusuma', email: 'dewi@company.com',
    password: pw, role: 'IT_STAFF', phone: '081234567894',
    departmentId: itDept.id, branchId: bdg.id, isActive: true,
  }});
  const staffSBY = await prisma.user.create({ data: {
    employeeId: 'EMP-006', name: 'Roni Kurniawan', email: 'roni@company.com',
    password: pw, role: 'IT_STAFF', phone: '081234567895',
    departmentId: itDept.id, branchId: sby.id, isActive: true,
  }});

  // Regular users
  const userData = [
    { employeeId: 'EMP-010', name: 'Rina Wati',         email: 'rina@company.com',     phone: '081345678900', deptIdx: 1, branchId: hq.id },
    { employeeId: 'EMP-011', name: 'Doni Prasetyo',      email: 'doni@company.com',     phone: '081345678901', deptIdx: 2, branchId: hq.id },
    { employeeId: 'EMP-012', name: 'Maya Indah',         email: 'maya@company.com',     phone: '081345678902', deptIdx: 3, branchId: hq.id },
    { employeeId: 'EMP-013', name: 'Hendra Gunawan',     email: 'hendra@company.com',   phone: '081345678903', deptIdx: 4, branchId: bdg.id },
    { employeeId: 'EMP-014', name: 'Lestari Putri',      email: 'lestari@company.com',  phone: '081345678904', deptIdx: 5, branchId: bdg.id },
    { employeeId: 'EMP-015', name: 'Wahyu Susanto',      email: 'wahyu@company.com',    phone: '081345678905', deptIdx: 1, branchId: sby.id },
    { employeeId: 'EMP-016', name: 'Fitri Handayani',    email: 'fitri@company.com',    phone: '081345678906', deptIdx: 2, branchId: sby.id },
    { employeeId: 'EMP-017', name: 'Bambang Sutrisno',   email: 'bambang@company.com',  phone: '081345678907', deptIdx: 7, branchId: sby.id },
    { employeeId: 'EMP-018', name: 'Sari Dewi',          email: 'sari@company.com',     phone: '081345678908', deptIdx: 6, branchId: hq.id },
    { employeeId: 'EMP-019', name: 'Wahyu Nugroho',      email: 'wahyun@company.com',   phone: '081345678909', deptIdx: 3, branchId: bdg.id },
  ];
  const regularUsers = [];
  for (const u of userData) {
    regularUsers.push(await prisma.user.create({ data: {
      employeeId: u.employeeId, name: u.name, email: u.email, phone: u.phone,
      password: pw, role: 'USER',
      departmentId: createdDepts[u.deptIdx].id,
      branchId: u.branchId,
      isActive: true,
    }}));
  }

  const allStaff = [...staffHQ, staffBDG, staffSBY];
  console.log(`✅ Users: 1 admin, ${allStaff.length} IT staff, ${regularUsers.length} users`);

  // ── TICKETS ───────────────────────────────────────────────────────────────────
  const statuses = ['OPEN','ON_PROGRESS','PENDING','RESOLVED','CLOSED'];
  const createdTickets = [];

  for (let i = 0; i < ticketSamples.length; i++) {
    const sample  = ticketSamples[i];
    const daysAgo = Math.floor(Math.random() * 90);
    const createdAt = new Date(Date.now() - daysAgo * 24 * 3600 * 1000);
    const category  = catMap[sample.cat];
    const status    = statuses[Math.floor(Math.random() * statuses.length)];
    const creator   = regularUsers[i % regularUsers.length];
    const branchId  = creator.branchId;
    // assign to staff of same branch
    const branchStaff = allStaff.filter(s => s.branchId === branchId);
    const assignee  = Math.random() > 0.2 ? branchStaff[Math.floor(Math.random() * branchStaff.length)] : null;
    const slaDeadline = new Date(createdAt.getTime() + category.slaHours * 3600 * 1000);
    const slaBreached = slaDeadline < new Date() && !['RESOLVED','CLOSED'].includes(status);
    const month = String(createdAt.getMonth()+1).padStart(2,'0');
    const ticketNo = `TKT-${createdAt.getFullYear()}${month}-${String(i+1).padStart(4,'0')}`;

    const ticket = await prisma.ticket.create({ data: {
      ticketNo, title: sample.title, description: sample.desc,
      status, priority: sample.pri, categoryId: category.id,
      departmentId: creator.departmentId, creatorId: creator.id,
      assigneeId: assignee?.id, branchId,
      slaDeadline, slaBreached,
      resolvedAt: ['RESOLVED','CLOSED'].includes(status)
        ? new Date(createdAt.getTime() + Math.random() * 48*3600*1000) : null,
      closedAt: status === 'CLOSED'
        ? new Date(createdAt.getTime() + Math.random() * 72*3600*1000) : null,
      createdAt, updatedAt: new Date(),
    }});
    createdTickets.push(ticket);

    await prisma.activityLog.create({ data: {
      ticketId: ticket.id, actorId: creator.id,
      type: 'TICKET_CREATED',
      description: `Tiket #${ticket.ticketNo} dibuat`,
      createdAt,
    }});

    // 1–3 comments per ticket
    const numComments = 1 + Math.floor(Math.random() * 3);
    for (let j = 0; j < numComments; j++) {
      const commentDate = new Date(createdAt.getTime() + (j+1) * 2 * 3600 * 1000);
      const isStaffComment = j % 2 !== 0;
      const author = isStaffComment ? (assignee || staffHQ[0]) : creator;
      await prisma.ticketComment.create({ data: {
        ticketId: ticket.id, authorId: author.id,
        content: isStaffComment
          ? ['Sedang kami proses, mohon tunggu.',
             'Sudah kami identifikasi masalahnya, sedang mencari solusi.',
             'Perbaikan sedang berjalan, estimasi selesai 2 jam lagi.',
             'Mohon restart perangkat setelah kami kirim update.'][j % 4]
          : ['Mohon segera ditangani, menghambat pekerjaan saya.',
             'Apakah ada update penanganannya?',
             'Masalah masih belum terselesaikan.',
             'Terima kasih atas bantuannya.'][j % 4],
        isInternal: false, createdAt: commentDate,
      }});
    }
  }
  console.log(`✅ ${createdTickets.length} tickets created`);

  // ── ASSETS ────────────────────────────────────────────────────────────────────
  const assetData = [
    // Laptops
    { assetCode: 'AST-LP-001', name: 'Laptop Dell Latitude 5520',  category: 'LAPTOP',  brand: 'Dell',    model: 'Latitude 5520',  serialNumber: 'DL5520-2023-001', purchaseDate: new Date('2023-01-15'), purchasePrice: 12500000, condition: 'GOOD',      status: 'IN_USE',    location: 'Lantai 3 - Ruang IT', branchId: hq.id,  assignedUserId: staffHQ[0].id, departmentId: itDept.id },
    { assetCode: 'AST-LP-002', name: 'Laptop HP EliteBook 840',    category: 'LAPTOP',  brand: 'HP',      model: 'EliteBook 840 G8', serialNumber: 'HP840-2023-002', purchaseDate: new Date('2023-02-20'), purchasePrice: 14000000, condition: 'EXCELLENT', status: 'IN_USE',    location: 'Lantai 2 - Ruang Keuangan', branchId: hq.id, assignedUserId: regularUsers[0].id, departmentId: createdDepts[1].id },
    { assetCode: 'AST-LP-003', name: 'Laptop Lenovo ThinkPad X1',  category: 'LAPTOP',  brand: 'Lenovo',  model: 'ThinkPad X1 Carbon', serialNumber: 'LN-X1C-2022-003', purchaseDate: new Date('2022-06-10'), purchasePrice: 18000000, condition: 'FAIR',    status: 'IN_USE',    location: 'Lantai 1 - Direksi', branchId: hq.id, assignedUserId: admin.id, departmentId: itDept.id },
    { assetCode: 'AST-LP-004', name: 'Laptop ASUS ExpertBook B5',  category: 'LAPTOP',  brand: 'ASUS',    model: 'ExpertBook B5302', serialNumber: 'AS-B53-2023-004', purchaseDate: new Date('2023-03-05'), purchasePrice: 10500000, condition: 'GOOD',    status: 'IN_USE',    location: 'Cabang Bandung - IT Desk', branchId: bdg.id, assignedUserId: staffBDG.id, departmentId: itDept.id },
    { assetCode: 'AST-LP-005', name: 'Laptop Acer TravelMate P4',  category: 'LAPTOP',  brand: 'Acer',    model: 'TravelMate P414', serialNumber: 'AC-TMP4-2023-005', purchaseDate: new Date('2023-04-12'), purchasePrice: 9800000, condition: 'GOOD',    status: 'IN_USE',    location: 'Cabang Surabaya - IT Desk', branchId: sby.id, assignedUserId: staffSBY.id, departmentId: itDept.id },
    // Desktops
    { assetCode: 'AST-PC-001', name: 'PC Desktop HP ProDesk 400',  category: 'DESKTOP', brand: 'HP',      model: 'ProDesk 400 G7',  serialNumber: 'HP-PD400-2022-001', purchaseDate: new Date('2022-08-01'), purchasePrice: 7500000, condition: 'GOOD',   status: 'IN_USE',    location: 'Lantai 2 - Resepsionis', branchId: hq.id, departmentId: createdDepts[3].id },
    { assetCode: 'AST-PC-002', name: 'PC Desktop Dell OptiPlex',   category: 'DESKTOP', brand: 'Dell',    model: 'OptiPlex 3090',   serialNumber: 'DL-OP3090-2022-002', purchaseDate: new Date('2022-09-15'), purchasePrice: 8200000, condition: 'FAIR',   status: 'IN_USE',    location: 'Lantai 3 - Ruang Server', branchId: hq.id, departmentId: itDept.id },
    // Printers
    { assetCode: 'AST-PR-001', name: 'Printer HP LaserJet Pro',    category: 'PRINTER', brand: 'HP',      model: 'LaserJet Pro M404n', serialNumber: 'HP-LJM404-2022-001', purchaseDate: new Date('2022-03-10'), purchasePrice: 4500000, condition: 'GOOD',  status: 'IN_USE',    location: 'Lantai 2 - Area Print', branchId: hq.id, departmentId: createdDepts[1].id },
    { assetCode: 'AST-PR-002', name: 'Printer Epson L3150',        category: 'PRINTER', brand: 'Epson',   model: 'EcoTank L3150',   serialNumber: 'EP-L3150-2023-001', purchaseDate: new Date('2023-01-08'), purchasePrice: 2800000, condition: 'EXCELLENT', status: 'IN_USE', location: 'Lantai 1 - HRD', branchId: hq.id, departmentId: createdDepts[2].id },
    { assetCode: 'AST-PR-003', name: 'Printer Canon PIXMA G3010',  category: 'PRINTER', brand: 'Canon',   model: 'PIXMA G3010',    serialNumber: 'CN-G3010-2023-002', purchaseDate: new Date('2023-02-14'), purchasePrice: 2200000, condition: 'POOR',   status: 'MAINTENANCE', location: 'Gudang IT', branchId: hq.id, departmentId: itDept.id, notes: 'Sedang dalam perbaikan roller feed' },
    // Monitors
    { assetCode: 'AST-MN-001', name: 'Monitor LG 24" IPS',        category: 'MONITOR', brand: 'LG',      model: '24BL650C',        serialNumber: 'LG-24BL-2022-001', purchaseDate: new Date('2022-05-20'), purchasePrice: 3200000, condition: 'GOOD',   status: 'IN_USE',    location: 'Lantai 3 - Ruang IT', branchId: hq.id, assignedUserId: staffHQ[1].id, departmentId: itDept.id },
    { assetCode: 'AST-MN-002', name: 'Monitor Samsung 27" QHD',   category: 'MONITOR', brand: 'Samsung', model: 'S27A600NW',       serialNumber: 'SM-S27A6-2023-001', purchaseDate: new Date('2023-06-01'), purchasePrice: 4800000, condition: 'EXCELLENT', status: 'IN_USE', location: 'Lantai 1 - Direksi', branchId: hq.id, assignedUserId: admin.id, departmentId: itDept.id },
    // Network
    { assetCode: 'AST-NW-001', name: 'Switch Cisco Catalyst 2960', category: 'NETWORK_DEVICE', brand: 'Cisco', model: 'Catalyst 2960-X', serialNumber: 'CS-C2960-2021-001', purchaseDate: new Date('2021-11-10'), purchasePrice: 18000000, condition: 'GOOD', status: 'IN_USE', location: 'Ruang Server Lt.3', branchId: hq.id, departmentId: itDept.id },
    { assetCode: 'AST-NW-002', name: 'Router Mikrotik RB1100',     category: 'NETWORK_DEVICE', brand: 'Mikrotik', model: 'RB1100AHx4', serialNumber: 'MT-RB1100-2021-001', purchaseDate: new Date('2021-10-05'), purchasePrice: 8500000, condition: 'GOOD', status: 'IN_USE', location: 'Ruang Server Lt.3', branchId: hq.id, departmentId: itDept.id },
    // UPS
    { assetCode: 'AST-UP-001', name: 'UPS APC Smart-UPS 1500',    category: 'UPS',     brand: 'APC',     model: 'SMT1500I',        serialNumber: 'APC-SMT1500-2022-001', purchaseDate: new Date('2022-01-20'), purchasePrice: 9500000, condition: 'GOOD', status: 'IN_USE', location: 'Ruang Server Lt.3', branchId: hq.id, departmentId: itDept.id },
    // Projector
    { assetCode: 'AST-PJ-001', name: 'Projector Epson EB-W06',    category: 'PROJECTOR', brand: 'Epson', model: 'EB-W06',          serialNumber: 'EP-EBW06-2022-001', purchaseDate: new Date('2022-07-15'), purchasePrice: 6500000, condition: 'GOOD', status: 'IN_USE', location: 'Ruang Rapat Utama Lt.2', branchId: hq.id, departmentId: createdDepts[3].id },
    // Retired
    { assetCode: 'AST-LP-006', name: 'Laptop Toshiba Satellite',   category: 'LAPTOP',  brand: 'Toshiba', model: 'Satellite L750',  serialNumber: 'TO-L750-2018-001', purchaseDate: new Date('2018-04-20'), purchasePrice: 6000000, condition: 'DAMAGED', status: 'RETIRED', location: 'Gudang IT', branchId: hq.id, departmentId: itDept.id, notes: 'Motherboard rusak, tidak ekonomis diperbaiki' },
  ];

  for (const asset of assetData) {
    await prisma.asset.create({ data: { ...asset, createdById: admin.id } });
  }
  console.log(`✅ ${assetData.length} assets created`);

  // ── PURCHASE ORDERS (legacy) ──────────────────────────────────────────────────
  const po1 = await prisma.purchaseOrder.create({ data: {
    poNumber: 'PRQ-2025-0001',
    companyName: 'PT. Teknologi Maju Indonesia',
    workLocation: 'Kantor Pusat Jakarta',
    position: 'IT Department',
    justification: 'Penggantian laptop yang rusak dan penambahan kapasitas tim IT',
    status: 'APPROVED',
    totalEstimate: 45000000,
    branchId: hq.id, createdById: admin.id, approvedById: admin.id,
    submissionDate: new Date('2025-01-15'),
  }});
  await prisma.purchaseOrderItem.createMany({ data: [
    { poId: po1.id, itemNo: 1, itemName: 'Laptop Dell Latitude 5540', specification: 'Intel i7-1365U, RAM 16GB, SSD 512GB, Win11 Pro', qty: 2, unit: 'unit', estimatedPrice: 14500000 },
    { poId: po1.id, itemNo: 2, itemName: 'Monitor LG 27" IPS 4K',     specification: '27", 4K UHD, IPS Panel, USB-C Hub', qty: 2, unit: 'unit', estimatedPrice: 5500000 },
    { poId: po1.id, itemNo: 3, itemName: 'Wireless Mouse & Keyboard',  specification: 'Logitech MK540 Combo Wireless', qty: 5, unit: 'set', estimatedPrice: 1000000 },
  ]});

  const po2 = await prisma.purchaseOrder.create({ data: {
    poNumber: 'PRQ-2025-0002',
    companyName: 'PT. Teknologi Maju Indonesia',
    workLocation: 'Cabang Bandung',
    position: 'IT Cabang Bandung',
    justification: 'Upgrade infrastruktur jaringan cabang Bandung',
    status: 'PENDING',
    totalEstimate: 28000000,
    branchId: bdg.id, createdById: staffBDG.id,
    submissionDate: new Date('2025-02-10'),
  }});
  await prisma.purchaseOrderItem.createMany({ data: [
    { poId: po2.id, itemNo: 1, itemName: 'Switch Managed 24-Port',  specification: 'TP-Link TL-SG3428X, 24x Gigabit', qty: 1, unit: 'unit', estimatedPrice: 12000000 },
    { poId: po2.id, itemNo: 2, itemName: 'Access Point WiFi 6',     specification: 'Ubiquiti UniFi U6-Pro', qty: 4, unit: 'unit', estimatedPrice: 4000000 },
  ]});
  console.log('✅ Purchase Orders (legacy) created');

  // ── VENDOR PO ─────────────────────────────────────────────────────────────────
  const vpo1 = await prisma.vendorPO.create({ data: {
    poNumber: 'VPO-2025-0001',
    poDate: new Date('2025-01-20'),
    supplierName: 'CV. Sumber Teknologi',
    supplierPhone: '021-7654321',
    supplierAddress: 'Jl. Mangga Dua Raya No. 25, Jakarta Utara',
    deliveryDate: '30 Januari 2025',
    deliveryAddress: 'Kantor Pusat - Lantai 3, Jl. Jend. Sudirman No. 52-53',
    receiverName: 'Budi Santoso',
    paymentMethod: 'Transfer Bank - 30 hari setelah terima barang',
    ppnEnabled: true, ppnPercent: 11,
    subtotal: 13500000, ppnAmount: 1485000, grandTotal: 14985000,
    status: 'CONFIRMED',
    branchId: hq.id, createdById: staffHQ[0].id,
  }});
  await prisma.vendorPOItem.createMany({ data: [
    { poId: vpo1.id, itemNo: 1, productName: 'Toner HP CF226X (LaserJet Pro)',  qty: 5,  unit: 'pcs',  unitPrice: 850000,  totalPrice: 4250000 },
    { poId: vpo1.id, itemNo: 2, productName: 'Kabel UTP Cat6 Belden 305m',      qty: 2,  unit: 'box',  unitPrice: 2100000, totalPrice: 4200000 },
    { poId: vpo1.id, itemNo: 3, productName: 'Patch Panel 24-Port Cat6',        qty: 2,  unit: 'pcs',  unitPrice: 1500000, totalPrice: 3000000 },
    { poId: vpo1.id, itemNo: 4, productName: 'RJ45 Connector AMP (100 pcs)',    qty: 2,  unit: 'box',  unitPrice: 525000,  totalPrice: 1050000 },
    { poId: vpo1.id, itemNo: 5, productName: 'Cable Tester Network',            qty: 1,  unit: 'pcs',  unitPrice: 1000000, totalPrice: 1000000 },
  ]});

  const vpo2 = await prisma.vendorPO.create({ data: {
    poNumber: 'VPO-2025-0002',
    poDate: new Date('2025-03-05'),
    supplierName: 'PT. Datascrip',
    supplierPhone: '021-8888777',
    supplierAddress: 'Jl. Hayam Wuruk No. 37, Jakarta Barat',
    deliveryDate: '15 Maret 2025',
    deliveryAddress: 'Cabang Bandung - IT Desk, Jl. Asia Afrika No. 10',
    receiverName: 'Dewi Kusuma',
    paymentMethod: 'Transfer Bank - 14 hari',
    ppnEnabled: true, ppnPercent: 11,
    subtotal: 8600000, ppnAmount: 946000, grandTotal: 9546000,
    status: 'SENT',
    branchId: bdg.id, createdById: staffBDG.id,
  }});
  await prisma.vendorPOItem.createMany({ data: [
    { poId: vpo2.id, itemNo: 1, productName: 'Tinta Epson 003 Black (4-pack)',  qty: 4, unit: 'set',  unitPrice: 350000,  totalPrice: 1400000 },
    { poId: vpo2.id, itemNo: 2, productName: 'RAM DDR4 16GB Kingston 3200MHz',  qty: 4, unit: 'pcs',  unitPrice: 650000,  totalPrice: 2600000 },
    { poId: vpo2.id, itemNo: 3, productName: 'SSD Samsung 870 EVO 500GB',       qty: 3, unit: 'pcs',  unitPrice: 850000,  totalPrice: 2550000 },
    { poId: vpo2.id, itemNo: 4, productName: 'Thermal Paste Noctua NT-H1',      qty: 5, unit: 'tube', unitPrice: 210000,  totalPrice: 1050000 },
    { poId: vpo2.id, itemNo: 5, productName: 'Mouse Pad Logitech Desk Mat',     qty: 5, unit: 'pcs',  unitPrice: 200000,  totalPrice: 1000000 },
  ]});

  console.log('✅ Vendor POs created');

  // ── INTERNAL PO ───────────────────────────────────────────────────────────────
  const ipo1 = await prisma.internalPO.create({ data: {
    poNumber: 'IPO-2025-0001',
    poDate: new Date('2025-01-25'),
    department: 'Teknologi Informasi',
    requestor: 'Budi Santoso',
    preparedBy: 'Ahmad Fauzi',
    description: 'Permintaan pengadaan perlengkapan IT untuk Q1 2025',
    bankInfo: 'Bank BCA - 123-456-7890 a.n. PT. Teknologi Maju Indonesia',
    totalAmount: 7850000,
    status: 'APPROVED',
    sigDiajukan: 'Budi Santoso', sigDisetujui: 'Ahmad Fauzi', sigMengetahui: 'Admin IT',
    branchId: hq.id, createdById: staffHQ[0].id, approvedById: admin.id,
  }});
  await prisma.internalPOItem.createMany({ data: [
    { poId: ipo1.id, itemNo: 1, itemName: 'Flash Drive USB 3.0 64GB', supplier: 'SanDisk',     qty: 10, unit: 'pcs', unitPrice: 120000,  totalPrice: 1200000 },
    { poId: ipo1.id, itemNo: 2, itemName: 'Kabel HDMI 3 Meter',       supplier: 'Belkin',      qty: 5,  unit: 'pcs', unitPrice: 150000,  totalPrice: 750000  },
    { poId: ipo1.id, itemNo: 3, itemName: 'Hub USB-C 7-in-1',         supplier: 'Anker',       qty: 3,  unit: 'pcs', unitPrice: 450000,  totalPrice: 1350000 },
    { poId: ipo1.id, itemNo: 4, itemName: 'Mouse Wireless Logitech M220', supplier: 'Logitech', qty: 8, unit: 'pcs', unitPrice: 280000,  totalPrice: 2240000 },
    { poId: ipo1.id, itemNo: 5, itemName: 'Label Printer Tape 12mm',  supplier: 'Brother',     qty: 10, unit: 'pcs', unitPrice: 131000,  totalPrice: 1310000 },
    { poId: ipo1.id, itemNo: 6, itemName: 'Anti-static Wristband',    supplier: 'Generic',     qty: 5,  unit: 'pcs', unitPrice: 50000,   totalPrice: 250000  },
    { poId: ipo1.id, itemNo: 7, itemName: 'Cable Velcro Tie 30cm (100pcs)', supplier: 'Generic', qty: 1, unit: 'pack', unitPrice: 750000, totalPrice: 750000  },
  ]});

  const ipo2 = await prisma.internalPO.create({ data: {
    poNumber: 'IPO-2025-0002',
    poDate: new Date('2025-02-18'),
    department: 'Sumber Daya Manusia',
    requestor: 'Maya Indah',
    preparedBy: 'Budi Santoso',
    description: 'Pengadaan perangkat IT untuk karyawan baru batch Februari 2025',
    totalAmount: 28500000,
    status: 'SUBMITTED',
    sigDiajukan: 'Maya Indah',
    branchId: hq.id, createdById: staffHQ[0].id,
  }});
  await prisma.internalPOItem.createMany({ data: [
    { poId: ipo2.id, itemNo: 1, itemName: 'Laptop ASUS ExpertBook B1502', supplier: 'ASUS',  qty: 2, unit: 'unit', unitPrice: 10500000, totalPrice: 21000000 },
    { poId: ipo2.id, itemNo: 2, itemName: 'Mouse + Keyboard Combo',       supplier: 'Logitech', qty: 2, unit: 'set', unitPrice: 350000, totalPrice: 700000 },
    { poId: ipo2.id, itemNo: 3, itemName: 'Tas Laptop 15.6"',             supplier: 'Targus',   qty: 2, unit: 'pcs', unitPrice: 400000, totalPrice: 800000 },
    { poId: ipo2.id, itemNo: 4, itemName: 'Lisensi Microsoft 365 Business Basic', supplier: 'Microsoft', qty: 2, unit: 'user/thn', unitPrice: 3000000, totalPrice: 6000000 },
  ]});

  console.log('✅ Internal POs created');

  // ── SELISIH PO ────────────────────────────────────────────────────────────────
  const spo1 = await prisma.selisihPO.create({ data: {
    poNumber: 'SPO-2025-0001',
    poDate: new Date('2025-02-05'),
    department: 'Teknologi Informasi',
    requestor: 'Budi Santoso',
    preparedBy: 'Ahmad Fauzi',
    description: 'Selisih harga PO Vendor toner HP vs harga aktual di pasaran',
    bankInfo: 'Bank Mandiri - 140-000-1234567 a.n. CV. Sumber Teknologi',
    refPoNumber: 'VPO-2025-0001',
    refPoDate: new Date('2025-01-20'),
    refPoAmount: 4250000,
    totalAmount: 4675000,
    selisihAmount: 425000,
    status: 'DRAFT',
    sigDiajukan: 'Budi Santoso', sigMengetahui: 'Admin IT',
    branchId: hq.id, createdById: staffHQ[0].id,
  }});
  await prisma.selisihPOItem.createMany({ data: [
    { poId: spo1.id, itemNo: 1, itemName: 'Toner HP CF226X (LaserJet Pro)', supplier: 'CV. Sumber Teknologi', qty: 5, unit: 'pcs', unitPrice: 935000, totalPrice: 4675000, notes: 'Harga aktual naik dari Rp 850.000 menjadi Rp 935.000/pcs' },
  ]});

  const spo2 = await prisma.selisihPO.create({ data: {
    poNumber: 'SPO-2025-0002',
    poDate: new Date('2025-03-15'),
    department: 'Teknologi Informasi',
    requestor: 'Dewi Kusuma',
    preparedBy: 'Dewi Kusuma',
    description: 'Selisih biaya pengiriman dan instalasi perangkat cabang Bandung',
    refPoNumber: 'VPO-2025-0002',
    refPoDate: new Date('2025-03-05'),
    refPoAmount: 8600000,
    totalAmount: 9300000,
    selisihAmount: 700000,
    status: 'DRAFT',
    sigDiajukan: 'Dewi Kusuma',
    branchId: bdg.id, createdById: staffBDG.id,
  }});
  await prisma.selisihPOItem.createMany({ data: [
    { poId: spo2.id, itemNo: 1, itemName: 'Biaya Pengiriman Ekspres Bandung', qty: 1, unit: 'layanan', unitPrice: 450000, totalPrice: 450000, notes: 'Pengiriman ekspres sesuai kebutuhan urgency' },
    { poId: spo2.id, itemNo: 2, itemName: 'Biaya Instalasi & Konfigurasi',   qty: 1, unit: 'layanan', unitPrice: 250000, totalPrice: 250000 },
  ]});

  console.log('✅ Selisih POs created');

  // ── TANDA TERIMA ──────────────────────────────────────────────────────────────
  const tt1 = await prisma.tandaTerima.create({ data: {
    ttNumber: 'TT-2025-0001',
    ttDate: new Date('2025-02-01'),
    receivedFrom: 'CV. Sumber Teknologi',
    addressedTo: 'Dept. Teknologi Informasi - Kantor Pusat',
    ccTo: 'Kepala IT, Bagian Keuangan',
    receivedBy: 'Budi Santoso',
    notes: 'Barang diterima dalam kondisi baik dan sesuai dengan PO VPO-2025-0001. Semua item telah diverifikasi.',
    branchId: hq.id, createdById: staffHQ[0].id,
  }});
  await prisma.tandaTerimaItem.createMany({ data: [
    { ttId: tt1.id, itemNo: 1, description: 'Toner HP CF226X (LaserJet Pro) - 5 pcs',  itemDate: new Date('2025-02-01') },
    { ttId: tt1.id, itemNo: 2, description: 'Kabel UTP Cat6 Belden 305m - 2 box',      itemDate: new Date('2025-02-01') },
    { ttId: tt1.id, itemNo: 3, description: 'Patch Panel 24-Port Cat6 - 2 pcs',        itemDate: new Date('2025-02-01') },
    { ttId: tt1.id, itemNo: 4, description: 'RJ45 Connector AMP 100pcs - 2 box',       itemDate: new Date('2025-02-01') },
    { ttId: tt1.id, itemNo: 5, description: 'Cable Tester Network - 1 pcs',            itemDate: new Date('2025-02-01') },
  ]});

  const tt2 = await prisma.tandaTerima.create({ data: {
    ttNumber: 'TT-2025-0002',
    ttDate: new Date('2025-02-20'),
    receivedFrom: 'Dept. IT Pusat',
    addressedTo: 'Dept. SDM - Kantor Pusat',
    receivedBy: 'Maya Indah',
    notes: 'Perangkat laptop untuk karyawan baru telah diserahterimakan dan dikonfigurasi.',
    branchId: hq.id, createdById: staffHQ[0].id,
  }});
  await prisma.tandaTerimaItem.createMany({ data: [
    { ttId: tt2.id, itemNo: 1, description: 'Laptop ASUS ExpertBook B1502 + charger (SN: AS-B15-001)', itemDate: new Date('2025-02-20') },
    { ttId: tt2.id, itemNo: 2, description: 'Laptop ASUS ExpertBook B1502 + charger (SN: AS-B15-002)', itemDate: new Date('2025-02-20') },
    { ttId: tt2.id, itemNo: 3, description: 'Wireless Mouse + Keyboard Combo Logitech (2 set)',        itemDate: new Date('2025-02-20') },
    { ttId: tt2.id, itemNo: 4, description: 'Tas Laptop 15.6" Targus (2 pcs)',                        itemDate: new Date('2025-02-20') },
  ]});

  const tt3 = await prisma.tandaTerima.create({ data: {
    ttNumber: 'TT-2025-0003',
    ttDate: new Date('2025-03-20'),
    receivedFrom: 'PT. Datascrip',
    addressedTo: 'Dept. IT - Cabang Bandung',
    receivedBy: 'Dewi Kusuma',
    notes: 'Barang diterima sesuai PO VPO-2025-0002. Semua item kondisi baik dan sudah diinventarisasi.',
    branchId: bdg.id, createdById: staffBDG.id,
  }});
  await prisma.tandaTerimaItem.createMany({ data: [
    { ttId: tt3.id, itemNo: 1, description: 'Tinta Epson 003 Black 4-pack - 4 set',    itemDate: new Date('2025-03-20') },
    { ttId: tt3.id, itemNo: 2, description: 'RAM DDR4 16GB Kingston 3200MHz - 4 pcs',  itemDate: new Date('2025-03-20') },
    { ttId: tt3.id, itemNo: 3, description: 'SSD Samsung 870 EVO 500GB - 3 pcs',      itemDate: new Date('2025-03-20') },
    { ttId: tt3.id, itemNo: 4, description: 'Thermal Paste Noctua NT-H1 - 5 tube',    itemDate: new Date('2025-03-20') },
    { ttId: tt3.id, itemNo: 5, description: 'Mouse Pad Logitech Desk Mat - 5 pcs',    itemDate: new Date('2025-03-20') },
  ]});

  console.log('✅ Tanda Terima created');

  // ── COMPANY SETTINGS ─────────────────────────────────────────────────────────
  await prisma.companySetting.upsert({
    where: { id: 'singleton' },
    update: {
      companyName:    'PT. Teknologi Maju Indonesia',
      companyTagline: 'IT Support & Ticketing System',
      companyAddress: 'Jl. Jend. Sudirman No. 52-53, Kebayoran Baru',
      companyCity:    'Jakarta Selatan 12190',
      companyPhone:   '021-5255555',
      companyEmail:   'info@itticket.co.id',
      companyWebsite: 'www.itticket.co.id',
      sigCreator:     'Budi Santoso\nIT Support Staff',
      sigChecker:     'Siti Rahayu\nIT Supervisor',
      sigApprover:    'Ahmad Fauzi\nKepala IT',
    },
    create: {
      id: 'singleton',
      companyName:    'PT. Teknologi Maju Indonesia',
      companyTagline: 'IT Support & Ticketing System',
      companyAddress: 'Jl. Jend. Sudirman No. 52-53, Kebayoran Baru',
      companyCity:    'Jakarta Selatan 12190',
      companyPhone:   '021-5255555',
      companyEmail:   'info@itticket.co.id',
      companyWebsite: 'www.itticket.co.id',
      sigCreator:     'Budi Santoso\nIT Support Staff',
      sigChecker:     'Siti Rahayu\nIT Supervisor',
      sigApprover:    'Ahmad Fauzi\nKepala IT',
    },
  });
  console.log('✅ Company settings seeded');

  // ── SUMMARY ───────────────────────────────────────────────────────────────────
  console.log('\n🎉 Seed selesai!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 AKUN DEMO (semua password: password123)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👑 Admin    : admin@company.com       (Kantor Pusat)');
  console.log('🔧 IT Staff : budi@company.com        (Kantor Pusat)');
  console.log('🔧 IT Staff : siti@company.com        (Kantor Pusat)');
  console.log('🔧 IT Staff : ahmad@company.com       (Kantor Pusat)');
  console.log('🔧 IT Staff : dewi@company.com        (Cabang Bandung)');
  console.log('🔧 IT Staff : roni@company.com        (Cabang Surabaya)');
  console.log('👤 User     : rina@company.com        (Kantor Pusat)');
  console.log('👤 User     : doni@company.com        (Kantor Pusat)');
  console.log('👤 User     : hendra@company.com      (Cabang Bandung)');
  console.log('👤 User     : wahyu@company.com       (Cabang Surabaya)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 Data: ${createdTickets.length} tiket • ${assetData.length} aset • 2 VPO • 2 IPO • 2 SPO • 3 TT`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => await prisma.$disconnect());
