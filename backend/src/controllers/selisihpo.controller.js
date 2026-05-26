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
  const prefix=`SPO/${ROMAWI[now.getMonth()+1]}/${now.getFullYear()}/`;
  const last=await prisma.selisihPO.findFirst({where:{poNumber:{startsWith:prefix}},orderBy:{poNumber:'desc'},select:{poNumber:true}});
  const seq=last?parseInt(last.poNumber.split('/').pop(),10)+1:1;
  return `${prefix}${String(seq).padStart(3,'0')}`;
};

const INCLUDE={
  createdBy:   { select:{id:true,name:true,email:true} },
  branch:      { select:{id:true,name:true,code:true,city:true,address:true,phone:true,email:true,sigCreator:true,sigApprover:true} },
  items:       { orderBy:{itemNo:'asc'} },
  attachments: { orderBy:{createdAt:'asc'} },
};

const getSelisihPOs = async (req,res) => {
  const {page,limit,skip}=getPagination(req.query.page,req.query.limit);
  const {status,branchId,search}=req.query;
  const where={};
  if (req.user.role==='USER') where.createdById=req.user.id;
  else if (req.user.role==='IT_STAFF'&&req.user.branchId) where.branchId=req.user.branchId;
  else if (req.user.role==='ADMIN'&&branchId) where.branchId=branchId;
  if (status) where.status=status;
  if (search) where.OR=[{poNumber:{contains:search,mode:'insensitive'}},{department:{contains:search,mode:'insensitive'}}];
  const [rows,total]=await Promise.all([
    prisma.selisihPO.findMany({where,include:INCLUDE,orderBy:{createdAt:'desc'},skip,take:limit}),
    prisma.selisihPO.count({where}),
  ]);
  return paginatedResponse(res,rows,getPaginationMeta(total,page,limit));
};

const getSelisihPOById = async (req,res) => {
  const row=await prisma.selisihPO.findUnique({where:{id:req.params.id},include:INCLUDE});
  if (!row) return errorResponse(res,'Selisih PO tidak ditemukan',404);
  return successResponse(res,row);
};

const createSelisihPO = async (req,res) => {
  const {department,requestor,preparedBy,description,bankInfo,
         refPoNumber,refPoDate,refPoAmount=0,branchId,
         sigDiajukan,sigMengetahui,items=[]}=req.body;
  if (!department||!requestor) return errorResponse(res,'Departemen dan requestor wajib diisi',400);
  if (!items.length) return errorResponse(res,'Minimal satu item harus diisi',400);
  const poNumber=await generatePONumber();
  const totalAmount=items.reduce((s,i)=>s+(parseFloat(i.qty||0)*parseFloat(i.unitPrice||0)),0);
  const selisihAmount=totalAmount-parseFloat(refPoAmount||0);
  const effectiveBranchId=branchId||(req.user.role!=='ADMIN'?req.user.branchId:null)||null;
  const row=await prisma.selisihPO.create({
    data:{poNumber,department,requestor,preparedBy:preparedBy||null,description:description||null,
          bankInfo:bankInfo||null,totalAmount,refPoNumber:refPoNumber||null,
          refPoDate:refPoDate?new Date(refPoDate):null,refPoAmount:parseFloat(refPoAmount||0),
          selisihAmount,status:'DRAFT',sigDiajukan:sigDiajukan||null,sigMengetahui:sigMengetahui||null,
          branchId:effectiveBranchId,createdById:req.user.id,
          items:{create:items.map((it,idx)=>({
            itemNo:idx+1,itemName:it.itemName,supplier:it.supplier||null,qty:parseFloat(it.qty||1),
            unit:it.unit||'pcs',unitPrice:parseFloat(it.unitPrice||0),
            totalPrice:parseFloat(it.qty||1)*parseFloat(it.unitPrice||0),notes:it.notes||null,
          }))}},
    include:INCLUDE});
  return successResponse(res,row,'Selisih PO berhasil dibuat',201);
};

const updateSelisihPO = async (req,res) => {
  const {id}=req.params;
  const existing=await prisma.selisihPO.findUnique({where:{id}});
  if (!existing) return errorResponse(res,'Selisih PO tidak ditemukan',404);
  const {department,requestor,preparedBy,description,bankInfo,refPoNumber,refPoDate,refPoAmount,
         status,sigDiajukan,sigMengetahui,branchId,items}=req.body;
  const data={};
  if(department!==undefined)  data.department=department;
  if(requestor!==undefined)   data.requestor=requestor;
  if(preparedBy!==undefined)  data.preparedBy=preparedBy||null;
  if(description!==undefined) data.description=description||null;
  if(bankInfo!==undefined)    data.bankInfo=bankInfo||null;
  if(status!==undefined)      data.status=status;
  if(sigDiajukan!==undefined) data.sigDiajukan=sigDiajukan||null;
  if(sigMengetahui!==undefined) data.sigMengetahui=sigMengetahui||null;
  if(refPoNumber!==undefined) data.refPoNumber=refPoNumber||null;
  if(refPoDate!==undefined)   data.refPoDate=refPoDate?new Date(refPoDate):null;
  if(branchId!==undefined&&req.user.role==='ADMIN') data.branchId=branchId||null;
  if(items&&Array.isArray(items)){
    data.totalAmount=items.reduce((s,i)=>s+(parseFloat(i.qty||0)*parseFloat(i.unitPrice||0)),0);
    const rpa=parseFloat(refPoAmount!==undefined?refPoAmount:existing.refPoAmount||0);
    data.refPoAmount=rpa; data.selisihAmount=data.totalAmount-rpa;
    await prisma.selisihPOItem.deleteMany({where:{poId:id}});
    data.items={create:items.map((it,idx)=>({
      itemNo:idx+1,itemName:it.itemName,supplier:it.supplier||null,qty:parseFloat(it.qty||1),
      unit:it.unit||'pcs',unitPrice:parseFloat(it.unitPrice||0),
      totalPrice:parseFloat(it.qty||1)*parseFloat(it.unitPrice||0),notes:it.notes||null,
    }))};
  }
  const updated=await prisma.selisihPO.update({where:{id},data,include:INCLUDE});
  return successResponse(res,updated,'Selisih PO berhasil diperbarui');
};

const deleteSelisihPO = async (req,res) => {
  const {id}=req.params;
  if (!await prisma.selisihPO.findUnique({where:{id}})) return errorResponse(res,'Selisih PO tidak ditemukan',404);
  await prisma.selisihPO.delete({where:{id}});
  return successResponse(res,null,'Selisih PO berhasil dihapus');
};

const urlToFilePath=(url)=>{try{const p=new URL(url).pathname;return path.join(process.cwd(),p);}catch{return null;}};

const generateSelisihPOPDF = async (req,res) => {
  const row=await prisma.selisihPO.findUnique({where:{id:req.params.id},include:INCLUDE});
  if (!row) return errorResponse(res,'Selisih PO tidak ditemukan',404);
  const settings=await prisma.companySetting.upsert({where:{id:'singleton'},create:{},update:{}});
  const sigDiajukan=(row.sigDiajukan||row.branch?.sigCreator||settings.sigCreator||row.createdBy.name).trim();
  const sigMengetahui=(row.sigMengetahui||row.branch?.sigApprover||settings.sigApprover||'').trim()||'(.....................................)';
  const BURL=process.env.BACKEND_URL||`http://localhost:${process.env.PORT||5000}`;

  const doc=new PDFDocument({size:'A4',margin:50,bufferPages:true});
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="SPO-${row.poNumber.replace(/\//g,'-')}.pdf"`);
  doc.pipe(res);

  const ML=50,PW=doc.page.width-100,DARK='#0f172a',GRAY='#475569',AMBER='#d97706',AMBERLIGHT='#fffbeb',LINE='#e2e8f0';

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
  y = drawDocTitle(doc, 'PURCHASE ORDER SELISIH', y, ML);

  // Info rows
  const KW2=130, COLON2=8, VW2=PW-KW2-COLON2, LH2=16;
  const infoRows2=[
    ['No. PO',       row.poNumber],
    ['Tanggal',      fmtDate(row.poDate)],
    ['Departemen',   row.department],
    ['Pemohon',      row.requestor],
    ['Disusun Oleh', row.preparedBy||'-'],
    ['Cabang',       row.branch?.name||'-'],
  ];
  infoRows2.forEach(([k,v])=>{
    doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK).text(k,ML,y,{width:KW2,lineBreak:false});
    doc.font('Helvetica').fontSize(9).fillColor(DARK).text(':',ML+KW2,y,{width:COLON2,lineBreak:false});
    doc.font('Helvetica').fontSize(9).fillColor(DARK).text(v,ML+KW2+COLON2,y,{width:VW2});
    y+=LH2;
  });
  y+=8;
  doc.moveTo(ML,y).lineTo(ML+PW,y).strokeColor('#cccccc').lineWidth(0.5).stroke(); y+=10;

  if(row.description||row.bankInfo){
    if(row.description){ doc.roundedRect(ML,y,PW,24,4).fill('#fef9c3'); doc.font('Helvetica-Bold').fontSize(8).fillColor('#92400e').text('Deskripsi: ',ML+8,y+8,{continued:true}); doc.font('Helvetica').fontSize(8).fillColor(DARK).text(row.description||'',{width:PW-80,lineBreak:false}); y+=32; }
    if(row.bankInfo){ doc.roundedRect(ML,y,PW,22,4).fill('#eff6ff'); doc.font('Helvetica-Bold').fontSize(8).fillColor('#1d4ed8').text('Info Rekening/VA: ',ML+8,y+7,{continued:true}); doc.font('Helvetica').fontSize(8).fillColor(DARK).text(row.bankInfo,{width:PW-110,lineBreak:false}); y+=30; }
  }

  // Items Table
  doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text('DAFTAR BARANG / JASA',ML,y); y+=12;
  const COLS=[26,Math.round(PW*0.32),Math.round(PW*0.18),36,46,76,Math.round(PW-26-Math.round(PW*0.32)-Math.round(PW*0.18)-36-46-76)];
  const CX=COLS.reduce((a,w,i)=>{a.push(i===0?ML:a[i-1]+COLS[i-1]);return a;},[]);
  const HDRS=['No','Nama Barang','Supplier','Qty','Satuan','Harga Unit','Total Harga'];
  const PBB=doc.page.height-doc.page.margins.bottom-60;
  doc.rect(ML,y,PW,22).fill(AMBER);
  HDRS.forEach((h,i)=>doc.font('Helvetica-Bold').fontSize(7.5).fillColor('white').text(h,CX[i]+3,y+7,{width:COLS[i]-6,align:i>=3?'center':'left',lineBreak:false}));
  y+=22;
  const drawHdr=(ty)=>{ doc.rect(ML,ty,PW,22).fill(AMBER); HDRS.forEach((h,i)=>doc.font('Helvetica-Bold').fontSize(7.5).fillColor('white').text(h,CX[i]+3,ty+7,{width:COLS[i]-6,align:i>=3?'center':'left',lineBreak:false})); return ty+22; };
  row.items.forEach((it,ri)=>{
    if(y+22>PBB){doc.addPage();y=50;y=drawHdr(y);}
    doc.rect(ML,y,PW,22).fill(ri%2===0?'#ffffff':AMBERLIGHT);
    doc.rect(ML,y,PW,22).stroke(LINE);
    COLS.forEach((_,ci)=>{if(ci>0)doc.moveTo(CX[ci],y).lineTo(CX[ci],y+22).strokeColor(LINE).lineWidth(0.5).stroke();});
    const vs=[String(it.itemNo),it.itemName,it.supplier||'-',String(it.qty),it.unit,fmtRp(it.unitPrice),fmtRp(it.totalPrice)];
    vs.forEach((v,ci)=>doc.font(ci===0?'Helvetica-Bold':'Helvetica').fontSize(8).fillColor(DARK).text(v,CX[ci]+3,y+7,{width:COLS[ci]-6,align:ci>=3?'center':'left',lineBreak:false}));
    y+=22;
  });
  y+=8;

  // Selisih Summary Box
  const SW=260,SX=ML+PW-SW;
  if(y+90>PBB){doc.addPage();y=50;}
  const summaryRows=[
    ['Total Belanja Keseluruhan',fmtRp(row.totalAmount),false],
    [`Referensi PO (${row.refPoNumber||'-'})`,fmtRp(row.refPoAmount),false],
    ['SELISIH',fmtRp(Math.abs(row.selisihAmount)),true],
  ];
  summaryRows.forEach(([k,v,bold],idx)=>{
    if(bold){ doc.rect(SX,y,SW,28).fill(AMBER); doc.font('Helvetica-Bold').fontSize(11).fillColor('white').text(k,SX+8,y+7,{width:SW/2-8,lineBreak:false}); doc.font('Helvetica-Bold').fontSize(11).fillColor('white').text(v,SX+SW/2,y+7,{width:SW/2-8,align:'right',lineBreak:false}); y+=28; }
    else { doc.rect(SX,y,SW,20).fill(idx%2===0?AMBERLIGHT:'#ffffff'); doc.font('Helvetica').fontSize(8.5).fillColor(GRAY).text(k,SX+8,y+5,{width:SW/2-8,lineBreak:false}); doc.font('Helvetica').fontSize(8.5).fillColor(DARK).text(v,SX+SW/2,y+5,{width:SW/2-8,align:'right',lineBreak:false}); y+=20; }
  });
  y+=14;

  // Signatures (2-col)
  if(y+100>PBB){doc.addPage();y=50;}
  doc.moveTo(ML,y).lineTo(ML+PW,y).strokeColor(LINE).lineWidth(1).stroke(); y+=12;
  const SIG2W=Math.floor((PW-10)/2),SIG2H=90;
  [{label:'Diajukan oleh,',name:sigDiajukan},{label:'Mengetahui,',name:sigMengetahui}].forEach((s,i)=>{
    const sx=ML+i*(SIG2W+10);
    doc.roundedRect(sx,y,SIG2W,SIG2H,6).fill(AMBERLIGHT);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(AMBER).text(s.label,sx,y+10,{width:SIG2W,align:'center',lineBreak:false});
    const ly=y+SIG2H-28;
    doc.moveTo(sx+14,ly).lineTo(sx+SIG2W-14,ly).strokeColor('#fcd34d').lineWidth(0.5).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK).text(s.name,sx,ly+5,{width:SIG2W,align:'center',lineBreak:false});
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
const uploadSelisihPOAttachments = async (req,res) => {
  const po = await prisma.selisihPO.findUnique({where:{id:req.params.id}});
  if (!po) return errorResponse(res,'PO tidak ditemukan',404);
  if (!req.files||!req.files.length) return errorResponse(res,'Tidak ada file',400);
  const created = await Promise.all(req.files.map(file =>
    prisma.selisihPOAttachment.create({data:{filename:file.filename,originalName:file.originalname,mimeType:file.mimetype,size:file.size,url:buildAttachUrl(file),poId:req.params.id}})
  ));
  return successResponse(res,created,'Lampiran berhasil diupload',201);
};
const deleteSelisihPOAttachment = async (req,res) => {
  const att = await prisma.selisihPOAttachment.findFirst({where:{id:req.params.attachId,poId:req.params.id}});
  if (!att) return errorResponse(res,'Lampiran tidak ditemukan',404);
  const fp = att.url.replace(/^https?:\/\/[^/]+/,'').replace(/\//,process.cwd()+'/').replace(/\//g,require('path').sep);
  try { if (require('fs').existsSync(fp)) require('fs').unlinkSync(fp); } catch(_){}
  await prisma.selisihPOAttachment.delete({where:{id:req.params.attachId}});
  return successResponse(res,null,'Lampiran dihapus');
};

module.exports = { getSelisihPOs, getSelisihPOById, createSelisihPO, updateSelisihPO, deleteSelisihPO, generateSelisihPOPDF, uploadSelisihPOAttachments, deleteSelisihPOAttachment };
