import rpm,stat,json,hashlib,subprocess,os
from pathlib import Path
D=Path('/root/onedrs-pr54-runtime-package-20261113');E=D/'evidence'
old=Path('/root/onedrs-rpm-build-final-e39bf32-r8/rpmbuild/RPMS/x86_64/opennebula-7.4.1-8.ls.onedrs.e39bf32.el9.x86_64.rpm')
new=D/'rpmbuild/RPMS/x86_64/opennebula-7.4.1-9.ls.onedrs.pr54.3165fdb.el9.x86_64.rpm'
def header(p):
 with p.open('rb') as f:return rpm.TransactionSet().hdrFromFdno(f.fileno())
a,b=header(old),header(new)
def files(h):
 keys=['filenames','fileflags','filemodes','fileusername','filegroupname','fileverifyflags','filedigests','filelinktos']
 return {r[0]:dict(zip(keys[1:],r[1:])) for r in zip(*(h[k] for k in keys))}
af,bf=files(a),files(b)
added=sorted(set(bf)-set(af));removed=sorted(set(af)-set(bf));changed={}
for p in sorted(set(af)&set(bf)):
 diff={k:{'old':af[p][k],'new':bf[p][k]} for k in af[p] if af[p][k]!=bf[p][k]}
 if diff:changed[p]=diff
assert set(changed)<=set(['/usr/bin/oned']),changed
assert set(changed['/usr/bin/oned'])=={'filedigests'},changed
assert all(p.startswith('/usr/lib/.build-id/') for p in added+removed)
assert bf['/usr/bin/oned']['filedigests']=='782a3969593114d966f82f7946b36c076af8f67392f7b49313a68d87f3e8a7fb'
scriptkeys=['prein','postin','preun','postun','posttrans','pretrans','preinprog','postinprog','preunprog','postunprog','posttransprog','triggerscripts','triggername','triggerflags','triggerversion','triggerindex','triggerscriptprog','filetriggerscripts','transfiletriggerscripts']
scripts={k:a[k]==b[k] for k in scriptkeys};assert all(scripts.values()),scripts
# Automatic provenance bits differ under explicit dependency reconstruction;
# retain version/operator and lifecycle/interpreter dependency semantics.
def deps(h,prefix):
 rows=[]
 for n,f,v in zip(h[prefix+'name'],h[prefix+'flags'],h[prefix+'version']):
  if n.startswith('rpmlib('):continue
  if n in ['config(opennebula)','opennebula','opennebula(x86-64)']:v=v.replace(h['release'],'<self-release>')
  flags=f & ~(rpm.RPMSENSE_FIND_REQUIRES|rpm.RPMSENSE_FIND_PROVIDES)
  if n=="config(opennebula)":flags &= ~rpm.RPMSENSE_CONFIG
  rows.append((n,flags,v))
 return sorted(rows)
depchecks={}
for kind in ['require','provide','obsolete','conflict']:
 x,y=deps(a,kind),deps(b,kind);depchecks[kind]={'equal':x==y,'removed':sorted(set(x)-set(y)),'added':sorted(set(y)-set(x))}
assert all(x['equal'] for x in depchecks.values()),depchecks
for key in ['name','version','arch','os','license']:assert a[key]==b[key]
assert rpm.labelCompare(('0',b['version'],b['release']),('0',a['version'],a['release']))>0
check=subprocess.run(['rpm','--checksig','--verbose',str(new)],capture_output=True,text=True,timeout=20,check=True)
(E/'rpm-digests.log').write_text(check.stdout+check.stderr)
# Extract to a NEW verification location, unrelated to the pending service prefix.
extract=D/'rpm-extraction-verification';assert not extract.exists();extract.mkdir(mode=0o700)
p1=subprocess.Popen(['rpm2cpio',str(new)],stdout=subprocess.PIPE)
p2=subprocess.run(['cpio','-idm','--quiet','--no-absolute-filenames'],cwd=extract,stdin=p1.stdout,capture_output=True,timeout=30)
p1.stdout.close();assert p1.wait()==0 and p2.returncode==0
embedded=hashlib.sha256((extract/'usr/bin/oned').read_bytes()).hexdigest();assert embedded==bf['/usr/bin/oned']['filedigests']
r={'result':'PASS_PACKAGE_METADATA_AND_PAYLOAD','original_rpm':str(old),'candidate_rpm':str(new),'candidate_rpm_sha256':hashlib.sha256(new.read_bytes()).hexdigest(),'candidate_NEVRA':f"{b['name']}-{b['version']}-{b['release']}.{b['arch']}",'original_file_count':len(af),'candidate_file_count':len(bf),'changed_shared_paths':changed,'added_build_id_artifacts':added,'removed_build_id_artifacts':removed,'all_original_lifecycle_scripts_and_triggers_identical':scripts,'dependency_semantics':depchecks,'explicit_config_dependency_provenance_note':'Original automatically-generated RPMSENSE_CONFIG marker is not set on explicit version-matched candidate config() requirement/provide. Name/operator/version and file config flags are retained.','configuration_flags_ownership_permissions_preserved':True,'embedded_tested_core_sha256':embedded,'upgrade_release_order_correct':True,'rpm_digest_verification_pass':True,'signature':'UNSIGNED_AT_THIS_STAGE','live_install':False}
(E/'rpm-validation.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps(r,indent=2))
