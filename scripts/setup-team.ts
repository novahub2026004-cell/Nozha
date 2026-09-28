// Fresh installation only. Generates nine distinct passwords locally.
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { toEmail, toPassword } from '../lib/auth';
async function main() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const username=process.env.INITIAL_ADMIN_USERNAME,password=process.env.INITIAL_ADMIN_PASSWORD,name=process.env.INITIAL_ADMIN_NAME;
 if(!url||!key||!username||!password||password.length<12||!name)throw new Error('Complete .env.local with Supabase and INITIAL_ADMIN_* values.');
 const branches=JSON.parse(await readFile(process.env.TEAM_CONFIG_PATH||'config/branches.example.json','utf8')) as {code:string;name:string;manager:string;username:string}[];
 if(branches.length!==9||new Set(branches.map(b=>b.username)).size!==9||branches.some(b=>!b.code||!b.name||!b.manager||!/^[a-z0-9_]{3,32}$/.test(b.username))||!/^[a-z0-9_]{3,32}$/.test(username)||branches.some(b=>b.username===username))throw new Error('Expected exactly nine branches with unique manager usernames.');
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:existing,error}=await sb.from('profiles').select('id').limit(1);if(error)throw error;
 if(existing?.length)throw new Error('Accounts already exist. Use the app to manage them; setup:team only runs on a fresh database.');
 const credentials:{name:string;username:string;password:string;branch?:string}[]=[];
 async function create(u:string,n:string,p:string,role:string,b?:string){
  const {data,error}=await sb.auth.admin.createUser({email:toEmail(u),password:toPassword(p),email_confirm:true});if(error||!data.user)throw error;
  const {error:e}=await sb.from('profiles').insert({id:data.user.id,username:u,full_name:n,role,branch_id:b});if(e){await sb.auth.admin.deleteUser(data.user.id);throw e;}
  credentials.push({name:n,username:u,password:p,branch:b});
  await writeFile('team-credentials.private.json',JSON.stringify(credentials,null,2),{mode:0o600});
 }
 await create(username,name,password,'super_admin');
 for(const b of branches){
  const {data,error}=await sb.from('branches').insert({code:b.code,name:b.name}).select('id').single();if(error)throw error;
  await create(b.username,b.manager,randomBytes(12).toString('base64url'),'branch_manager',data.id);
  const {error:e}=await sb.rpc('sync_branch_room',{b:data.id});if(e)throw e;
 }
 const {data:tpl,error:tplError}=await sb.from('checklist_templates').insert({name:'قائمة تشغيل يومية — قابلة للتعديل'}).select('id').single();if(tplError)throw tplError;
 const {error:itemsError}=await sb.from('checklist_items').insert(['تجهيز الفرع وفتح الوردية','تسجيل حضور الموظفين','مراجعة النظافة والتجهيزات','مراجعة البلاغات وإقفال الوردية'].map((label,i)=>({template_id:tpl.id,section:'التشغيل اليومي',label,sort_order:i})));if(itemsError)throw itemsError;
 const {data:form,error:formError}=await sb.from('quality_forms').insert({name:'جودة التشغيل — قابل للتعديل'}).select('id').single();if(formError)throw formError;
 const {data:section,error:sectionError}=await sb.from('quality_sections').insert({form_id:form.id,title:'التقييم العام'}).select('id').single();if(sectionError)throw sectionError;
 const {error:questionsError}=await sb.from('quality_questions').insert(['النظافة والتنظيم','الالتزام بإجراءات التشغيل','جودة خدمة العملاء'].map((text,i)=>({section_id:section.id,text,max_score:5,sort_order:i})));if(questionsError)throw questionsError;
 console.log('Created 1 general manager and 9 branch managers. Credentials are in team-credentials.private.json. Keep this file private.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
