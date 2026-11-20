import pathlib,subprocess,os,shutil,json,stat,hashlib,re
D=pathlib.Path('/root/ls-onedrs-dr4-admission-20261120')
cfg=json.loads((D/'trusted-peers.json').read_text())
if subprocess.check_output(['hostname'],text=True).strip()!=cfg['hostname'] or pathlib.Path('/sys/class/dmi/id/product_uuid').read_text().strip()!=cfg['uuid']:raise RuntimeError('Host identity mismatch')
P=pathlib.Path('/var/lib/one/.ssh')
if P.is_symlink() or P.stat().st_uid!=9869 or stat.S_IMODE(P.stat().st_mode)!=0o700:raise RuntimeError('Unsafe native SSH directory')
receipt={'host':cfg['hostname'],'known_hosts_added':0,'authorized_keys_added':0}
def existing(name):
 f=P/name
 if f.exists():
  if f.is_symlink() or not f.is_file() or f.stat().st_uid!=9869 or f.stat().st_mode&0o022:raise RuntimeError('Unsafe existing SSH file')
  if not (D/(name+'.before')).exists():shutil.copy2(f,D/(name+'.before'))
  return f.read_text()
 return ''
def replace(name,content):
 f=P/name;t=P/(name+'.onedrs-20261120-next')
 if t.exists():raise RuntimeError('Unreconciled SSH temporary file')
 fd=os.open(t,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'w') as stream:stream.write(content);stream.flush();os.fsync(stream.fileno())
 os.chown(t,9869,9869);os.replace(t,f);subprocess.run(['restorecon','-F',str(f)],check=True,capture_output=True)
kh=existing('known_hosts');ak=existing('authorized_keys')
for peer in cfg['peers']:
 host_key=' '.join(peer['host_public_key'].split()[:2])
 aliases=[peer['hostname'],peer['ip']]
 for alias in aliases:
  if (P/'known_hosts').exists():
   r=subprocess.run(['ssh-keygen','-F',alias,'-f',str(P/'known_hosts')],capture_output=True,text=True)
   for line in r.stdout.splitlines():
    parts=line.split()
    if parts and not line.startswith('#') and len(parts)>=3 and parts[1]=='ssh-ed25519' and ' '.join(parts[1:3])!=host_key:raise RuntimeError('Existing authoritative host key mismatch; no overwrite')
 line=','.join(aliases)+' '+host_key+'\n'
 if line.strip() not in kh.splitlines():
  kh=kh.rstrip()+'\n'+line;receipt['known_hosts_added']+=1
 for public in peer['oneadmin_public_keys'].values():
  words=public.split()
  if len(words)<2 or words[0] not in ('ssh-rsa','ssh-ed25519'):raise RuntimeError('Invalid public native identity')
  matches=[l for l in ak.splitlines() if words[1] in l.split() and not l.lstrip().startswith('#')]
  def allows_peer(line):
   prefix=line.split(words[0],1)[0]
   match=re.search(r'from="([^"]+)"',prefix)
   return not match or peer['ip'] in match.group(1).split(',')
  if not any(allows_peer(line) for line in matches):
   ak=ak.rstrip()+'\n'+'from="'+peer['ip']+'",no-agent-forwarding,no-X11-forwarding '+public+'\n'
   receipt['authorized_keys_added']+=1
if receipt['known_hosts_added']:replace('known_hosts',kh)
if receipt['authorized_keys_added']:replace('authorized_keys',ak)
receipt['known_hosts_sha256']=hashlib.sha256((P/'known_hosts').read_bytes()).hexdigest()
receipt['authorized_keys_sha256']=hashlib.sha256((P/'authorized_keys').read_bytes()).hexdigest()
(D/'trust-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
