#!/usr/bin/python3
from pathlib import Path
import concurrent.futures,datetime,hashlib,json,os,secrets,shlex,shutil,subprocess,tarfile
R=Path('/root/ls-onedrs-rc-20261120');nodes=json.loads((R/'provisioning.json').read_text())['members']
assert {n['ip'] for n in nodes}=={f'192.168.247.{i}' for i in range(11,16)}
assert json.loads((R/'vendor-install-r2-result.json').read_text())['status']=='PASS'
if shutil.disk_usage(R).free<15*1024**3:raise SystemExit('Host free-space guard')
auth=R/'frontend-auth';auth.mkdir(mode=0o700)
for name,value in [('db-password',secrets.token_hex(32)+'\n'),('one_auth','oneadmin:'+secrets.token_hex(32)+'\n')]:
 p=auth/name;p.write_text(value);p.chmod(0o600)
subprocess.run(['ssh-keygen','-q','-t','ed25519','-N','','-C','onedrs-rc-20261120-native','-f',str(auth/'native_ed25519')],check=True,capture_output=True)
shutil.copy2(R/'known_hosts',auth/'known_hosts');(auth/'known_hosts').chmod(0o600)
bundle=R/'frontend-auth.tar'
with tarfile.open(bundle,'w') as archive:
 for p in sorted(auth.iterdir()):archive.add(p,arcname=p.name,recursive=False)
bundle.chmod(0o600);bundle_hash=hashlib.sha256(bundle.read_bytes()).hexdigest()
remote='''from pathlib import Path
import hashlib,json,os,pwd,re,shutil,stat,subprocess,tarfile
n=json.loads(NODE_JSON);r=Path('/root/ls-onedrs-rc-20261120')
assert subprocess.check_output(['hostname','-s'],text=True).strip()==n['name']
assert subprocess.check_output(['getenforce'],text=True).strip()=='Enforcing'
assert subprocess.run(['rpm','-q','opennebula'],stdout=subprocess.DEVNULL).returncode!=0
u=pwd.getpwnam('oneadmin');assert (u.pw_uid,u.pw_gid)==(9869,9869)
source=Path('/home/haqa/.onedrs-rc-20261120-transfer/frontend-auth.tar')
assert source.is_file() and not source.is_symlink()
assert hashlib.sha256(source.read_bytes()).hexdigest()==BUNDLE_HASH
private=r/'frontend-auth';private.mkdir(mode=0o700)
allowed={'db-password','one_auth','native_ed25519','native_ed25519.pub','known_hosts'}
with tarfile.open(source) as archive:
 assert {m.name for m in archive.getmembers()}==allowed
 for member in archive.getmembers():
  assert member.isfile() and member.name in allowed
  p=private/member.name;p.write_bytes(archive.extractfile(member).read());p.chmod(0o600)
source.unlink()
password=(private/'db-password').read_text().strip();assert re.fullmatch('[0-9a-f]{64}',password)
config=Path('/etc/my.cnf.d/onedrs-rc-20261120.cnf')
assert not config.exists()
config.write_text('[mariadb]\\nbind-address=127.0.0.1\\nwsrep_on=OFF\\ntransaction-isolation=READ-COMMITTED\\nmax_allowed_packet=64M\\n');config.chmod(0o644)
subprocess.run(['systemctl','enable','--now','mariadb'],check=True,capture_output=True)
def sql(command,client=None):
 args=['mariadb']+(['--defaults-extra-file='+str(client)] if client else [])+['--protocol=socket','--batch','--skip-column-names']
 return subprocess.check_output(args,input=command,text=True).strip()
assert sql("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='opennebula';")=='0'
assert sql("SELECT COUNT(*) FROM mysql.user WHERE User='oneadmin';")=='0'
sql("CREATE DATABASE opennebula CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci; CREATE USER 'oneadmin'@'localhost' IDENTIFIED BY '"+password+"'; GRANT ALL PRIVILEGES ON opennebula.* TO 'oneadmin'@'localhost';")
client=private/'db-client.cnf';client.write_text('[client]\\nuser=oneadmin\\npassword='+password+'\\n');client.chmod(0o600)
assert sql('SELECT DATABASE(); USE opennebula; SELECT DATABASE();',client).endswith('opennebula')
settings=sql('SELECT @@version,@@wsrep_on,@@bind_address,@@tx_isolation;').split('\\t')
assert settings[1:]==['0','127.0.0.1','READ-COMMITTED']
home=Path(u.pw_dir);one=home/'.one';one.mkdir(mode=0o700);os.chown(one,u.pw_uid,u.pw_gid)
p=one/'one_auth';assert not p.exists();p.write_bytes((private/'one_auth').read_bytes());p.chmod(0o600);os.chown(p,u.pw_uid,u.pw_gid)
ssh=home/'.ssh';ssh.mkdir(mode=0o700,exist_ok=True);ssh.chmod(0o700);os.chown(ssh,u.pw_uid,u.pw_gid)
for src,dst in [('native_ed25519','id_ed25519_onedrs_rc'),('known_hosts','known_hosts')]:
 p=ssh/dst;assert not p.exists();p.write_bytes((private/src).read_bytes());p.chmod(0o600);os.chown(p,u.pw_uid,u.pw_gid)
p=ssh/'authorized_keys';assert not p.exists();p.write_bytes((private/'native_ed25519.pub').read_bytes());p.chmod(0o600);os.chown(p,u.pw_uid,u.pw_gid)
p=ssh/'config';old=p.read_text() if p.exists() else ''
(r/'vendor-oneadmin-ssh-config').write_text(old);(r/'vendor-oneadmin-ssh-config').chmod(0o600)
strict='Host 192.168.247.11 192.168.247.12 192.168.247.13 192.168.247.14 192.168.247.15\\n    User oneadmin\\n    IdentityFile /var/lib/one/.ssh/id_ed25519_onedrs_rc\\n    IdentitiesOnly yes\\n    BatchMode yes\\n    StrictHostKeyChecking yes\\n    UserKnownHostsFile /var/lib/one/.ssh/known_hosts\\n    GlobalKnownHostsFile /dev/null\\n    ControlMaster no\\n    ControlPath none\\n\\n'
p.write_text(strict+old);p.chmod(0o600);os.chown(p,u.pw_uid,u.pw_gid)
subprocess.run(['restorecon','-RF',str(one),str(ssh)],check=True,capture_output=True)
prepared=r/'controller-proposal.json'
proposal={'scope':'FRESH_REALM_CONFIGURATION_PROPOSAL_NATIVE_NOT_INSTALLED_OR_STARTED','native_rpc_transport':'HTTP on isolated192.168.247.0/24; no TLS claim','server_id':SERVER_ID,'zone_id':0,'federation_mode':'STANDALONE','xmlrpc_endpoint':'http://'+n['ip']+':2633/RPC2','listen_address':n['ip'],'grpc_listen_address':n['ip'],'hostname':n['ip'],'db':{'backend':'mysql','server':'localhost','port':0,'user':'oneadmin','password_file':str(private/'db-password'),'db_name':'opennebula','connections':25,'compare_binary':'no'},'raft':{'limit_purge':100000,'log_retention':250000,'log_purge_timeout':60,'election_timeout_ms':5000,'broadcast_timeout_ms':500,'xmlrpc_timeout_ms':1000},'planned_vip':'192.168.247.10/24','planned_vip_interface':'eth0','compute_member':True,'db_bootstrap_note':'Leader only creates native schema. Before starting each new follower, use a native leader backup and copy the full generated .one directory; do not initialize independent native authorities.'}
prepared.write_text(json.dumps(proposal,indent=2)+'\\n');prepared.chmod(0o600)
assert subprocess.run(['systemctl','is-active','--quiet','opennebula.service']).returncode!=0
print(json.dumps({'node':n['name'],'database_version':settings[0],'wsrep_on':False,'sql_bind':'127.0.0.1','transaction_isolation':settings[3],'native_schema_tables':int(sql("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='opennebula';")),'native_user_created':False,'native_credential_staged':True,'oneadmin_ssh_host_check':'strict-preseeded-keys','proposal_sha256':hashlib.sha256(prepared.read_bytes()).hexdigest(),'selinux':'Enforcing','native_service_active':False}))
'''
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def transport(node,cmd):
 return ['ssh','-n','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(R/'known_hosts'),'-o','ConnectTimeout=8','-i',str(R/'lab_ed25519'),'haqa@'+node['ip'],cmd]
def one(item):
 index,node=item
 if shutil.disk_usage(R).free<15*1024**3:raise RuntimeError('Host free-space guard')
 subprocess.run(transport(node,'install -d -m0700 /home/haqa/.onedrs-rc-20261120-transfer'),check=True,capture_output=True,timeout=20)
 scp=['scp','-q','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(R/'known_hosts'),'-o','ConnectTimeout=8','-i',str(R/'lab_ed25519'),str(bundle),'haqa@'+node['ip']+':/home/haqa/.onedrs-rc-20261120-transfer/frontend-auth.tar']
 subprocess.run(scp,check=True,capture_output=True,timeout=25)
 program='NODE_JSON='+repr(json.dumps(node))+'\nBUNDLE_HASH='+repr(bundle_hash)+'\nSERVER_ID='+str(index)+'\n'+remote
 started=now();log=R/(node['name']+'-controller-prepare-r1.log')
 with log.open('x') as out:
  log.chmod(0o600);p=subprocess.run(transport(node,'sudo -n python3 -c '+shlex.quote(program)),stdout=out,stderr=subprocess.STDOUT,timeout=150)
 return {'node':node['name'],'started':started,'ended':now(),'exit':p.returncode,'log':str(log),'log_sha256':hashlib.sha256(log.read_bytes()).hexdigest()}
result={'started':now(),'scope':'FRESH_REALM_LOCAL_SQL_AND_STRICT_NATIVE_SSH_PREPARATION'}
try:
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:result['nodes']=list(pool.map(one,enumerate(nodes)))
 result['status']='PASS' if all(n['exit']==0 for n in result['nodes']) else 'FAIL'
finally:
 result['ended']=now();result['free_host_bytes']=shutil.disk_usage(R).free
 p=R/'controller-prepare-r1-result.json';p.write_text(json.dumps(result,indent=2)+'\n');p.chmod(0o600);print(json.dumps(result))
raise SystemExit(result.get('status')!='PASS')
