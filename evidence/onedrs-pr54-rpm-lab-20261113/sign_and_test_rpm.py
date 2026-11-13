"""Private LAB signature and RPM file/scriptlet transaction qualification.
Not dependency closure, normal service startup, native HA or production trust.
"""
from pathlib import Path
import os,subprocess,shutil,json,hashlib,re,datetime
D=Path('/root/onedrs-pr54-runtime-package-20261113');E=D/'evidence';G=D/'lab-signing';R=D/'rpm-transaction-root';N=D/'untrusted-rpmdb-root'
for p in [G,R,N]:assert not p.exists();p.mkdir(mode=0o700)
original=Path('/root/onedrs-rpm-build-final-e39bf32-r8/rpmbuild/RPMS/x86_64/opennebula-7.4.1-8.ls.onedrs.e39bf32.el9.x86_64.rpm')
unsigned=D/'rpmbuild/RPMS/x86_64/opennebula-7.4.1-9.ls.onedrs.pr54.3165fdb.el9.x86_64.rpm'
signed=G/unsigned.name;shutil.copy2(unsigned,signed)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(unsigned)=='a16283d51942de6d3772dc4166d57432a4ede705d58f5fc6e6e7634203347c1e'
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'LAB_SIGNATURE_PRIVATE_RPMROOT_FILE_AND_SCRIPTLET_TEST','live_root_or_release_trust_modified':False,'systemd_service_calls':'recorded-only stub inside private chroot','dependency_resolution':'NOT_TESTED_transactions_use_nodeps_in_private_root','full_service_start_or_HA':'NOT_TESTED','steps':[]}
def run(label,args,expected=0,env=None):
 p=subprocess.run(args,capture_output=True,text=True,timeout=90,env=env)
 (E/(label+'.log')).write_text(p.stdout+p.stderr)
 result['steps'].append({'test':label,'exit':p.returncode})
 if expected is not None and p.returncode!=expected:raise RuntimeError(label+': '+(p.stdout+p.stderr)[-1800:])
 return p
try:
 env=dict(os.environ,GNUPGHOME=str(G))
 run('lab-key-create',['gpg','--batch','--pinentry-mode','loopback','--passphrase','','--quick-generate-key','LayerSentry OneDRS PR54 LAB ONLY 20261113 <lab-pr54-noreply@invalid.test>','rsa3072','sign','7d'],env=env)
 keys=run('lab-key-metadata',['gpg','--batch','--with-colons','--list-secret-keys'],env=env).stdout
 fingerprint=next(l.split(':')[9] for l in keys.splitlines() if l.startswith('fpr:'))
 result['lab_signer_fingerprint']=fingerprint
 public=G/'RPM-GPG-KEY-PR54-LAB-ONLY'
 p=subprocess.run(['gpg','--batch','--armor','--export',fingerprint],env=env,capture_output=True,check=True,timeout=15);public.write_bytes(p.stdout)
 run('lab-rpm-sign',['rpmsign','--addsign','--define','_gpg_name '+fingerprint,'--define','_gpg_path '+str(G),'--define','__gpg /usr/bin/gpg',str(signed)],env=env)
 run('private-rpmdb-init',['rpm','--root',str(R),'--initdb'])
 run('untrusted-rpmdb-init',['rpm','--root',str(N),'--initdb'])
 unknown=run('unknown-lab-key-rejected',['rpm','--root',str(N),'--checksig','--verbose',str(signed)],expected=None)
 assert unknown.returncode!=0 and 'NOKEY' in unknown.stdout+unknown.stderr
 run('private-only-lab-key-import',['rpm','--root',str(R),'--import',str(public)])
 trusted=run('trusted-lab-signature-and-digests',['rpm','--root',str(R),'--checksig','--verbose',str(signed)])
 assert 'NOKEY' not in trusted.stdout+trusted.stderr and 'Signature' in trusted.stdout+trusted.stderr
 corrupt=G/'tampered-DO-NOT-USE.rpm';shutil.copy2(signed,corrupt)
 with corrupt.open('r+b') as f:f.seek(-1,2);x=f.read(1);f.seek(-1,2);f.write(bytes([x[0]^1]))
 bad=run('tampered-payload-rejected',['rpm','--root',str(R),'--checksig','--verbose',str(corrupt)],expected=None)
 assert bad.returncode!=0 and ('BAD' in bad.stdout+bad.stderr or 'NOT OK' in bad.stdout+bad.stderr)
 # Install a bounded shell/coreutils substrate solely for original RPM scriptlets.
 copied=set()
 def copy_binary(path):
  path=Path(path);dest=R/str(path).lstrip('/');dest.parent.mkdir(parents=True,exist_ok=True)
  shutil.copy2(path.resolve(),dest)
  if str(path) in copied:return
  copied.add(str(path))
  p=subprocess.run(['ldd',str(path)],capture_output=True,text=True,timeout=10,check=True)
  for lib in re.findall(r'(?:=>\s*)?(/[^\s()]+)',p.stdout):
   target=R/lib.lstrip('/');target.parent.mkdir(parents=True,exist_ok=True)
   if not target.exists():shutil.copy2(Path(lib).resolve(),target)
 for path in ['/bin/bash','/usr/bin/mkdir','/usr/bin/chmod','/usr/bin/chown','/usr/bin/rm','/usr/bin/rmdir','/usr/bin/md5sum','/usr/bin/cut','/usr/bin/date','/usr/bin/basename']:
  copy_binary(path)
 (R/'bin/sh').symlink_to('bash')
 for n in ['mkdir','chmod','chown','rm','rmdir','md5sum','cut','date','basename']:(R/'bin'/n).symlink_to('../usr/bin/'+n)
 for p in ['etc','var/tmp','var/lib/one/.one','var/lib/one/.ssh','var/lib/one/vms/999999','var/log/one','var/lib/one/remotes/hooks/ft','dev']:(R/p).mkdir(parents=True,exist_ok=True)
 (R/'dev/null').touch()
 (R/'etc/passwd').write_text('root:x:0:0:root:/root:/bin/bash\noneadmin:x:9869:9869:Lab native user:/var/lib/one:/bin/bash\n')
 (R/'etc/group').write_text('root:x:0:\noneadmin:x:9869:\n')
 stub=R/'usr/bin/systemctl';stub.write_text('#!/bin/bash\nprintf "%s\\n" "$*" >> /var/tmp/systemctl-test-calls.log\nexit 0\n');stub.chmod(0o755)
 # Existing placeholder files deliberately avoid generating or using real credentials.
 (R/'var/lib/one/.one/one_auth').write_text('disposable-installroot-placeholder\n');(R/'var/lib/one/.ssh/id_rsa').write_text('not-a-key-disposable-placeholder\n')
 for p in [R/'var/lib/one/.one/one_auth',R/'var/lib/one/.ssh/id_rsa']:p.chmod(0o600)
 marker=R/'var/lib/one/vms/999999/test-state.txt';marker.write_text('retain test VM state across upgrade/downgrade\n')
 logmarker=R/'var/log/one/999999.log';logmarker.write_text('retain test logs\n')
 fence=R/'var/lib/one/remotes/hooks/ft/fence_host.sh';fence.write_text('#!/bin/bash\n# custom inert LAB fixture; not a qualified fencer\nexit 1\n');fence.chmod(0o750)
 preserve={str(p.relative_to(R)):sha(p) for p in [marker,logmarker,fence,R/'var/lib/one/.one/one_auth',R/'var/lib/one/.ssh/id_rsa']}
 run('original-rpm-install-scriptlets',['rpm','--root',str(R),'-Uvh','--nodeps',str(original)])
 assert sha(R/'usr/bin/oned')=='d3c7480078450fdf567676afaa73d56590417ef27b6c3196e533ba4b50293bd1'
 conf=R/'etc/one/oned.conf';conf.write_text(conf.read_text()+'\n# SYNTHETIC-LAB-CONFIG-PRESERVATION-MARKER\n');preserve['etc/one/oned.conf']=sha(conf)
 run('candidate-upgrade-dry-run',['rpm','--root',str(R),'-Uvh','--test','--nodeps',str(signed)])
 run('candidate-rpm-upgrade-scriptlets',['rpm','--root',str(R),'-Uvh','--nodeps',str(signed)])
 assert sha(R/'usr/bin/oned')=='782a3969593114d966f82f7946b36c076af8f67392f7b49313a68d87f3e8a7fb'
 for p,digest in preserve.items():assert sha(R/p)==digest,'upgrade changed '+p
 run('original-rpm-downgrade-scriptlets',['rpm','--root',str(R),'-Uvh','--oldpackage','--nodeps',str(original)])
 assert sha(R/'usr/bin/oned')=='d3c7480078450fdf567676afaa73d56590417ef27b6c3196e533ba4b50293bd1'
 for p,digest in preserve.items():assert sha(R/p)==digest,'downgrade changed '+p
 calls=(R/'var/tmp/systemctl-test-calls.log').read_text().splitlines()
 assert calls.count('stop opennebula')==2 and calls.count('stop opennebula-hem')==2 and calls.count('stop opennebula-ssh-agent')==2,calls
 result.update({'result':'PASS_BOUNDED_PACKAGE_SIGNATURE_AND_UPGRADE_DOWNGRADE','signed_rpm_sha256':sha(signed),'signed_rpm':str(signed),'signature_scope':'EPHEMERAL_LAB_KEY_NOT_PRODUCTION_TRUST','unknown_signer_rejected':True,'tampered_payload_rejected':True,'original_install_candidate_upgrade_original_downgrade_pass':True,'exact_binary_readbacks_pass':True,'modified_config_credentials_custom_fence_VM_state_and_logs_preserved':True,'recorded_systemctl_calls':calls,'original_lifecycle_scriptlets_executed_in_private_root':True,'real_systemctl_calls':0})
except BaseException as ex:
 result['result']='FAIL';result['error']=str(ex);print(result['error'],flush=True)
finally:
 # The newly generated test key is not retained as an ongoing signing authority.
 if 'fingerprint' in locals():
  p=subprocess.run(['gpg','--batch','--yes','--delete-secret-keys',fingerprint],env=env,capture_output=True,text=True,timeout=20)
  remaining=subprocess.run(['gpg','--batch','--with-colons','--list-secret-keys'],env=env,capture_output=True,text=True,timeout=10)
  result['ephemeral_lab_secret_key_removed']=p.returncode==0 and not any(x.startswith('sec:') for x in remaining.stdout.splitlines())
 (E/'rpm-transaction-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2),flush=True)
if not result['result'].startswith('PASS'):raise SystemExit(1)
