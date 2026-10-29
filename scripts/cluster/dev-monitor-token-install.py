#!/usr/bin/python3
"""Install a verified DEV monitor token at a new root-only path; never log values."""
import ipaddress, json, os, pwd, stat, subprocess, sys, tempfile

ROOT = '/root/.config/uvanoo-dev'
TARGET = ROOT + '/dokploy-monitor.token'
OLD = '/opt/uvanoo-dev/monitor-private/dokploy.token'
DEV_ID = 'wYb0LxLQrvj2FPI21i-Oj'

def require(ok):
    if not ok:
        raise RuntimeError('CHECK_FAILED')

def read_regular(path, uid):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        st = os.fstat(fd)
        require(stat.S_ISREG(st.st_mode) and st.st_uid == uid and stat.S_IMODE(st.st_mode) == 0o600)
        data = os.read(fd, 4097)
        require(0 < len(data) <= 4096)
        return data
    finally:
        os.close(fd)

def verify(token, ip):
    with tempfile.TemporaryDirectory(prefix='uvanoo-token-check-', dir='/run') as temp:
        header = temp + '/header'
        body = temp + '/body'
        fd = os.open(header, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(b'x-api-key: ' + token + b'\n')
        args = ['/usr/bin/curl', '-sS', '--connect-timeout', '5', '--max-time', '15', '--max-filesize', '1048576',
                '--noproxy', 'dokploy.uvanoo.com', '--resolve', 'dokploy.uvanoo.com:443:' + ip,
                '-H', '@' + header, '-o', body, '-w', '%{http_code}', '-G',
                '--data-urlencode', 'composeId=' + DEV_ID,
                'https://dokploy.uvanoo.com/api/compose.one']
        r = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, timeout=20, check=False,
                           env={'PATH':'/usr/bin:/bin'})
        require(r.returncode == 0 and r.stdout == b'200' and os.path.getsize(body) < 1048576)
        with open(body, 'rb') as stream:
            obj = json.load(stream)
        require(obj.get('composeId') == DEV_ID and
                obj.get('appName') == 'uvanoo-v1-4-dev-gniriv' and
                obj.get('environmentId') == 'qT391QtcIqahNap5wPjif' and
                obj.get('composeType') == 'stack' and obj.get('sourceType') == 'raw' and
                obj.get('autoDeploy') is False)
        domains = obj.get('domains')
        require(isinstance(domains, list) and len(domains) == 1)
        domain = domains[0]
        require(domain.get('composeId') == DEV_ID and domain.get('host') == 'dev.uvanoo.com' and
                domain.get('serviceName') == 'web' and domain.get('port') == 3000 and
                domain.get('https') is True and domain.get('enabled') is True and domain.get('path') == '/')

def main():
    require(os.geteuid() == 0)
    raw = sys.stdin.buffer.read(8193)
    require(len(raw) <= 8192)
    lines = raw.splitlines()
    require(len(lines) == 2)
    ip = ipaddress.IPv4Address(lines[0].decode('ascii'))
    require(any(ip in ipaddress.IPv4Network(n) for n in ('10.0.0.0/8','172.16.0.0/12','192.168.0.0/16')))
    token = lines[1]
    require(20 <= len(token) <= 4096 and b'\r' not in token and b'\n' not in token)
    require(os.path.realpath(ROOT) == ROOT)
    root_stat = os.lstat(ROOT)
    require(stat.S_ISDIR(root_stat.st_mode) and root_stat.st_uid == 0 and stat.S_IMODE(root_stat.st_mode) == 0o700)
    require(not os.path.lexists(TARGET))
    old = read_regular(OLD, pwd.getpwnam('ubuntu').pw_uid)
    verify(token, str(ip))
    backup_fd, backup = tempfile.mkstemp(prefix='dokploy-monitor-previous-', dir=ROOT)
    try:
        os.fchmod(backup_fd, 0o600)
        with os.fdopen(backup_fd, 'wb') as stream:
            stream.write(old)
            stream.flush()
            os.fsync(stream.fileno())
    except Exception:
        os.unlink(backup)
        raise
    directory_fd = os.open(ROOT, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    stage_fd, stage = tempfile.mkstemp(prefix='.dokploy-monitor-stage-', dir=ROOT)
    installed = False
    installed_inode = None
    try:
        os.fchmod(stage_fd, 0o600)
        with os.fdopen(stage_fd, 'wb') as stream:
            stream.write(token)
            stream.flush()
            os.fsync(stream.fileno())
        staged = os.lstat(stage)
        require(stat.S_ISREG(staged.st_mode) and staged.st_uid == 0 and stat.S_IMODE(staged.st_mode) == 0o600)
        os.link(stage, TARGET, follow_symlinks=False)
        installed = True
        installed_inode = (staged.st_dev, staged.st_ino)
        os.unlink(stage)
        target = read_regular(TARGET, 0)
        require(target == token)
        verify(target, str(ip))
        d = os.open(ROOT, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(d)
        finally:
            os.close(d)
    except Exception:
        if installed:
            current = os.lstat(TARGET)
            if (current.st_dev,current.st_ino) == installed_inode:
                os.unlink(TARGET)
        raise
    finally:
        if os.path.lexists(stage):
            os.unlink(stage)
    print('DEV_MONITOR_TOKEN_INSTALLED_VERIFIED_ROOT_ONLY')

try:
    main()
except Exception:
    print('DEV_MONITOR_TOKEN_INSTALL_FAILED')
    sys.exit(1)
