from pathlib import Path
import os,subprocess,signal,time,xmlrpc.client,xml.etree.ElementTree as E,json,socket,hashlib,datetime,secrets,re
D=Path('/root/onedrs-pr54-runtime-package-20261113');P=Path('/root/onedrs-pr54-security-integrated-r10-20261113/mysql-native-prefix');out=Path('/root/onedrs-pr54-security-integrated-r10-20261113/evidence');socket.setdefaulttimeout(2)
assert not (out/'mysql-runtime-result.json').exists(),'prior MySQL runtime result exists; inspect before rerun'
assert (D/'evidence/runtime-result.json').is_file() and json.loads((D/'evidence/runtime-result.json').read_text())['result']=='PASS','SQLite control test not accepted'
assert not (P/'var/one.db').exists() and not (P/'var/.one/sunstone_auth').exists(),'fresh MySQL prefix required'
subprocess.run(['mount','--make-rprivate','/'],check=True)
subprocess.run(['ip','link','set','lo','up'],check=True)
# Only these private namespace mounts shadow the normal native paths.
for source,target in [(P/'var','/var/lib/one'),(P/'etc','/etc/one'),(P/'log','/var/log/one')]:subprocess.run(['mount','--bind',str(source),target],check=True)
assert len(json.loads(subprocess.check_output(['ip','-j','link','show'],text=True)))==1
assert not json.loads(subprocess.check_output(['ip','-j','route','show'],text=True))
auth=(P/'var/.one/one_auth').read_text().strip();password=auth.split(':',1)[1]
env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C.UTF-8','ONE_LOCATION':str(P),'ONE_AUTH':str(P/'var/.one/one_auth'),'HOME':str(P/'home'),'ONE_MAD_DEBUG':'1'}
sqlroot=Path('/root/onedrs-pr54-security-integrated-r10-20261113/mysql-runtime-fixture-v2');assert not sqlroot.exists();sqlroot.mkdir(mode=0o700)
data=sqlroot/'data';data.mkdir(mode=0o700);sock=sqlroot/'mysql.sock'
with (sqlroot/'init.log').open('w') as f:
 p=subprocess.run(['/usr/bin/mariadb-install-db','--no-defaults','--datadir='+str(data),'--auth-root-authentication-method=socket','--skip-test-db','--user=root'],stdout=f,stderr=subprocess.STDOUT,timeout=60);assert p.returncode==0
sqlproc=subprocess.Popen(['/usr/sbin/mariadbd','--no-defaults','--user=root','--datadir='+str(data),'--socket='+str(sock),'--pid-file='+str(sqlroot/'server.pid'),'--bind-address=127.0.0.1','--port=33655','--skip-name-resolve','--skip-log-bin','--max-connections=16','--innodb-buffer-pool-size=32M','--log-error='+str(sqlroot/'server.log')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def sql(text):
 p=subprocess.run(['/usr/bin/mariadb','--no-defaults','--protocol=socket','--socket='+str(sock),'-uroot','-N','-B'],input=text,text=True,capture_output=True,timeout=15)
 if p.returncode:raise RuntimeError('private MySQL request failed')
 return p.stdout
for _ in range(100):
 if sqlproc.poll() is not None:raise RuntimeError('private MySQL exited')
 if sock.exists():
  try:sql('SELECT 1;');break
  except Exception:pass
 time.sleep(.1)
else:raise RuntimeError('private MySQL startup timeout')
dbsecret=secrets.token_urlsafe(32)
sql("CREATE DATABASE ls_pr54_runtime; CREATE USER 'ls_runtime_test'@'127.0.0.1' IDENTIFIED BY '"+dbsecret+"'; GRANT ALL ON ls_pr54_runtime.* TO 'ls_runtime_test'@'127.0.0.1';")
configpath=P/'etc/oned.conf';original_config=configpath.read_text()
db='DB = [BACKEND="mysql",SERVER="127.0.0.1",PORT=33655,USER="ls_runtime_test",PASSWD="'+dbsecret+'",DB_NAME="ls_pr54_runtime",CONNECTIONS=4]'
config,n=re.subn(r'(?ms)^DB\s*=\s*\[.*?\]',lambda m:db,original_config,count=1);assert n==1
configpath.write_text(config);configpath.chmod(0o600)

api=xmlrpc.client.ServerProxy('http://127.0.0.1:2633/RPC2')
result={'scope':'ISOLATED_MYSQL_FULL_NATIVE_DAEMON_API_UPGRADE_ROLLBACK_NO_LIVE_HOSTS','backend':'MariaDB 10.5 private loopback schema','started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'network':'private namespace,loopback only,no routes','production_data_paths_shadowed':True,'steps':[]};proc=None

def call(method,*args):
 r=getattr(api,method)(auth,*args)
 if not r[0]:raise RuntimeError(method+': '+str(r[1])[:250])
 return r[1]
def stop():
 global proc
 if proc and proc.poll() is None:
  proc.send_signal(signal.SIGTERM)
  try:proc.wait(timeout=25)
  except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait(timeout=5)
 if proc:result['steps'][-1]['shutdown_exit']=proc.returncode
 proc=None
 time.sleep(.5)
def start(label,binary):
 global proc
 log=P/'var/oned.log';start=log.stat().st_size if log.exists() else 0
 with (out/(label+'-stdout.log')).open('w') as output:
  proc=subprocess.Popen([str(binary),'-f'],cwd=P,env=env,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
 step={'label':label,'binary_sha256':hashlib.sha256(binary.read_bytes()).hexdigest()};result['steps'].append(step)
 for _ in range(100):
  if proc.poll() is not None:break
  try:step['version']=call('one.system.version');break
  except Exception:time.sleep(.2)
 if 'version' not in step:
  text=log.read_text(errors='replace') if log.exists() else ''
  step['start_error_log']=text[start:][-3500:].replace(password,'<REDACTED>').replace(dbsecret,'<REDACTED>')
  raise RuntimeError(label+' did not become authenticated API-ready')
 assert Path('/proc/'+str(proc.pid)+'/exe').resolve()==binary.resolve()
 step['authenticated_api_ready']=True
 hosts=E.fromstring(call('one.hostpool.info'));assert len(hosts.findall('HOST'))==0
 step['native_host_pool_empty']=True
 print(label,'API_READY',step['version'],flush=True)
try:
 start('mysql-original-start',D/'baseline-oned')
 cid=int(call('one.cluster.allocate','ls-pr54-isolated-persistence'))
 call('one.cluster.update',cid,'LAYERSENTRY_TEST_CUSTODY="pr54-isolated"\nONE_DRS=[AUTOMATION="manual",POLICY="balance",ENABLED="no"]',1)
 baseline=call('one.cluster.info',cid,False);result['created_isolated_cluster_id']=cid
 stop()
 start('mysql-candidate-upgrade-start',D/'candidate-oned')
 upgraded=call('one.cluster.info',cid,False);assert E.tostring(E.fromstring(baseline).find('TEMPLATE'))==E.tostring(E.fromstring(upgraded).find('TEMPLATE'))
 call('one.cluster.update',cid,'LAYERSENTRY_CANDIDATE_WRITE="accepted"',1)
 result['candidate_read_and_write_native_API']=True
 stop()
 start('mysql-original-rollback-start',D/'baseline-oned')
 restored=E.fromstring(call('one.cluster.info',cid,False));assert restored.findtext('TEMPLATE/LAYERSENTRY_CANDIDATE_WRITE')=='accepted'
 call('one.cluster.delete',cid);result['original_reads_candidate_write_and_cleans']=True
 result['result']='PASS'
except BaseException as ex:
 result['result']='FAIL';result['error']=str(ex).replace(password,'<REDACTED>').replace(dbsecret,'<REDACTED>')
finally:
 stop()
 configpath.write_text(original_config)
 sqlproc.terminate()
 try:sqlproc.wait(timeout=20)
 except subprocess.TimeoutExpired:sqlproc.kill();sqlproc.wait(timeout=5)
 result['private_mysql_stopped']=sqlproc.poll() is not None
 result['original_private_config_restored']=configpath.read_text()==original_config
 result['ended_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 (out/'mysql-runtime-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2),flush=True)
if result['result']!='PASS':raise SystemExit(1)
