from pathlib import Path
import os,subprocess,json,shutil,hashlib,datetime
D=Path('/root/onedrs-pr54-runtime-package-20261113');S=Path('/root/onedrs-native-host-context-20261113/src/vmm_mad/remotes/kvm/deploy');R=D/'preboot-gate-fixture'
assert not R.exists();R.mkdir(mode=0o700)
for p in [R/'remotes/vmm/kvm',R/'remotes/etc/vmm/kvm',R/'bin',R/'libexec',R/'guests']:p.mkdir(parents=True,exist_ok=True)
shutil.copy2(S,R/'remotes/vmm/kvm/deploy')
(R/'remotes/etc/vmm/kvm/kvmrc').write_text('LIBVIRT_URI=test:///private-fixture\nCLEANUP_MEMORY_ON_START=no\n')
(R/'remotes/scripts_common.sh').write_text('error_message() { printf "%s\\n" "$*" >&2; }\n')
def executable(p,s):p.write_text(s);p.chmod(0o755)
executable(R/'bin/virsh','''#!/bin/bash
if [ "$3" = create ]; then echo virsh-create >> "$TRACE"; echo created; exit 0; fi
if [ "$3" = dominfo ]; then echo 'UUID: 11111111-2222-4333-8444-555555555555'; exit 0; fi
exit 96
''')
executable(R/'bin/sudo','''#!/bin/bash
if [ "$1" = -l ]; then exit 0; fi
if [ "$1" = -n ]; then shift; fi
if [ "$CASE" = sudo-denied ]; then exit 1; fi
exec "$@"
''')
helper='''#!/bin/bash
printf '%s\\n' "$1" >> "$TRACE"
if [ "$1" = preboot ] && [ "$CASE" = preboot-denied ]; then exit 1; fi
if [ "$1" = verify-preboot ] && [ "$CASE" = verification-denied ]; then exit 1; fi
exit 0
'''
subprocess.run(['mount','--make-rprivate','/'],check=True)
subprocess.run(['mount','--bind',str(R/'libexec'),'/usr/libexec'],check=True)
rows=[]
for name,tag,expected in [('untagged','',True),('empty-tag','<LAYERSENTRY_SECURITY_STATE_VERSION/>',True),('valid-tag','<LAYERSENTRY_SECURITY_STATE_VERSION>2</LAYERSENTRY_SECURITY_STATE_VERSION>',True),('preboot-denied','<LAYERSENTRY_SECURITY_STATE_VERSION>2</LAYERSENTRY_SECURITY_STATE_VERSION>',False),('verification-denied','<LAYERSENTRY_SECURITY_STATE_VERSION>2</LAYERSENTRY_SECURITY_STATE_VERSION>',False),('missing-helper','<LAYERSENTRY_SECURITY_STATE_VERSION>2</LAYERSENTRY_SECURITY_STATE_VERSION>',False),('sudo-denied','<LAYERSENTRY_SECURITY_STATE_VERSION>2</LAYERSENTRY_SECURITY_STATE_VERSION>',False)]:
 h=R/'libexec/layersentry-vm-security-state'
 if h.exists():h.unlink()
 if name!='missing-helper':executable(h,helper)
 guest=R/'guests'/name;guest.mkdir();trace=guest/'trace';trace.write_text('')
 (guest/'vm.xml').write_text('<VM><USER_TEMPLATE>'+tag+'</USER_TEMPLATE></VM>')
 xml='<domain><name>one-fixture</name><uuid>11111111-2222-4333-8444-555555555555</uuid><devices/></domain>'
 env=dict(os.environ,PATH=str(R/'bin')+':/usr/bin:/bin',TRACE=str(trace),CASE=name)
 p=subprocess.run(['bash',str(R/'remotes/vmm/kvm/deploy'),str(guest/'deployment.0')],input=xml,capture_output=True,text=True,timeout=8,env=env)
 actions=trace.read_text().splitlines();booted='virsh-create' in actions
 assert booted==expected,(name,p.returncode,actions,p.stderr)
 if name=='valid-tag':assert actions==['preboot','verify-preboot','virsh-create'],actions
 if not expected:assert p.returncode!=0 and not booted
 rows.append({'case':name,'exit':p.returncode,'trace':actions,'expected_boot':expected,'pass':True})
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'driver_sha256':hashlib.sha256(S.read_bytes()).hexdigest(),'scope':'REAL_NATIVE_DRIVER_SCRIPT_WITH_MOCK_HELPER_SUDO_AND_VIRSH_NO_REAL_VM','cases':rows,'result':'PASS','source_driver_identical_to_DR1':True,'helper_logic_or_real_guest_not_tested':True}
(D/'evidence/preboot-driver-tests.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
