const path = require('path');
const fs   = require('fs');
const PDFDocument = require('pdfkit');
const { prisma } = require('../config/database');
const { successResponse, errorResponse, paginatedResponse, getPagination, getPaginationMeta } = require('../utils/response');
const { drawKopSurat, drawDocTitle } = require('../utils/pdfHelper');

const BULAN=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const fmtDate=(d)=>{const dt=new Date(d);return `${dt.getDate()} ${BULAN[dt.getMonth()]} ${dt.getFullYear()}`;};
const fmtRp=(n)=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n||0);

const generatePONumber = async () => {
  const now=new Date();
  const ROMAWI=['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  const prefix=`IPO/${ROMAWI[now.getMonth()+1]}/${now.getFullYear()}/`;
  const last=await prisma.internalPO.findFirst({where:{poNumber:{startsWith:prefix}},orderBy:{poNumber:'desc'},select:{poNumber:true}});
  const seq=last?parseInt(last.poNumber.split('/').pop(),10)+1:1;
  return `${prefix}${String(seq).padStart(3,'0')}`;
};

const INCLUDE = {
  createdBy:  { select:{id:true,name:true,email:true} },
  approvedBy: { select:{id:true,name:true} },
  branch:     { select:{id:true,name:true,code:true,city:true,address:true,phone:true,email:true,sigCreator:true,sigChecker:true,sigApprover:true} },
  items:        { orderBy:{itemNo:'asc'} },
  attachments:  { orderBy:{createdAt:'asc'} },
};

const getInternalPOs = async (req,res) => {
  const {page,limit,skip}=getPagination(req.query.page,req.query.limit);
  const {status,branchId,search}=req.query;
  const where={};
  if (req.user.role==='USER') where.createdById=req.user.id;
  else if (req.user.role==='IT_STAFF'&&req.user.branchId) where.branchId=req.user.branchId;
  else if (req.user.role==='ADMIN'&&branchId) where.branchId=branchId;
  if (status) where.status=status;
  if (search) where.OR=[{poNumber:{contains:search,mode:'insensitive'}},{department:{contains:search,mode:'insensitive'}},{requestor:{contains:search,mode:'insensitive'}}];
  const [rows,total]=await Promise.all([
    prisma.internalPO.findMany({where,include:INCLUDE,orderBy:{createdAt:'desc'},skip,take:limit}),
    prisma.internalPO.count({where}),
  ]);
  return paginatedResponse(res,rows,getPaginationMeta(total,page,limit));
};

const getInternalPOById = async (req,res) => {
  const row=await prisma.internalPO.findUnique({where:{id:req.params.id},include:INCLUDE});
  if (!row) return errorResponse(res,'Internal PO tidak ditemukan',404);
  return successResponse(res,row);
};

const createInternalPO = async (req,res) => {
  const {department,requestor,preparedBy,description,bankInfo,discount=0,branchId,
         sigDiajukan,sigDisetujui,sigMengetahui,items=[]}=req.body;
  if (!department||!requestor) return errorResponse(res,'Departemen dan requestor wajib diisi',400);
  if (!items.length) return errorResponse(res,'Minimal satu item harus diisi',400);
  const poNumber=await generatePONumber();
  const totalAmount=items.reduce((s,i)=>s+(parseFloat(i.qty||0)*parseFloat(i.unitPrice||0)),0)-parseFloat(discount||0);
  const effectiveBranchId=branchId||(req.user.role!=='ADMIN'?req.user.branchId:null)||null;
  const row=await prisma.internalPO.create({
    data:{poNumber,department,requestor,preparedBy:preparedBy||null,description:description||null,
          bankInfo:bankInfo||null,discount:parseFloat(discount||0),totalAmount,status:'DRAFT',
          sigDiajukan:sigDiajukan||null,sigDisetujui:sigDisetujui||null,sigMengetahui:sigMengetahui||null,
          branchId:effectiveBranchId,createdById:req.user.id,
          items:{create:items.map((it,idx)=>({
            itemNo:idx+1,itemName:it.itemName,supplier:it.supplier||null,qty:parseFloat(it.qty||1),
            unit:it.unit||'pcs',unitPrice:parseFloat(it.unitPrice||0),
            totalPrice:parseFloat(it.qty||1)*parseFloat(it.unitPrice||0),notes:it.notes||null,
          }))}},
    include:INCLUDE});
  return successResponse(res,row,'Internal PO berhasil dibuat',201);
};

const updateInternalPO = async (req,res) => {
  const {id}=req.params;
  const existing=await prisma.internalPO.findUnique({where:{id}});
  if (!existing) return errorResponse(res,'Internal PO tidak ditemukan',404);
  const {department,requestor,preparedBy,description,bankInfo,discount,status,
         sigDiajukan,sigDisetujui,sigMengetahui,rejectedReason,branchId,items}=req.body;
  const data={};
  if (department!==undefined)     data.department=department;
  if (requestor!==undefined)      data.requestor=requestor;
  if (preparedBy!==undefined)     data.preparedBy=preparedBy||null;
  if (description!==undefined)    data.description=description||null;
  if (bankInfo!==undefined)       data.bankInfo=bankInfo||null;
  if (status!==undefined)         data.status=status;
  if (rejectedReason!==undefined) data.rejectedReason=rejectedReason||null;
  if (sigDiajukan!==undefined)    data.sigDiajukan=sigDiajukan||null;
  if (sigDisetujui!==undefined)   data.sigDisetujui=sigDisetujui||null;
  if (sigMengetahui!==undefined)  data.sigMengetahui=sigMengetahui||null;
  if (status==='APPROVED')        { data.approvedById=req.user.id; }
  if (branchId!==undefined&&req.user.role==='ADMIN') data.branchId=branchId||null;
  if (items&&Array.isArray(items)) {
    const d=parseFloat(discount!==undefined?discount:existing.discount||0);
    data.discount=d;
    data.totalAmount=items.reduce((s,i)=>s+(parseFloat(i.qty||0)*parseFloat(i.unitPrice||0)),0)-d;
    await prisma.internalPOItem.deleteMany({where:{poId:id}});
    data.items={create:items.map((it,idx)=>({
      itemNo:idx+1,itemName:it.itemName,supplier:it.supplier||null,qty:parseFloat(it.qty||1),
      unit:it.unit||'pcs',unitPrice:parseFloat(it.unitPrice||0),
      totalPrice:parseFloat(it.qty||1)*parseFloat(it.unitPrice||0),notes:it.notes||null,
    }))};
  }
  const updated=await prisma.internalPO.update({where:{id},data,include:INCLUDE});
  return successResponse(res,updated,'Internal PO berhasil diperbarui');
};

const deleteInternalPO = async (req,res) => {
  const {id}=req.params;
  if (!await prisma.internalPO.findUnique({where:{id}})) return errorResponse(res,'Internal PO tidak ditemukan',404);
  await prisma.internalPO.delete({where:{id}});
  return successResponse(res,null,'Internal PO berhasil dihapus');
};

const urlToFilePath=(url)=>{try{const p=new URL(url).pathname;return path.join(process.cwd(),p);}catch{return null;}};

const generateInternalPOPDF = async (req,res) => {
  const row=await prisma.internalPO.findUnique({where:{id:req.params.id},include:INCLUDE});
  if (!row) return errorResponse(res,'Internal PO tidak ditemukan',404);
  const settings=await prisma.companySetting.upsert({where:{id:'singleton'},create:{},update:{}});
  const sigDiajukan =(row.sigDiajukan||row.branch?.sigCreator||settings.sigCreator||row.createdBy.name).trim();
  const sigDisetujui=(row.sigDisetujui||row.branch?.sigChecker||settings.sigChecker||'').trim()||'(.....................................)';
  const sigMengetahui=(row.sigMengetahui||row.branch?.sigApprover||settings.sigApprover||'').trim()||'(.....................................)';
  const BURL=process.env.BACKEND_URL||`http://localhost:${process.env.PORT||5000}`;

  const doc=new PDFDocument({size:'A4',margin:50,bufferPages:true});
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="IPO-${row.poNumber.replace(/\//g,'-')}.pdf"`);
  doc.pipe(res);

  const ML=50,PW=doc.page.width-100,DARK='#0f172a',GRAY='#475569',GREEN='#16a34a',LIGHT='#f0fdf4',LINE='#e2e8f0';

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
  y = drawDocTitle(doc, 'PURCHASE ORDER INTERNAL', y, ML);

  // Info rows
  const KW2=130, COLON2=8, VW2=PW-KW2-COLON2, LH2=16;
  const infoRows2=[
    ['No. PO',       row.poNumber],
    ['Tanggal',      fmtDate(row.poDate)],
    ['Departemen',   row.department],
    ['Pemohon',      row.requestor],
    ['Disusun Oleh', row.preparedBy||'-'],
    ['Status',       row.status],
  ];
  infoRows2.forEach(([k,v])=>{
    doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK).text(k,ML,y,{width:KW2,lineBreak:false});
    doc.font('Helvetica').fontSize(9).fillColor(DARK).text(':',ML+KW2,y,{width:COLON2,lineBreak:false});
    doc.font('Helvetica').fontSize(9).fillColor(DARK).text(v,ML+KW2+COLON2,y,{width:VW2});
    y+=LH2;
  });
  y+=8;
  doc.moveTo(ML,y).lineTo(ML+PW,y).strokeColor('#cccccc').lineWidth(0.5).stroke(); y+=10;

  // Description
  if (row.description) {
    doc.roundedRect(ML,y,PW,30,5).fill('#fefce8');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#92400e').text('Deskripsi Keperluan: ',ML+8,y+8,{continued:true});
    doc.font('Helvetica').fontSize(8).fillColor(DARK).text(row.description,{width:PW-80,lineBreak:false});
    y+=38;
  }
  if (row.bankInfo) {
    doc.roundedRect(ML,y,PW,22,5).fill('#eff6ff');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#1d4ed8').text('Info Rekening/VA: ',ML+8,y+7,{continued:true});
    doc.font('Helvetica').fontSize(8).fillColor(DARK).text(row.bankInfo,{width:PW-100,lineBreak:false});
    y+=30;
  }

  // Items Table
  doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text('DAFTAR BARANG / JASA',ML,y); y+=12;
  const COLS=[26,Math.round(PW*0.30),Math.round(PW*0.18),36,46,76,Math.round(PW-26-Math.round(PW*0.30)-Math.round(PW*0.18)-36-46-76)];
  const CX=COLS.reduce((a,w,i)=>{a.push(i===0?ML:a[i-1]+COLS[i-1]);return a;},[]);
  const HDRS2=['No','Nama Barang','Supplier','Qty','Satuan','Harga Unit','Total Harga'];
  const PBB=doc.page.height-doc.page.margins.bottom-60;
  doc.rect(ML,y,PW,22).fill(GREEN);
  HDRS2.forEach((h,i)=>doc.font('Helvetica-Bold').fontSize(7.5).fillColor('white').text(h,CX[i]+3,y+7,{width:COLS[i]-6,align:i>=3?'center':'left',lineBreak:false}));
  y+=22;
  const drawHdr2=(ty)=>{ doc.rect(ML,ty,PW,22).fill(GREEN); HDRS2.forEach((h,i)=>doc.font('Helvetica-Bold').fontSize(7.5).fillColor('white').text(h,CX[i]+3,ty+7,{width:COLS[i]-6,align:i>=3?'center':'left',lineBreak:false})); return ty+22; };
  row.items.forEach((it,ri)=>{
    if(y+22>PBB){doc.addPage();y=50;y=drawHdr2(y);}
    doc.rect(ML,y,PW,22).fill(ri%2===0?'#ffffff':'#f0fdf4');
    doc.rect(ML,y,PW,22).stroke(LINE);
    COLS.forEach((_,ci)=>{if(ci>0)doc.moveTo(CX[ci],y).lineTo(CX[ci],y+22).strokeColor(LINE).lineWidth(0.5).stroke();});
    const vs=[String(it.itemNo),it.itemName,it.supplier||'-',String(it.qty),it.unit,fmtRp(it.unitPrice),fmtRp(it.totalPrice)];
    vs.forEach((v,ci)=>doc.font(ci===0?'Helvetica-Bold':'Helvetica').fontSize(8).fillColor(DARK).text(v,CX[ci]+3,y+7,{width:COLS[ci]-6,align:ci>=3?'center':'left',lineBreak:false}));
    y+=22;
  });
  y+=8;

  // Totals
  const SW=200,SX=ML+PW-SW;
  if (row.discount>0) {
    doc.rect(SX,y,SW,18).fill(LIGHT);
    doc.font('Helvetica').fontSize(8.5).fillColor(GRAY).text('Diskon',SX+8,y+4,{width:SW/2-8,lineBreak:false});
    doc.font('Helvetica').fontSize(8.5).fillColor(DARK).text(`- ${fmtRp(row.discount)}`,SX+SW/2,y+4,{width:SW/2-8,align:'right',lineBreak:false});
    y+=18;
  }
  doc.rect(SX,y,SW,24).fill(GREEN);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('white').text('TOTAL',SX+8,y+6,{width:SW/2-8,lineBreak:false});
  doc.font('Helvetica-Bold').fontSize(10).fillColor('white').text(fmtRp(row.totalAmount),SX+SW/2,y+6,{width:SW/2-8,align:'right',lineBreak:false});
  y+=34;

  // Signatures (3 col)
  if (y+110>PBB){doc.addPage();y=50;}
  doc.moveTo(ML,y).lineTo(ML+PW,y).strokeColor(LINE).lineWidth(1).stroke(); y+=12;
  const SIG3W=Math.floor((PW-20)/3),SIG3H=100;
  [{label:'Diajukan oleh,',name:sigDiajukan},{label:'Disetujui oleh,',name:sigDisetujui},{label:'Mengetahui,',name:sigMengetahui}].forEach((s,i)=>{
    const sx=ML+i*(SIG3W+10);
    doc.roundedRect(sx,y,SIG3W,SIG3H,6).fill(LIGHT);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GREEN).text(s.label,sx,y+10,{width:SIG3W,align:'center',lineBreak:false});
    const ly2=y+SIG3H-28;
    doc.moveTo(sx+14,ly2).lineTo(sx+SIG3W-14,ly2).strokeColor('#86efac').lineWidth(0.5).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK).text(s.name,sx,ly2+5,{width:SIG3W,align:'center',lineBreak:false});
  });

  // ── Lampiran foto ─────────────────────────────────────────────────────────
  const IMG_MIME=new Set(['image/png','image/jpeg','image/jpg','image/gif','image/webp']);
  const imgAtts=(row.attachments||[]).filter(a=>IMG_MIME.has(a.mimeType));
  imgAtts.forEach((att,idx)=>{
    const imgPath=urlToFilePath(att.url);
    if(!imgPath||!fs.existsSync(imgPath)) return;
    doc.addPage();
    const PGW=doc.page.width, PGH=doc.page.height;
    doc.rect(0,0,PGW,50).fill('#f8fafc');
    doc.moveTo(0,50).lineTo(PGW,50).strokeColor('#e2e8f0').lineWidth(1).stroke();
    let hx2=ML;
    if(effectiveSettings.companyLogo){const lp=urlToFilePath(`${BURL}${effectiveSettings.companyLogo}`);if(lp&&fs.existsSync(lp)){try{doc.image(lp,ML,8,{fit:[32,32]});hx2+=40;}catch(_){}}}
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1e293b').text(effectiveSettings.companyName||'IT Support',hx2,16,{width:PGW-hx2-ML-10,lineBreak:false});
    doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(`${row.poNumber}  ·  Lampiran ${idx+1} / ${imgAtts.length}`,ML,34,{width:PGW-ML*2,align:'right',lineBreak:false});
    const imgY=62, maxImgH=PGH-imgY-70;
    try{doc.image(imgPath,ML,imgY,{fit:[PGW-ML*2,maxImgH],align:'center',valign:'center'});}catch(_){}
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(att.originalName,ML,PGH-62,{width:PGW-ML*2,align:'center',lineBreak:false});
  });

  const total=doc.bufferedPageRange().count;
  for(let p=0;p<total;p++){
    doc.switchToPage(p);
    const MB=doc.page.margins.bottom,fY=doc.page.height-MB-12;
    doc.moveTo(ML,fY-6).lineTo(ML+PW,fY-6).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY).text(`${effectiveSettings.companyName||'IT Support'}  ·  ${row.poNumber}`,ML,fY,{width:PW/2,lineBreak:false});
    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY).text(`Hal. ${p+1} / ${total}`,ML+PW/2,fY,{width:PW/2,align:'right',lineBreak:false});
  }
  doc.switchToPage(total-1); doc.y=doc.page.margins.top||50; doc.end();
};


const buildAttachUrl = (file) => {
  const rel = file.path.replace(process.cwd(),'').replace(/\\/g,'/');
  return `${process.env.BACKEND_URL||`http://localhost:${process.env.PORT||5000}`}${rel}`;
};
const uploadInternalPOAttachments = async (req,res) => {
  const po = await prisma.internalPO.findUnique({where:{id:req.params.id}});
  if (!po) return errorResponse(res,'PO tidak ditemukan',404);
  if (!req.files||!req.files.length) return errorResponse(res,'Tidak ada file',400);
  const created = await Promise.all(req.files.map(file =>
    prisma.internalPOAttachment.create({data:{filename:file.filename,originalName:file.originalname,mimeType:file.mimetype,size:file.size,url:buildAttachUrl(file),poId:req.params.id}})
  ));
  return successResponse(res,created,'Lampiran berhasil diupload',201);
};
const deleteInternalPOAttachment = async (req,res) => {
  const att = await prisma.internalPOAttachment.findFirst({where:{id:req.params.attachId,poId:req.params.id}});
  if (!att) return errorResponse(res,'Lampiran tidak ditemukan',404);
  const fp = att.url.replace(/^https?:\/\/[^/]+/,'').replace(/\//,process.cwd()+'/').replace(/\//g,require('path').sep);
  try { if (require('fs').existsSync(fp)) require('fs').unlinkSync(fp); } catch(_){}
  await prisma.internalPOAttachment.delete({where:{id:req.params.attachId}});
  return successResponse(res,null,'Lampiran dihapus');
};

module.exports = { getInternalPOs, getInternalPOById, createInternalPO, updateInternalPO, deleteInternalPO, generateInternalPOPDF, uploadInternalPOAttachments, deleteInternalPOAttachment };
