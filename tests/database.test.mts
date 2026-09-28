import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`create schema auth; create schema storage; create role anon; create role authenticated;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
create publication supabase_realtime;
alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
alter default privileges in schema public grant usage,select on sequences to authenticated;
grant usage on schema public,auth,storage to authenticated;`);
for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) {
  const sql=(await readFile('supabase/migrations/'+file,'utf8')).replace('create extension if not exists "pgcrypto";','-- gen_random_uuid is built in; pgcrypto is supplied by Supabase');
  try { await db.exec(sql); console.log('Migration OK:',file); } catch(e:any) { console.error('Migration failed:',file,e.message);process.exit(1); }
}
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const admin=uuid(1), manager=uuid(2), branch=uuid(101), other=uuid(102), emp=uuid(201), tpl=uuid(301), item1=uuid(401),item2=uuid(402),form=uuid(501),section=uuid(601),question=uuid(701);
await db.exec(`insert into auth.users(id) values ('${admin}');insert into profiles(id,username,full_name,role) values('${admin}','owner','المدير العام','super_admin');`);
for(let i=0;i<9;i++) await db.exec(`insert into branches(id,code,name) values('${uuid(101+i)}','BR-${i+1}','فرع ${i+1}');insert into auth.users(id) values('${uuid(2+i)}');insert into profiles(id,username,full_name,role,branch_id) values('${uuid(2+i)}','manager${i+1}','مدير ${i+1}','branch_manager','${uuid(101+i)}');`);
await db.exec(`insert into employees(id,branch_id,full_name) values('${emp}','${branch}','موظف');
insert into checklist_templates(id,name) values('${tpl}','روتين');insert into checklist_items(id,template_id,section,label) values('${item1}','${tpl}','عام','نظافة'),('${item2}','${tpl}','عام','فتح');
insert into quality_forms(id,name) values('${form}','الجودة');insert into quality_sections(id,form_id,title) values('${section}','${form}','قسم');insert into quality_questions(id,section_id,text,max_score) values('${question}','${section}','سؤال',5);`);
async function as(id:string){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`);}
await as(manager);
assert.equal((await db.query('select * from branches')).rows.length,1);
await assert.rejects(db.exec(`update profiles set branch_id='${other}' where id='${manager}'`));
await assert.rejects(db.exec(`select submit_daily_checklist('${tpl}','${other}','', '[{"item_id":"${item1}","is_done":true},{"item_id":"${item2}","is_done":true}]')`));
await assert.rejects(db.exec(`select submit_daily_checklist('${tpl}','${branch}','', '[{"item_id":"${item1}","is_done":true}]')`));
assert.equal((await db.query('select * from daily_reports')).rows.length,0);
await db.exec(`select record_attendance('${emp}','present','08:00');select submit_daily_checklist('${tpl}','${branch}','تم','[{"item_id":"${item1}","is_done":true},{"item_id":"${item2}","is_done":false}]');
select submit_quality_assessment('${form}','${branch}','', '[{"question_id":"${question}","score":4}]');`);
const quality=await db.query<{percentage:string}>('select percentage from quality_submissions');assert.equal(Number(quality.rows[0].percentage),80);
assert.equal((await db.query('select * from branch_daily_metrics()')).rows.length,1);
await assert.rejects(db.exec(`select admin_save_daily_report('${tpl}','${branch}',current_date,'','[]','محاولة')`));
await assert.rejects(db.exec(`select record_attendance('${emp}','present','08:00',null,null,(now() at time zone 'Africa/Cairo')::date-1)`));
await as(admin);
await db.exec(`select record_attendance('${emp}','present','08:00',null,'تصحيح',(now() at time zone 'Africa/Cairo')::date-1)`);
assert.equal((await db.query('select * from attendance')).rows.length,2);
const metrics=await db.query<any>('select * from branch_daily_metrics()');assert.equal(metrics.rows.length,9);assert.equal(Number(metrics.rows[0].done_items),1);
await db.exec(`select admin_save_daily_report('${tpl}','${branch}',(now() at time zone 'Africa/Cairo')::date,'تصحيح','[{"item_id":"${item1}","is_done":true},{"item_id":"${item2}","is_done":true}]','مراجعة المدير');`);
const reports=await db.query<any>('select * from daily_reports');assert.equal(reports.rows[0].submitted_by,manager);assert.equal(reports.rows[0].updated_by,admin);
assert.equal(Number((await db.query<any>('select * from branch_daily_metrics()')).rows[0].done_items),2);
assert.ok((await db.query("select * from activity_log where entity='daily_reports' and action='UPDATE'")).rows.length>0);
await db.exec(`update profiles set is_active=false where id='${manager}'`);await as(manager);assert.equal((await db.query('select * from branches')).rows.length,0);
console.log('PASS: 9 managers + owner, branch isolation, atomic reports, quality score, admin corrections/audit, disabled access');
await db.close();
