#!/usr/bin/python3
"""Source-level render safety tests against copied native reference templates."""
from pathlib import Path
import copy,hashlib,json,os,re,tempfile,unittest
import render_native_configs as m
R=Path(__file__).parent
BASE=(R/"reference-oned.conf").read_text()
MON=(R/"reference-monitord.conf").read_text()
PASSWORD="Source_fixture_only_"+"A"*32
def build(base=BASE,mon=MON,member=0,server=0,password=PASSWORD):return m.build_configs(base,mon,member,server,password)
class RenderSafety(unittest.TestCase):
 def test_five_exact_members_and_unchanged_raft(self):
  a,b=m.vector_span(BASE,"RAFT");expected=BASE[a:b]
  for i in range(5):
   with self.subTest(member=i):
    oned,mon=build(member=i,server=i)
    self.assertIn('SERVER_ID = '+str(i),oned)
    self.assertIn('HOSTNAME = "192.168.247.'+str(i+11)+'"',oned)
    self.assertIn('LISTEN_ADDRESS = "0.0.0.0"',oned)
    self.assertIn('GRPC_LISTEN_ADDRESS = "127.0.0.1"',oned)
    a,b=m.vector_span(oned,"RAFT");self.assertEqual(oned[a:b],expected)
    self.assertIn('MONITOR_ADDRESS = "192.168.247.10"',mon)
    self.assertIn('PRIKEY = "/var/lib/one/.one/onedrs-rc-monitor.key"',mon)
 def test_solo_only_first_member(self):
  self.assertIn('SERVER_ID = -1',build(server=-1)[0])
  for i in range(1,5):
   with self.assertRaises(ValueError):build(member=i,server=-1)
 def test_foreign_member_or_server_refused(self):
  for i,s in [(-1,0),(5,5),(0,1),(3,4),(0,-2)]:
   with self.subTest(member=i,server=s),self.assertRaises(ValueError):build(member=i,server=s)
 def test_unrelated_vendor_scheduler_and_constraints_preserved(self):
  out,_=build()
  def immutable(text):
   for name in ["DB","FEDERATION","RAFT_LEADER_HOOK","RAFT_FOLLOWER_HOOK"]:
    span=m.vector_span(text,name,False)
    if span:text=text[:span[0]]+text[span[1]:]
   text=re.sub(r'(?m)^[ \t]*(?:LISTEN_ADDRESS|GRPC_LISTEN_ADDRESS|HOSTNAME)[ \t]*=[^\n]*$', '', text)
   return "\n".join(line for line in text.splitlines() if line.strip())
  self.assertEqual(immutable(BASE),immutable(out))
  self.assertEqual(len(re.findall(r'(?m)^VM_MAD\s*=',BASE)),len(re.findall(r'(?m)^VM_MAD\s*=',out)))
 def test_missing_db_refused(self):
  a,b=m.vector_span(BASE,"DB")
  with self.assertRaises(ValueError):build(base=BASE[:a]+BASE[b:])
 def test_duplicate_db_refused(self):
  with self.assertRaises(ValueError):build(base=BASE+'\nDB = [ BACKEND="sqlite" ]\n')
 def test_duplicate_listener_refused(self):
  with self.assertRaises(ValueError):build(base=BASE+'\nLISTEN_ADDRESS = "127.0.0.1"\n')
 def test_modified_raft_default_refused(self):
  with self.assertRaises(ValueError):build(base=BASE.replace("ELECTION_TIMEOUT_MS  = 5000","ELECTION_TIMEOUT_MS  = 5001"))
 def test_duplicate_raft_field_refused(self):
  a,b=m.vector_span(BASE,"RAFT")
  changed=BASE[:b-1]+"\nXMLRPC_TIMEOUT_MS = 1000\n"+BASE[b-1:]
  with self.assertRaises(ValueError):build(base=changed)
 def test_existing_hook_cannot_be_adopted(self):
  for role in ["LEADER","FOLLOWER"]:
   with self.subTest(role=role),self.assertRaises(ValueError):build(base=BASE+'\nRAFT_'+role+'_HOOK = [ COMMAND = "foreign.sh" ]\n')
 def test_secret_injection_refused(self):
  for p in ['a'*31,'a'*129,'a'*32+'\nX=1','a'*32+'"','a'*32+'\\','a'*32+'é']:
   with self.subTest(length=len(p)),self.assertRaises(ValueError):build(password=p)
 def test_missing_or_duplicate_monitor_network_refused(self):
  a,b=m.vector_span(MON,"NETWORK")
  for text in [MON[:a]+MON[b:],MON+'\nNETWORK=[PORT=4124]\n']:
   with self.assertRaises(ValueError):build(mon=text)
 def test_vector_lexer_ignores_quotes_and_comments(self):
  text='DB = [ NAME="a]b#c", OTHER=[X=1] # ] ignored\n]\nNEXT=1\n'
  a,b=m.vector_span(text,'DB');self.assertEqual(text[b:].strip(),'NEXT=1')
  with self.assertRaises(ValueError):m.vector_span('DB = [ NAME="unterminated ]','DB')
 def test_binding_requires_complete_frozen_candidate(self):
  good={"status":"FROZEN_CANDIDATE_READY_FOR_PARENT_APPROVED_BOOTSTRAP","source_commit":"a"*40,"rpm_sha256":"b"*64,"runtime_manifest_sha256":"c"*64,"core_sha256":"d"*64,"rpm_signature_fingerprint":"E"*40,"realm_allowlist_sha256":m.ALLOWLIST_SHA}
  self.assertEqual(m.validate_binding(json.dumps(good)),good)
  for field in good:
   bad=copy.copy(good);bad[field]=None
   with self.subTest(field=field),self.assertRaises(ValueError):m.validate_binding(json.dumps(bad))
 def test_secret_custody_refuses_symlink_and_public_mode(self):
  with tempfile.TemporaryDirectory(prefix="source-render-test-",dir=R) as tmp:
   p=Path(tmp)/"fixture";p.write_text(PASSWORD);p.chmod(0o600)
   self.assertEqual(m.protected_file(p).decode(),PASSWORD)
   link=Path(tmp)/"link";link.symlink_to(p)
   with self.assertRaises(ValueError):m.protected_file(link)
   p.chmod(0o644)
   with self.assertRaises(ValueError):m.protected_file(p)
 def test_no_secret_in_public_reference_or_proposal(self):
  for p in [R/"reference-oned.conf",R/"reference-monitord.conf",R/"native-bootstrap.json",R/"realm-allowlist.json"]:
   self.assertNotIn(PASSWORD,p.read_text())
if __name__=="__main__":unittest.main(verbosity=2)
