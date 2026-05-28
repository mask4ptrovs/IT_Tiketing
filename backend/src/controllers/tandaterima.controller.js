const path = require('path');
const fs   = require('fs');
const PDFDocument = require('pdfkit');
const { prisma } = require('../config/database');
const { successResponse, errorResponse, paginatedResponse, getPagination, getPaginationMeta } = require('../utils/response');
const { drawKopSurat, drawDocTitle } = require('../utils/pdfHelper');

const BULAN=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const fmtDate=(d)=>{const dt=new Date(d);return `${dt.getDate()} ${BULAN[dt.getMonth()]} ${dt.getFullYear()}`;};

const generateTTNumber = async () => {
  const now=new Date();
  const ROMAWI=['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  const prefix=`TT/${ROMAWI[now.getMonth()+1]}/${now.getFullYear()}/`;
  const last=await prisma.tandaTerima.findFirst({where:{ttNumber:{startsWith:prefix}},orderBy:{ttNumber:'desc'},select:{ttNumber:true}});
  const seq=last?parseInt(last.ttNumber.split('/').pop(),10)+1:1;
  return `${prefix}${String(seq).padStart(3,'0')}`;
};

const INCLUDE={
  createdBy:   { select:{id:true,name:true,email:true} },
  branch:      { select:{id:true,name:true,code:true,city:true,address:true,phone:true,email:true} },
  items:       { orderBy:{itemNo:'asc'} },
  attachments: { orderBy:{createdAt:'asc'} },
};

const getTandaTerimas = async (req,res) => {
  const {page,limit,skip}=getPagination(req.query.page,req.query.limit);
  const {branchId,search}=req.query;
  const where={};
  if (req.user.role==='USER') where.createdById=req.user.id;
  else if (req.user.role==='IT_STAFF'&&req.user.branchId) where.branchId=req.user.branchId;
  else if (req.user.role==='ADMIN'&&branchId) where.branchId=branchId;
  if (search) where.OR=[{ttNumber:{contains:search,mode:'insensitive'}},{receivedFrom:{contains:search,mode:'insensitive'}},{addressedTo:{contains:search,mode:'insensitive'}}];
  const [rows,total]=await Promise.all([
    prisma.tandaTerima.findMany({where,include:INCLUDE,orderBy:{createdAt:'desc'},skip,take:limit}),
    prisma.tandaTerima.count({where}),
  ]);
  return paginatedResponse(res,rows,getPaginationMeta(total,page,limit));
};

const getTandaTerimaById = async (req,res) => {
  const row=await prisma.tandaTerima.findUnique({where:{id:req.params.id},include:INCLUDE});
  if (!row) return errorResponse(res,'Tanda Terima tidak ditemukan',404);
  return successResponse(res,row);
};

const createTandaTerima = async (req,res) => {
  const {receivedFrom,addressedTo,ccTo,receivedBy,notes,branchId,items=[]}=req.body;
  if (!receivedFrom||!addressedTo||!receivedBy) return errorResponse(res,'Diterima dari, ditujukan kepada, dan penerima wajib diisi',400);
  if (!items.length) return errorResponse(res,'Minimal satu item berupa harus diisi',400);
  const ttNumber=await generateTTNumber();
  const effectiveBranchId=branchId||(req.user.role!=='ADMIN'?req.user.branchId:null)||null;
  const row=await prisma.tandaTerima.create({
    data:{ttNumber,receivedFrom,addressedTo,ccTo:ccTo||null,receivedBy,notes:notes||null,
          branchId:effectiveBranchId,createdById:req.user.id,
          items:{create:items.map((it,idx)=>({
            itemNo:idx+1,description:it.description,
            itemDate:it.itemDate?new Date(it.itemDate):null,
          }))}},
    include:INCLUDE});
  return successResponse(res,row,'Tanda Terima berhasil dibuat',201);
};

const updateTandaTerima = async (req,res) => {
  const {id}=req.params;
  if (!await prisma.tandaTerima.findUnique({where:{id}})) return errorResponse(res,'Tanda Terima tidak ditemukan',404);
  const {receivedFrom,addressedTo,ccTo,receivedBy,notes,branchId,items}=req.body;
  const data={};
  if(receivedFrom!==undefined) data.receivedFrom=receivedFrom;
  if(addressedTo!==undefined)  data.addressedTo=addressedTo;
  if(ccTo!==undefined)         data.ccTo=ccTo||null;
  if(receivedBy!==undefined)   data.receivedBy=receivedBy;
  if(notes!==undefined)        data.notes=notes||null;
  if(branchId!==undefined&&req.user.role==='ADMIN') data.branchId=branchId||null;
  if(items&&Array.isArray(items)){
    await prisma.tandaTerimaItem.deleteMany({where:{ttId:id}});
    data.items={create:items.map((it,idx)=>({
      itemNo:idx+1,description:it.description,
      itemDate:it.itemDate?new Date(it.itemDate):null,
    }))};
  }
  const updated=await prisma.tandaTerima.update({where:{id},data,include:INCLUDE});
  return successResponse(res,updated,'Tanda Terima berhasil diperbarui');
};

const deleteTandaTerima = async (req,res) => {
  const {id}=req.params;
  if (!await prisma.tandaTerima.findUnique({where:{id}})) return errorResponse(res,'Tanda Terima tidak ditemukan',404);
  await prisma.tandaTerima.delete({where:{id}});
  return successResponse(res,null,'Tanda Terima berhasil dihapus');
};

const urlToFilePath=(url)=>{try{const p=new URL(url).pathname;return path.join(process.cwd(),p);}catch{return null;}};

const generateTandaTerimaPDF = async (req,res) => {
  const row=await prisma.tandaTerima.findUnique({where:{id:req.params.id},include:INCLUDE});
  if (!row) return errorResponse(res,'Tanda Terima tidak ditemukan',404);
  const settings=await prisma.companySetting.upsert({where:{id:'singleton'},create:{},update:{}});
  const BURL=process.env.BACKEND_URL||`http://localhost:${process.env.PORT||5000}`;

  const doc=new PDFDocument({size:'A4',margin:50,bufferPages:true});
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="TT-${row.ttNumber.replace(/\//g,'-')}.pdf"`);
  doc.pipe(res);

  const ML=50,PW=doc.page.width-100,DARK='#0f172a',GRAY='#475569',PURPLE='#7c3aed',PURPLELIGHT='#f5f3ff',LINE='#e2e8f0';

  // ── Kop Surat — gunakan data cabang jika tersedia ───────────────────────────
  const effectiveSettings = {
    companyName:    row.branch?.name    || settings.companyName,
    companyAddress: row.branch?.address || settings.companyAddress,
    companyCity:    row.branch?.city    || settings.companyCity,
    companyPhone:   row.branch?.phone   || settings.companyPhone,
    companyEmail:   row.branch?.email   || settings.companyEmail,
    companyLogo:    settings.companyLogo,
  };
  let y = await drawKopSurat(doc, effectiveSettings, BURL, ML);
  y = drawDocTitle(doc, 'TANDA TERIMA', y, ML);

  // Info rows
  const KW=130, COLON2=8, VW2=PW-KW-COLON2, LH2=16;
  const infoRows=[
    ['No. Tanda Terima', row.ttNumber],
    ['Tanggal',          fmtDate(row.ttDate)],
    ['Diterima Dari',    row.receivedFrom],
    ['Ditujukan Kepada', row.addressedTo],
    ['Tembusan',         row.ccTo||'-'],
    ['Diterima Oleh',    row.receivedBy||'-'],
  ];
  infoRows.forEach(([k,v])=>{
    doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK).text(k,ML,y,{width:KW,lineBreak:false});
    doc.font('Helvetica').fontSize(9).fillColor(DARK).text(':',ML+KW,y,{width:COLON2,lineBreak:false});
    doc.font('Helvetica').fontSize(9).fillColor(DARK).text(v,ML+KW+COLON2,y,{width:VW2});
    y+=LH2;
  });
  y+=8;
  doc.moveTo(ML,y).lineTo(ML+PW,y).strokeColor('#cccccc').lineWidth(0.5).stroke(); y+=10;

  // Items (Berupa)
  doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text('BERUPA :',ML,y); y+=14;
  const PBB=doc.page.height-doc.page.margins.bottom-60;
  row.items.forEach((it,idx)=>{
    if(y+26>PBB){doc.addPage();y=50;}
    doc.roundedRect(ML,y,PW,26,4).fill(idx%2===0?PURPLELIGHT:'#ffffff');
    doc.moveTo(ML,y).lineTo(ML+PW,y).strokeColor(LINE).lineWidth(0.5).stroke();
    // Number bullet
    doc.roundedRect(ML+8,y+5,20,16,3).fill(PURPLE);
    doc.font('Helvetica-Bold').fontSize(8).fillColor('white').text(String(it.itemNo),ML+8,y+9,{width:20,align:'center',lineBreak:false});
    // Description
    doc.font('Helvetica').fontSize(9).fillColor(DARK).text(it.description,ML+36,y+8,{width:PW-100,lineBreak:false});
    // Date
    if(it.itemDate) doc.font('Helvetica').fontSize(8).fillColor(GRAY).text(`(${fmtDate(it.itemDate)})`,ML+PW-90,y+9,{width:82,align:'right',lineBreak:false});
    y+=26;
  });
  // Bottom border of last item
  doc.moveTo(ML,y).lineTo(ML+PW,y).strokeColor(LINE).lineWidth(0.5).stroke();
  y+=16;

  if(row.notes){
    doc.roundedRect(ML,y,PW,24,4).fill('#f0f9ff');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#0369a1').text('Catatan: ',ML+8,y+8,{continued:true});
    doc.font('Helvetica').fontSize(8).fillColor(DARK).text(row.notes,{width:PW-60,lineBreak:false});
    y+=32;
  }
  y+=10;

  // Signature + Date
  if(y+100>PBB){doc.addPage();y=50;}
  const cityLine=(row.branch?.city||settings.companyCity||'').toUpperCase();
  doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(`${cityLine?cityLine+', ':''}${fmtDate(row.ttDate)}`,ML,y,{width:PW,align:'right',lineBreak:false});
  y+=18;
  doc.moveTo(ML,y).lineTo(ML+PW,y).strokeColor(LINE).lineWidth(0.8).stroke(); y+=12;
  const SIG_W=Math.floor((PW-10)/2),SIG_H=90;
  [{label:'Yang Menyerahkan,',name:row.receivedFrom},{label:'Yang Menerima,',name:row.receivedBy}].forEach((s,i)=>{
    const sx=ML+i*(SIG_W+10);
    doc.roundedRect(sx,y,SIG_W,SIG_H,6).fill(PURPLELIGHT);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(PURPLE).text(s.label,sx,y+10,{width:SIG_W,align:'center',lineBreak:false});
    const ly=y+SIG_H-28;
    doc.moveTo(sx+14,ly).lineTo(sx+SIG_W-14,ly).strokeColor('#c4b5fd').lineWidth(0.5).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK).text(s.name,sx,ly+5,{width:SIG_W,align:'center',lineBreak:false});
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
    doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(`${row.ttNumber}  ·  Lampiran ${idx+1} / ${imgAtts.length}`,ML,34,{width:PGW-ML*2,align:'right',lineBreak:false});
    const imgY=62, maxImgH=PGH-imgY-70;
    try{doc.image(imgPath,ML,imgY,{fit:[PGW-ML*2,maxImgH],align:'center',valign:'center'});}catch(_){}
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(att.originalName,ML,PGH-62,{width:PGW-ML*2,align:'center',lineBreak:false});
  });

  const total=doc.bufferedPageRange().count;
  for(let p=0;p<total;p++){
    doc.switchToPage(p);
    const MB=doc.page.margins.bottom,fY=doc.page.height-MB-12;
    doc.moveTo(ML,fY-6).lineTo(ML+PW,fY-6).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY).text(`${effectiveSettings.companyName||'IT Support'}  ·  ${row.ttNumber}`,ML,fY,{width:PW/2,lineBreak:false});
    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY).text(`Hal. ${p+1} / ${total}`,ML+PW/2,fY,{width:PW/2,align:'right',lineBreak:false});
  }
  doc.switchToPage(total-1); doc.y=doc.page.margins.top||50; doc.end();
};


const buildAttachUrl = (file) => {
  const rel = file.path.replace(process.cwd(),'').replace(/\\/g,'/');
  return `${process.env.BACKEND_URL||`http://localhost:${process.env.PORT||5000}`}${rel}`;
};
const uploadTandaTerimaAttachments = async (req,res) => {
  const tt = await prisma.tandaTerima.findUnique({where:{id:req.params.id}});
  if (!tt) return errorResponse(res,'Tanda Terima tidak ditemukan',404);
  if (!req.files||!req.files.length) return errorResponse(res,'Tidak ada file',400);
  const created = await Promise.all(req.files.map(file =>
    prisma.tandaTerimaAttachment.create({data:{filename:file.filename,originalName:file.originalname,mimeType:file.mimetype,size:file.size,url:buildAttachUrl(file),ttId:req.params.id}})
  ));
  return successResponse(res,created,'Lampiran berhasil diupload',201);
};
const deleteTandaTerimaAttachment = async (req,res) => {
  const att = await prisma.tandaTerimaAttachment.findFirst({where:{id:req.params.attachId,ttId:req.params.id}});
  if (!att) return errorResponse(res,'Lampiran tidak ditemukan',404);
  const fp = att.url.replace(/^https?:\/\/[^/]+/,'').replace(/\//,process.cwd()+'/').replace(/\//g,require('path').sep);
  try { if (require('fs').existsSync(fp)) require('fs').unlinkSync(fp); } catch(_){}
  await prisma.tandaTerimaAttachment.delete({where:{id:req.params.attachId}});
  return successResponse(res,null,'Lampiran dihapus');
};

module.exports = { getTandaTerimas, getTandaTerimaById, createTandaTerima, updateTandaTerima, deleteTandaTerima, generateTandaTerimaPDF, uploadTandaTerimaAttachments, deleteTandaTerimaAttachment };
