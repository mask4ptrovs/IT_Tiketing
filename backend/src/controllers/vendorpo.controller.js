const path = require('path');
const fs   = require('fs');
const PDFDocument = require('pdfkit');
const { prisma } = require('../config/database');
const { successResponse, errorResponse, paginatedResponse, getPagination, getPaginationMeta } = require('../utils/response');
const { drawKopSurat, drawDocTitle } = require('../utils/pdfHelper');

const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const fmtDate = (d) => { const dt = new Date(d); return `${dt.getDate()} ${BULAN[dt.getMonth()]} ${dt.getFullYear()}`; };
const fmtRp   = (n) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0);

const generatePONumber = async () => {
  const now = new Date();
  const ROMAWI = ['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  const prefix = `PO/${ROMAWI[now.getMonth()+1]}/${now.getFullYear()}/`;
  const last = await prisma.vendorPO.findFirst({ where:{poNumber:{startsWith:prefix}}, orderBy:{poNumber:'desc'}, select:{poNumber:true} });
  const seq = last ? parseInt(last.poNumber.split('/').pop(),10)+1 : 1;
  return `${prefix}${String(seq).padStart(3,'0')}`;
};

const INCLUDE = {
  createdBy:   { select:{id:true,name:true,email:true} },
  branch:      { select:{id:true,name:true,code:true,city:true,address:true,phone:true,email:true,sigCreator:true,sigApprover:true} },
  items:       { orderBy:{itemNo:'asc'} },
  attachments: { orderBy:{createdAt:'asc'} },
};

// GET /vendor-po
const getVendorPOs = async (req,res) => {
  const { page,limit,skip } = getPagination(req.query.page,req.query.limit);
  const { status,branchId,search } = req.query;
  const where = {};
  if (req.user.role==='USER') where.createdById = req.user.id;
  else if (req.user.role==='IT_STAFF'&&req.user.branchId) where.branchId = req.user.branchId;
  else if (req.user.role==='ADMIN'&&branchId) where.branchId = branchId;
  if (status) where.status = status;
  if (search) where.OR = [{poNumber:{contains:search,mode:'insensitive'}},{supplierName:{contains:search,mode:'insensitive'}}];
  const [rows,total] = await Promise.all([
    prisma.vendorPO.findMany({where,include:INCLUDE,orderBy:{createdAt:'desc'},skip,take:limit}),
    prisma.vendorPO.count({where}),
  ]);
  return paginatedResponse(res,rows,getPaginationMeta(total,page,limit));
};

// GET /vendor-po/:id
const getVendorPOById = async (req,res) => {
  const row = await prisma.vendorPO.findUnique({where:{id:req.params.id},include:INCLUDE});
  if (!row) return errorResponse(res,'Surat PO tidak ditemukan',404);
  return successResponse(res,row);
};

// POST /vendor-po
const createVendorPO = async (req,res) => {
  const { supplierName,supplierPhone,supplierFax,supplierAddress,deliveryDate,deliveryAddress,
          receiverName,receiverPhone,paymentMethod,notes,discount=0,ppnEnabled=false,ppnPercent=11,
          branchId,items=[] } = req.body;
  if (!supplierName) return errorResponse(res,'Nama supplier wajib diisi',400);
  if (!items.length) return errorResponse(res,'Minimal satu item produk harus diisi',400);
  const poNumber = await generatePONumber();
  const subtotal   = items.reduce((s,i)=>s+(parseFloat(i.qty||0)*parseFloat(i.unitPrice||0)),0) - parseFloat(discount||0);
  const ppnAmount  = ppnEnabled ? subtotal*(parseFloat(ppnPercent)||11)/100 : 0;
  const grandTotal = subtotal + ppnAmount;
  const effectiveBranchId = branchId||(req.user.role!=='ADMIN'?req.user.branchId:null)||null;
  const row = await prisma.vendorPO.create({
    data:{ poNumber,supplierName,supplierPhone:supplierPhone||null,supplierFax:supplierFax||null,
           supplierAddress:supplierAddress||null,deliveryDate:deliveryDate||null,
           deliveryAddress:deliveryAddress||null,receiverName:receiverName||null,
           receiverPhone:receiverPhone||null,paymentMethod:paymentMethod||null,
           notes:notes||null,discount:parseFloat(discount||0),ppnEnabled:!!ppnEnabled,
           ppnPercent:parseFloat(ppnPercent||11),subtotal,ppnAmount,grandTotal,
           status:'DRAFT',branchId:effectiveBranchId,createdById:req.user.id,
           items:{ create:items.map((it,idx)=>({
             itemNo:idx+1,productName:it.productName,qty:parseFloat(it.qty||1),
             unit:it.unit||'pcs',unitPrice:parseFloat(it.unitPrice||0),
             totalPrice:parseFloat(it.qty||1)*parseFloat(it.unitPrice||0),notes:it.notes||null,
           })) } },
    include:INCLUDE });
  return successResponse(res,row,'Surat PO berhasil dibuat',201);
};

// PUT /vendor-po/:id
const updateVendorPO = async (req,res) => {
  const {id}=req.params;
  const existing = await prisma.vendorPO.findUnique({where:{id}});
  if (!existing) return errorResponse(res,'Surat PO tidak ditemukan',404);
  const { supplierName,supplierPhone,supplierFax,supplierAddress,deliveryDate,deliveryAddress,
          receiverName,receiverPhone,paymentMethod,notes,discount,ppnEnabled,ppnPercent,
          status,branchId,items } = req.body;
  const data = {};
  if (supplierName!==undefined)    data.supplierName    = supplierName;
  if (supplierPhone!==undefined)   data.supplierPhone   = supplierPhone||null;
  if (supplierFax!==undefined)     data.supplierFax     = supplierFax||null;
  if (supplierAddress!==undefined) data.supplierAddress = supplierAddress||null;
  if (deliveryDate!==undefined)    data.deliveryDate    = deliveryDate||null;
  if (deliveryAddress!==undefined) data.deliveryAddress = deliveryAddress||null;
  if (receiverName!==undefined)    data.receiverName    = receiverName||null;
  if (receiverPhone!==undefined)   data.receiverPhone   = receiverPhone||null;
  if (paymentMethod!==undefined)   data.paymentMethod   = paymentMethod||null;
  if (notes!==undefined)           data.notes           = notes||null;
  if (status!==undefined)          data.status          = status;
  if (branchId!==undefined&&req.user.role==='ADMIN') data.branchId = branchId||null;
  if (items&&Array.isArray(items)) {
    const d = parseFloat(discount!==undefined?discount:existing.discount||0);
    const pp = parseFloat(ppnPercent!==undefined?ppnPercent:existing.ppnPercent||11);
    const pEnabled = ppnEnabled!==undefined?!!ppnEnabled:existing.ppnEnabled;
    const sub = items.reduce((s,i)=>s+(parseFloat(i.qty||0)*parseFloat(i.unitPrice||0)),0)-d;
    const ppnAmt = pEnabled?sub*pp/100:0;
    data.discount=d; data.ppnEnabled=pEnabled; data.ppnPercent=pp;
    data.subtotal=sub; data.ppnAmount=ppnAmt; data.grandTotal=sub+ppnAmt;
    await prisma.vendorPOItem.deleteMany({where:{poId:id}});
    data.items={ create:items.map((it,idx)=>({
      itemNo:idx+1,productName:it.productName,qty:parseFloat(it.qty||1),
      unit:it.unit||'pcs',unitPrice:parseFloat(it.unitPrice||0),
      totalPrice:parseFloat(it.qty||1)*parseFloat(it.unitPrice||0),notes:it.notes||null,
    })) };
  }
  const updated = await prisma.vendorPO.update({where:{id},data,include:INCLUDE});
  return successResponse(res,updated,'Surat PO berhasil diperbarui');
};

// DELETE /vendor-po/:id
const deleteVendorPO = async (req,res) => {
  const {id}=req.params;
  const row = await prisma.vendorPO.findUnique({where:{id}});
  if (!row) return errorResponse(res,'Surat PO tidak ditemukan',404);
  await prisma.vendorPO.delete({where:{id}});
  return successResponse(res,null,'Surat PO berhasil dihapus');
};

// ── PDF Generator ─────────────────────────────────────────────────────────────
const urlToFilePath = (url) => {
  try { const p=new URL(url).pathname; return path.join(process.cwd(),p); } catch{return null;}
};

const generateVendorPOPDF = async (req,res) => {
  const row = await prisma.vendorPO.findUnique({where:{id:req.params.id},include:INCLUDE});
  if (!row) return errorResponse(res,'Surat PO tidak ditemukan',404);
  const settings = await prisma.companySetting.upsert({where:{id:'singleton'},create:{},update:{}});
  const sigBuyer  = (row.branch?.sigCreator||settings.sigCreator||row.createdBy.name).trim();

  const doc = new PDFDocument({size:'A4',margin:50,bufferPages:true});
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="PO-${row.poNumber.replace(/\//g,'-')}.pdf"`);
  doc.pipe(res);

  const ML=50, PW=doc.page.width-100, DARK='#0f172a', GRAY='#475569', BLUE='#2563eb', LIGHT='#f1f5f9', LINE='#e2e8f0';
  const BURL = process.env.BACKEND_URL||`http://localhost:${process.env.PORT||5000}`;

  // ── Kop Surat — gunakan data cabang jika tersedia ───────────────────────────
  const effectiveSettings = {
    companyName:    row.branch?.name    || settings.companyName,
    companyAddress: row.branch?.address || settings.companyAddress,
    companyCity:    row.branch?.city    || settings.companyCity,
    companyPhone:   row.branch?.phone   || settings.companyPhone,
    companyEmail:   row.branch?.email   || settings.companyEmail,
    companyLogo:    settings.companyLogo,
  };
  let y = drawKopSurat(doc, effectiveSettings, BURL, ML);
  y = drawDocTitle(doc, 'SURAT PURCHASE ORDER', y, ML);

  // PO number + date info row
  const KW2=130, COLON2=8, VW2=PW-KW2-COLON2, LH2=16;
  const infoRows2=[['No. PO',row.poNumber],['Tanggal',fmtDate(row.poDate)]];
  infoRows2.forEach(([k,v])=>{
    doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK).text(k,ML,y,{width:KW2,lineBreak:false});
    doc.font('Helvetica').fontSize(9).fillColor(DARK).text(':',ML+KW2,y,{width:COLON2,lineBreak:false});
    doc.font('Helvetica').fontSize(9).fillColor(DARK).text(v,ML+KW2+COLON2,y,{width:VW2});
    y+=LH2;
  });
  y+=8;
  doc.moveTo(ML,y).lineTo(ML+PW,y).strokeColor('#cccccc').lineWidth(0.5).stroke(); y+=10;

  // ── Supplier & Delivery Info (2 col) ──────────────────────────────────────
  const COL2=Math.floor((PW-12)/2);
  // Left: Supplier
  doc.roundedRect(ML,y,COL2,110,6).fill(LIGHT);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BLUE).text('KEPADA / SUPPLIER',ML+10,y+10);
  const supRows=[['Nama',row.supplierName],['Telp',row.supplierPhone||'-'],['Fax',row.supplierFax||'-'],['Alamat',row.supplierAddress||'-']];
  let sy=y+26;
  supRows.forEach(([k,v])=>{
    doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY).text(k,ML+10,sy,{width:40,lineBreak:false});
    doc.font('Helvetica').fontSize(8).fillColor(DARK).text(`: ${v}`,ML+52,sy,{width:COL2-60,lineBreak:false});
    sy+=16;
  });
  // Right: Delivery info
  const rx=ML+COL2+12;
  doc.roundedRect(rx,y,COL2,110,6).fill(LIGHT);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BLUE).text('INFO PENGIRIMAN',rx+10,y+10);
  const dlvRows=[['Tgl Kirim',row.deliveryDate||'-'],['Alamat',row.deliveryAddress||'-'],['Penerima',`${row.receiverName||'-'}${row.receiverPhone?` (${row.receiverPhone})`:''}`.trim()],['Pembayaran',row.paymentMethod||'-']];
  let dy=y+26;
  dlvRows.forEach(([k,v])=>{
    doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY).text(k,rx+10,dy,{width:52,lineBreak:false});
    doc.font('Helvetica').fontSize(8).fillColor(DARK).text(`: ${v}`,rx+64,dy,{width:COL2-72,lineBreak:false});
    dy+=16;
  });
  y+=120;

  // ── Items Table ────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text('RINCIAN PESANAN',ML,y); y+=14;
  const COL=[26,Math.round(PW*0.38),46,50,80,Math.round(PW-26-Math.round(PW*0.38)-46-50-80)];
  const COL_X=COL.reduce((acc,w,i)=>{acc.push(i===0?ML:acc[i-1]+COL[i-1]);return acc;},[]);
  const HDRS=['No','Nama Produk','Qty','Satuan','Harga/Unit','Total Harga'];
  const TH=22, PB=doc.page.height-doc.page.margins.bottom-60;
  doc.rect(ML,y,PW,TH).fill(BLUE);
  HDRS.forEach((h,i)=>{
    doc.font('Helvetica-Bold').fontSize(8).fillColor('white').text(h,COL_X[i]+3,y+7,{width:COL[i]-6,align:i>=2?'center':'left',lineBreak:false});
  });
  y+=TH;
  const drawTblHdr=(topY)=>{
    doc.rect(ML,topY,PW,TH).fill(BLUE);
    HDRS.forEach((h,i)=>doc.font('Helvetica-Bold').fontSize(8).fillColor('white').text(h,COL_X[i]+3,topY+7,{width:COL[i]-6,align:i>=2?'center':'left',lineBreak:false}));
    return topY+TH;
  };
  const RH=22;
  row.items.forEach((it,ri)=>{
    if (y+RH>PB) { doc.addPage(); y=50; y=drawTblHdr(y); }
    doc.rect(ML,y,PW,RH).fill(ri%2===0?'#ffffff':'#f8fafc');
    doc.rect(ML,y,PW,RH).stroke(LINE);
    COL.forEach((_,ci)=>{if(ci>0)doc.moveTo(COL_X[ci],y).lineTo(COL_X[ci],y+RH).strokeColor(LINE).lineWidth(0.5).stroke();});
    const vals=[String(it.itemNo),it.productName,String(it.qty),it.unit,fmtRp(it.unitPrice),fmtRp(it.totalPrice)];
    vals.forEach((v,ci)=>doc.font(ci===0?'Helvetica-Bold':'Helvetica').fontSize(8).fillColor(DARK).text(v,COL_X[ci]+3,y+7,{width:COL[ci]-6,align:ci>=2?'center':'left',lineBreak:false}));
    y+=RH;
  });
  y+=10;

  // ── Pricing Summary ────────────────────────────────────────────────────────
  const SW=220, SX=ML+PW-SW;
  const pRows=[['Subtotal sebelum diskon',fmtRp(row.items.reduce((s,i)=>s+i.totalPrice,0))],['Diskon',`- ${fmtRp(row.discount)}`]];
  if(row.ppnEnabled) pRows.push([`PPN ${row.ppnPercent}%`,fmtRp(row.ppnAmount)]);
  let py=y;
  pRows.forEach(([k,v],idx)=>{
    doc.rect(SX,py,SW,18).fill(idx%2===0?LIGHT:'white');
    doc.font('Helvetica').fontSize(8.5).fillColor(GRAY).text(k,SX+8,py+4,{width:SW/2-8,lineBreak:false});
    doc.font('Helvetica').fontSize(8.5).fillColor(DARK).text(v,SX+SW/2,py+4,{width:SW/2-8,align:'right',lineBreak:false});
    py+=18;
  });
  doc.rect(SX,py,SW,24).fill(BLUE);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('white').text('GRAND TOTAL',SX+8,py+6,{width:SW/2-8,lineBreak:false});
  doc.font('Helvetica-Bold').fontSize(10).fillColor('white').text(fmtRp(row.grandTotal),SX+SW/2,py+6,{width:SW/2-8,align:'right',lineBreak:false});
  y=py+34;

  // ── Terms ─────────────────────────────────────────────────────────────────
  const TERMS=[
    'Tanggal pengiriman sesuai konfirmasi.',
    'Syarat penagihan: dilampirkan kwitansi asli, surat jalan asli, dan copy PO yang sudah ditandatangan dan distempel oleh Penjual.',
    'Pembayaran diproses maksimal 7 hari kerja setelah berkas penagihan lengkap.',
    'Harga di atas belum termasuk PPN 11% (kecuali tercantum dalam PO).',
    'Pembeli berhak menolak barang yang tidak sesuai spesifikasi, biaya pengambilan menjadi beban Penjual.',
    'Pengiriman harus tepat waktu. Keterlambatan menjadi tanggung jawab Penjual.',
    'Jika barang belum terkirim dalam 7 hari dari tanggal pengiriman yang tercantum, PO ini dianggap BATAL.',
    'Barang harus sesuai spesifikasi atau sample yang disetujui Pembeli.',
  ];
  if (y+10+TERMS.length*12+10>PB) { doc.addPage(); y=50; }
  doc.moveTo(ML,y).lineTo(ML+PW,y).strokeColor(LINE).lineWidth(1).stroke(); y+=10;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK).text('Hal-hal yang perlu diperhatikan:',ML,y); y+=14;
  TERMS.forEach((t,i)=>{
    if(y+12>PB){doc.addPage();y=50;}
    doc.font('Helvetica').fontSize(8).fillColor(GRAY).text(`${i+1}.  ${t}`,ML+4,y,{width:PW-8}); y+=12;
  });
  y+=10;

  // ── Signatures ────────────────────────────────────────────────────────────
  if (y+120>PB) { doc.addPage(); y=50; }
  doc.moveTo(ML,y).lineTo(ML+PW,y).strokeColor(LINE).lineWidth(1).stroke(); y+=14;
  const SIG_W=Math.floor((PW-10)/2), SIG_H=90;
  [{ label:'Pembeli', name:sigBuyer },{ label:'Penjual (Menyetujui)', name:'(..........................................)' }].forEach((s,i)=>{
    const sx=ML+i*(SIG_W+10);
    doc.roundedRect(sx,y,SIG_W,SIG_H,6).fill(LIGHT);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BLUE).text(s.label,sx,y+10,{width:SIG_W,align:'center',lineBreak:false});
    const ly=y+SIG_H-28;
    doc.moveTo(sx+16,ly).lineTo(sx+SIG_W-16,ly).strokeColor('#94a3b8').lineWidth(0.5).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK).text(`( ${s.name} )`,sx,ly+5,{width:SIG_W,align:'center',lineBreak:false});
  });
  y+=SIG_H+10;

  // ── Lampiran foto ─────────────────────────────────────────────────────────
  const IMG_MIME=new Set(['image/png','image/jpeg','image/jpg','image/gif','image/webp']);
  const imgAtts=(row.attachments||[]).filter(a=>IMG_MIME.has(a.mimeType));
  imgAtts.forEach((att,idx)=>{
    const imgPath=urlToFilePath(att.url);
    if(!imgPath||!fs.existsSync(imgPath)) return;
    doc.addPage();
    const PGW=doc.page.width, PGH=doc.page.height;
    // mini header
    doc.rect(0,0,PGW,50).fill('#f8fafc');
    doc.moveTo(0,50).lineTo(PGW,50).strokeColor('#e2e8f0').lineWidth(1).stroke();
    let hx=ML;
    if(effectiveSettings.companyLogo){
      const lp=urlToFilePath(`${BURL}${effectiveSettings.companyLogo}`);
      if(lp&&fs.existsSync(lp)){ try{doc.image(lp,ML,8,{fit:[32,32]});hx+=40;}catch(_){} }
    }
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1e293b').text(effectiveSettings.companyName||'IT Support',hx,16,{width:PGW-hx-ML-10,lineBreak:false});
    doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(`${row.poNumber}  ·  Lampiran ${idx+1} / ${imgAtts.length}`,ML,34,{width:PGW-ML*2,align:'right',lineBreak:false});
    // gambar
    const imgY=62, maxImgH=PGH-imgY-70;
    try{ doc.image(imgPath,ML,imgY,{fit:[PGW-ML*2,maxImgH],align:'center',valign:'center'}); }catch(_){}
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(att.originalName,ML,PGH-62,{width:PGW-ML*2,align:'center',lineBreak:false});
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  const total=doc.bufferedPageRange().count;
  for(let p=0;p<total;p++){
    doc.switchToPage(p);
    const MB=doc.page.margins.bottom, fY=doc.page.height-MB-12;
    doc.moveTo(ML,fY-6).lineTo(ML+PW,fY-6).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY).text(`${effectiveSettings.companyName||'IT Support'}  ·  ${row.poNumber}`,ML,fY,{width:PW/2,lineBreak:false});
    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY).text(`Hal. ${p+1} / ${total}`,ML+PW/2,fY,{width:PW/2,align:'right',lineBreak:false});
  }
  doc.switchToPage(total-1);
  doc.y=doc.page.margins.top||50;
  doc.end();
};


// ── Helpers ────────────────────────────────────────────────────────────────────
const buildAttachUrl = (file) => {
  const rel = file.path.replace(process.cwd(), '').replace(/\\/g, '/');
  return `${process.env.BACKEND_URL||`http://localhost:${process.env.PORT||5000}`}${rel}`;
};

// POST /:id/attachments
const uploadVendorPOAttachments = async (req,res) => {
  const po = await prisma.vendorPO.findUnique({where:{id:req.params.id}});
  if (!po) return errorResponse(res,'PO tidak ditemukan',404);
  if (!req.files||!req.files.length) return errorResponse(res,'Tidak ada file',400);
  const created = await Promise.all(req.files.map(file =>
    prisma.vendorPOAttachment.create({data:{filename:file.filename,originalName:file.originalname,mimeType:file.mimetype,size:file.size,url:buildAttachUrl(file),poId:req.params.id}})
  ));
  return successResponse(res,created,'Lampiran berhasil diupload',201);
};

// DELETE /:id/attachments/:attachId
const deleteVendorPOAttachment = async (req,res) => {
  const att = await prisma.vendorPOAttachment.findFirst({where:{id:req.params.attachId,poId:req.params.id}});
  if (!att) return errorResponse(res,'Lampiran tidak ditemukan',404);
  const fp = att.url.replace(/^https?:\/\/[^/]+/,'').replace(/\//,process.cwd()+'/').replace(/\//g,require('path').sep);
  try { if (require('fs').existsSync(fp)) require('fs').unlinkSync(fp); } catch(_){}
  await prisma.vendorPOAttachment.delete({where:{id:req.params.attachId}});
  return successResponse(res,null,'Lampiran dihapus');
};

module.exports = { getVendorPOs, getVendorPOById, createVendorPO, updateVendorPO, deleteVendorPO, generateVendorPOPDF, uploadVendorPOAttachments, deleteVendorPOAttachment };
