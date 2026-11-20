#!/usr/bin/python3
"""Render reviewed native configs into NEW protected staging only; never install/start."""
from pathlib import Path
import argparse,hashlib,json,os,re,stat
REALM="ls-onedrs-rc-20261120"
ALLOWLIST_SHA="5911487abf74555c790aad971c288b5a741e41caa651a1b0c8d7e425955e0c24"
RAFT={"LIMIT_PURGE":100000,"LOG_RETENTION":250000,"LOG_PURGE_TIMEOUT":60,"ELECTION_TIMEOUT_MS":5000,"BROADCAST_TIMEOUT_MS":500,"XMLRPC_TIMEOUT_MS":1000}
def sha(data):return hashlib.sha256(data).hexdigest()
def vector_span(text,name,required=True):
 matches=list(re.finditer(r"(?m)^[ \t]*"+re.escape(name)+r"[ \t]*=[ \t]*\[",text))
 if not matches and not required:return None
 if len(matches)!=1:raise ValueError("Expected exactly one active "+name+" vector")
 start=matches[0].start();pos=matches[0].end();depth=1;quote=None;escaped=False;comment=False
 while pos<len(text):
  ch=text[pos]
  if comment:
   if ch=="\n":comment=False
  elif quote:
   if escaped:escaped=False
   elif ch=="\\":escaped=True
   elif ch==quote:quote=None
  elif ch=="#":comment=True
  elif ch in ['"',"'"]:quote=ch
  elif ch=="[":depth+=1
  elif ch=="]":
   depth-=1
   if depth==0:return (start,pos+1)
  pos+=1
 raise ValueError("Unterminated "+name+" vector")
def replace_vector(text,name,value,required=True):
 span=vector_span(text,name,required)
 if span is None:return text.rstrip()+"\n\n"+value+"\n"
 return text[:span[0]]+value+text[span[1]:]
def scalar(text,name,value,required=True):
 pat=re.compile(r"(?m)^[ \t]*"+re.escape(name)+r"[ \t]*=[^\n]*$")
 matches=list(pat.finditer(text))
 if len(matches)>1 or (required and not matches):raise ValueError("Unexpected active "+name+" scalar")
 line=name+" = "+value
 if not matches:return text.rstrip()+"\n\n"+line+"\n"
 return text[:matches[0].start()]+line+text[matches[0].end():]
def q(s):
 if not isinstance(s,str) or not s.isascii() or any(ord(c)<32 or ord(c)==127 for c in s):raise ValueError("Invalid native string")
 return json.dumps(s)
def vector(name,fields):return name+" = [\n"+",\n".join("    "+k+" = "+v for k,v in fields)+"\n]"
def build_configs(oned,monitor,member,server_id,password):
 if member not in range(5) or server_id not in [-1,member]:raise ValueError("Foreign member/server ID")
 if server_id==-1 and member!=0:raise ValueError("Only rc01 can bootstrap solo")
 if not isinstance(password,str) or not re.fullmatch(r"[A-Za-z0-9_-]{32,128}",password):raise ValueError("Unexpected protected DB secret format")
 ip="192.168.247."+str(11+member)
 raft=vector_span(oned,"RAFT");raft_text=oned[raft[0]:raft[1]]
 for k,v in RAFT.items():
  fields=re.findall(r"(?m)^[ \t]*"+re.escape(k)+r"[ \t]*=[ \t]*([0-9]+)[ \t]*,?[ \t]*(?:#.*)?$",raft_text)
  if fields!=[str(v)]:raise ValueError("Unreviewed native Raft value: "+k)
 for key in ["RAFT_LEADER_HOOK","RAFT_FOLLOWER_HOOK"]:
  if vector_span(oned,key,False) is not None:raise ValueError("Preconfigured hook is not an unmodified package baseline")
 out=replace_vector(oned,"DB",vector("DB",[("BACKEND",q("mysql")),("SERVER",q("localhost")),("PORT","0"),("USER",q("oneadmin")),("PASSWD",q(password)),("DB_NAME",q("opennebula")),("CONNECTIONS","25"),("COMPARE_BINARY",q("no"))]))
 out=replace_vector(out,"FEDERATION",vector("FEDERATION",[("MODE",q("STANDALONE")),("ZONE_ID","0"),("SERVER_ID",str(server_id)),("MASTER_ONED",q("")),("MASTER_ONED_GRPC",q(""))]))
 out=scalar(out,"LISTEN_ADDRESS",q("0.0.0.0"))
 out=scalar(out,"GRPC_LISTEN_ADDRESS",q("127.0.0.1"))
 out=scalar(out,"HOSTNAME",q(ip),False)
 for role in ["LEADER","FOLLOWER"]:
  out=replace_vector(out,"RAFT_"+role+"_HOOK",vector("RAFT_"+role+"_HOOK",[("COMMAND",q("raft/vip.sh")),("ARGUMENTS",q(role.lower()+" eth0 192.168.247.10/24"))]),False)
 net=vector("NETWORK",[("ADDRESS",q("0.0.0.0")),("MONITOR_ADDRESS",q("192.168.247.10")),("PORT","4124"),("THREADS","8"),("PUBKEY",q("/var/lib/one/.one/onedrs-rc-monitor.pub")),("PRIKEY",q("/var/lib/one/.one/onedrs-rc-monitor.key"))])
 mon=replace_vector(monitor,"NETWORK",net)
 assert out[vector_span(out,"RAFT")[0]:vector_span(out,"RAFT")[1]]==raft_text
 return out,mon
def trusted_parents(path):
 p=Path(path)
 if not p.is_absolute() or ".." in p.parts:raise ValueError("Noncanonical protected path")
 for parent in p.parents:
  st=parent.lstat()
  if not stat.S_ISDIR(st.st_mode) or parent.is_symlink() or st.st_uid!=0 or st.st_mode&0o022:raise ValueError("Untrusted protected ancestor")
def protected_file(path):
 p=Path(path);trusted_parents(p);s=p.lstat()
 if not stat.S_ISREG(s.st_mode) or p.is_symlink() or s.st_uid!=0 or s.st_mode&0o777!=0o600:raise ValueError("Protected input custody refused")
 if s.st_size>1024*1024:raise ValueError("Oversized protected input")
 return p.read_bytes()
def validate_binding(raw):
 d=json.loads(raw)
 if d.get("status")!="FROZEN_CANDIDATE_READY_FOR_PARENT_APPROVED_BOOTSTRAP":raise ValueError("Candidate is not frozen/approved")
 for k,n in [("source_commit",40),("rpm_sha256",64),("runtime_manifest_sha256",64),("core_sha256",64)]:
  if not re.fullmatch("[0-9a-f]{"+str(n)+"}",str(d.get(k,""))):raise ValueError("Unbound candidate field "+k)
 if not re.fullmatch(r"[0-9A-Fa-f]{40}|[0-9A-Fa-f]{64}",str(d.get("rpm_signature_fingerprint",""))):raise ValueError("Unbound RPM signing key")
 if d.get("realm_allowlist_sha256")!=ALLOWLIST_SHA:raise ValueError("Wrong realm allowlist")
 return d
def main():
 p=argparse.ArgumentParser()
 for name in ["oned","monitor","allowlist","db-password-file","candidate-binding","out-directory"]:p.add_argument("--"+name,required=True)
 p.add_argument("--member",type=int,required=True);p.add_argument("--server-id",type=int,required=True);a=p.parse_args()
 if os.geteuid()!=0:raise SystemExit("Root-only protected staging")
 binding=validate_binding(protected_file(a.candidate_binding))
 raw=Path(a.allowlist).read_bytes()
 if sha(raw)!=ALLOWLIST_SHA:raise SystemExit("Immutable realm allowlist mismatch")
 password=protected_file(a.db_password_file).decode("ascii").rstrip("\n")
 oned=Path(a.oned).read_text();mon=Path(a.monitor).read_text()
 out,monitor=build_configs(oned,mon,a.member,a.server_id,password)
 dest=Path(a.out_directory)
 trusted_parents(dest)
 if not str(dest).startswith("/root/ls-onedrs-rc-20261120/bootstrap-private/"):raise SystemExit("Output is outside the fixed private realm stage")
 if dest.exists() or dest.is_symlink():raise SystemExit("Refusing existing staging output")
 parent=dest.parent.lstat()
 if not stat.S_ISDIR(parent.st_mode) or parent.st_uid!=0 or parent.st_mode&0o022:raise SystemExit("Unsafe staging parent")
 dest.mkdir(mode=0o700)
 for name,body in [("oned.conf",out),("monitord.conf",monitor)]:
  fd=os.open(dest/name,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
  with os.fdopen(fd,"w") as f:f.write(body);f.flush();os.fsync(f.fileno())
 receipt={"status":"RENDERED_NOT_INSTALLED","realm":REALM,"member":a.member,"server_id":a.server_id,"candidate":binding,"source_config_sha256":{"oned":sha(oned.encode()),"monitor":sha(mon.encode())},"rendered_sha256":{"oned":sha(out.encode()),"monitor":sha(monitor.encode())},"raft_values_preserved":RAFT,"native_transport":"HTTP/XMLRPC in exact isolated realm; gRPC loopback; no TLS claim"}
 f=dest/"receipt.json";f.write_text(json.dumps(receipt,indent=2,sort_keys=True)+"\n");f.chmod(0o600)
 print(json.dumps({"status":receipt["status"],"member":a.member,"server_id":a.server_id,"out_directory":str(dest)}))
if __name__=="__main__":main()
