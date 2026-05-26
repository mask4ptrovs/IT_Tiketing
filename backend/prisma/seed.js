const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const departments = [
  { name: 'Teknologi Informasi', code: 'IT', description: 'Divisi IT & Sistem Informasi' },
  { name: 'Keuangan & Akuntansi', code: 'FIN', description: 'Divisi Keuangan dan Akuntansi' },
  { name: 'Sumber Daya Manusia', code: 'HR', description: 'Divisi Human Resources' },
  { name: 'Operasional', code: 'OPS', description: 'Divisi Operasional' },
  { name: 'Pemasaran', code: 'MKT', description: 'Divisi Marketing & Sales' },
  { name: 'Legal & Compliance', code: 'LGL', description: 'Divisi Legal' },
  { name: 'Produksi', code: 'PRD', description: 'Divisi Produksi' },
  { name: 'Logistik', code: 'LOG', description: 'Divisi Logistik & Supply Chain' },
];

const categories = [
  { name: 'Hardware', code: 'HARDWARE', color: '#EF4444', slaHours: 8, description: 'Masalah perangkat keras' },
  { name: 'Software', code: 'SOFTWARE', color: '#3B82F6', slaHours: 4, description: 'Masalah perangkat lunak & aplikasi' },
  { name: 'Network', code: 'NETWORK', color: '#8B5CF6', slaHours: 2, description: 'Masalah jaringan & konektivitas' },
  { name: 'Email', code: 'EMAIL', color: '#F59E0B', slaHours: 4, description: 'Masalah email & komunikasi' },
  { name: 'Printer', code: 'PRINTER', color: '#10B981', slaHours: 8, description: 'Masalah printer & periferal' },
  { name: 'Security', code: 'SECURITY', color: '#DC2626', slaHours: 1, description: 'Masalah keamanan sistem' },
  { name: 'Lainnya', code: 'OTHER', color: '#6B7280', slaHours: 24, description: 'Permintaan lainnya' },
];

const ticketTitles = [
  'Laptop tidak bisa menyala',
  'VPN tidak bisa terhubung',
  'Email tidak bisa dikirim',
  'Printer error saat cetak',
  'Aplikasi ERP crash',
  'Internet sangat lambat',
  'Lupa password Windows',
  'Monitor bergaris-garis',
  'Keyboard tidak merespons',
  'Virus terdeteksi di komputer',
  'Share folder tidak bisa diakses',
  'Update Windows gagal',
  'Software license expired',
  'Komputer sangat lambat',
  'CCTV offline',
  'Telepon IP tidak berbunyi',
  'Backup gagal dilakukan',
  'Akun terkunci',
  'Projector tidak terdeteksi',
  'Database error pada sistem',
];

const ticketDescriptions = [
  'Perangkat tidak merespons saat dinyalakan, sudah dicoba restart namun masih tidak mau hidup.',
  'Koneksi VPN selalu gagal dengan error "Authentication Failed". Sudah coba ulang beberapa kali.',
  'Pesan error muncul saat mencoba mengirim email: "Connection timed out". Sudah terjadi sejak pagi.',
  'Printer mengeluarkan bunyi aneh dan kertas sering nyangkut. Sudah dicoba membersihkan tapi tetap error.',
  'Aplikasi tiba-tiba menutup sendiri saat sedang input data. Data yang diinput hilang semua.',
  'Koneksi internet sangat lambat, tidak bisa loading halaman web dengan normal.',
  'Password Windows lupa setelah komputer direstart. Perlu reset password segera untuk bisa bekerja.',
  'Layar monitor menampilkan garis-garis horizontal yang mengganggu pekerjaan.',
  'Keyboard tidak merespons penekanan tombol, beberapa tombol tidak berfungsi.',
  'Antivirus mendeteksi malware pada komputer, butuh penanganan segera.',
];

async function main() {
  console.log('🌱 Seeding database...');

  // Clean up existing data (in order to respect foreign keys)
  await prisma.activityLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.ticketComment.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();
  await prisma.department.deleteMany();
  await prisma.branchRegulation.deleteMany();
  await prisma.branch.deleteMany();

  console.log('✅ Cleaned existing data');

  // Create branches
  const branchData = [
    { name: 'Kantor Pusat', code: 'HQ', city: 'Jakarta', address: 'Jl. Sudirman No. 1', phone: '021-1234567', email: 'hq@perusahaan.com', managerName: 'Direktur Utama', isHeadOffice: true, isActive: true },
    { name: 'Cabang Bandung', code: 'BDG', city: 'Bandung', address: 'Jl. Asia Afrika No. 10', phone: '022-9876543', email: 'bandung@perusahaan.com', managerName: 'Kepala Cabang Bandung', isActive: true },
    { name: 'Cabang Surabaya', code: 'SBY', city: 'Surabaya', address: 'Jl. Pemuda No. 5', phone: '031-5554321', email: 'surabaya@perusahaan.com', managerName: 'Kepala Cabang Surabaya', isActive: true },
  ];
  const createdBranches = [];
  for (const b of branchData) {
    const branch = await prisma.branch.create({ data: b });
    createdBranches.push(branch);
  }
  console.log(`✅ Branches: ${createdBranches.length} created`);

  // Create regulations for head office
  const hq = createdBranches[0];
  const regulationData = [
    { branchId: hq.id, title: 'SLA Tiket Critical', content: 'Semua tiket dengan prioritas Critical wajib ditangani dalam waktu maksimal 1 jam sejak tiket dibuat. Jika teknisi pertama tidak merespons dalam 30 menit, tiket otomatis dieskalasi ke Kepala IT.', type: 'SLA', orderIndex: 1 },
    { branchId: hq.id, title: 'SLA Tiket High', content: 'Tiket prioritas High harus diselesaikan dalam 4 jam kerja. Teknisi wajib memberikan update progres setiap 1 jam.', type: 'SLA', orderIndex: 2 },
    { branchId: hq.id, title: 'Prosedur Eskalasi', content: 'Tiket yang belum ditangani lebih dari 2x waktu SLA wajib dieskalasi ke Supervisor. Eskalasi dilakukan dengan menambahkan komentar bertanda [ESKALASI] dan mengubah assign ke Kepala IT.', type: 'ESCALATION', orderIndex: 3 },
    { branchId: hq.id, title: 'Keamanan Perangkat', content: 'Setiap insiden keamanan (virus, malware, akses tidak sah) harus dilaporkan ke tim Security dalam waktu 15 menit. Perangkat yang terinfeksi langsung diisolasi dari jaringan.', type: 'SECURITY', orderIndex: 4 },
    { branchId: hq.id, title: 'Jam Operasional IT Support', content: 'Layanan IT Support tersedia Senin–Jumat pukul 08.00–17.00 WIB. Di luar jam kerja, hanya tiket Critical yang ditangani melalui on-call. Hubungi nomor darurat: 0812-xxxx-xxxx.', type: 'OPERATIONAL', orderIndex: 5 },
  ];
  for (const reg of regulationData) {
    await prisma.branchRegulation.create({ data: reg });
  }
  // Regulations for Bandung branch
  const bdg = createdBranches[1];
  await prisma.branchRegulation.createMany({ data: [
    { branchId: bdg.id, title: 'SLA Cabang Bandung', content: 'Tiket dari cabang Bandung wajib direspon dalam 2 jam kerja. Teknisi lokal menjadi prioritas penanganan pertama.', type: 'SLA', orderIndex: 1 },
    { branchId: bdg.id, title: 'Koordinasi dengan Pusat', content: 'Tiket yang membutuhkan akses ke server pusat wajib dikomunikasikan terlebih dahulu dengan tim IT Pusat sebelum penanganan.', type: 'OPERATIONAL', orderIndex: 2 },
  ]});
  console.log('✅ Branch regulations created');

  // Create departments
  const createdDepartments = [];
  for (const dept of departments) {
    const d = await prisma.department.create({ data: dept });
    createdDepartments.push(d);
  }
  console.log(`✅ Created ${createdDepartments.length} departments`);

  // Create categories
  const createdCategories = [];
  for (const cat of categories) {
    const c = await prisma.category.create({ data: cat });
    createdCategories.push(c);
  }
  console.log(`✅ Created ${createdCategories.length} categories`);

  const hashedPassword = await bcrypt.hash('password123', 12);

  // Create admin
  const admin = await prisma.user.create({
    data: {
      employeeId: 'EMP-001',
      name: 'Admin IT',
      email: 'admin@company.com',
      password: hashedPassword,
      role: 'ADMIN',
      phone: '08123456789',
      departmentId: createdDepartments[0].id, // IT dept
      isActive: true,
    },
  });

  // Create IT staff
  const itStaff = [];
  const staffData = [
    { employeeId: 'EMP-002', name: 'Budi Santoso', email: 'budi@company.com' },
    { employeeId: 'EMP-003', name: 'Siti Rahayu', email: 'siti@company.com' },
    { employeeId: 'EMP-004', name: 'Ahmad Fauzi', email: 'ahmad@company.com' },
    { employeeId: 'EMP-005', name: 'Dewi Kusuma', email: 'dewi@company.com' },
  ];
  for (const s of staffData) {
    const staff = await prisma.user.create({
      data: {
        ...s,
        password: hashedPassword,
        role: 'IT_STAFF',
        phone: '0812345678' + itStaff.length,
        departmentId: createdDepartments[0].id,
        isActive: true,
      },
    });
    itStaff.push(staff);
  }

  // Create regular users (from various departments)
  const regularUsers = [];
  const userData = [
    { employeeId: 'EMP-010', name: 'Rina Wati', email: 'rina@company.com', deptIdx: 1 },
    { employeeId: 'EMP-011', name: 'Doni Prasetyo', email: 'doni@company.com', deptIdx: 2 },
    { employeeId: 'EMP-012', name: 'Maya Indah', email: 'maya@company.com', deptIdx: 3 },
    { employeeId: 'EMP-013', name: 'Hendra Gunawan', email: 'hendra@company.com', deptIdx: 4 },
    { employeeId: 'EMP-014', name: 'Lestari Putri', email: 'lestari@company.com', deptIdx: 5 },
    { employeeId: 'EMP-015', name: 'Wahyu Susanto', email: 'wahyu@company.com', deptIdx: 1 },
    { employeeId: 'EMP-016', name: 'Fitri Handayani', email: 'fitri@company.com', deptIdx: 2 },
    { employeeId: 'EMP-017', name: 'Roni Kurniawan', email: 'roni@company.com', deptIdx: 3 },
    { employeeId: 'EMP-018', name: 'Sari Dewi', email: 'sari@company.com', deptIdx: 6 },
    { employeeId: 'EMP-019', name: 'Bambang Sutrisno', email: 'bambang@company.com', deptIdx: 7 },
  ];
  for (const u of userData) {
    const user = await prisma.user.create({
      data: {
        employeeId: u.employeeId,
        name: u.name,
        email: u.email,
        password: hashedPassword,
        role: 'USER',
        phone: '0813456789' + regularUsers.length,
        departmentId: createdDepartments[u.deptIdx].id,
        isActive: true,
      },
    });
    regularUsers.push(user);
  }

  console.log(`✅ Created users: 1 admin, ${itStaff.length} IT staff, ${regularUsers.length} regular users`);

  // Create tickets
  const statuses = ['OPEN', 'ON_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'];
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const createdTickets = [];

  for (let i = 0; i < 50; i++) {
    const daysAgo = Math.floor(Math.random() * 90);
    const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    const category = createdCategories[Math.floor(Math.random() * createdCategories.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const priority = priorities[Math.floor(Math.random() * priorities.length)];
    const creator = regularUsers[Math.floor(Math.random() * regularUsers.length)];
    const assignee = Math.random() > 0.3 ? itStaff[Math.floor(Math.random() * itStaff.length)] : null;

    const slaDeadline = new Date(createdAt.getTime() + category.slaHours * 60 * 60 * 1000);
    const slaBreached = slaDeadline < new Date() && !['RESOLVED', 'CLOSED'].includes(status);

    const month = String(createdAt.getMonth() + 1).padStart(2, '0');
    const year = createdAt.getFullYear();
    const seq = String(i + 1).padStart(4, '0');
    const ticketNo = `TKT-${year}${month}-${seq}`;

    const ticket = await prisma.ticket.create({
      data: {
        ticketNo,
        title: ticketTitles[i % ticketTitles.length],
        description: ticketDescriptions[i % ticketDescriptions.length],
        status,
        priority,
        categoryId: category.id,
        departmentId: creator.departmentId,
        creatorId: creator.id,
        assigneeId: assignee?.id,
        slaDeadline,
        slaBreached,
        resolvedAt: ['RESOLVED', 'CLOSED'].includes(status) ? new Date(createdAt.getTime() + Math.random() * 48 * 60 * 60 * 1000) : null,
        closedAt: status === 'CLOSED' ? new Date(createdAt.getTime() + Math.random() * 72 * 60 * 60 * 1000) : null,
        createdAt,
        updatedAt: new Date(),
      },
    });

    createdTickets.push(ticket);

    // Activity log
    await prisma.activityLog.create({
      data: {
        ticketId: ticket.id,
        actorId: creator.id,
        type: 'TICKET_CREATED',
        description: `Ticket #${ticket.ticketNo} created`,
        createdAt,
      },
    });

    // Comments
    const numComments = Math.floor(Math.random() * 4);
    for (let j = 0; j < numComments; j++) {
      const commentDate = new Date(createdAt.getTime() + (j + 1) * 2 * 60 * 60 * 1000);
      const commentAuthor = j % 2 === 0 ? creator : (assignee || itStaff[0]);
      await prisma.ticketComment.create({
        data: {
          ticketId: ticket.id,
          authorId: commentAuthor.id,
          content: j % 2 === 0
            ? 'Mohon segera ditangani, masalah ini menghambat pekerjaan saya.'
            : 'Sedang kami proses, mohon tunggu sebentar.',
          isInternal: false,
          createdAt: commentDate,
        },
      });
    }
  }

  console.log(`✅ Created ${createdTickets.length} tickets with comments and activity logs`);

  // Default company settings
  await prisma.companySetting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      companyName: 'IT Support',
      companyTagline: 'Ticketing System',
      companyAddress: '',
      companyCity: '',
      companyPhone: '',
      companyEmail: '',
      companyWebsite: '',
    },
  });
  console.log('🏢 Company settings seeded');

  console.log('\n🎉 Seed completed successfully!\n');
  console.log('📋 Test Accounts:');
  console.log('─────────────────────────────────────────');
  console.log('👤 Admin:     admin@company.com    / password123');
  console.log('🔧 IT Staff:  budi@company.com     / password123');
  console.log('🔧 IT Staff:  siti@company.com     / password123');
  console.log('👥 User:      rina@company.com     / password123');
  console.log('👥 User:      doni@company.com     / password123');
  console.log('─────────────────────────────────────────\n');
}

main()
  .catch(e => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => await prisma.$disconnect());
