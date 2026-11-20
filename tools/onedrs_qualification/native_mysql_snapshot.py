#!/usr/bin/env python3
"""Export native MariaDB rows in one read-only snapshot; this does not authorize rollback.

Run locally as root. Credentials are read from oned.conf and passed only through
an ephemeral 0600 client option file inside a 0700 directory. Raw native XML may
contain workload secrets: the snapshot is created 0600 in an existing private
root-owned directory and must never be committed. The separate native downgrade
guard consumes this snapshot using the same row policy as its SQLite loader.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile

SCHEMA = 'onedrs.native-db-snapshot/v1'
SQL = """SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET SESSION TRANSACTION READ ONLY;
START TRANSACTION WITH CONSISTENT SNAPSHOT;
SELECT 'META',VERSION(),@@hostname,@@server_id,@@tx_isolation,@@tx_read_only;
SELECT 'WSREP_BEGIN',VARIABLE_NAME,VARIABLE_VALUE FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME IN ('WSREP_CLUSTER_STATUS','WSREP_LOCAL_STATE_COMMENT','WSREP_CLUSTER_SIZE','WSREP_READY','WSREP_LAST_COMMITTED') ORDER BY VARIABLE_NAME;
SELECT 'ENGINE',TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('vm_pool','plan_pool','history') ORDER BY TABLE_NAME;
SELECT 'COUNTS',(SELECT COUNT(*) FROM vm_pool),(SELECT COUNT(*) FROM plan_pool),(SELECT COUNT(*) FROM history);
SELECT 'VM',oid,state,lcm_state,HEX(body) FROM vm_pool ORDER BY oid;
SELECT 'PLAN',cid,state,HEX(body) FROM plan_pool ORDER BY cid;
SELECT 'HISTORY',vid,seq,HEX(body) FROM history ORDER BY vid,seq;
SELECT 'WSREP_END',VARIABLE_NAME,VARIABLE_VALUE FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME IN ('WSREP_CLUSTER_STATUS','WSREP_LOCAL_STATE_COMMENT','WSREP_CLUSTER_SIZE','WSREP_READY','WSREP_LAST_COMMITTED') ORDER BY VARIABLE_NAME;
COMMIT;
SELECT 'COMPLETE',1;
"""

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def database_config(text):
    starts=list(re.finditer(r'(?m)^[ \t]*DB[ \t]*=[ \t]*\[',text))
    if len(starts)!=1: raise ValueError('Exactly one native DB vector is required')
    i=starts[0].end(); result={}
    def space():
        nonlocal i
        while i<len(text):
            if text[i].isspace() or text[i]==',': i+=1
            elif text[i]=='#':
                end=text.find('\n',i);i=len(text) if end<0 else end+1
            else: break
    while True:
        space()
        if i>=len(text): raise ValueError('Unterminated native DB vector')
        if text[i]==']': break
        m=re.match(r'[A-Za-z_][A-Za-z0-9_]*',text[i:])
        if not m: raise ValueError('Invalid DB field')
        key=m.group().upper();i+=len(m.group());space()
        if i>=len(text) or text[i]!='=': raise ValueError('Invalid DB assignment')
        i+=1;space()
        if i<len(text) and text[i]=='"':
            i+=1;value=[]
            while i<len(text) and text[i]!='"':
                ch=text[i];i+=1
                if ch=='\\':
                    if i>=len(text) or text[i] not in ('\\','"'): raise ValueError('Unsupported DB escape')
                    ch=text[i];i+=1
                value.append(ch)
            if i>=len(text): raise ValueError('Unterminated DB string')
            i+=1;value=''.join(value)
        else:
            m=re.match(r'[^\s,\]#]+',text[i:])
            if not m: raise ValueError('Missing DB value')
            value=m.group();i+=len(value)
        if key in result: raise ValueError('Duplicate DB field')
        if any(ord(c)<32 for c in value): raise ValueError('Control character in DB value')
        result[key]=value
    if result.get('BACKEND','').lower()!='mysql': raise ValueError('This exporter requires the native mysql backend')
    if result.get('SERVER','localhost') not in ('localhost','127.0.0.1','::1'): raise ValueError('Only the local database endpoint is allowed')
    if not re.fullmatch(r'[A-Za-z0-9_]+',result.get('DB_NAME','')): raise ValueError('Invalid database name')
    if not result.get('USER') or 'PASSWD' not in result: raise ValueError('Native DB credentials are missing')
    port=int(result.get('PORT','0'))
    if port<0 or port>65535: raise ValueError('Invalid database port')
    return result


def option(value):
    return '"'+value.replace('\\','\\\\').replace('"','\\"')+'"'


def parse_rows(text):
    result={'vm_rows':[],'plan_rows':[],'history_rows':[]}
    metadata=None;counts=None;complete=False;wsrep={'begin':{},'end':{}};engines={}
    for line in text.splitlines():
        if complete: raise ValueError('Record follows transaction completion')
        fields=line.split('\t');kind=fields[0]
        if kind=='META' and len(fields)==6 and metadata is None:
            metadata={'server_version':fields[1],'server_hostname':fields[2],'server_id':int(fields[3]),'isolation':fields[4],'read_only':fields[5]=='1'}
        elif kind in ('WSREP_BEGIN','WSREP_END') and len(fields)==3:
            where=wsrep['begin' if kind.endswith('BEGIN') else 'end']
            if fields[1] in where: raise ValueError('Duplicate Galera observation')
            where[fields[1]]=fields[2]
        elif kind=='ENGINE' and len(fields)==3 and fields[1] not in engines: engines[fields[1]]=fields[2]
        elif kind=='COUNTS' and len(fields)==4 and counts is None: counts=[int(v) for v in fields[1:]]
        elif kind=='VM' and len(fields)==5: result['vm_rows'].append([int(v) for v in fields[1:4]]+[bytes.fromhex(fields[4]).decode('utf-8')])
        elif kind=='PLAN' and len(fields)==4: result['plan_rows'].append([int(v) for v in fields[1:3]]+[bytes.fromhex(fields[3]).decode('utf-8')])
        elif kind=='HISTORY' and len(fields)==4: result['history_rows'].append([int(v) for v in fields[1:3]]+[bytes.fromhex(fields[3]).decode('utf-8')])
        elif kind=='COMPLETE' and fields==['COMPLETE','1'] and not complete: complete=True
        else: raise ValueError('Unexpected database export record')
    if not complete or metadata is None or counts is None: raise ValueError('Incomplete database transaction export')
    if not metadata['read_only'] or metadata['isolation'].upper()!='REPEATABLE-READ': raise ValueError('Required read-only repeatable-read transaction was not established')
    if 'mariadb' not in metadata['server_version'].lower(): raise ValueError('Only MariaDB has been qualified for this exporter')
    if engines!={'vm_pool':'InnoDB','plan_pool':'InnoDB','history':'InnoDB'}: raise ValueError('All native pools must support transactional snapshots')
    actual=[len(result[k]) for k in ('vm_rows','plan_rows','history_rows')]
    if counts!=actual: raise ValueError('Database row counts do not match transaction counts')
    metadata['wsrep_status']=wsrep;metadata['consistent_snapshot']=True
    metadata['table_engines']=engines
    metadata['wsrep_observation_note']='Galera status is observed at transaction boundaries, outside table MVCC'
    result['transaction']=metadata
    return result


def export(config, destination):
    if os.geteuid()!=0: raise ValueError('Run locally as root to protect native database material')
    destination=Path(destination)
    parent=destination.parent.resolve(strict=True);st=parent.stat()
    if st.st_uid!=0 or stat.S_IMODE(st.st_mode)&0o077: raise ValueError('Output requires a private root-owned parent directory')
    if destination.exists() or destination.is_symlink(): raise ValueError('Snapshot destination already exists')
    db=database_config(Path(config).read_text())
    client=shutil.which('mariadb')
    if not client: raise ValueError('MariaDB client is unavailable')
    started=now()
    with tempfile.TemporaryDirectory(prefix='onedrs-db-export-',dir='/run') as private:
        auth=Path(private)/'client.cnf'
        content='[client]\nuser='+option(db['USER'])+'\npassword='+option(db['PASSWD'])+'\nhost='+option(db.get('SERVER','localhost'))+'\n'
        if int(db.get('PORT','0')): content+='port='+db['PORT']+'\n'
        fd=os.open(auth,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as f:f.write(content)
        args=[client,'--defaults-file='+str(auth),'--batch','--raw','--skip-column-names','--default-character-set=utf8mb4','--database='+db['DB_NAME']]
        proc=subprocess.run(args,input=SQL,text=True,capture_output=True,timeout=90,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C.UTF-8','MYSQL_HISTFILE':'/dev/null'})
        if proc.returncode: raise ValueError('Read-only MariaDB transaction failed (exit '+str(proc.returncode)+'); raw diagnostics withheld')
        if len(proc.stdout)>64*1024*1024: raise ValueError('Export exceeds the qualified size bound')
        result=parse_rows(proc.stdout)
    result.update({'schema':SCHEMA,'backend':'mysql','scope':'READ_ONLY_OBSERVATION_NOT_ROLLBACK_AUTHORIZATION','snapshot_complete':True})
    result['transaction'].update({'started_utc':started,'ended_utc':now(),'database':db['DB_NAME'],'local_endpoint':True,'controller_stopped_or_writers_frozen_by_exporter':False})
    data=(json.dumps(result,sort_keys=True,separators=(',',':'))+'\n').encode()
    fd=os.open(destination,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
    return {'schema':SCHEMA,'state':'EXPORTED_READ_ONLY_NOT_ROLLBACK_AUTHORIZATION','path':str(destination),'snapshot_sha256':hashlib.sha256(data).hexdigest(),'counts':{k:len(result[k]) for k in ('vm_rows','plan_rows','history_rows')},'transaction':result['transaction'],'credentials_logged':False,'raw_rows_in_report':False}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',default='/etc/one/oned.conf')
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    try: report=export(args.config,args.output)
    except (ValueError,OSError,subprocess.SubprocessError):
        print(json.dumps({'state':'EXPORT_REFUSED','detail':'Configuration, transaction, or private-output validation failed; no rollback authorization'}))
        return 2
    print(json.dumps(report,indent=2,sort_keys=True));return 0

if __name__=='__main__': raise SystemExit(main())
