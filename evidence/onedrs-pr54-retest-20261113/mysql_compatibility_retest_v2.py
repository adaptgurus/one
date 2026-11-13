"""Bounded original/candidate bootstrap and rollback compatibility on an empty private MySQL instance.
Never connects to or copies the live database; does not start oned managers.
"""
from pathlib import Path
import os,socket,subprocess,json,time,secrets,re,signal,hashlib,datetime
D=Path('/root/onedrs-pr54-package-retest-20261113');E=D/'evidence';R=D/'mysql-isolated-v2'
assert not R.exists(),'refuse existing isolated database directory'
R.mkdir(mode=0o700);data=R/'data';data.mkdir(mode=0o700)
port=33654;bind=socket.socket();bind.bind(('127.0.0.1',port));bind.close()
base=Path('/root/onedrs-rpm-build-final-e39bf32-r8/rpmbuild/BUILD/opennebula-7.4.1/src/nebula/oned')
candidate=D/'build/src/nebula/oned';assert hashlib.sha256(candidate.read_bytes()).hexdigest()=='782a3969593114d966f82f7946b36c076af8f67392f7b49313a68d87f3e8a7fb'
password=secrets.token_urlsafe(32);nativepass=secrets.token_urlsafe(32)
sock=R/'mysql.sock';server=None
result={'scope':'ISOLATED_EMPTY_MYSQL_BOOTSTRAP_AND_SCHEMA_ROLLBACK_NOT_LIVE_DATABASE_OR_SERVICE','started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'production_database_contacted':False,'oned_managers_started':False,'steps':[]}
def redact(s):
 for v in [password,nativepass]:s=s.replace(v,'<REDACTED>')
 return s
def sql(text):
 p=subprocess.run(['/usr/bin/mariadb','--no-defaults','--protocol=socket','--socket='+str(sock),'-uroot','-N','-B'],input=text,text=True,capture_output=True,timeout=25)
 if p.returncode:raise RuntimeError('isolated SQL failed: '+redact(p.stderr))
 return p.stdout

def location(name,dbname):
 p=R/name
 for path in [p,p/'etc',p/'var',p/'var/.one',p/'var/vms',p/'var/datastores',p/'share',p/'home']:
  path.mkdir(mode=0o700,exist_ok=True)
 config=(D/'build/share/etc/oned.conf').read_text()
 db='DB = [ BACKEND="mysql", SERVER="127.0.0.1", PORT='+str(port)+', USER="ls_pr54_test", PASSWD="'+password+'", DB_NAME="'+dbname+'", CONNECTIONS=4, COMPARE_BINARY="NO" ]'
 config,n=re.subn(r'(?ms)^DB\s*=\s*\[.*?\]',lambda m:db,config,count=1);assert n==1
 assert 'BACKEND="mysql"' in config and 'SERVER_ID        = -1' in config
 (p/'etc/oned.conf').write_text(config);os.chmod(p/'etc/oned.conf',0o600)
 (p/'var/.one/one_auth').write_text('oneadmin:'+nativepass+'\n');os.chmod(p/'var/.one/one_auth',0o600)
 return p

def bootstrap(label,binary,home,existing=False):
 env=dict(os.environ,ONE_LOCATION=str(home),ONE_AUTH=str(home/'var/.one/one_auth'),HOME=str(home/'home'))
 logpath=home/'var/oned.log';start=logpath.stat().st_size if logpath.exists() else 0
 p=subprocess.run([str(binary),'-i'],cwd=home,env=env,text=True,capture_output=True,timeout=35,start_new_session=True)
 log=''
 if logpath.exists():
  with logpath.open(errors='replace') as f:f.seek(start);log=f.read()
 # Persist sanitized logs only; original scratch configs never enter repository evidence.
 (E/(label+'.log')).write_text(redact(p.stdout+p.stderr+'\n'+log))
 result['steps'].append({'test':label,'exit':p.returncode})
 print(label,'EXIT',p.returncode,flush=True)
 if existing:
  assert p.returncode==255,'unexpected existing-init behavior'
  assert "Duplicate key name" in log and 'version 7.4.0 for local_db_versioning' in log and 'version 7.4.0 for db_versioning' in log and 'Database version mismatch' not in log,'different schema-check behavior'
 else:
  if p.returncode:raise RuntimeError(label+' failed; see private sanitized evidence')

def schema(db):
 tables=sql('SHOW TABLES FROM `'+db+'`;').splitlines();objects={}
 for table in tables:
  rows=sql('SHOW CREATE TABLE `'+db+'`.`'+table+'`;').split('\t',1)
  objects[table]=re.sub(r'AUTO_INCREMENT=\d+','AUTO_INCREMENT=<value>',rows[1].strip())
 versions=sql('SELECT * FROM `'+db+'`.`db_versioning`;')
 local=sql('SELECT * FROM `'+db+'`.`local_db_versioning`;')
 return {'tables':objects,'db_versioning':versions,'local_db_versioning':local}
try:
 with (R/'initialization.log').open('w') as out:
  p=subprocess.run(['/usr/bin/mariadb-install-db','--no-defaults','--datadir='+str(data),'--auth-root-authentication-method=socket','--skip-test-db','--user=root'],stdout=out,stderr=subprocess.STDOUT,timeout=60)
 assert p.returncode==0,'isolated MariaDB initialization failed'
 server=subprocess.Popen(['/usr/sbin/mariadbd','--no-defaults','--user=root','--datadir='+str(data),'--socket='+str(sock),'--pid-file='+str(R/'server.pid'),'--bind-address=127.0.0.1','--port='+str(port),'--skip-name-resolve','--skip-log-bin','--max-connections=12','--innodb-buffer-pool-size=32M','--log-error='+str(R/'server.log')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
 for _ in range(80):
  if server.poll() is not None:raise RuntimeError('isolated DB server exited')
  if sock.exists():
   try:sql('SELECT 1;');break
   except Exception:pass
  time.sleep(.1)
 else:raise RuntimeError('isolated server readiness timeout')
 sql("CREATE DATABASE ls_pr54_baseline; CREATE DATABASE ls_pr54_candidate; CREATE USER 'ls_pr54_test'@'127.0.0.1' IDENTIFIED BY '"+password+"'; GRANT ALL ON ls_pr54_baseline.* TO 'ls_pr54_test'@'127.0.0.1'; GRANT ALL ON ls_pr54_candidate.* TO 'ls_pr54_test'@'127.0.0.1';")
 b=location('baseline','ls_pr54_baseline');c=location('candidate','ls_pr54_candidate')
 bootstrap('v2-baseline-empty-mysql-bootstrap',base,b)
 original=schema('ls_pr54_baseline')
 bootstrap('v2-candidate-empty-mysql-bootstrap',candidate,c)
 fresh=schema('ls_pr54_candidate')
 assert original['tables']==fresh['tables'],'candidate fresh schema differs'
 bootstrap('v2-original-existing-baseline-nonidempotence-control',base,b,existing=True)
 assert schema('ls_pr54_baseline')==original,'original reinit altered schema/version rows'
 bootstrap('v2-candidate-checks-original-version-before-reinit-rejection',candidate,b,existing=True)
 assert schema('ls_pr54_baseline')==original,'candidate reinit altered original schema/version rows'
 bootstrap('v2-original-checks-candidate-version-before-reinit-rejection',base,c,existing=True)
 assert schema('ls_pr54_candidate')==fresh,'original reinit altered candidate schema/version rows'
 result.update({'result':'PASS_BOUNDED_SCHEMA_COMPATIBILITY','table_count':len(original['tables']),'fresh_bootstrap_original_and_candidate_pass':True,'candidate_and_original_schema_equal':True,'cross_binary_version_checks_accept_7_4_0':True,'existing_database_reinitialization_nonidempotent_on_both':True,'schema_and_version_rows_unchanged_after_reinitialization_attempts':True,'database_version_rows':{'baseline':original['db_versioning'],'baseline_local':original['local_db_versioning'],'candidate':fresh['db_versioning'],'candidate_local':fresh['local_db_versioning']},'actual_server_version':sql('SELECT VERSION();').strip(),'normal_daemon_startup_or_HA_failover_tested':False,'rollback_runtime_tested':False})

except BaseException as ex:
 result['result']='FAIL';result['error']=redact(str(ex));print('TEST_ERROR',result['error'],flush=True)
finally:
 if server is not None and server.poll() is None:
  server.terminate()
  try:server.wait(timeout=20)
  except subprocess.TimeoutExpired:os.killpg(server.pid,signal.SIGKILL);server.wait(timeout=5)
 result['isolated_server_stopped']=server is None or server.poll() is not None
 check=socket.socket();result['isolated_TCP_listener_absent']=check.connect_ex(('127.0.0.1',port))!=0;check.close()
 result['ended_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 (E/'mysql-compatibility-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2),flush=True)
if result['result']!='PASS_BOUNDED_SCHEMA_COMPATIBILITY':raise SystemExit(1)
