"""Create a narrowly changed LAB candidate from the original package manifest.
Does not install, start, restart or modify a live service. Does not touch the
separately pending runtime-prefix correction.
"""
import rpm,stat,json,hashlib,subprocess,shutil,os,re
from pathlib import Path
D=Path('/root/onedrs-pr54-security-integrated-r10-20261113');T=D/'rpmbuild';B=D/'package-payload';E=D/'evidence'
assert not T.exists() and not B.exists(),'refuse existing package staging'
P=Path('/root/onedrs-rpm-build-final-e39bf32-r8/rpmbuild/RPMS/x86_64/opennebula-7.4.1-8.ls.onedrs.e39bf32.el9.x86_64.rpm')
with P.open('rb') as f:h=rpm.TransactionSet().hdrFromFdno(f.fileno())
assert (h['name'],h['version'],h['release'])==('opennebula','7.4.1','8.ls.onedrs.e39bf32.el9')
for n in ['BUILD','BUILDROOT','RPMS','SOURCES','SPECS','SRPMS']:(T/n).mkdir(mode=0o700,parents=True,exist_ok=True)
shutil.copytree(D/'payload',B,symlinks=True)
source=Path('/root/onedrs-pr54-package-retest-20261113/build/src/nebula/oned');expected='782a3969593114d966f82f7946b36c076af8f67392f7b49313a68d87f3e8a7fb'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(source)==expected
shutil.copy2(source,B/'usr/bin/oned')
security_driver=Path('/root/onedrs-native-host-context-20261113/src/vmm_mad/remotes/kvm/deploy')
assert sha(security_driver)=='3cc0513112d22968859fb822fc4605347c8067fc7a5b169933775ae340584e9b'
shutil.copyfile(security_driver,B/'var/lib/one/remotes/vmm/kvm/deploy')

# Preserve the exact tested binary bytes, including its debug sections.
# RPM postprocessing is disabled below to prevent stripping/mangling that identity.
def buildid(p):
 text=subprocess.check_output(['readelf','-n',str(p)],text=True)
 return re.search(r'Build ID: ([0-9a-f]+)',text).group(1)
oldid=buildid(D/'payload/usr/bin/oned');newid=buildid(B/'usr/bin/oned')
oldlink='/usr/lib/.build-id/'+oldid[:2]+'/'+oldid[2:]
newlink='/usr/lib/.build-id/'+newid[:2]+'/'+newid[2:]
assert oldlink in h['filenames'];oldpath=B/oldlink.lstrip('/');target=os.readlink(oldpath)
assert target.endswith('/usr/bin/oned') or target.endswith('/bin/oned'),target
oldpath.unlink();newpath=B/newlink.lstrip('/');newpath.parent.mkdir(exist_ok=True);os.symlink(target,newpath)
oldparent=oldpath.parent;oldparent_removed=False
if not any(oldparent.iterdir()):oldparent.rmdir();oldparent_removed=True
release='10.ls.onedrs.pr54.07c9128.el9'
escape=lambda s:s.replace('%','%%')
lines=['%global debug_package %{nil}','%global _build_id_links none','%global __os_install_post %{nil}','%global _binary_payload w3.zstdio','Name: opennebula','Version: 7.4.1','Release: '+release,'Summary: Server and Scheduler - LayerSentry PR54 LAB CANDIDATE','License: '+h['license'],'Group: '+h['group'],'URL: '+h['url'],'Packager: LayerSentry LAB Qualification - NOT PRODUCTION APPROVED','BuildArch: x86_64','AutoReqProv: no','Requires: config(opennebula) = %{version}-%{release}','Provides: config(opennebula) = %{version}-%{release}']
def expr(n,fl,v):
 op={0:'',2:'<',4:'>',8:'=',10:'<=',12:'>=',6:'<>'}.get(fl&14)
 assert op is not None
 return n+(' '+op+' '+v if op else '')
for n,fl,v in zip(h['requirename'],h['requireflags'],h['requireversion']):
 if n.startswith('rpmlib(') or n=='config(opennebula)' or (n=='/bin/sh' and fl&0x100):continue
 lines.append('Requires: '+escape(expr(n,fl,v)))
for n,fl,v in zip(h['providename'],h['provideflags'],h['provideversion']):
 if n in ['config(opennebula)','opennebula','opennebula(x86-64)']:continue
 lines.append('Provides: '+escape(expr(n,fl,v)))
for tag,title in [('obsolete','Obsoletes'),('conflict','Conflicts')]:
 for n,fl,v in zip(h[tag+'name'],h[tag+'flags'],h[tag+'version']):lines.append(title+': '+escape(expr(n,fl,v)))
lines+=['','%description',escape(h['description']),'','LAB CANDIDATE ONLY: original 7.4.1 r8 payload with PR54 native core correction.','Not production-approved; runtime/canary acceptance remains mandatory.','','%prep','','%build','','%install','mkdir -p %{buildroot}','cp -a '+str(B)+'/. %{buildroot}/','','%files']
file_manifest=[]
for n,fl,mode,user,group,verify in zip(h['filenames'],h['fileflags'],h['filemodes'],h['fileusername'],h['filegroupname'],h['fileverifyflags']):
 if n==oldlink:n=newlink
 if n==str(oldparent.relative_to(B)).join(['/','']) and oldparent_removed:continue
 if n=='/'+str(oldparent.relative_to(B)) and oldparent_removed:continue
 assert fl in [0,1,2,16,17,64,4096],(n,fl)
 directives=[]
 if stat.S_ISDIR(mode):directives.append('%dir')
 if fl&1 or fl==16:directives.append('%config(noreplace)' if fl&16 else '%config')
 if fl&2:directives.append('%doc')
 if fl&64:directives.append('%ghost')
 if fl&4096:directives.append('%artifact')
 if verify!=0xffffffff:
  assert verify==4294967256 and fl==64,(n,verify)
  directives.append('%verify(not md5 size mtime)')
 directives.append('%%attr(%04o,%s,%s)'%(stat.S_IMODE(mode),user,group))
 directives.append('"'+escape(n)+'"');lines.append(' '.join(directives))
 file_manifest.append({'path':n,'original_flags':fl,'mode':mode,'user':user,'group':group})
newdir='/'+str(newpath.parent.relative_to(B))
if newdir not in [r['path'] for r in file_manifest]:lines.append('%dir %artifact %attr(0755,root,root) "'+newdir+'"')
for tag,section in [('prein','pre'),('postin','post'),('preun','preun'),('postun','postun'),('posttrans','posttrans')]:
 body=h[tag]
 if body:
  assert h[tag+'prog']==['/bin/sh']
  lines+=['','%'+section+' -p /bin/sh',escape(body)]
assert len(h['triggerscripts'])==1 and h['triggername']==['opennebula-server'] and h['triggerflags']==[262144]
lines+=['','%triggerpostun -p /bin/sh -- opennebula-server',escape(h['triggerscripts'][0]),'','%changelog','* Fri Nov 13 2026 LayerSentry Lab Qualification <lab-noreply@invalid.test> - 7.4.1-'+release,'- LAB candidate: preserve original manifest/config/scriptlets and replace only native core for PR54.']
spec=T/'SPECS/opennebula-pr54-lab.spec';spec.write_text('\n'.join(lines)+'\n')
(E/'rpm-build-input.json').write_text(json.dumps({'original_rpm_sha256':sha(P),'original_rpm':str(P),'candidate_binary_sha256':sha(B/'usr/bin/oned'),'core_old_build_id':oldid,'core_new_build_id':newid,'changed_binary':'/usr/bin/oned','retained_DR1_security_preboot_driver_sha256':'3cc0513112d22968859fb822fc4605347c8067fc7a5b169933775ae340584e9b','security_driver_source_commit':'07c9128a55fea8c74aada3cf3d6e301ba59a840c','old_debug_link':oldlink,'new_debug_link':newlink,'release':release,'original_scriptlets_retained':True,'original_package_payload_derived':True,'not_a_clean_source_rebuild':True,'live_install':False},indent=2)+'\n')
print('BUILD_SPEC_READY',spec,'FILES',len(file_manifest),flush=True)
with (E/'rpmbuild.log').open('w') as log:
 p=subprocess.run(['rpmbuild','-bb','--define','_topdir '+str(T),str(spec)],stdout=log,stderr=subprocess.STDOUT,timeout=180)
print('RPMBUILD_EXIT',p.returncode,flush=True)
if p.returncode:print((E/'rpmbuild.log').read_text()[-7000:]);raise SystemExit(1)
files=list((T/'RPMS/x86_64').glob('*.rpm'));assert len(files)==1
print('CANDIDATE_RPM',files[0]);print('RPM_SHA256',sha(files[0]))
